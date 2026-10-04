"use strict";

// Run with: node tests/pixel-regression.cjs
// No browser, npm packages, or production test hooks are required. The VM runs
// the shipped scripts and the routes use their real interactions and choices.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..", "pixel-version");
const SAVE = "wuzhong-returner-pixel-v1";
const META = "wuzhong-returner-pixel-meta-v1";
const source = fs.readFileSync(path.join(root, "game.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const enhancementPath = path.join(root, "enhancements.js");
const enhancements = fs.existsSync(enhancementPath) ? fs.readFileSync(enhancementPath, "utf8") : "";
const scriptOrder = [...html.matchAll(/<script\b[^>]*src=["']\.\/([^"']+)["'][^>]*>/g)].map((match) => match[1]);

class MockEvent {
  constructor(type, options = {}) {
    Object.assign(this, { type, bubbles: false, cancelable: true, defaultPrevented: false }, options);
  }
  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() { this.stopped = true; }
  stopImmediatePropagation() { this.stopped = this.immediateStopped = true; }
}

class EventTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, callback, options = {}) {
    const list = this.listeners.get(type) || [];
    list.push({ callback, once: typeof options === "object" && options.once });
    this.listeners.set(type, list);
  }
  removeEventListener(type, callback) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter((item) => item.callback !== callback));
  }
  dispatchEvent(event) {
    if (!event.target) event.target = this;
    event.currentTarget = this;
    for (const listener of [...(this.listeners.get(event.type) || [])]) {
      listener.callback.call(this, event);
      if (listener.once) this.removeEventListener(event.type, listener.callback);
      if (event.immediateStopped) break;
    }
    if (event.bubbles && !event.stopped && this.parentNode) this.parentNode.dispatchEvent(event);
    return !event.defaultPrevented;
  }
}

