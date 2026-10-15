"use strict";

// Headless document host for the unchanged EFF scripts. No client-provided source is evaluated.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const runtimeRoot = fs.existsSync(path.resolve(__dirname, "../pixel-version"))
  ? path.resolve(__dirname, "..")
  : path.resolve(__dirname, "../..");
const root = path.join(runtimeRoot, "pixel-version");
const SAVE = "wuzhong-returner-pixel-v1";
const META = "wuzhong-returner-pixel-meta-v1";
const source = fs.readFileSync(path.join(root, "game.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const enhancementPath = path.join(root, "enhancements.js");
const enhancements = fs.existsSync(enhancementPath)
  ? fs.readFileSync(enhancementPath, "utf8")
  : "";
const scriptOrder = [
  ...html.matchAll(/<script\b[^>]*src=["']((?:\.\/|\.\.\/)[^"']+)["'][^>]*>/g),
].map((match) => match[1].replace(/^\.\//, ""));

class HostEvent {
  constructor(type, options = {}) {
    Object.assign(
      this,
      { type, bubbles: false, cancelable: true, defaultPrevented: false },
      options,
    );
  }
  preventDefault() {
    this.defaultPrevented = true;
  }
  stopPropagation() {
    this.stopped = true;
  }
  stopImmediatePropagation() {
    this.stopped = this.immediateStopped = true;
  }
}

class EventTarget {
  constructor() {
    this.listeners = new Map();
  }
  addEventListener(type, callback, options = {}) {
    const list = this.listeners.get(type) || [];
    list.push({ callback, once: typeof options === "object" && options.once });
    this.listeners.set(type, list);
  }
  removeEventListener(type, callback) {
    this.listeners.set(
      type,
      (this.listeners.get(type) || []).filter(
        (item) => item.callback !== callback,
      ),
    );
  }
  dispatchEvent(event) {
    if (!event.target) event.target = this;
    event.currentTarget = this;
    for (const listener of [...(this.listeners.get(event.type) || [])]) {
      listener.callback.call(this, event);
      if (listener.once)
        this.removeEventListener(event.type, listener.callback);
      if (event.immediateStopped) break;
    }
    if (event.bubbles && !event.stopped && this.parentNode)
      this.parentNode.dispatchEvent(event);
    return !event.defaultPrevented;
  }
}

function makeDocument() {
  const document = new EventTarget();
  const ids = new Map();
  const canvasContext = new Proxy(
    {
      measureText: (value) => ({ width: String(value).length * 7 }),
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
      getImageData: (_x, _y, w, h) => ({
        data: new Uint8ClampedArray(w * h * 4),
      }),
    },
    {
      get: (target, key) => (key in target ? target[key] : () => {}),
      set: (target, key, value) => ((target[key] = value), true),
    },
  );

  function matches(element, selector) {
    if (element.nodeType !== 1) return false;
    const attr = selector.match(/\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]/);
    if (
      attr &&
      (!element.attributes.has(attr[1]) ||
        (attr[2] && element.getAttribute(attr[1]) !== attr[2]))
    )
      return false;
    const plain = selector.replace(/\[[^\]]+\]/g, "");
    const tag = plain.match(/^[a-z][\w-]*/i);
    if (tag && element.tagName !== tag[0].toUpperCase()) return false;
    const id = plain.match(/#([\w-]+)/);
    if (id && element.id !== id[1]) return false;
    for (const item of plain.matchAll(/\.([\w-]+)/g))
      if (!element.classList.contains(item[1])) return false;
    return true;
  }

  class Element extends EventTarget {
    constructor(tag) {
      super();
      this.tagName = tag.toUpperCase();
      this.nodeType = 1;
      this.childNodes = [];
      this.attributes = new Map();
      this.dataset = {};
      this.style = {
        setProperty(key, value) {
          this[key] = value;
        },
        removeProperty(key) {
          delete this[key];
        },
      };
      this.hidden = false;
      this.value = "";
      this.width = 320;
      this.height = 192;
      this.ownerDocument = document;
      this.className = "";
      this.classList = {
        add: (...classes) => {
          this.className = [
            ...new Set([
              ...this.className.split(/\s+/).filter(Boolean),
              ...classes,
            ]),
          ].join(" ");
        },
        remove: (...classes) => {
          this.className = this.className
            .split(/\s+/)
            .filter((item) => !classes.includes(item))
            .join(" ");
        },
        contains: (item) => this.className.split(/\s+/).includes(item),
        toggle: (item, force) => {
          const wanted =
            force === undefined ? !this.classList.contains(item) : force;
          this.classList[wanted ? "add" : "remove"](item);
          return wanted;
        },
      };
    }
    get children() {
      return this.childNodes.filter((child) => child.nodeType === 1);
    }
    get firstChild() {
      return this.childNodes[0] || null;
    }
    get firstElementChild() {
      return this.children[0] || null;
    }
    get lastElementChild() {
      return this.children.at(-1) || null;
    }
    set textContent(value) {
      this._text = String(value);
      this.replaceChildren();
    }
    get textContent() {
      return (
        (this._text || "") +
        this.childNodes.map((child) => child.textContent).join("")
      );
    }
    set innerHTML(value) {
      this._text = "";
      this.replaceChildren();
      parseMarkup(String(value), this);
    }
    get innerHTML() {
      return this.textContent;
    }
    append(...children) {
      for (let child of children) {
        if (typeof child === "string") child = document.createTextNode(child);
        if (child.parentNode) child.remove?.();
        child.parentNode = this;
        this.childNodes.push(child);
      }
    }
    appendChild(child) {
      this.append(child);
      return child;
    }
    prepend(...children) {
      for (const child of children.reverse()) {
        child.parentNode = this;
        this.childNodes.unshift(child);
      }
    }
    replaceChildren(...children) {
      for (const child of this.childNodes) child.parentNode = null;
      this.childNodes = [];
      this.append(...children);
    }
    remove() {
      if (this.parentNode) {
        this.parentNode.childNodes = this.parentNode.childNodes.filter(
          (child) => child !== this,
        );
        this.parentNode = null;
      }
    }
    setAttribute(key, value) {
      const str = String(value);
      this.attributes.set(key, str);
      if (key === "id") {
        this.id = str;
        ids.set(str, this);
      }
      if (key === "class") this.className = str;
      if (key === "hidden") this.hidden = true;
      if (key === "value") this.value = str;
      if (key === "type") this.type = str;
      if (key.startsWith("data-"))
        this.dataset[
          key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
        ] = str;
    }
    getAttribute(key) {
      return this.attributes.get(key) ?? null;
    }
    removeAttribute(key) {
      this.attributes.delete(key);
      if (key === "hidden") this.hidden = false;
    }
    toggleAttribute(key, force) {
      const wanted = force ?? !this.attributes.has(key);
      if (wanted) this.setAttribute(key, "");
      else this.removeAttribute(key);
      return wanted;
    }
    matches(selector) {
      return matches(this, selector);
    }
    querySelectorAll(selector) {
      const simple = selector.trim().split(/\s+/).pop();
      const found = [];
      const walk = (parent) => {
        for (const child of parent.children || []) {
          if (simple.split(",").some((part) => matches(child, part.trim())))
            found.push(child);
          walk(child);
        }
      };
      walk(this);
      return found;
    }
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    }
    closest(selector) {
      let current = this;
      while (current?.nodeType === 1) {
        if (selector.split(",").some((part) => matches(current, part.trim())))
          return current;
        current = current.parentNode;
      }
      return null;
    }
    contains(target) {
      return (
        target === this ||
        this.childNodes.some((child) => child.contains?.(target))
      );
    }
    focus() {
      document.activeElement = this;
    }
    blur() {
      if (document.activeElement === this)
        document.activeElement = document.body;
    }
    click() {
      this.dispatchEvent(new HostEvent("click", { bubbles: true }));
    }
    showModal() {
      this.open = true;
      this.hidden = false;
    }
    close() {
      this.open = false;
      this.hidden = true;
      this.dispatchEvent(new HostEvent("close"));
    }
    getContext() {
      return canvasContext;
    }
    getBoundingClientRect() {
      return {
        left: 0,
        top: 0,
        right: 640,
        bottom: 384,
        width: 640,
        height: 384,
      };
    }
    setPointerCapture() {}
    releasePointerCapture() {}
    scrollIntoView() {}
  }

  const voidTags = new Set([
    "meta",
    "link",
    "input",
    "img",
    "br",
    "hr",
    "source",
  ]);
  function parseMarkup(markup, parent) {
    const stack = [parent];
    for (const match of markup.matchAll(/<\/?([\w-]+)\b([^>]*)>|([^<]+)/g)) {
      if (match[3]) {
        const text = match[3]
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");
        stack
          .at(-1)
          .append({ nodeType: 3, textContent: text, parentNode: null });
        continue;
      }
      const tag = match[1].toLowerCase();
      if (match[0].startsWith("</")) {
        if (stack.length > 1) stack.pop();
        continue;
      }
      const element = new Element(tag);
      for (const attr of match[2].matchAll(
        /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g,
      ))
        element.setAttribute(attr[1], attr[2] ?? attr[3] ?? attr[4] ?? "");
      stack.at(-1).append(element);
      if (!voidTags.has(tag) && !match[0].endsWith("/>")) stack.push(element);
    }
  }

  document.documentElement = new Element("html");
  parseMarkup(html, document.documentElement);
  document.body = document.documentElement.querySelector("body");
  document.head = document.documentElement.querySelector("head");
  document.hidden = false;
  document.visibilityState = "visible";
  document.activeElement = document.body;
  document.createElement = (tag) => new Element(tag);
  document.createElementNS = (_namespace, tag) => new Element(tag);
  document.createTextNode = (text) => ({
    nodeType: 3,
    textContent: String(text),
    parentNode: null,
  });
  document.getElementById = (id) => ids.get(id) || null;
  document.querySelector = (selector) =>
    document.documentElement.querySelector(selector);
  document.querySelectorAll = (selector) =>
    document.documentElement.querySelectorAll(selector);
  return { document, Element, ids };
}

class SilentAudioContext {
  constructor() {
    this.sampleRate = 8000;
    this.currentTime = 0;
    this.state = "running";
    this.destination = {};
    this.resumeCount = 0;
    this.suspendCount = 0;
  }
  node() {
    const parameter = () => ({
      value: 0,
      setTargetAtTime() {},
      setValueAtTime() {},
      linearRampToValueAtTime() {},
      exponentialRampToValueAtTime() {},
    });
    return {
      gain: parameter(),
      frequency: parameter(),
      Q: parameter(),
      connect() {},
      disconnect() {},
      start() {},
      stop() {},
    };
  }
  createGain() {
    return this.node();
  }
  createOscillator() {
    return this.node();
  }
  createBiquadFilter() {
    return this.node();
  }
  createBufferSource() {
    return this.node();
  }
  createBuffer(_channels, size) {
    return { getChannelData: () => new Float32Array(size) };
  }
  resume() {
    this.state = "running";
    this.resumeCount += 1;
    return Promise.resolve();
  }
  suspend() {
    this.state = "suspended";
    this.suspendCount += 1;
    return Promise.resolve();
  }
}

function createStoryEngine(initialStorage = {}) {
  const dom = makeDocument();
  const storage = new Map(Object.entries(initialStorage));
  const timers = new Map();
  const frames = new Map();
  let now = 1000;
  let nextId = 1;
  const window = new EventTarget();
  const localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
    clear: () => storage.clear(),
  };
  const matchMedia = () =>
    Object.assign(new EventTarget(), {
      matches: false,
      media: "",
      addListener() {},
      removeListener() {},
    });
  Object.assign(window, {
    document: dom.document,
    localStorage,
    AudioContext: SilentAudioContext,
    confirm: () => true,
    matchMedia,
    innerWidth: 1000,
    innerHeight: 800,
    navigator: {
      userAgent: "eff-minecraft-host",
      maxTouchPoints: 0,
      getGamepads: () => [],
    },
    location: { protocol: "http:", href: "http://localhost/pixel-version/" },
    Event: HostEvent,
    MouseEvent: HostEvent,
    KeyboardEvent: HostEvent,
  });
  const sandbox = {
    window,
    document: dom.document,
    localStorage,
    navigator: window.navigator,
    location: window.location,
    Event: HostEvent,
    MouseEvent: HostEvent,
    KeyboardEvent: HostEvent,
    HTMLElement: dom.Element,
    HTMLCanvasElement: dom.Element,
    console,
    performance: { now: () => now },
    matchMedia,
    setTimeout: (callback, delay = 0) => {
      const id = nextId++;
      timers.set(id, { callback, due: now + delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    setInterval: (callback, delay = 0) => {
      const id = nextId++;
      timers.set(id, {
        callback,
        due: now + delay,
        repeat: Math.max(1, delay),
      });
      return id;
    },
    clearInterval: (id) => timers.delete(id),
    requestAnimationFrame: (callback) => {
      const id = nextId++;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
  };
  Object.assign(window, sandbox);
  window.window = window;
  const context = vm.createContext(sandbox);
  const evaluate = (code) => vm.runInContext(code, context, { timeout: 3000 });
  assert.ok(
    scriptOrder.includes("game.js"),
    "index.html must load the game script",
  );
  for (const name of scriptOrder) {
    const script =
      name === "game.js"
        ? source
        : name === "enhancements.js"
          ? enhancements
          : fs.readFileSync(path.join(root, name), "utf8");
    vm.runInContext(script, context, {
      filename: `pixel-version/${name}`,
      timeout: 3000,
    });
  }
  return {
    ...dom,
    context,
    storage,
    window,
    evaluate,
    value: (code) => JSON.parse(JSON.stringify(evaluate(code))),
    tick(milliseconds = 1600) {
      const end = now + milliseconds;
      let count = 0;
      while (true) {
        const next = [...timers]
          .filter(([, timer]) => timer.due <= end)
          .sort((a, b) => a[1].due - b[1].due)[0];
        if (!next) break;
        assert.ok(count++ < 1000, "timer loop did not settle");
        const [id, timer] = next;
        now = timer.due;
        timers.delete(id);
        timer.callback();
        if (timer.repeat && !timers.has(id))
          timers.set(id, { ...timer, due: now + timer.repeat });
      }
      now = end;
    },
    frame(milliseconds = 16) {
      now += milliseconds;
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(now);
    },
    snapshot() {
      return Object.fromEntries(storage);
    },
  };
}

module.exports = { createStoryEngine, HostEvent };