function makeDocument() {
  const document = new EventTarget();
  const ids = new Map();
  const canvasContext = new Proxy({
    measureText: (value) => ({ width: String(value).length * 7 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  }, { get: (target, key) => key in target ? target[key] : () => {}, set: (target, key, value) => (target[key] = value, true) });

  function matches(element, selector) {
    if (element.nodeType !== 1) return false;
    const attr = selector.match(/\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]/);
    if (attr && (!element.attributes.has(attr[1]) || attr[2] && element.getAttribute(attr[1]) !== attr[2])) return false;
    const plain = selector.replace(/\[[^\]]+\]/g, "");
    const tag = plain.match(/^[a-z][\w-]*/i);
    if (tag && element.tagName !== tag[0].toUpperCase()) return false;
    const id = plain.match(/#([\w-]+)/);
    if (id && element.id !== id[1]) return false;
    for (const item of plain.matchAll(/\.([\w-]+)/g)) if (!element.classList.contains(item[1])) return false;
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
      this.style = { setProperty(key, value) { this[key] = value; }, removeProperty(key) { delete this[key]; } };
      this.hidden = false;
      this.value = "";
      this.width = 320;
      this.height = 192;
      this.ownerDocument = document;
      this.className = "";
      this.classList = {
        add: (...classes) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...classes])].join(" "); },
        remove: (...classes) => { this.className = this.className.split(/\s+/).filter((item) => !classes.includes(item)).join(" "); },
        contains: (item) => this.className.split(/\s+/).includes(item),
        toggle: (item, force) => {
          const wanted = force === undefined ? !this.classList.contains(item) : force;
          this.classList[wanted ? "add" : "remove"](item);
          return wanted;
        },
      };
    }
    get children() { return this.childNodes.filter((child) => child.nodeType === 1); }
    get firstChild() { return this.childNodes[0] || null; }
    get firstElementChild() { return this.children[0] || null; }
    get lastElementChild() { return this.children.at(-1) || null; }
    set textContent(value) { this._text = String(value); this.replaceChildren(); }
    get textContent() { return (this._text || "") + this.childNodes.map((child) => child.textContent).join(""); }
    set innerHTML(value) { this._text = ""; this.replaceChildren(); parseMarkup(String(value), this); }
    get innerHTML() { return this.textContent; }
    append(...children) {
      for (let child of children) {
        if (typeof child === "string") child = document.createTextNode(child);
        if (child.parentNode) child.remove?.();
        child.parentNode = this;
        this.childNodes.push(child);
      }
    }
    appendChild(child) { this.append(child); return child; }
    prepend(...children) { for (const child of children.reverse()) { child.parentNode = this; this.childNodes.unshift(child); } }
    replaceChildren(...children) { for (const child of this.childNodes) child.parentNode = null; this.childNodes = []; this.append(...children); }
    remove() { if (this.parentNode) { this.parentNode.childNodes = this.parentNode.childNodes.filter((child) => child !== this); this.parentNode = null; } }
    setAttribute(key, value) {
      const str = String(value);
      this.attributes.set(key, str);
      if (key === "id") { this.id = str; ids.set(str, this); }
      if (key === "class") this.className = str;
      if (key === "hidden") this.hidden = true;
      if (key === "value") this.value = str;
      if (key === "type") this.type = str;
      if (key.startsWith("data-")) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = str;
    }
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    removeAttribute(key) { this.attributes.delete(key); if (key === "hidden") this.hidden = false; }
    toggleAttribute(key, force) { const wanted = force ?? !this.attributes.has(key); if (wanted) this.setAttribute(key, ""); else this.removeAttribute(key); return wanted; }
    matches(selector) { return matches(this, selector); }
    querySelectorAll(selector) {
      const simple = selector.trim().split(/\s+/).pop();
      const found = [];
      const walk = (parent) => { for (const child of parent.children || []) { if (simple.split(",").some((part) => matches(child, part.trim()))) found.push(child); walk(child); } };
      walk(this);
      return found;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    closest(selector) { let current = this; while (current?.nodeType === 1) { if (selector.split(",").some((part) => matches(current, part.trim()))) return current; current = current.parentNode; } return null; }
    contains(target) { return target === this || this.childNodes.some((child) => child.contains?.(target)); }
    focus() { document.activeElement = this; }
    blur() { if (document.activeElement === this) document.activeElement = document.body; }
    click() { this.dispatchEvent(new MockEvent("click", { bubbles: true })); }
    showModal() { this.open = true; this.hidden = false; }
    close() { this.open = false; this.hidden = true; this.dispatchEvent(new MockEvent("close")); }
    getContext() { return canvasContext; }
    getBoundingClientRect() { return { left: 0, top: 0, right: 640, bottom: 384, width: 640, height: 384 }; }
    setPointerCapture() {}
    releasePointerCapture() {}
    scrollIntoView() {}
  }

  const voidTags = new Set(["meta", "link", "input", "img", "br", "hr", "source"]);
  function parseMarkup(markup, parent) {
    const stack = [parent];
    for (const match of markup.matchAll(/<\/?([\w-]+)\b([^>]*)>/g)) {
      const tag = match[1].toLowerCase();
      if (match[0].startsWith("</")) { if (stack.length > 1) stack.pop(); continue; }
      const element = new Element(tag);
      for (const attr of match[2].matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) element.setAttribute(attr[1], attr[2] ?? attr[3] ?? attr[4] ?? "");
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
  document.createTextNode = (text) => ({ nodeType: 3, textContent: String(text), parentNode: null });
  document.getElementById = (id) => ids.get(id) || null;
  document.querySelector = (selector) => document.documentElement.querySelector(selector);
  document.querySelectorAll = (selector) => document.documentElement.querySelectorAll(selector);
  return { document, Element, ids };
}

class MockAudioContext {
  constructor() { this.sampleRate = 8000; this.currentTime = 0; this.state = "running"; this.destination = {}; this.resumeCount = 0; this.suspendCount = 0; }
  node() {
    const parameter = () => ({ value: 0, setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
    return { gain: parameter(), frequency: parameter(), Q: parameter(), connect() {}, disconnect() {}, start() {}, stop() {} };
  }
  createGain() { return this.node(); }
  createOscillator() { return this.node(); }
  createBiquadFilter() { return this.node(); }
  createBufferSource() { return this.node(); }
  createBuffer(_channels, size) { return { getChannelData: () => new Float32Array(size) }; }
  resume() { this.state = "running"; this.resumeCount += 1; return Promise.resolve(); }
  suspend() { this.state = "suspended"; this.suspendCount += 1; return Promise.resolve(); }
}

function harness(initialStorage = {}) {
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
  const matchMedia = () => Object.assign(new EventTarget(), { matches: false, media: "", addListener() {}, removeListener() {} });
  Object.assign(window, {
    document: dom.document, localStorage, AudioContext: MockAudioContext,
    confirm: () => true, matchMedia, innerWidth: 1000, innerHeight: 800,
    navigator: { userAgent: "regression-vm", maxTouchPoints: 0, getGamepads: () => [] },
    location: { protocol: "http:", href: "http://localhost/pixel-version/" },
    Event: MockEvent, MouseEvent: MockEvent, KeyboardEvent: MockEvent,
  });
  const sandbox = {
    window, document: dom.document, localStorage,
    navigator: window.navigator, location: window.location,
    Event: MockEvent, MouseEvent: MockEvent, KeyboardEvent: MockEvent,
    HTMLElement: dom.Element, HTMLCanvasElement: dom.Element,
    console, performance: { now: () => now }, matchMedia,
    setTimeout: (callback, delay = 0) => { const id = nextId++; timers.set(id, { callback, due: now + delay }); return id; },
    clearTimeout: (id) => timers.delete(id),
    setInterval: (callback, delay = 0) => { const id = nextId++; timers.set(id, { callback, due: now + delay, repeat: Math.max(1, delay) }); return id; },
    clearInterval: (id) => timers.delete(id),
    requestAnimationFrame: (callback) => { const id = nextId++; frames.set(id, callback); return id; },
    cancelAnimationFrame: (id) => frames.delete(id),
    ResizeObserver: class { observe() {} disconnect() {} },
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
  };
  Object.assign(window, sandbox);
  window.window = window;
  const context = vm.createContext(sandbox);
  const evaluate = (code) => vm.runInContext(code, context, { timeout: 3000 });
  assert.ok(scriptOrder.includes("game.js"), "index.html must load the game script");
  for (const name of scriptOrder) {
    const script = name === "game.js" ? source : name === "enhancements.js" ? enhancements : fs.readFileSync(path.join(root, name), "utf8");
    vm.runInContext(script, context, { filename: `pixel-version/${name}`, timeout: 3000 });
  }
  return {
    ...dom, context, storage, window, evaluate,
    value: (code) => JSON.parse(JSON.stringify(evaluate(code))),
    tick(milliseconds = 1600) {
      const end = now + milliseconds;
      let count = 0;
      while (true) {
        const next = [...timers].filter(([, timer]) => timer.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
        if (!next) break;
        assert.ok(count++ < 1000, "timer loop did not settle");
        const [id, timer] = next;
        now = timer.due;
        timers.delete(id);
        timer.callback();
        if (timer.repeat && !timers.has(id)) timers.set(id, { ...timer, due: now + timer.repeat });
      }
      now = end;
    },
    frame(milliseconds = 16) {
      now += milliseconds;
      const pending = [...frames.values()]; frames.clear();
      for (const callback of pending) callback(now);
    },
    snapshot() { return Object.fromEntries(storage); },
  };
}

function finishDialog(game) {
  for (let i = 0; i < 400; i++) {
    if (!game.evaluate("dialogActive") || game.evaluate("!!dialogChoices")) return;
    game.evaluate("advanceDialog()");
  }
  assert.fail("dialogue did not finish within 400 advances");
}

function choose(game, text) {
  assert.ok(game.evaluate("!!dialogChoices"), `no choices while selecting ${text}`);
  const button = game.ids.get("dialogChoices").children.find((item) => item.textContent.includes(text));
  assert.ok(button, `choice missing: ${text}`);
  button.click();
  finishDialog(game);
  game.tick();
  finishDialog(game);
}

const fieldCache = new Map();
function reachableField(game, area) {
  if (fieldCache.has(area)) return fieldCache.get(area);
  const map = game.value(`MAPS[${JSON.stringify(area)}]`);
  const blocked = new Set(game.value("[...BLOCKED]"));
  const tile = game.evaluate("TILE");
  const width = map.grid[0].length * tile;
  const height = map.grid.length * tile;
  const obstacle = (x, y) => {
    const tx = Math.floor(x / tile), ty = Math.floor(y / tile);
    if (tx < 0 || ty < 0 || ty >= map.grid.length || tx >= map.grid[0].length) return true;
    return blocked.has(map.grid[ty].padEnd(map.grid[0].length, "#")[tx]);
  };
  const valid = (x, y) => ![[1, 5], [11, 5], [1, 13], [11, 13]].some(([dx, dy]) => obstacle(x + dx, y + dy));
  const start = [map.spawn.x * tile + 3, map.spawn.y * tile + 2];
  assert.ok(valid(...start), `${area}: spawn collides with the actual 12×14 player AABB`);
  const queue = [start];
  const seen = new Set([start.join(",")]);
  // Every corridor is tile-sized. A 2px lattice samples each legal corridor
  // several times while retaining the exact player collision corner offsets.
  for (let head = 0; head < queue.length; head++) {
    const [x, y] = queue[head];
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
      const nx = x + dx, ny = y + dy, key = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || seen.has(key) || !valid(nx, ny)) continue;
      seen.add(key); queue.push([nx, ny]);
    }
  }
  const result = { map, points: queue, tile };
  fieldCache.set(area, result);
  return result;
}

function standNear(game, id) {
  const area = game.evaluate("G.area");
  const { map, points, tile } = reachableField(game, area);
  const target = [...(map.interact || []), ...(map.npcs || [])].find((item) => item.id === id);
  assert.ok(target, `${area}: interaction ${id} is absent`);
  const candidates = points.filter(([x, y]) => Math.hypot(x + 6 - (target.x * tile + 8), y + 8 - (target.y * tile + 8)) < 26);
  candidates.sort((a, b) => Math.hypot(a[0] + 6 - (target.x * tile + 8), a[1] + 8 - (target.y * tile + 8)) - Math.hypot(b[0] + 6 - (target.x * tile + 8), b[1] + 8 - (target.y * tile + 8)));
  for (const [x, y] of candidates) {
    game.evaluate(`G.px = ${x}; G.py = ${y}`);
    if (game.evaluate("nearestInteractable()?.it.id") === id) return;
  }
  assert.fail(`${area}: ${id} cannot be selected from a reachable player position`);
}

function interact(game, id) {
  assert.equal(game.evaluate("dialogActive"), false, `previous dialogue still active before ${id}`);
  standNear(game, id);
  game.evaluate("tryInteract()");
  finishDialog(game);
  game.tick();
  finishDialog(game);
}

function walkToTile(game, x, y) {
  const { points, tile } = reachableField(game, game.evaluate("G.area"));
  const point = points.find(([px, py]) => Math.floor((px + 6) / tile) === x && Math.floor((py + 8) / tile) === y);
  assert.ok(point, `tile ${x},${y} is unreachable in ${game.evaluate("G.area")}`);
  game.evaluate(`G.px = ${point[0]}; G.py = ${point[1]}; checkExitsAndShards()`);
  game.tick(); finishDialog(game);
}

function exitTo(game, destination) {
  const exits = game.value("MAPS[G.area].exits");
  const exit = exits.find((item) => item.to === destination);
  assert.ok(exit, `no exit from ${game.evaluate("G.area")} to ${destination}`);
  walkToTile(game, exit.x, exit.y);
  assert.equal(game.evaluate("G.area"), destination);
}

function enterGarden(game) {
  game.ids.get("startButton").click(); finishDialog(game);
  for (const id of ["m1", "m2", "m3"]) interact(game, id);
  exitTo(game, "storm");
  for (const id of ["storm1", "storm2"]) interact(game, id);
  exitTo(game, "garden");
}

function enterEmptyHouse(game) {
  enterGarden(game);
  interact(game, "coffin"); choose(game, "再次躺入棺材");
  assert.equal(game.evaluate("G.area"), "house_empty");
}

function enterBlood(game) {
  enterEmptyHouse(game);
  for (const id of ["bed", "bathMirror", "washer", "toilet"]) interact(game, id);
  assert.equal(game.evaluate("G.area"), "garden");
  interact(game, "coffin");
  assert.equal(game.evaluate("G.area"), "house_family");
  for (const id of ["famBed", "father", "mother", "table"]) interact(game, id);
  assert.equal(game.evaluate("G.area"), "blood");
  for (const id of ["sister", "parents", "accuse"]) interact(game, id);
}

function enterMeta(game, retainRain) {
  enterBlood(game); choose(game, "不，我拒绝");
  assert.equal(game.evaluate("G.area"), "rain");
  interact(game, "repress");
  choose(game, retainRain ? "为什么在流失" : "不回来是什么意思");
  exitTo(game, "meta");
  for (const id of ["stele1", "stele2", "stele3", "senpai"]) interact(game, id);
  assert.equal(game.evaluate("!!F.metaDone"), true);
}

function assertEnding(game, id) {
  const expected = game.value(`ENDINGS[${JSON.stringify(id)}]`);
  assert.equal(game.ids.get("endingOverlay").hidden, false);
  assert.equal(game.ids.get("endingName").textContent, expected.name);
  assert.ok(game.value("META.endings").includes(expected.name));
  const reloaded = harness(game.snapshot());
  // Refresh returns to the title card; its resume action must restore the
  // finished ending rather than letting the player move behind its overlay.
  reloaded.ids.get("startButton").click();
  assert.equal(reloaded.ids.get("endingOverlay").hidden, false, `${id}: refresh loses the ending overlay`);
  assert.equal(reloaded.ids.get("endingName").textContent, expected.name, `${id}: refresh restores a different ending`);
  return game;
}

const tests = [];
function test(name, callback) { tests.push([name, callback]); }

test("valid run and cross-run collection load together", () => {
  const game = harness({
    [SAVE]: JSON.stringify({ area: "garden", px: 435, py: 274, flags: { m1: true, sleptOnce: true }, memories: ["周防"], counters: { pain: 1 } }),
    [META]: JSON.stringify({ shards: ["镜之碎片"], endings: ["无中归来者"] }),
  });
  assert.equal(game.evaluate("G.area"), "garden");
  assert.deepEqual(game.value("META"), { shards: ["镜之碎片"], endings: ["无中归来者"] });
  assert.equal(game.evaluate("ngLines('m2', SCRIPTS.m2.lines) === SCRIPTS.m2.lines"), true, "cross-run collection must not rewrite the original dialogue");
});

test("malformed META and run records cannot crash dialogue, movement, or the codex", () => {
  for (const meta of ["{", "null", "[]", '{"shards":null,"endings":{}}', '{"shards":"rain","endings":42}', '{"shards":[null,{},"镜之碎片","镜之碎片"],"endings":[false,"无中归来者"]}']) {
    const game = harness({ [META]: meta, [SAVE]: '{"area":"meta","px":null,"py":-999999,"flags":[],"counters":{"pain":"bad"},"memories":{}}' });
    assert.equal(game.evaluate("Array.isArray(META.shards) && Array.isArray(META.endings)"), true);
    assert.equal(game.evaluate("Number.isFinite(G.px) && Number.isFinite(G.py) && G.px >= 0 && G.py >= 0"), true);
    game.evaluate("playScript('m1')"); finishDialog(game);
    game.evaluate("renderCodex(); ui.start.hidden = true; movePlayer(0.016)");
    game.frame();
  }
});

test("run validation rejects blocked coordinates and unsafe flag/counter structures", () => {
  const game = harness({ [SAVE]: '{"area":"mirror","px":32,"py":16,"flags":{"m1":true,"m2":"yes","__proto__":true,"constructor":true},"memories":["周防","周防",null,{}],"counters":{"pain":99,"recall":9007199254740992,"negative":-1,"fraction":0.5,"safe":2,"__proto__":4}}' });
  assert.equal(game.evaluate("validSavedPosition(MAPS[G.area], G.px, G.py)"), true);
  assert.deepEqual(game.value("F"), { m1: true });
  assert.deepEqual(game.value("G.memories"), ["周防"]);
  assert.deepEqual(game.value("G.counters"), { pain: 3, safe: 2 });
});

test("empty and no-op dialogue completions close once", () => {
  const game = harness();
  game.evaluate("globalThis.completed = 0; playLines([], () => { completed += 1; })");
  assert.equal(game.evaluate("completed"), 1);
  assert.equal(game.evaluate("dialogActive"), false);
  game.evaluate("advanceDialog(); advanceDialog()");
  assert.equal(game.evaluate("completed"), 1);
  game.evaluate("playLines(['a'], () => { completed += 1; })"); finishDialog(game);
  assert.equal(game.evaluate("completed"), 2);
  assert.equal(game.evaluate("dialogActive"), false);
  game.evaluate("advanceDialog()");
  assert.equal(game.evaluate("completed"), 2);
});

test("choice click bubbling does not skip or reveal newly opened dialogue", () => {
  const game = harness();
  game.evaluate("ui.start.hidden = true; playScript('coffinFirst')"); finishDialog(game);
  const button = game.ids.get("dialogChoices").children.find((item) => item.textContent.includes("继续推理"));
  const event = new MockEvent("click", { bubbles: true });
  button.dispatchEvent(event);
  assert.equal(game.evaluate("dialogIndex"), 0);
  assert.equal(game.evaluate("typeDone"), false, "dialogue parent receives the same click and reveals the next line");
  assert.equal(game.evaluate("currentFullText()"), game.evaluate("SCRIPTS.coffinThought.lines[0]"));
  finishDialog(game);
  button.click();
  assert.equal(game.evaluate("dialogActive"), false, "detached stale choice restarts its action");
});

test("reset clears dialogue, choices, keyboard state, and pending continuation", () => {
  const game = harness();
  game.evaluate("ui.start.hidden = true; globalThis.completed = 0; playLines(['pending'], () => { completed += 1; }); keys.add('d'); resetRun()");
  assert.equal(game.evaluate("dialogActive"), false);
  assert.equal(game.ids.get("dialog").hidden, true);
  assert.equal(game.document.activeElement.id, "screen");
  assert.equal(game.evaluate("keys.size"), 0);
  game.evaluate("advanceDialog()");
  assert.equal(game.evaluate("completed"), 0);
  assert.equal(game.evaluate("G.area"), "mirror");
});

test("reset while the opening overlay is visible keeps its start button focused", () => {
  const game = harness();
  assert.equal(game.ids.get("startOverlay").hidden, false);
  game.evaluate("resetRun()");
  assert.equal(game.document.activeElement.id, "startButton");
  assert.equal(game.ids.get("startOverlay").hidden, false);
});

test("reset during a scene transition cancels its delayed teleport", () => {
  const game = harness(); enterGarden(game); interact(game, "coffin");
  const sleep = game.ids.get("dialogChoices").children.find((item) => item.textContent.includes("再次躺入"));
  sleep.click(); finishDialog(game);
  assert.equal(game.evaluate("transitionLock"), true);
  game.evaluate("resetRun()"); game.tick(2500);
  assert.equal(game.evaluate("G.area"), "mirror");
  assert.equal(game.evaluate("dialogActive"), false);
  assert.equal(game.evaluate("transitionLock"), false);
});

test("keyboard auto-repeat does not skip dialogue lines", () => {
  const game = harness();
  game.evaluate("ui.start.hidden = true; playLines(['first', 'second'], () => {})");
  game.window.dispatchEvent(new MockEvent("keydown", { key: "e", repeat: false, target: game.document.body }));
  assert.equal(game.evaluate("typeDone"), true);
  game.window.dispatchEvent(new MockEvent("keydown", { key: "e", repeat: true, target: game.document.body }));
  assert.equal(game.evaluate("dialogIndex"), 0);
  game.window.dispatchEvent(new MockEvent("keyup", { key: "e", target: game.document.body }));
  game.window.dispatchEvent(new MockEvent("keydown", { key: "e", repeat: false, target: game.document.body }));
  assert.equal(game.evaluate("dialogIndex"), 1);
});

test("external continue controls and closed utility panels keep choices keyboard-focused", () => {
  for (const id of ["interactButton", "touchInteract"]) {
    const game = harness();
    game.evaluate("ui.start.hidden = true; playScript('coffinFirst'); while (dialogIndex < dialogLines.length - 1) advanceDialog(); if (!typeDone) advanceDialog(); Expedition.sync()");
    const external = game.ids.get(id);
    assert.equal(external.disabled, false);
    external.focus(); external.click();
    const firstChoice = game.ids.get("dialogChoices").querySelector("button");
    assert.ok(firstChoice, `${id} does not open the actual coffin choices`);
    assert.ok(game.document.activeElement === firstChoice, `${id} steals focus from the first choice`);
    for (const [openerId, dialogId] of [["settingsButton", "settingsDialog"], ["journalButton", "journalDialog"]]) {
      game.ids.get(openerId).focus(); game.ids.get(openerId).click();
      assert.equal(game.ids.get(dialogId).open, true);
      const close = game.document.querySelector(`[data-close='${dialogId}']`);
      assert.ok(close); close.focus(); close.click();
      assert.ok(game.document.activeElement === firstChoice, `${dialogId} closes without restoring the first choice`);
    }
    game.ids.get("codexButton").focus(); game.ids.get("codexButton").click();
    assert.equal(game.ids.get("codex").hidden, false);
    game.ids.get("codexButton").click();
    assert.ok(game.document.activeElement === firstChoice, "closing the codex steals choice focus");
    assert.equal(game.evaluate("!!dialogChoices"), true);
  }
});

test("touch movement remains held beyond 0.6 seconds and pointer cancellation stops it", () => {
  const game = harness();
  game.ids.get("startButton").click(); finishDialog(game);
  const right = game.document.querySelector("[data-direction='arrowright']");
  assert.ok(right);
  const start = game.evaluate("G.px");
  right.dispatchEvent(new MockEvent("pointerdown", { pointerId: 1, bubbles: true }));
  assert.equal(game.evaluate("touchKeys.has('arrowright')"), true);
  for (let i = 0; i < 40; i++) game.frame(16);
  const after640ms = game.evaluate("G.px");
  assert.ok(after640ms > start + 40, "pointerdown did not move the player");
  for (let i = 0; i < 40; i++) game.frame(16);
  assert.ok(game.evaluate("G.px") > after640ms + 40, "touch input expires after the keyboard repeat timeout");
  right.dispatchEvent(new MockEvent("pointercancel", { pointerId: 1, bubbles: true }));
  const stopped = game.evaluate("G.px");
  for (let i = 0; i < 40; i++) game.frame(16);
  assert.equal(game.evaluate("G.px"), stopped);
  assert.equal(game.evaluate("touchKeys.size"), 0);
  assert.equal(right.classList.contains("pressed"), false);
});

test("settings pause typewriter, golden rain, and even stale held movement until closed", () => {
  const game = harness({ [SAVE]: JSON.stringify({ area: "meta", px: 35, py: 258, flags: { metaDone: true, rainMemory: true }, memories: [], counters: {} }) });
  game.ids.get("startButton").click();
  game.evaluate("updateGoldDrop(0.016); playLines(['the typewriter should retain its partial sentence while settings are open'], () => {})");
  game.frame(16);
  assert.ok(game.evaluate("typeTimer") > 0);
  assert.equal(game.evaluate("typeDone"), false);
  const typed = game.ids.get("dialogText").textContent;
  const timer = game.evaluate("typeTimer");
  const drop = game.value("goldDrop");
  game.ids.get("settingsButton").click();
  for (let i = 0; i < 40; i++) game.frame(16);
  assert.equal(game.evaluate("typeTimer"), timer);
  assert.equal(game.ids.get("dialogText").textContent, typed);
  assert.deepEqual(game.value("goldDrop"), drop);
  game.evaluate("closeDialog(); keys.add('d')");
  const position = game.value("[G.px, G.py]");
  for (let i = 0; i < 40; i++) game.frame(16);
  assert.deepEqual(game.value("[G.px, G.py]"), position, "stale movement advances underneath settings");
  game.document.querySelector("[data-close='settingsDialog']").click();
  assert.equal(game.document.activeElement.id, "screen");
  game.frame(16);
  assert.ok(game.evaluate("G.px") > position[0]);
  assert.ok(game.evaluate("goldDrop.wait") < drop.wait);
  game.window.dispatchEvent(new MockEvent("keyup", { key: "d", target: game.document.body }));
});

test("reduced motion suppresses storm particles, lightning, and moving scenery", () => {
  const game = harness({ [SAVE]: JSON.stringify({ area: "storm", px: 51, py: 418, flags: { storm1: true, storm2: true }, memories: [], counters: {} }) });
  game.ids.get("startButton").click();
  game.evaluate("Math.random = () => 0; stormScroll = 123; faller = { x: 120, y: 180 }; particles = [{ k: 'rain', x: 80, y: 80, vy: 100 }]; lightning = 0.22; houseFlicker = 0.1");
  const motion = game.ids.get("motionControl");
  motion.checked = true; motion.dispatchEvent(new MockEvent("change", { bubbles: true }));
  for (let i = 0; i < 40; i++) game.frame(16);
  assert.equal(game.evaluate("particles.length"), 0);
  assert.equal(game.evaluate("lightning + houseFlicker"), 0);
  assert.equal(game.evaluate("stormScroll"), 123);
  assert.equal(game.evaluate("faller.y"), 180);
  // A deterministic positive control confirms this frame would otherwise
  // produce rain and lightning; the preference gates the actual render path.
  motion.checked = false; motion.dispatchEvent(new MockEvent("change", { bubbles: true }));
  game.frame(16);
  assert.ok(game.evaluate("particles.length") > 0);
  assert.ok(game.evaluate("lightning") > 0);
  assert.ok(game.evaluate("stormScroll") > 123);
});

test("nearest interaction selects the closest candidate within a fixed radius", () => {
  const game = harness();
  // Fractional test locations make Euclidean distances exact and isolate the
  // search algorithm from map layout. No production map or script is changed.
  game.evaluate("G.px = 154; G.py = 152; MAPS.mirror.interact = [{x: 10.25, y: 9.5, id: 'near'}, {x: 10.5, y: 9.5, id: 'far'}]; MAPS.mirror.npcs = []");
  assert.equal(game.evaluate("nearestInteractable()?.it.id"), "near");
  game.evaluate("MAPS.mirror.interact = [{x: 10.5, y: 9.5, id: 'first'}, {x: 10.8, y: 9.5, id: 'second'}, {x: 11.2, y: 9.5, id: 'outside'}]");
  assert.equal(game.evaluate("nearestInteractable()?.it.id"), "first");
  game.evaluate("MAPS.mirror.interact = [{x: 11.13, y: 9.5, id: 'outside'}]");
  assert.equal(game.evaluate("nearestInteractable()"), null);
});

test("every map spawn, interactable, conditional NPC, shard, and exit is reachable", () => {
  const game = harness();
  const areas = game.value("Object.keys(MAPS)");
  for (const area of areas) {
    const { map, points, tile } = reachableField(game, area);
    game.evaluate(`G.area = ${JSON.stringify(area)}; F = Object.fromEntries([...Object.values(MAPS)].flatMap(m => (m.npcs || []).filter(n => n.cond).map(n => [n.cond, true])))`);
    for (const target of [...(map.interact || []), ...(map.npcs || [])]) standNear(game, target.id);
    for (const target of [...(map.exits || []), ...(map.shard ? [map.shard] : [])]) {
      assert.ok(points.some(([x, y]) => Math.floor((x + 6) / tile) === target.x && Math.floor((y + 8) / tile) === target.y), `${area}: tile ${target.x},${target.y} is not reachable`);
    }
  }
});

test("safe checkpoints survive transition refresh and preserve completed flags", () => {
  const game = harness(); enterGarden(game);
  interact(game, "coffin");
  const sleep = game.ids.get("dialogChoices").children.find((item) => item.textContent.includes("再次躺入"));
  sleep.click(); finishDialog(game);
  const interrupted = harness(game.snapshot());
  assert.ok(!(interrupted.evaluate("G.area === 'garden' && !!F.sleptOnce")), "refresh restores a half-completed coffin transition and strands the run");
  game.tick(); finishDialog(game);
  const refreshed = harness(game.snapshot());
  refreshed.ids.get("startButton").click();
  assert.equal(refreshed.evaluate("G.area"), "house_empty");
  assert.equal(refreshed.evaluate("!!F.sleptOnce"), true);
  assert.deepEqual(refreshed.value("F"), game.value("F"));
  // Return to the garden through the real photo route and check its entrance
  // flag is saved after, rather than before, the opening dialogue completes.
  for (const id of ["washer", "toilet"]) interact(game, id);
  const returned = harness(game.snapshot());
  assert.equal(returned.evaluate("G.area"), "garden");
  assert.equal(returned.evaluate("!!F.photoReturned && !!F.gardenWoke"), true);
});

test("BAD END 03 is reached by three deliberate recall choices", () => {
  const game = harness(); enterGarden(game);
  for (let i = 0; i < 3; i++) { interact(game, "recall"); choose(game, "强行再度"); }
  assert.equal(game.evaluate("G.counters.recall"), 3);
  assertEnding(game, "bad_twilight");
});

test("BAD END 00 is reached by opening the tank before collecting the photograph", () => {
  const game = harness(); enterEmptyHouse(game); interact(game, "toilet");
  assert.equal(game.evaluate("!!F.hasPhoto"), false);
  assertEnding(game, "bad_nophoto");
});

for (const [id, label] of [["bad_accept", "接受它们"], ["bad_escape", "只想从这里"]]) {
  test(`${id} is reached through the family scene and actual accusation choice`, () => {
    const game = harness(); enterBlood(game); choose(game, label); assertEnding(game, id);
  });
}

test("normal ending is reached after refusing blame and reading all three steles", () => {
  const game = harness(); enterMeta(game, false); interact(game, "flower");
  assert.equal(game.evaluate("!!F.rainMemory"), false);
  assertEnding(game, "normal");
  game.ids.get("endingStay").click();
  assert.equal(game.ids.get("endingOverlay").hidden, true);
  const refreshed = harness(game.snapshot());
  refreshed.ids.get("startButton").click();
  assert.equal(refreshed.ids.get("endingOverlay").hidden, true, "continued stay reopens a completed ending on refresh");
  assert.equal(refreshed.evaluate("endingId"), null);
});

test("reduced motion clears ambient effects while a generated golden drop still leads to the true ending", () => {
  const game = harness(); enterMeta(game, true);
  assert.equal(game.evaluate("!!F.rainMemory"), true);
  game.evaluate("particles = [{ k: 'spark', x: 10, y: 10, life: 1, max: 1 }]; lightning = 0.22; houseFlicker = 0.1");
  const motion = game.ids.get("motionControl");
  motion.checked = true; motion.dispatchEvent(new MockEvent("change", { bubbles: true }));
  assert.equal(game.evaluate("Expedition.prefs.motion"), true);
  assert.equal(game.evaluate("particles.length"), 0);
  assert.equal(game.evaluate("lightning + houseFlicker"), 0);
  for (let i = 0; i < 250 && !game.evaluate("goldDrop"); i++) game.frame(16);
  assert.ok(game.evaluate("goldDrop"), "golden drop did not spawn after the finale conversation");
  const drop = game.value("goldDrop");
  game.evaluate("playLines(['pause while listening'], () => {}); updateGoldDrop(3)");
  assert.deepEqual(game.value("goldDrop"), drop, "golden drop moves while dialogue pauses exploration");
  finishDialog(game);
  if (game.ids.has("settingsDialog")) {
    game.ids.get("settingsDialog").showModal();
    game.evaluate("updateGoldDrop(3)");
    assert.deepEqual(game.value("goldDrop"), drop, "golden drop moves behind an open settings modal");
    game.ids.get("settingsDialog").close();
  }
  const { points } = reachableField(game, "meta");
  const catchingPoint = points.find(([x, y]) => Math.abs(x + 6 - drop.x) < 8 && Math.abs(y + 8 - (drop.catchY ?? 200)) < 4);
  assert.ok(catchingPoint, "golden drop lane has no reachable catching position");
  game.evaluate(`G.px = ${catchingPoint[0]}; G.py = ${catchingPoint[1]}`);
  for (let i = 0; i < 1000 && !game.evaluate("!!F.golden"); i++) game.frame(16);
  assert.equal(game.evaluate("!!F.golden"), true, "reachable golden drop was not collected");
  assert.equal(game.evaluate("particles.length"), 0, "reduced motion still spawns ambient particles");
  assert.equal(game.evaluate("lightning + houseFlicker"), 0);
  interact(game, "flower"); assertEnding(game, "true");
});

test("background audio suspends and resumes only while the player's audio toggle is enabled", () => {
  const game = harness();
  game.ids.get("startButton").click(); finishDialog(game);
  game.ids.get("audioButton").click();
  game.document.hidden = true; game.document.dispatchEvent(new MockEvent("visibilitychange"));
  assert.equal(game.evaluate("AudioEngine.ctx.state"), "suspended");
  assert.equal(game.evaluate("AudioEngine.ctx.suspendCount"), 1);
  game.document.hidden = false; game.document.dispatchEvent(new MockEvent("visibilitychange"));
  assert.equal(game.evaluate("AudioEngine.ctx.state"), "running");
  assert.equal(game.evaluate("AudioEngine.ctx.resumeCount"), 1);
  game.document.hidden = true; game.document.dispatchEvent(new MockEvent("visibilitychange"));
  game.ids.get("audioButton").click();
  game.document.hidden = false; game.document.dispatchEvent(new MockEvent("visibilitychange"));
  assert.equal(game.evaluate("AudioEngine.ctx.resumeCount"), 1, "disabled audio resumes after returning to the page");
  assert.equal(game.evaluate("AudioEngine.enabled"), false);
});

test("frames and audio toggle execute with shipped scripts", () => {
  const game = harness();
  game.ids.get("audioButton").click();
  assert.equal(game.evaluate("AudioEngine.enabled"), true);
  game.frame(); game.frame();
  game.ids.get("audioButton").click(); game.tick();
  assert.equal(game.evaluate("AudioEngine.enabled"), false);
});

let failed = 0;
for (const [name, callback] of tests) {
  try { callback(); console.log(`PASS ${name}`); }
  catch (error) { failed += 1; console.error(`FAIL ${name}\n${error.stack}`); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed (${enhancements ? "game.js + enhancements.js" : "game.js"}).`);
if (failed) process.exitCode = 1;
