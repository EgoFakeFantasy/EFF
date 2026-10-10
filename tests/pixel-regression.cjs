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

function agencyButton(game, fragment, parent = 'agencyActions') {
  const b = game.ids.get(parent).children.find(item => item.tagName === 'BUTTON' && item.textContent.includes(fragment));
  assert.ok(b, `missing agency button: ${fragment}`); assert.ok(!b.disabled); b.click();
}

// Complete new acts via the same rendered controls as a player. Route tests
// still exercise every original paragraph and choice, including new gates.
function completeAgency(game) {
  if (!game.evaluate('NarrativeAgency.active()')) return;
  const kind = game.evaluate('NarrativeAgency.pending.kind');
  if (kind === 'body') {
    for (let i = 0; i < 4; i++) {
      if (game.evaluate(`NarrativeAgency.body.held[${i}]`)) continue;
      game.ids.get('agencyCards').children[i].click(); agencyButton(game, '以自己的回答');
    }
    for (let i = 1; i < 4 && !game.evaluate('NarrativeAgency.connected()'); i++) {
      game.ids.get('agencyCards').children[0].click();game.ids.get('agencyCards').children[i].click();agencyButton(game,'连接选中的');
    }
    agencyButton(game,'合而为一');
  } else if (kind === 'self') {
    for(let i=0;i<4;i++){game.ids.get('agencyCards').children[i].click();agencyButton(game,'承认');}
    agencyButton(game,'由我决定这些过往');
  } else if (kind === 'history') {
    if(game.evaluate('NarrativeAgency.pending.stage')===0)game.ids.get('agencyCards').children[0].click();
    if(game.evaluate('NarrativeAgency.pending.stage')===1)game.ids.get('agencyActions').children[0].click();
    agencyButton(game,'返回现在');
  } else assert.fail('optional epilogue must be operated explicitly');
}

function finishDialog(game) {
  for (let i = 0; i < 400; i++) {
    if (game.evaluate("NarrativeAgency.active()")) { completeAgency(game); game.tick(0); continue; }
    if (!game.evaluate("dialogActive") || game.evaluate("!!dialogChoices")) return;
    game.evaluate("if (typeDone && PhenomenonBattle.pending) PhenomenonBattle.selected = PhenomenonBattle.cue.target; advanceDialog()");
  }
  assert.fail("dialogue did not finish within 400 advances");
}

function nextLine(game) {
  if (game.evaluate("NarrativeAgency.active()")) { completeAgency(game); game.tick(0); return; }
  assert.equal(game.evaluate("dialogActive"), true, "cannot advance an inactive staged scene");
  game.evaluate("if (!typeDone) advanceDialog(); if (PhenomenonBattle.pending) { PhenomenonBattle.commit(PhenomenonBattle.cue.target); } advanceDialog()");
}

function advanceToText(game, fragment) {
  for (let i = 0; i < 120; i++) {
    if (game.evaluate("currentFullText()").includes(fragment)) return;
    nextLine(game);
  }
  assert.fail(`staged scene never reaches: ${fragment}`);
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

function beginInteraction(game, id) {
  assert.equal(game.evaluate("dialogActive"), false, `previous dialogue still active before ${id}`);
  standNear(game, id);
  game.evaluate("tryInteract()");
}

function interact(game, id) {
  beginInteraction(game, id);
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

function enterStorm(game) {
  game.ids.get("startButton").click(); finishDialog(game);
  for (const id of ["m1", "m2", "m3"]) interact(game, id);
  exitTo(game, "storm");
  game.evaluate("startStormSequence()"); finishDialog(game);
  assert.equal(game.evaluate("!!F.storm1"), true);
  assert.equal(game.evaluate("!!F.storm2"), false);
  assert.equal(game.evaluate("nearestInteractable()?.it.id"), "stormReach");
}

function finishStorm(game) {
  // This is a scene-wide reach action, not a teleport to a map marker.
  game.evaluate("tryInteract()"); finishDialog(game);
  game.tick(); finishDialog(game);
  assert.equal(game.evaluate("G.area"), "garden");
  assert.equal(game.evaluate("!!F.storm2"), true);
}

function enterGarden(game) {
  enterStorm(game); finishStorm(game);
}

function enterEmptyHouse(game) {
  enterGarden(game);
  interact(game, "coffin"); choose(game, "再次躺入棺材");
  assert.equal(game.evaluate("G.area"), "house_empty");
  assert.equal(game.evaluate("!!F.emptyWoke"), true);
}

function enterFamily(game) {
  enterEmptyHouse(game);
  for (const id of ["bathMirror", "washer", "toilet"]) interact(game, id);
  assert.equal(game.evaluate("G.area"), "garden");
  interact(game, "coffin");
  assert.equal(game.evaluate("G.area"), "house_family");
  assert.equal(game.evaluate("!!F.familyWoke"), true);
}

function enterBlood(game) {
  enterFamily(game);
  interact(game, "father"); choose(game, "不再停留");
  assert.equal(game.evaluate("G.area"), "blood");
  assert.equal(game.evaluate("!!F.sister"), true, "the bound awakening must precede free exploration");
  interact(game, "parents");
  assert.equal(game.evaluate("!!dialogChoices"), true, "seeing the remains must lead directly to the accusation");
}

function beginAccusation(game) {
  enterFamily(game);
  interact(game, "father"); choose(game, "不再停留");
  beginInteraction(game, "parents");
  advanceToText(game, "但他不能再移动了");
  nextLine(game);
  assert.equal(game.evaluate("currentDialogScript === SCRIPTS.accuse"), true);
  assert.equal(game.evaluate("dialogIndex"), 0);
}

function assertOrdinaryDialog(game) {
  const dialog = game.ids.get("dialog");
  for (const key of ["presentation", "pressure", "choosing"]) {
    assert.equal(dialog.dataset[key], undefined, `${key} survives after the outsider releases the screen`);
  }
}

function completeTwilightRain(game) {
  assert.equal(game.evaluate("NarrativeTrials.rainActive()"), true);
  if (game.evaluate("NarrativeTrials.rain.mode") === "intro") game.ids.get("rainStart").click();
  for (let frame = 0; frame < 29 && game.evaluate("NarrativeTrials.rainActive()"); frame++) {
    game.frame(1000);
    for (const button of [...game.ids.get("rainDrops").children]) {
      if (button.classList.contains("key-drop")) button.click();
    }
  }
  assert.equal(game.evaluate("!!F.twilightCaught"), true, "all four key memories must leave the twilight sea");
  finishDialog(game);
}

function enterMeta(game, retainRain) {
  enterBlood(game); choose(game, "不，我拒绝");
  choose(game, "让世界崩坏"); completeTwilightRain(game); choose(game, "抵达雨塔");
  assert.equal(game.evaluate("G.area"), "rain");
  interact(game, "repress");
  choose(game, retainRain ? "为什么在流失" : "不回来是什么意思");
  if (retainRain) choose(game, "继续追问黄昏");
  choose(game, "询问那些入侵者");
  assert.equal(game.evaluate("PhenomenonBattle.phase"), "rain-rise");
  game.frame(100);
  choose(game, "进入最后一章");
  finishFinaleToCompensation(game);
}

function finishFinaleToCompensation(game) {
  finishDialog(game);
  for (const label of ["故事表面", "下一种写法", "第三种写法", "呼唤无意识", "定义", "幻海消息", "朴素分层", "观察者", "前传人物的终止操作", "重写者回到终章开头", "阅读回写后的补偿结尾"]) choose(game, label);
  assert.equal(game.evaluate("Finale.node()"), "meta_compensation");
  assert.equal(game.evaluate("!!F.finaleRewritten"), true);
}

function reachFinaleRequest(game) {
  finishDialog(game);
  for (const label of ["故事表面", "下一种写法", "第三种写法"]) choose(game, label);
  assert.ok(game.evaluate("currentFullText()").includes("如果真的想帮上忙的话"));
}

function summonFinaleHelp(game) {
  reachFinaleRequest(game);
  choose(game, "呼唤无意识");
  assert.ok(game.evaluate("currentFullText()").includes("如你所愿"));
}

function finaleSave(flags = {}, counters = {}, memories = []) {
  return { [SAVE]: JSON.stringify({ area: "meta", px: 35, py: 258, flags, counters, memories }) };
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
  assert.equal(game.evaluate("currentDialogScript === SCRIPTS.coffinThought && !!dialogChoices"), true, "detached stale choice changes the current decision");
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

test("settings pause typewriter and even stale held movement until closed", () => {
  const game = harness();
  game.ids.get("startButton").click(); finishDialog(game);
  game.evaluate("G.px = 179; G.py = 162; playLines(['the typewriter should retain its partial sentence while settings are open'], () => {})");
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
  assert.equal(game.evaluate("goldDrop"), null);
  game.window.dispatchEvent(new MockEvent("keyup", { key: "d", target: game.document.body }));
});

test("the second act offers a global reach action and stages one body falling toward the red moon", () => {
  const game = harness(); enterStorm(game);
  assert.equal(game.evaluate("SCRIPTS.storm1.lines.at(-1)"), "在偶尔闪过的白光与暗影的怀抱中掉出无尽螺旋的回廊，这也许就是我的命运吧。");
  assert.equal(game.evaluate("MAPS.storm.interact.length + MAPS.storm.exits.length + MAPS.storm.npcs.length"), 0, "the flight scene still requires walking to a story marker");
  const position = game.value("[G.px, G.py]");
  game.window.dispatchEvent(new MockEvent("keydown", { key: "arrowup", target: game.ids.get("screen") }));
  game.window.dispatchEvent(new MockEvent("keydown", { key: "arrowright", target: game.ids.get("screen") }));
  for (let i = 0; i < 200 && !game.evaluate("META.shards.includes('雨之碎片')"); i++) game.frame(16);
  assert.ok(game.evaluate("META.shards.includes('雨之碎片')"), "slight horizontal drift cannot collect the optional rain fragment");
  assert.deepEqual(game.value("[G.px, G.py]"), position, "arrow-up turns the flight into ground movement");
  game.window.dispatchEvent(new MockEvent("keyup", { key: "arrowup", target: game.ids.get("screen") }));
  game.window.dispatchEvent(new MockEvent("keyup", { key: "arrowright", target: game.ids.get("screen") }));
  assert.ok(game.evaluate("StormFlight.x >= 185 && StormFlight.x <= 203"));
  assert.ok(game.evaluate("StormFlight.scroll > 0"), "tower layers do not flow down past the falling body");
  assert.ok(game.evaluate("StormFlight.time > 0"), "downward rain never advances");
  // Legacy coordinates used to gate the chapter. They must be irrelevant to
  // the reach action even when the saved player is far below the old moon.
  game.evaluate("G.px = 3 * TILE + 3; G.py = 26 * TILE + 2");
  assert.equal(game.evaluate("nearestInteractable()?.it.id"), "stormReach");
  game.evaluate("tryInteract()");
  assert.equal(game.evaluate("dialogIndex"), 0);
  assert.equal(game.evaluate("StormFlight.stage"), 1);
  game.evaluate("if (!typeDone) advanceDialog(); advanceDialog()");
  assert.equal(game.evaluate("dialogIndex"), 1);
  assert.equal(game.evaluate("StormFlight.stage"), 2);
  game.evaluate("if (!typeDone) advanceDialog(); advanceDialog(); if (!typeDone) advanceDialog(); advanceDialog()");
  assert.equal(game.evaluate("dialogIndex"), 3);
  assert.equal(game.evaluate("StormFlight.stage"), 3);
  game.evaluate("if (!typeDone) advanceDialog(); advanceDialog()");
  assert.equal(game.evaluate("StormFlight.stage"), 4);
  assert.equal(game.evaluate("currentFullText()"), "下一个奇点再见吧，无名的旅伴。");
  const bodyBefore = game.evaluate("StormFlight.y");
  const towerBefore = game.evaluate("StormFlight.scroll");
  for (let i = 0; i < 40; i++) game.frame(16);
  assert.ok(game.evaluate("StormFlight.y") < bodyBefore, "the body does not approach the sky's red moon");
  assert.ok(game.evaluate("StormFlight.scroll") > towerBefore);
  finishDialog(game); game.tick(); finishDialog(game);
  assert.equal(game.evaluate("G.area"), "garden");
  assert.equal(game.evaluate("!!F.storm2"), true);
});

test("refresh at the reach checkpoint resumes the second act without replaying its opening", () => {
  const game = harness(); enterStorm(game);
  const checkpoint = JSON.parse(game.storage.get(SAVE));
  assert.equal(checkpoint.area, "storm");
  assert.equal(checkpoint.flags.storm1, true);
  assert.equal(Boolean(checkpoint.flags.storm2), false);
  const resumed = harness(game.snapshot());
  resumed.ids.get("startButton").click();
  assert.equal(resumed.evaluate("dialogActive"), false, "the completed opening is replayed after refresh");
  assert.equal(resumed.evaluate("nearestInteractable()?.it.id"), "stormReach");
  finishStorm(resumed);
});

test("an old completed second-act save resumes its farewell and automatically returns to the garden", () => {
  const game = harness({ [SAVE]: JSON.stringify({ area: "storm", px: 179, py: 34, flags: { storm1: true, storm2: true }, memories: ["被呼喊的名字", "红月", "螺旋之塔"], counters: {} }) });
  game.ids.get("startButton").click();
  if (game.evaluate("dialogActive")) assert.equal(game.evaluate("currentFullText()"), "下一个奇点再见吧，无名的旅伴。");
  finishDialog(game); game.tick(); finishDialog(game);
  assert.equal(game.evaluate("G.area"), "garden", "old completed saves are left in a chapter with no ground exit");
});

test("utility pauses freeze the second act and restarting clears its pending story and motion", () => {
  const game = harness(); enterStorm(game); game.frame(32);
  game.ids.get("settingsButton").click();
  const frozen = game.value("[StormFlight.time, StormFlight.scroll, StormFlight.x, StormFlight.y, StormFlight.stage, StormFlight.pose, StormFlight.shadow, StormFlight.approach]");
  for (let i = 0; i < 40; i++) game.frame(16);
  assert.deepEqual(game.value("[StormFlight.time, StormFlight.scroll, StormFlight.x, StormFlight.y, StormFlight.stage, StormFlight.pose, StormFlight.shadow, StormFlight.approach]"), frozen);
  game.document.querySelector("[data-close='settingsDialog']").click(); game.frame(16);
  assert.ok(game.evaluate("StormFlight.time") > frozen[0]);
  game.evaluate("tryInteract()");
  assert.equal(game.evaluate("dialogActive"), true);
  game.ids.get("restartButton").click();
  game.tick(2500);
  for (let i = 0; i < 20; i++) game.frame(16);
  assert.equal(game.evaluate("G.area"), "mirror");
  assert.equal(game.evaluate("dialogActive"), false);
  assert.equal(game.evaluate("transitionLock"), false);
  assert.equal(game.evaluate("!!F.storm1 || !!F.storm2"), false);
  assert.deepEqual(game.value("[StormFlight.time, StormFlight.scroll, StormFlight.stage]"), [0, 0, 0]);
});

test("second-act lightning flashes normally, freezes during settings, and stays off under reduced motion", () => {
  const game = harness(); enterStorm(game);
  game.evaluate("Math.random = () => 0; updateStorm(0.016)");
  const flash = game.evaluate("lightning");
  assert.ok(flash > 0, "the dedicated second-act path no longer produces lightning");
  game.ids.get("settingsButton").click();
  game.evaluate("updateStorm(1)");
  for (let i = 0; i < 40; i++) game.frame(16);
  assert.equal(game.evaluate("lightning"), flash, "an open settings modal still consumes the flash timer");
  game.document.querySelector("[data-close='settingsDialog']").click();
  game.evaluate("Math.random = () => 1; updateStorm(0.016)");
  assert.ok(game.evaluate("lightning") > 0 && game.evaluate("lightning") < flash, "lightning does not decay after exploration resumes");
  const motion = game.ids.get("motionControl");
  motion.checked = true; motion.dispatchEvent(new MockEvent("change", { bubbles: true }));
  assert.equal(game.evaluate("lightning"), 0, "applying reduced motion retains a pending white flash");
  game.evaluate("Math.random = () => 0; updateStorm(0.016)");
  for (let i = 0; i < 40; i++) game.frame(16);
  assert.equal(game.evaluate("lightning"), 0, "reduced motion can still generate second-act lightning");
});

test("reduced motion freezes automatic scenery without blocking the second-act reach or farewell", () => {
  const game = harness(); enterStorm(game); game.frame(16);
  game.evaluate("particles = [{ k: 'rain', x: 80, y: 80, vy: 100 }]; lightning = 0.22; houseFlicker = 0.1");
  const motion = game.ids.get("motionControl");
  motion.checked = true; motion.dispatchEvent(new MockEvent("change", { bubbles: true }));
  const frozen = game.value("[StormFlight.time, StormFlight.scroll]");
  for (let i = 0; i < 40; i++) game.frame(16);
  assert.equal(game.evaluate("particles.length"), 0);
  assert.equal(game.evaluate("lightning + houseFlicker"), 0);
  assert.deepEqual(game.value("[StormFlight.time, StormFlight.scroll]"), frozen);
  finishStorm(game);
  assert.equal(game.evaluate("Expedition.prefs.motion"), true);
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

test("every exploration-map spawn, interactable, conditional NPC, shard, and exit is reachable", () => {
  const game = harness();
  const areas = game.value("Object.keys(MAPS)");
  for (const area of areas) {
    // The second act is an automatic flight scene. Its fragment and reach
    // action are verified through scene completion rather than walking tiles.
    if (area === "storm" || area === "meta") continue;
    const { map, points, tile } = reachableField(game, area);
    game.evaluate(`G.area = ${JSON.stringify(area)}; F = Object.fromEntries([...Object.values(MAPS)].flatMap(m => (m.npcs || []).filter(n => n.cond).map(n => [n.cond, true])))`);
    for (const target of [...(map.interact || []), ...(map.npcs || []).filter(n => !n.passive)]) standNear(game, target.id);
    for (const target of [...(map.exits || []), ...(map.shard ? [map.shard] : [])]) {
      assert.ok(points.some(([x, y]) => Math.floor((x + 6) / tile) === target.x && Math.floor((y + 8) / tile) === target.y), `${area}: tile ${target.x},${target.y} is not reachable`);
    }
  }
});

test("house arrivals wake in bed automatically and old explored saves preserve their progress", () => {
  const game = harness(); enterGarden(game); interact(game, "coffin");
  game.ids.get("dialogChoices").children.find((item) => item.textContent.includes("再次躺入")).click();
  finishDialog(game); game.tick(1200);
  assert.equal(game.evaluate("G.area"), "house_empty");
  assert.equal(game.evaluate("currentFullText()"), "在这个清晨，头发凌乱的少年猛然从床上弹起。");
  assert.equal(game.evaluate("dialogActive"), true);
  assert.equal(game.evaluate("!!F.emptyWoke"), false, "the awakening checkpoint is committed before its text is read");
  assert.equal(game.evaluate("StoryStaging.playerOptions().pose"), "wake");
  assert.equal(game.evaluate("G.px < 7 * TILE && G.py < 7 * TILE"), true, "the awakening is staged outside the bedroom");
  finishDialog(game);
  assert.equal(game.evaluate("!!F.emptyWoke"), true);
  assert.equal(JSON.parse(game.storage.get(SAVE)).flags.emptyWoke, true);
  for (const [area, flag, opening] of [["house_empty", "emptyWoke", "在这个清晨"], ["house_family", "familyWoke", "猛然的"]]) {
    const resumed = harness({ [SAVE]: JSON.stringify({ area, px: 51, py: 50, flags: { hasPhoto: true, father: true, mother: true }, memories: ["已有的记忆"], counters: { pain: 1 } }) });
    resumed.ids.get("startButton").click();
    assert.ok(resumed.evaluate("currentFullText()").startsWith(opening));
    assert.equal(resumed.evaluate("StoryStaging.playerOptions().pose"), "wake");
    finishDialog(resumed);
    assert.equal(resumed.evaluate(`!!F.${flag}`), true);
    if (area === "house_family") {
      choose(resumed, "不再停留");
      assert.equal(resumed.evaluate("G.area"), "blood", "the old breakfast checkpoint cannot continue without retired markers");
    }
    assert.equal(resumed.evaluate("F.hasPhoto && F.father && F.mother"), true);
    assert.ok(resumed.value("G.memories").includes("已有的记忆"));
    assert.equal(resumed.evaluate("G.counters.pain"), 1);
  }
});

test("the tank's second line switches to the garden while its dialogue remains an unsaved transaction", () => {
  const game = harness(); enterEmptyHouse(game); interact(game, "washer");
  const checkpoint = game.storage.get(SAVE);
  beginInteraction(game, "toilet");
  assert.equal(game.evaluate("G.area"), "house_empty");
  game.evaluate("Expedition.chapterTime = 10; Expedition.dom.chapterCard.classList.add('visible')");
  nextLine(game);
  assert.ok(game.evaluate("currentFullText()").includes("在棺材里难受地打滚"));
  assert.equal(game.evaluate("G.area"), "garden", "the scene waits until all toilet dialogue is over before returning to the coffin");
  assert.equal(game.evaluate("dialogActive"), true);
  assert.equal(game.evaluate("StoryStaging.playerOptions().reclined"), true);
  assert.equal(game.evaluate("Expedition.chapterTime"), 0);
  assert.equal(game.ids.get("chapterCard").classList.contains("visible"), false);
  assert.equal(game.evaluate("saveRun()"), false);
  assert.equal(game.storage.get(SAVE), checkpoint, "a staged area switch persists a half-finished photo-return checkpoint");
  advanceToText(game, "从裤兜里掏出的");
  assert.equal(game.evaluate("G.area"), "garden");
  assert.equal(game.evaluate("StoryStaging.playerOptions().pose"), "photo");
  assert.equal(game.evaluate("saveRun()"), false);
  assert.equal(game.storage.get(SAVE), checkpoint);
  const interrupted = harness(game.snapshot());
  assert.equal(interrupted.evaluate("G.area"), "house_empty");
  assert.equal(interrupted.evaluate("!!F.hasPhoto"), true);
  assert.equal(interrupted.evaluate("!!F.photoReturned"), false);
  finishDialog(game); game.tick(); finishDialog(game);
  assert.equal(game.evaluate("G.area"), "garden");
  assert.equal(game.evaluate("!!F.photoReturned"), true);
  const resumed = harness(game.snapshot());
  assert.equal(resumed.evaluate("G.area"), "garden");
  assert.equal(resumed.evaluate("!!F.photoReturned"), true);
});

test("the first return anchors both the marker and the interaction to the actual coffin board", () => {
  const game = harness(); enterEmptyHouse(game);
  for (const id of ["washer", "toilet"]) interact(game, id);
  const coffin = game.value("MAPS.garden.interact.find(it => it.id === 'coffin')");
  assert.equal(game.evaluate(`MAPS.garden.grid[${coffin.y}][${coffin.x}]`), "C");
  assert.equal(game.evaluate("MAPS.garden.npcs.some(n => n.kind === 'echo')"), false, "the inscription must not be assigned to a shadow");
  assert.equal(game.evaluate("nearestInteractable()?.it.id"), "coffin", "the returning player must reach the board without walking to a shadow");
  assert.deepEqual(game.value("Expedition.goalPoint()"), coffin);
  game.evaluate("globalThis.markerCamera = null; const originalCamera = StoryStaging.camera.bind(StoryStaging); StoryStaging.camera = (map, fallback) => { markerCamera = originalCamera(map, fallback); return markerCamera; }");
  game.frame(16);
  const cam = game.value("markerCamera");
  // Markers are pixel glyphs; their drawn anchors are recorded for each frame.
  assert.ok(game.value("PlayAids.lastMarkers").some(m => m.id === "coffin" && m.state === "new" && m.x === coffin.x * 16 + 8 - cam.x && Math.abs(m.y - (coffin.y * 16 - 4 - cam.y)) <= 2), "the displayed marker is detached from the coffin board");
  game.evaluate("tryInteract()");
  assert.equal(game.evaluate("currentDialogScript === SCRIPTS.coffinAgain"), true);
  nextLine(game);
  assert.equal(game.evaluate("StoryStaging.coffin"), true);
  assert.ok(game.evaluate("currentFullText()").includes("打开棺材板"));
});

test("coffin reasoning offers sleep immediately and still allows garden exploration", () => {
  for (const sleep of [false, true]) {
    const game = harness(); enterGarden(game); interact(game, "coffin");
    choose(game, "继续推理");
    assert.equal(game.evaluate("currentDialogScript === SCRIPTS.coffinThought && !!dialogChoices"), true);
    assert.ok(game.ids.get("dialogChoices").children.some(button => button.textContent.includes("再次躺入")));
    choose(game, sleep ? "再次躺入" : "继续调查花园");
    assert.ok(game.value("G.memories").includes("梦中沉眠"));
    assert.equal(game.evaluate("G.area"), sleep ? "house_empty" : "garden");
    assert.equal(game.evaluate("dialogActive"), false);
    if (!sleep) { beginInteraction(game, "edge"); assert.equal(game.evaluate("currentDialogScript === SCRIPTS.edge"), true); }
  }
});

test("old breakfast checkpoints resume at the unread table without repeating the parental greetings", () => {
  const game = harness({ [SAVE]: JSON.stringify({ area: "house_family", px: 227, py: 82, flags: { familyWoke: true, father: true, mother: true }, memories: ["父亲", "母亲"], counters: {} }) });
  game.ids.get("startButton").click();
  assert.equal(game.evaluate("currentDialogScript === SCRIPTS.table"), true);
  assert.equal(game.evaluate("StoryStaging.family"), "table");
  finishDialog(game); choose(game, "不再停留");
  assert.equal(game.evaluate("G.area"), "blood");
  assert.equal(game.evaluate("F.familyDone && F.sister"), true);
});

test("the tower interlude, family breakfast, absent parents, and curtain follow the spoken scene", () => {
  const game = harness(); enterEmptyHouse(game);
  for (const id of ["washer", "toilet"]) interact(game, id);
  beginInteraction(game, "coffin");
  game.evaluate("Expedition.chapterTime = 10; Expedition.dom.chapterCard.classList.add('visible')");
  advanceToText(game, "无限螺旋的高塔");
  assert.equal(game.evaluate("StoryStaging.scene"), "tower");
  assert.equal(game.evaluate("Expedition.chapterTime"), 0);
  assert.equal(game.ids.get("chapterCard").classList.contains("visible"), false);
  game.evaluate("globalThis.tileDraws = 0; ctx.drawImage = (image) => { if (image === tileCache) tileDraws += 1; }");
  game.frame(16);
  assert.equal(game.evaluate("tileDraws"), 0, "the tower interlude still paints the garden map behind its text");
  finishDialog(game); game.tick(1200);
  assert.equal(game.evaluate("G.area"), "house_family");
  assert.ok(game.evaluate("currentFullText()").startsWith("猛然的"));
  assert.equal(game.evaluate("StoryStaging.playerOptions().pose"), "wake");
  finishDialog(game);
  assert.equal(game.evaluate("!!F.familyWoke"), true);
  beginInteraction(game, "father"); advanceToText(game, "厨房门被打开");
  assert.equal(game.evaluate("StoryStaging.mother"), "carry");
  nextLine(game);
  const mother = game.value("StoryStaging.npc(MAPS.house_family.npcs.find(n => n.id === 'mother'))");
  assert.ok(mother.x > 7 && mother.x < 16 && mother.y < 7, "the mother's reply remains at the distant kitchen marker");
  assert.equal(game.evaluate("SCRIPTS.mother.lines.some(l => (typeof l === 'string' ? l : l.t || '').includes('慢慢喝'))"), false);
  advanceToText(game, "桌上摆着");
  assert.equal(game.evaluate("StoryStaging.family"), "table");
  assert.equal(game.evaluate("StoryStaging.playerOptions().pose"), "eat");
  for (const id of ["father", "mother"]) {
    const actor = game.value(`StoryStaging.npc(MAPS.house_family.npcs.find(n => n.id === ${JSON.stringify(id)}))`);
    assert.equal(actor.hidden, false);
    assert.equal(actor.pose, "eat");
    assert.ok(actor.x > 7 && actor.x < 16 && actor.y < 7);
  }
  advanceToText(game, "慢慢喝");
  assert.equal(game.evaluate("StoryStaging.family"), "table");
  advanceToText(game, "父母不急不忙地去上班了");
  assert.equal(game.evaluate("StoryStaging.family"), "gone");
  assert.equal(game.evaluate("MAPS.house_family.npcs.filter(n => ['father','mother'].includes(n.id)).every(n => StoryStaging.npc(n).hidden)"), true);
  game.evaluate("Expedition.chapterTime = 10; Expedition.dom.chapterCard.classList.add('visible')");
  finishDialog(game);
  game.ids.get("dialogChoices").children.find(button => button.textContent.includes("不再停留")).click();
  advanceToText(game, "要开始了吗");
  assert.equal(game.evaluate("StoryStaging.scene"), "curtain");
  assert.equal(game.evaluate("Expedition.chapterTime"), 0);
  assert.equal(game.ids.get("chapterCard").classList.contains("visible"), false);
  game.evaluate("tileDraws = 0"); game.frame(16);
  assert.equal(game.evaluate("tileDraws"), 0, "the curtain still shows the living room backdrop");
  finishDialog(game); game.tick(1200); game.frame(16);
  assert.equal(game.evaluate("G.area"), "blood");
  assert.ok(game.evaluate("tileDraws") > 0, "the special backdrop does not release for the next courtyard scene");
});

test("the blood scene binds the protagonist holding the heart and leads from the guestroom directly to accusation", () => {
  const game = harness(); enterFamily(game);
  beginInteraction(game, "father"); finishDialog(game);
  game.ids.get("dialogChoices").children.find(button => button.textContent.includes("不再停留")).click();
  finishDialog(game); game.tick(1200);
  assert.equal(game.evaluate("G.area"), "blood");
  assert.ok(game.evaluate("currentFullText()").startsWith("被束缚了。有什么东西在撕扯着我的身体，阻碍了我对身体的控制权。"));
  assert.equal(game.evaluate("!!F.sister"), false);
  assert.equal(game.evaluate("StoryStaging.playerOptions().pose"), "bound");
  advanceToText(game, "握着还在鼓动的心脏的手");
  assert.ok(game.evaluate("currentFullText()").includes("握着还在鼓动的心脏的手"));
  assert.equal(game.evaluate("StoryStaging.playerOptions().blood"), true);
  assert.equal(game.evaluate("StoryStaging.playerOptions().reclined"), false);
  assert.equal(game.evaluate("StoryStaging.playerOptions().heldHeart"), true);
  const sibling = game.value("StoryStaging.npc({ id: 'sister', x: 13, y: 7, kind: 'sister' })");
  assert.notEqual(sibling.blood, true);
  assert.notEqual(sibling.heldHeart, true, "the heart is assigned to the sister instead of the protagonist");
  assert.equal(game.evaluate("(() => { const area = G.area; const ok = Object.keys(MAPS).filter(a => a !== 'blood').every(a => { G.area = a; const options = StoryStaging.playerOptions(); return !options.blood && !options.heldHeart; }); G.area = area; return ok; })()"), true);
  advanceToText(game, "洒在已经变得褐色的地板上");
  advanceToText(game, "心脏的主人");
  finishDialog(game);
  assert.equal(game.evaluate("!!F.sister"), true);
  assert.equal(game.evaluate("StoryStaging.playerOptions().pose"), "stand");
  assert.equal(game.evaluate("MAPS.blood.interact.some(it => it.id === 'accuse')"), false);
  beginInteraction(game, "parents"); advanceToText(game, "穿过褐色的客房");
  assert.equal(game.evaluate("G.py + 8 > 12 * TILE"), true, "the guestroom passage is still staged in the open courtyard");
  advanceToText(game, "但他不能再移动了");
  assert.equal(game.evaluate("StoryStaging.playerOptions().pose"), "bound");
  finishDialog(game);
  assert.equal(game.evaluate("!!F.parents"), true);
  assert.equal(game.evaluate("!!dialogChoices"), true, "seeing the remains still requires walking back to an accusation marker");
  assert.equal(game.evaluate("StoryStaging.playerOptions().pose"), "bound");
});

test("the outsider takes over seven complete screens, escalates pressure, and preserves the original accusation in the journal", () => {
  const game = harness(); beginAccusation(game);
  const original = "看看这样的你吧，犯下了如此滔天大罪的感觉如何？是你亲手杀死了你的妹妹，挖出了她的心脏。是你亲自把利剑刺向你父亲的胸膛，而对特别巧合的等待到你的母亲扑了上去试图挡开这一击时再动手，将两个人一同再绝望中贯穿。是你亲自杀害了家中的所有人，然后一把火点燃了一切。如今造下此等恶孽，你该如何是好呢？是接受这一切然后就此堕入魔渊，还是因为接受不了这一切而自刎归天？又或者，只是这样恍恍惚惚茫茫然然，疯疯癫癫的度过余生？";
  const offered = [];
  const pressure = [];
  const dialog = game.ids.get("dialog");
  assert.equal(game.evaluate("dialogLines.length"), 7);
  for (let screen = 0; screen < 7; screen++) {
    const text = game.evaluate("currentFullText()");
    offered.push(text);
    pressure.push(Number(dialog.dataset.pressure));
    assert.equal(game.evaluate("dialogIndex"), screen);
    assert.equal(dialog.dataset.presentation, "takeover");
    assert.equal(dialog.dataset.choosing, undefined);
    assert.equal(game.evaluate("typeDone"), true, `outsider screen ${screen + 1} uses the ordinary typewriter`);
    assert.equal(game.ids.get("dialogText").textContent, text, `outsider screen ${screen + 1} is not fully visible immediately`);
    assert.equal(game.evaluate("StoryStaging.playerOptions().pose"), "bound");
    // Each real input advances once, without an initial reveal-only press.
    if (screen % 2) {
      game.window.dispatchEvent(new MockEvent("keydown", { key: "e", repeat: false, target: game.ids.get("screen") }));
      game.window.dispatchEvent(new MockEvent("keyup", { key: "e", target: game.ids.get("screen") }));
    } else dialog.click();
  }
  assert.equal(offered.join(""), original, "screen breaks change or omit the supplied accusation");
  assert.deepEqual(pressure, [1, 2, 2, 2, 3, 3, 3]);
  assert.equal(game.evaluate("!!dialogChoices"), true);
  assert.equal(dialog.dataset.presentation, "takeover");
  assert.equal(dialog.dataset.pressure, "3");
  assert.equal(dialog.dataset.choosing, "true");
  assert.equal(game.ids.get("dialogText").textContent, offered.at(-1), "offering responses erases the outsider's final sentence");
  assert.deepEqual(game.value("Expedition.journal.slice(-7).map(entry => entry.text)"), offered);
  game.ids.get("journalButton").click();
  assert.equal(game.ids.get("journalDialog").open, true);
  assert.deepEqual(game.ids.get("journalEntries").children.slice(-7).map(entry => entry.querySelector("p").textContent), offered);
  game.document.querySelector("[data-close='journalDialog']").click();
  assert.equal(game.document.activeElement, game.ids.get("dialogChoices").children[0]);
  assert.equal(game.ids.get("dialogText").textContent, offered.at(-1));
});

test("settings freeze takeover inputs and refusal restores ordinary dialogue and releases the bound protagonist", () => {
  const game = harness(); beginAccusation(game);
  const dialog = game.ids.get("dialog");
  const frozen = game.value("[dialogIndex, currentFullText(), typeDone, typeTimer, StoryStaging.playerOptions().pose]");
  game.ids.get("settingsButton").click();
  assert.equal(game.ids.get("settingsDialog").open, true);
  dialog.click();
  game.ids.get("interactButton").click();
  game.ids.get("touchInteract").click();
  game.window.dispatchEvent(new MockEvent("keydown", { key: "e", repeat: false, target: game.ids.get("screen") }));
  game.window.dispatchEvent(new MockEvent("keyup", { key: "e", target: game.ids.get("screen") }));
  for (let i = 0; i < 40; i++) game.frame(16);
  assert.deepEqual(game.value("[dialogIndex, currentFullText(), typeDone, typeTimer, StoryStaging.playerOptions().pose]"), frozen);
  assert.equal(game.ids.get("dialogText").textContent, frozen[1]);
  assert.equal(dialog.dataset.presentation, "takeover");
  assert.equal(dialog.dataset.pressure, "1");
  game.document.querySelector("[data-close='settingsDialog']").click();
  dialog.click();
  assert.equal(game.evaluate("dialogIndex"), 1, "closing settings leaves the subtitle input paused");
  finishDialog(game);
  const refusal = game.ids.get("dialogChoices").children.find(button => button.textContent.includes("不，我拒绝"));
  game.ids.get("settingsButton").click();
  dialog.click();
  refusal.click();
  game.window.dispatchEvent(new MockEvent("keydown", { key: "Enter", repeat: false, target: game.ids.get("screen") }));
  game.window.dispatchEvent(new MockEvent("keyup", { key: "Enter", target: game.ids.get("screen") }));
  assert.equal(game.evaluate("currentDialogScript === SCRIPTS.accuse && !!dialogChoices"), true);
  assert.equal(dialog.dataset.choosing, "true");
  game.document.querySelector("[data-close='settingsDialog']").click();
  assert.equal(game.document.activeElement, game.ids.get("dialogChoices").children[0]);
  refusal.click();
  assert.equal(game.evaluate("currentFullText()"), "不，我拒绝这一切。");
  assertOrdinaryDialog(game);
  assert.equal(game.evaluate("typeDone"), false, "the protagonist inherits the outsider's instant text presentation");
  assert.equal(game.evaluate("StoryStaging.playerOptions().pose"), "stand");
  nextLine(game);
  assert.equal(game.evaluate("StoryStaging.playerOptions().pose"), "stand");
  assertOrdinaryDialog(game);
  finishDialog(game); game.tick(); finishDialog(game);
  choose(game, "让世界崩坏"); completeTwilightRain(game); choose(game, "抵达雨塔");
  assert.equal(game.evaluate("G.area"), "rain");
  assert.equal(game.evaluate("!!F.refused"), true);
  assertOrdinaryDialog(game);
});

test("restarting and both accusation endings clear takeover presentation from subsequent screens", () => {
  for (const awaitingChoice of [false, true]) {
    const game = harness(); beginAccusation(game);
    if (awaitingChoice) finishDialog(game);
    assert.equal(game.ids.get("dialog").dataset.presentation, "takeover");
    game.ids.get("restartButton").click(); game.tick(2500); game.frame(16);
    assert.equal(game.evaluate("G.area"), "mirror");
    assert.equal(game.evaluate("dialogActive"), false);
    assert.equal(game.ids.get("dialog").hidden, true);
    assertOrdinaryDialog(game);
    beginInteraction(game, "m1");
    assertOrdinaryDialog(game);
    assert.equal(game.evaluate("typeDone"), false);
  }
  for (const [id, label] of [["bad_accept", "接受它们"], ["bad_escape", "只想从这里"]]) {
    const game = harness(); enterBlood(game);
    assert.equal(game.ids.get("dialog").dataset.choosing, "true");
    choose(game, label); assertEnding(game, id);
    assert.equal(game.evaluate("dialogActive"), false);
    assert.equal(game.ids.get("dialog").hidden, true);
    assertOrdinaryDialog(game);
    game.ids.get("endingRestart").click();
    assert.equal(game.evaluate("G.area"), "mirror");
    assertOrdinaryDialog(game);
    finishDialog(game);
    beginInteraction(game, "m1");
    assertOrdinaryDialog(game);
    assert.equal(game.evaluate("typeDone"), false);
  }
});

test("the mother carries food through open floor, pauses with settings, and an interrupted breakfast resumes safely", () => {
  const game = harness({ [SAVE]: JSON.stringify({ area: "house_family", px: 227, py: 82, flags: { familyWoke: true, father: true }, memories: [], counters: {} }) });
  game.ids.get("startButton").click();
  assert.equal(game.evaluate("currentDialogScript === SCRIPTS.mother"), true, "old saves must resume the next unread breakfast scene");
  game.evaluate("StoryStaging.renderSpecial(performance.now(), 0.4)");
  const moving = game.value("StoryStaging.npc(MAPS.house_family.npcs.find(n => n.id === 'mother'))");
  game.ids.get("settingsDialog").showModal();
  game.evaluate("StoryStaging.renderSpecial(performance.now(), 2)");
  assert.deepEqual(game.value("StoryStaging.npc(MAPS.house_family.npcs.find(n => n.id === 'mother'))"), moving);
  game.ids.get("settingsDialog").close();
  game.evaluate("StoryStaging.carryElapsed = 0");
  for (let frame = 0; frame <= 150; frame++) {
    assert.equal(game.evaluate("(() => { const n = StoryStaging.npc(MAPS.house_family.npcs.find(n => n.id === 'mother')); return validSavedPosition(MAPS.house_family, n.x * TILE + 2, n.y * TILE); })()"), true, `mother crosses furniture or a wall at frame ${frame}`);
    game.evaluate("StoryStaging.renderSpecial(performance.now(), 1 / 60)");
  }
  nextLine(game);
  const settled = game.value("StoryStaging.npc(MAPS.house_family.npcs.find(n => n.id === 'mother'))");
  assert.equal(settled.x, 12); assert.equal(settled.y, 5);
  advanceToText(game, "桌上摆着");
  assert.equal(game.evaluate("StoryStaging.family"), "table");
  assert.equal(game.evaluate("!!F.mother"), true);
  assert.equal(!!JSON.parse(game.storage.get(SAVE)).flags.mother, false, "the continuous breakfast must not save a half-read sequence");
  const resumed = harness(game.snapshot()); resumed.ids.get("startButton").click();
  assert.equal(resumed.evaluate("currentDialogScript === SCRIPTS.mother"), true);
  assert.equal(resumed.evaluate("StoryStaging.mother"), "carry");
  finishDialog(resumed); choose(resumed, "不再停留");
  assert.equal(resumed.evaluate("G.area"), "blood");
  assert.equal(resumed.evaluate("F.father && F.mother && F.familyDone"), true);
  assert.equal(JSON.parse(resumed.storage.get(SAVE)).flags.familyDone, true);
});

test("old family and blood checkpoints resume the next scene with the protagonist inside its camera", () => {
  const game = harness({ [SAVE]: JSON.stringify({ area: "blood", px: 35, py: 18, flags: { sister: true, parents: true }, memories: [], counters: {} }) });
  game.ids.get("startButton").click();
  assert.equal(game.evaluate("StoryStaging.playerOptions().pose"), "bound");
  assert.equal(game.evaluate("G.px"), 12 * 16 + 3);
  assert.equal(game.evaluate("G.py"), 14 * 16 + 2);
  finishDialog(game);
  assert.equal(game.evaluate("!!dialogChoices"), true);
  for (const [area, flags, expected] of [["house_family", { familyDone: true }, "blood"], ["blood", { sister: true, parents: true, refused: true }, "rain"]]) {
    const resumed = harness({ [SAVE]: JSON.stringify({ area, px: 51, py: 50, flags, memories: [], counters: {} }) });
    resumed.ids.get("startButton").click(); resumed.tick(1200);
    assert.equal(resumed.evaluate("G.area"), expected);
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

test("normal ending is reached through all original writing operations and compensation", () => {
  const game = harness(); enterMeta(game, false); choose(game, "接受这份");
  assert.equal(game.evaluate("!!F.rainMemory"), false);
  assertEnding(game, "normal");
  game.ids.get("endingStay").click();
  assert.equal(game.ids.get("endingOverlay").hidden, true);
  const refreshed = harness(game.snapshot());
  refreshed.ids.get("startButton").click();
  assert.equal(refreshed.ids.get("endingOverlay").hidden, true, "continued stay reopens a completed ending on refresh");
  assert.equal(refreshed.evaluate("endingId"), null);
});

test("reduced motion preserves the original textual answer and full true ending without a finale golden-catch prerequisite", () => {
  const game = harness(); enterMeta(game, true);
  game.evaluate("particles = [{ k: 'spark', x: 10, y: 10, life: 1, max: 1 }]; lightning = 0.22; houseFlicker = 0.1");
  const motion = game.ids.get("motionControl");
  motion.checked = true; motion.dispatchEvent(new MockEvent("change", { bubbles: true }));
  assert.equal(game.evaluate("particles.length"), 0);
  assert.equal(game.evaluate("lightning + houseFlicker"), 0);
  assert.equal(game.evaluate("!!F.golden"), false);
  const answer = game.ids.get("dialogText").querySelector(".finale-answer");
  assert.ok(answer, "the original answer is not an actionable paragraph");
  answer.click(); game.tick(); finishDialog(game);
  assertEnding(game, "true");
  assert.equal(game.ids.get("endingText").textContent, game.value("FinaleScenes.ending.text.map(line => Finale.text(line))").join("\n\n"));
  assert.equal(game.evaluate("!!F.golden"), false);
  assert.equal(game.evaluate("goldDrop"), null);
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


test("the nine finale nodes preserve operations and paragraphs with the novel correction to the compensation ending", () => {
  const original = fs.readFileSync(path.resolve(root, "..", "game.js"), "utf8");
  const originalScenes = vm.runInNewContext(original.slice(original.indexOf("const scenes ="), original.indexOf("const defaultState")) + "\nscenes");
  originalScenes.normal_ending.text[1] = "于绝境之中领悟了真灵不灭法的存在，却在自身、自身之暗淡与敌人的斗争中，无意间造就了更为重要的东西之表象。";
  const game = harness();
  for (const key of game.value("Finale.keys")) assert.deepEqual(game.value("FinaleScenes[" + JSON.stringify(key) + "]"), JSON.parse(JSON.stringify(originalScenes[key])), key + ": original finale content changed");
  assert.equal(game.evaluate("FinaleScenes.meta_prequel.text.length"), 18);
  assert.equal(game.evaluate("FinaleScenes.ending.text.length"), 11);
  assert.equal(game.evaluate("!!SCRIPTS.stele1 || !!SCRIPTS.flowerTrue"), false, "compressed finale scripts remain playable");
});

test("unconscious help starts at Zhou's request after the complete two-party contest", () => {
  const game = harness(finaleSave()); game.ids.get('startButton').click();
  assert.deepEqual(game.value('dialogLines.map(line => line.t)'), game.value('FinaleScenes.meta_1.text.map(raw => Finale.text(raw))'));
  assert.equal(game.ids.get('phenomenonStage').dataset.mode, 'appearance');
  assert.equal(game.ids.get('historyAnchors').hidden, true);
  game.evaluate('Finale.act(FinaleScenes.meta_1.phaseChoices[0][0])');
  assert.equal(game.evaluate('Finale.step()'), 0, 'help cannot be activated before the request');
  finishDialog(game);
  for (const label of ['故事表面', '下一种写法', '第三种写法']) {
    const choice = game.ids.get('dialogChoices').children.find(button => button.textContent.includes(label));
    assert.ok(choice); choice.click(); game.tick();
    assert.equal(game.ids.get('phenomenonStage').dataset.mode, 'appearance');
    assert.equal(game.ids.get('historyAnchors').hidden, true);
    assert.equal(game.evaluate('Finale.step()'), 0);
    if (label !== '第三种写法') finishDialog(game);
  }
  advanceToText(game, '我需要提醒你');
  assert.equal(game.ids.get('phenomenonStage').dataset.mode, 'appearance', 'the warning must not start assistance');
  nextLine(game);
  assert.ok(game.evaluate('currentFullText()').includes('如果真的想帮上忙的话'));
  assert.equal(game.ids.get('dialogSpeaker').textContent, '周防');
  assert.equal(game.ids.get('phenomenonStage').dataset.mode, 'summons');
  assert.equal(game.evaluate('!!F.finaleSummoned'), false);
  finishDialog(game);
  assert.ok(game.ids.get('dialogChoices').children.every(button => !button.textContent.includes('回溯')));
  game.ids.get('settingsButton').click(); game.ids.get('dialogChoices').children[0].click();
  assert.equal(game.evaluate('!!F.finaleSummoned'), false);
  game.document.querySelector('[data-close="settingsDialog"]').click();
  game.ids.get('dialogChoices').children[0].click();
  const checkpoint = JSON.parse(game.storage.get(SAVE));
  assert.equal(checkpoint.flags.finaleSummoned, true);
  assert.equal(checkpoint.counters.finaleStep, 0);
  assert.equal(checkpoint.counters.finaleFrom, 8);
  const resumed = harness(game.snapshot()); resumed.ids.get('startButton').click();
  assert.ok(resumed.evaluate('currentFullText()').includes('...如你所愿'));
  assert.equal(resumed.ids.get('phenomenonStage').dataset.mode, 'history');
  assert.ok(resumed.ids.get('historyAnchors').children.every(button => button.disabled));
  finishDialog(resumed);
  assert.equal(resumed.ids.get('historyAnchors').children[0].disabled, false);
  resumed.ids.get('historyAnchors').children[0].click(); completeAgency(resumed); resumed.tick();
  assert.ok(resumed.evaluate('currentFullText()').includes('真的定义吗'));
  assert.equal(resumed.evaluate('Finale.step()'), 1);
});

test("unfinished premature-help saves replay the contest without erasing rain memory or completed endings", () => {
  const game = harness(finaleSave({finaleStarted:true,rainMemory:true}, {finaleNode:0,finaleStep:1,finaleFrom:6}, ['手心里的雨水']));
  game.ids.get('startButton').click();
  assert.equal(game.evaluate('Finale.step()'), 0);
  assert.equal(game.evaluate('G.counters.finaleFlow'), 2);
  assert.equal(game.evaluate('dialogLines.length'), 10);
  assert.equal(game.evaluate('!!F.finaleSummoned'), false);
  assert.equal(game.evaluate('F.rainMemory'), true);
  assert.ok(game.value('G.memories').includes('手心里的雨水'));
  assert.equal(game.ids.get('historyAnchors').hidden, true);
  reachFinaleRequest(game);
  assert.equal(game.value("G.memories").includes("跨时序书写战"), false);
  const resumed = harness(game.snapshot()); resumed.ids.get('startButton').click();
  assert.equal(resumed.evaluate('Finale.node()'), 'meta_state_3');
  assert.equal(resumed.evaluate('Finale.step()'), 0);
  assert.equal(resumed.ids.get('phenomenonStage').dataset.mode, 'appearance');
  finishDialog(resumed);
  assert.ok(resumed.evaluate('currentFullText()').includes('如果真的想帮上忙的话'));
  assert.equal(resumed.ids.get('historyAnchors').hidden, true);
});

test("the first two retroactive actions reveal their original anchors while preserving earlier wording", () => {
  const game = harness(finaleSave()); game.ids.get("startButton").click();
  assert.equal(game.evaluate("dialogLines.length"), 10);
  assert.equal(game.ids.get("dialog").dataset.presentation, "finale");
  assert.equal(game.document.body.classList.contains("finale-active"), true);
  const start = game.value("[G.px, G.py]");
  game.evaluate("keys.add('d'); movePlayer(1)");
  assert.deepEqual(game.value("[G.px, G.py]"), start);
  summonFinaleHelp(game); game.ids.get("dialogChoices").children[0].click(); completeAgency(game); game.tick();
  assert.equal(game.evaluate("Finale.step()"), 1);
  assert.ok(game.evaluate("dialogLines[0].t").includes("真的定义吗"));
  assert.ok(game.ids.get("finaleLedger").textContent.includes("当且仅当"));
  assert.equal(game.evaluate("Finale.compose('meta_1').length"), 10);
  finishDialog(game); game.ids.get("dialogText").scrollTop = 100;
  game.ids.get("dialogChoices").children[0].click(); completeAgency(game); game.tick();
  assert.equal(game.ids.get("dialogText").scrollTop, 0);
  assert.equal(game.evaluate("Finale.step()"), 2);
  assert.ok(game.evaluate("dialogLines[0].t").includes("令人感到兴奋的知识"));
  assert.equal(game.evaluate("Finale.compose('meta_1').length"), 12);
  assert.ok(game.value("Finale.compose('meta_1').map(line => Finale.text(line))").some(text => text.includes("真的定义吗")));
});

test("story revisions show the full struck wording and its replacement on the text stage", () => {
  const game = harness(finaleSave()); game.ids.get("startButton").click(); finishDialog(game);
  for (const label of ["故事表面", "下一种写法"]) choose(game, label);
  assert.equal(game.evaluate("Finale.node()"), "meta_state_2");
  assert.equal(game.ids.get("dialogText").querySelector("del").textContent, game.evaluate("FinaleScenes.meta_state_2.text[0].original"));
  assert.equal(game.ids.get("dialogText").querySelector("ins").textContent, game.evaluate("FinaleScenes.meta_state_2.text[0].replacement"));
  assert.equal(game.ids.get("dialog").dataset.voice, "rewrite");
  choose(game, "第三种写法"); choose(game, "呼唤无意识"); choose(game, "定义"); choose(game, "幻海消息"); choose(game, "朴素分层");
  assert.equal(game.evaluate("Finale.step()"), 3);
  assert.ok(game.evaluate("dialogLines[0].t").includes("我并不建议在这样朴素的分层中"));
  assert.equal(game.evaluate("Finale.compose('meta_state_3').length"), 12);
});

test("chapter rewriting restores the original first-page insertion and awards the crystal fragment", () => {
  const game = harness(finaleSave({ rainMemory: true })); game.ids.get("startButton").click();
  finishDialog(game);
  for (const label of ["故事表面", "下一种写法", "第三种写法", "呼唤无意识", "定义", "幻海消息", "朴素分层", "观察者", "前传人物的终止操作"]) choose(game, label);
  assert.equal(game.evaluate("Finale.node()"), "meta_prequel");
  assert.equal(game.evaluate("dialogLines.length"), 18);
  const prequel = game.value("FinaleScenes.meta_prequel.text.map(line => Finale.text(line))");
  assert.ok(prequel.every(text => game.value("Expedition.journal.map(entry => entry.text)").includes(text)), "prequel paragraphs disappeared from the actual route");
  choose(game, "重写者回到终章开头");
  assert.equal(game.evaluate("Finale.node()"), "meta_1");
  assert.equal(game.evaluate("dialogLines[0].t"), game.evaluate("FinaleScenes.meta_1.revealAfterRewrite[0].text"));
  assert.equal(game.evaluate("dialogLines.length"), 13);
  assert.ok(game.value("META.shards").includes("水晶碎片"));
  assert.equal(game.ids.get("dialogChoices").children[0].textContent, "阅读回写后的补偿结尾");
});

test("former stele and golden-drop saves restart the missing original chapter", () => {
  const game = harness(finaleSave({ stele1: true, stele2: true, stele3: true, metaDone: true, golden: true, rainMemory: true }));
  game.ids.get("startButton").click();
  assert.equal(game.evaluate("Finale.node()"), "meta_1");
  assert.equal(game.evaluate("Finale.step()"), 0);
  assert.equal(game.evaluate("currentFullText()"), game.evaluate("FinaleScenes.meta_1.text[0].text"));
  assert.equal(game.ids.get("endingOverlay").hidden, true);
  assert.equal(game.evaluate("goldDrop"), null);
  assert.equal(game.ids.get("mapButton").hidden, true);
});

test("the rain-memory answer is absent without its original prerequisite and cannot activate in another node", () => {
  const game = harness(finaleSave()); game.ids.get("startButton").click();
  game.evaluate("Finale.answer()");
  assert.equal(game.evaluate("Finale.node()"), "meta_1");
  finishFinaleToCompensation(game);
  assert.equal(game.ids.get("dialogText").querySelector(".finale-answer"), null);
  game.evaluate("Finale.answer()");
  assert.equal(game.evaluate("Finale.node()"), "meta_compensation");
  choose(game, "接受这份"); assertEnding(game, "normal");
  assert.equal(game.ids.get("endingText").textContent, game.value("FinaleScenes.normal_ending.text.map(line => Finale.text(line))").join("\n\n"));
});

test("refresh commits an insertion before its next page and restarting cancels queued finale work", () => {
  const game = harness(finaleSave()); game.ids.get("startButton").click(); summonFinaleHelp(game);
  game.ids.get("dialogChoices").children[0].click(); completeAgency(game);
  const saved = JSON.parse(game.storage.get(SAVE));
  assert.equal(saved.counters.finaleStep, 1);
  assert.equal(saved.counters.finaleFrom, 6);
  const resumed = harness(game.snapshot()); resumed.ids.get("startButton").click();
  assert.ok(resumed.evaluate("currentFullText()").includes("真的定义吗"));
  assert.equal(resumed.evaluate("Finale.step()"), 1);
  game.ids.get("restartButton").click(); game.tick(2000);
  assert.equal(game.evaluate("G.area"), "mirror");
  assert.equal(game.evaluate("Finale.timer"), null);
  assert.equal(game.document.body.classList.contains("finale-active"), false);
  assert.equal(game.ids.get("finaleHeading").hidden, true);
  assertOrdinaryDialog(game);
});

test("settings pause the secret answer and the true ending restores naming and gallery operations", () => {
  const game = harness(finaleSave({ rainMemory: true })); game.ids.get("startButton").click(); finishFinaleToCompensation(game);
  const answer = game.ids.get("dialogText").querySelector(".finale-answer");
  game.ids.get("settingsButton").click(); answer.click(); game.ids.get("dialog").click();
  assert.equal(game.evaluate("Finale.node()"), "meta_compensation");
  game.document.querySelector("[data-close='settingsDialog']").click();
  answer.click(); game.tick(); finishDialog(game); assertEnding(game, "true");
  game.ids.get("endingRename").click();
  assert.equal(game.ids.get("renameDialog").open, true);
  game.ids.get("protagonistName").value = "新的旅伴";
  game.ids.get("renameForm").dispatchEvent(new MockEvent("submit", { bubbles: true }));
  assert.equal(game.ids.get("renameDialog").open, false);
  assert.equal(JSON.parse(game.storage.get(SAVE)).protagonistName, "新的旅伴");
  assert.equal(game.document.title, "无垠之萍 · 箱庭版");
  game.ids.get("endingGallery").click();
  assert.equal(game.ids.get("codex").hidden, false);
  game.ids.get("codexButton").click(); game.ids.get("endingStay").click(); finishDialog(game);
  assert.equal(game.ids.get("endingOverlay").hidden, true);
  assert.equal(game.evaluate("Finale.node()"), "ending");
  assert.deepEqual(game.ids.get("dialogChoices").children.map(button => button.textContent), ["打开记忆画廊", "修改周防的名字", "从镜像阶段重新开始", "螺旋之后 · 研究院尾声"]);
  const restored = harness(game.snapshot()); restored.ids.get("startButton").click();
  assert.equal(restored.evaluate("G.protagonistName"), "新的旅伴");
  assert.equal(restored.ids.get("endingOverlay").hidden, true);
});


test("terminal naming pauses the stage, preserves its choice on cancel, and resets without reopening", () => {
  const game = harness(finaleSave({ finaleStarted: true, finaleTrue: true, finaleRewritten: true }, { finaleNode: 8, finaleStep: 3 }));
  game.ids.get("startButton").click(); finishDialog(game);
  game.ids.get("dialogChoices").children[1].click();
  assert.equal(game.ids.get("renameDialog").open, true);
  assert.equal(game.evaluate("Expedition.paused()"), true);
  assert.equal(game.evaluate("dialogActive"), false);
  game.ids.get("protagonistName").value = "   ";
  game.ids.get("renameForm").dispatchEvent(new MockEvent("submit"));
  assert.equal(game.ids.get("renameDialog").open, true);
  assert.equal(game.evaluate("G.protagonistName"), "周防");
  game.document.querySelector("[data-close='renameDialog']").click();
  finishDialog(game);
  assert.equal(game.evaluate("Finale.node()"), "ending");
  assert.equal(game.ids.get("endingOverlay").hidden, true);
  game.ids.get("dialogChoices").children[1].click();
  game.evaluate("resetRun()"); game.tick(2000);
  assert.equal(game.ids.get("renameDialog").open, false);
  assert.equal(game.evaluate("G.area"), "mirror");
  assert.equal(game.evaluate("dialogActive"), false);
});

test("an interrupted true ending replays its unread chapter before recording completion", () => {
  const game = harness(finaleSave({ finaleStarted: true, finaleRewritten: true, rainMemory: true }, { finaleNode: 8, finaleStep: 3 }));
  game.ids.get("startButton").click();
  assert.equal(game.evaluate("dialogLines.length"), 11);
  nextLine(game); game.frame(4000);
  assert.equal(game.evaluate("!!F.finaleTrue"), false);
  assert.equal(game.value("META.endings").length, 0);
  const restored = harness(game.snapshot()); restored.ids.get("startButton").click();
  assert.equal(restored.evaluate("currentFullText()"), restored.evaluate("FinaleScenes.ending.text[0].text"));
  finishDialog(restored);
  assert.equal(restored.evaluate("!!F.finaleTrue"), true);
  assertEnding(restored, "true");
});


test("courtyard and rain preserve game passages and restore omitted novel dialogue in its correct order", () => {
  const game = harness();
  const original = fs.readFileSync(path.join(root, '..', 'game.js'), 'utf8');
  const canonical = vm.runInNewContext(original.slice(original.indexOf('const scenes ='), original.indexOf('const defaultState')) + '\nscenes');
  for (const [script, scene] of [['refusal','refusal'],['clash','clash'],['repress','rain_1'],['rainMemory','rain_memory'],['rainDeath','rain_death'],['rainEnemy','rain_enemy']]) {
    const expected = Array.from(canonical[scene].text.map(line => typeof line === 'string' ? line : line.text));
    if(scene==='refusal'){
      expected[7]+='好似是有狮子在咆哮，好似是雷霆突然从黑暗中出现。';
      expected.splice(8,0,'如果只是嘴上功夫的话可敷衍不了我们这群经验丰富，阅片无数的家伙啊。','快点，快些爆发出新的力量然后再一度被我们困入绝望的世界吧！我已经等不及了。');
    }
    if(scene==='clash') expected[3]+='在那红色的月亮之上，似乎还有一座更加宏伟的高塔，那两团光真正要落入的，或许是那如同台阶般无限衍生的塔之螺旋吧……';
    if(scene==='rain_1'){
      const explanation=expected.pop();expected.pop();expected.pop();
      expected.push('话说回来，要不是我发现了这个情况，那你可能此时已经不在这里了呢，无中归来的人。','不在这里？你不是说……这里是我的心象空间？那么，我不应该想来时就可以来到吗？',explanation,'为什么？','你说的是哪一个？','所有的。');
    }
    assert.deepEqual(game.value('SCRIPTS[' + JSON.stringify(script) + '].lines.map(line => line.t)'), Array.from(expected));
  }
  assert.deepEqual(game.value('SCRIPTS.refusal.choices.map(c => c.label)'), ['让世界崩坏']);
  assert.deepEqual(game.value('SCRIPTS.clash.choices.map(c => c.label)'), ['抵达雨塔']);
  for (const [script, scene] of [['rainMemory','rain_memory'],['rainDeath','rain_death'],['rainEnemy','rain_enemy']]) assert.deepEqual(game.value('SCRIPTS[' + JSON.stringify(script) + '].choices.map(c => c.label)'), Array.from(canonical[scene].choices.map(c => c.label)));
  assert.equal(game.evaluate('SCRIPTS.rainEnemy.lines.at(-1).stage.battle.phase'), 'rain-rise');
});

test("rain tower fairy aside belongs to an anonymous observer, then returns to the inner voice", () => {
  const game = harness();
  game.evaluate("ui.start.hidden = true; G.area = 'rain'; playScript('rainDeath')");
  assert.deepEqual(game.value("SCRIPTS.rainDeath.lines.map(line => line.s || '')"), ['周防','压抑','','压抑','？？？','？？？','？？？','？？？']);
  advanceToText(game, '水潭吗');
  for (const fragment of ['水潭吗', '可爱的小妖精', '小妖精总是会离开', '请继续观赏吧']) {
    assert.ok(game.evaluate('currentFullText()').includes(fragment));
    assert.equal(game.ids.get('dialogSpeaker').textContent, '？？？');
    assert.equal(game.ids.get('portraitFrame').hidden, false);
    assert.equal(game.ids.get('portraitFrame').dataset.role, 'unknown');
    assert.equal(game.ids.get('speakerPortrait').getAttribute('aria-label'), '身份不明的说话者');
    nextLine(game);
  }
  const button = game.ids.get('dialogChoices').children.find(item => item.textContent.includes('询问那些入侵者'));
  assert.ok(button);
  button.click();
  assert.equal(game.ids.get('dialogSpeaker').textContent, '周防');
  assert.equal(game.ids.get('portraitFrame').dataset.role, 'zhou');
  nextLine(game);
  assert.equal(game.ids.get('dialogSpeaker').textContent, '压抑');
  assert.equal(game.ids.get('portraitFrame').dataset.role, 'shadow');
});

test("body ownership requires a matching act, wrong targets neither advance nor invent a bad ending", () => {
  const game = harness({ [SAVE]: JSON.stringify({ area:'blood',px:211,py:130,flags:{sister:true,parents:true},counters:{},memories:[] }) });
  game.ids.get('startButton').click(); finishDialog(game);
  game.ids.get('dialogChoices').children[2].click();
  assert.equal(game.ids.get('portraitFrame').hidden, false);
  assert.ok(game.ids.get('speakerPortrait').getAttribute('aria-label').includes('血迹'));
  game.evaluate('advanceDialog()');
  game.ids.get('battleTargets').children[2].click();
  assert.equal(game.evaluate('dialogIndex'), 0);
  assert.equal(game.evaluate('PhenomenonBattle.pending'), true);
  assert.equal(game.evaluate('endingId'), null);
  game.ids.get('battleTargets').children[0].click();
  assert.equal(game.evaluate('PhenomenonBattle.pending'), false);
  assert.equal(game.evaluate('dialogIndex'), 0, 'writing must not skip the response text');
  game.ids.get('dialog').click();
  nextLine(game);
  assert.equal(game.evaluate('dialogIndex'), 2);
  assert.equal(game.evaluate('PhenomenonBattle.cue.target'), 1);
  game.evaluate('advanceDialog()');
  game.ids.get('settingsButton').click();
  const frozen = game.value('[dialogIndex, PhenomenonBattle.selected, PhenomenonBattle.time]');
  game.ids.get('battleTargets').children[1].click(); game.frame(2000);
  assert.deepEqual(game.value('[dialogIndex, PhenomenonBattle.selected, PhenomenonBattle.time]'), frozen);
  game.document.querySelector('[data-close="settingsDialog"]').click();
  game.document.dispatchEvent(new MockEvent('keydown', {key:'ArrowRight'}));
  assert.equal(game.evaluate('PhenomenonBattle.selected'), 1);
  assert.equal(game.document.activeElement, game.ids.get('battleTargets').children[1]);
  game.ids.get('interactButton').click();
  assert.equal(game.evaluate('PhenomenonBattle.claimed[1]'), true);
  finishDialog(game); choose(game, '让世界崩坏');
  assert.equal(game.evaluate('NarrativeTrials.rainActive()'), true);
  completeTwilightRain(game);
  assert.equal(game.evaluate('PhenomenonBattle.phase'), 'clash');
  assert.equal(game.evaluate('F.refused'), undefined, 'clash is not a complete victory over the outsider');
  choose(game, '抵达雨塔');
  assert.equal(game.evaluate('G.area'), 'rain');
  assert.equal(game.ids.get('battlePanel').hidden, true);
});

test("history anchors unlock only the original offered retroaction and commit its checkpoint", () => {
  const game = harness(finaleSave({rainMemory:true})); game.ids.get('startButton').click();
  assert.equal(game.ids.get('phenomenonStage').hidden, false);
  assert.equal(game.ids.get('historyAnchors').hidden, true);
  assert.equal(game.ids.get('historyAnchors').children.length, 0);
  summonFinaleHelp(game);
  assert.equal(game.ids.get('historyAnchors').hidden, false);
  const anchor = game.ids.get('historyAnchors').children[0];
  assert.equal(anchor.disabled, false);
  game.ids.get('settingsButton').click(); anchor.click();
  assert.equal(game.evaluate('Finale.step()'), 0);
  game.document.querySelector('[data-close="settingsDialog"]').click(); anchor.click(); completeAgency(game);
  assert.equal(JSON.parse(game.storage.get(SAVE)).counters.finaleStep, 1);
  game.tick();
  assert.ok(game.evaluate('currentFullText()').includes('真的定义吗'));
  assert.ok(game.ids.get('phenomenonStage').getAttribute('aria-label').includes('已回写1处'));
  finishDialog(game); game.ids.get('historyAnchors').children[1].click(); completeAgency(game); game.tick();
  assert.equal(game.evaluate('Finale.step()'), 2);
  assert.ok(game.evaluate('currentFullText()').includes('幻海'));
});

test("battle motion stops under reduced motion and reset clears its unfinished act", () => {
  const game = harness({ [SAVE]: JSON.stringify({ area:'blood',px:211,py:130,flags:{sister:true,parents:true},counters:{},memories:[] }) });
  game.ids.get('startButton').click(); finishDialog(game); game.ids.get('dialogChoices').children[2].click();
  game.ids.get('settingsButton').click(); game.ids.get('motionControl').checked = true; game.ids.get('motionControl').dispatchEvent(new MockEvent('change'));
  game.document.querySelector('[data-close="settingsDialog"]').click();
  const before = game.evaluate('PhenomenonBattle.time'); game.frame(1000);
  assert.equal(game.evaluate('PhenomenonBattle.time'), before);
  assert.equal(game.evaluate('PhenomenonBattle.pending'), true, 'motion preference cannot solve the battle');
  game.evaluate('resetRun()'); game.tick();
  assert.equal(game.evaluate('PhenomenonBattle.pending'), false);
  assert.equal(game.ids.get('battlePanel').hidden, true);
  assert.equal(game.ids.get('portraitFrame').hidden, true);
});

function familyRiskGame(seed = 0, stays = 0) {
  const game = harness({ [SAVE]: JSON.stringify({ area: "house_family", px: 179, py: 82, flags: { familyWoke: true, father: true, mother: true }, memories: ["父亲", "母亲"], counters: {}, trials: { version: 1, family: { mode: "choice", seed, stays } } }) });
  game.ids.get("startButton").click(); finishDialog(game); return game;
}
function courtDecisionGame() {
  const game = harness({ [SAVE]: JSON.stringify({ area: "blood", px: 195, py: 226, flags: { sister: true, parents: true }, memories: [], counters: {} }) });
  game.ids.get("startButton").click(); return game;
}
function twilightGame() {
  const game = courtDecisionGame(); finishDialog(game); choose(game, "我拒绝"); choose(game, "让世界崩坏");
  assert.equal(game.evaluate("NarrativeTrials.rain.mode"), "intro"); return game;
}

test("family risk rises only on chosen stays and a stored lock cannot be rerolled on refresh", () => {
  const game = familyRiskGame();
  assert.ok(game.ids.get("dialogChoices").children[0].textContent.includes("20%"));
  choose(game, "再留一天");
  assert.equal(game.evaluate("NarrativeTrials.family.stays"), 1);
  assert.ok(game.ids.get("dialogChoices").children[0].textContent.includes("30%"));
  const afterDay = game.value("NarrativeTrials.family");
  const resumed = harness(game.snapshot()); resumed.ids.get("startButton").click(); finishDialog(resumed);
  assert.deepEqual(resumed.value("NarrativeTrials.family"), afterDay);
  resumed.ids.get("dialogChoices").children[0].click();
  assert.equal(resumed.evaluate("NarrativeTrials.family.mode"), "locked");
  const lockedSave = resumed.snapshot();
  const locked = harness(lockedSave); locked.ids.get("startButton").click();
  assert.equal(locked.evaluate("NarrativeTrials.family.mode"), "locked");
  assert.equal(locked.evaluate("!!dialogChoices"), false);
  assert.ok(locked.evaluate("currentFullText()").includes("早餐之后仍然是早餐"));
  finishDialog(locked); assertEnding(locked, "bad_family");
  const ending = harness(locked.snapshot()); ending.ids.get("startButton").click(); assertEnding(ending, "bad_family");
});

test("family exploration leaves without a lottery and the day risk caps at sixty percent", () => {
  const game = familyRiskGame(0, 9);
  assert.ok(game.ids.get("dialogChoices").children[0].textContent.includes("60%"));
  const stale = game.ids.get("dialogChoices").children[0];
  choose(game, "不再停留");
  assert.equal(game.evaluate("G.area"), "blood");
  assert.equal(game.evaluate("NarrativeTrials.family"), null);
  stale.click(); assert.equal(game.evaluate("endingId"), null);
  assert.equal(game.evaluate("G.area"), "blood");
});

test("the occupation deadline starts only after all accusations are read and expires into the occupied-body ending", () => {
  const game = courtDecisionGame(); game.frame(60000);
  assert.equal(game.evaluate("NarrativeTrials.court"), null, "reading must not start a reaction clock");
  finishDialog(game); assert.equal(game.evaluate("NarrativeTrials.court.remaining"), 24000);
  assert.equal(game.ids.get("trialHUD").hidden, false);
  game.frame(24001);
  assert.equal(game.evaluate("NarrativeTrials.court.mode"), "lost");
  assert.equal(game.evaluate("!!dialogChoices"), false);
  finishDialog(game); assertEnding(game, "bad_owned");
});

test("occupation time and choices pause in settings, the background and a blurred window, then resume without a reset", () => {
  const game = courtDecisionGame(); finishDialog(game); game.frame(5000);
  assert.equal(game.evaluate("NarrativeTrials.court.remaining"), 19000);
  game.ids.get("settingsButton").click(); game.frame(90000);
  assert.equal(game.evaluate("NarrativeTrials.court.remaining"), 19000);
  game.document.querySelector('[data-close="settingsDialog"]').click();
  game.document.hidden = true; game.document.dispatchEvent(new MockEvent("visibilitychange")); game.frame(90000);
  assert.equal(game.evaluate("NarrativeTrials.court.remaining"), 19000);
  game.document.hidden = false; game.document.dispatchEvent(new MockEvent("visibilitychange"));
  game.window.dispatchEvent(new MockEvent("blur")); game.frame(90000);
  assert.equal(game.evaluate("NarrativeTrials.court.remaining"), 19000);
  game.window.dispatchEvent(new MockEvent("focus")); game.frame(1000);
  const resumed = harness(game.snapshot()); resumed.ids.get("startButton").click();
  assert.equal(resumed.evaluate("NarrativeTrials.court.remaining"), 18000);
  assert.equal(resumed.evaluate("!!dialogChoices"), true);
  resumed.frame(18001); finishDialog(resumed); assertEnding(resumed, "bad_owned");
});

test("ownership targets consume decision time, a correct act restores five seconds, and refresh preserves the next act", () => {
  const game = courtDecisionGame(); finishDialog(game); game.ids.get("dialogChoices").children[2].click();
  game.evaluate("advanceDialog()"); game.frame(10000);
  assert.equal(game.evaluate("NarrativeTrials.court.remaining"), 14000);
  game.ids.get("battleTargets").children[2].click();
  assert.equal(game.evaluate("NarrativeTrials.court.remaining"), 14000);
  game.ids.get("battleTargets").children[0].click();
  assert.equal(game.evaluate("NarrativeTrials.court.remaining"), 19000);
  const written = harness(game.snapshot()); written.ids.get("startButton").click();
  assert.equal(written.evaluate("PhenomenonBattle.pending"), false);
  assert.ok(written.ids.get("battleTargets").children.every(button => button.disabled));
  assert.equal(written.ids.get("battleTargets").children[0].classList.contains("written"), true);
  advanceToText(game, "造下这一切的不是我"); game.evaluate("advanceDialog()"); game.frame(3000);
  assert.equal(game.evaluate("NarrativeTrials.court.remaining"), 16000);
  game.ids.get("battleTargets").children[2].dispatchEvent(new MockEvent("focus")); game.evaluate("NarrativeTrials.checkpoint()");
  const resumed = harness(game.snapshot()); resumed.ids.get("startButton").click();
  assert.equal(resumed.evaluate("dialogIndex"), 2);
  assert.equal(resumed.evaluate("PhenomenonBattle.cue.target"), 1);
  assert.deepEqual(resumed.value("PhenomenonBattle.claimed"), [true, false, false]);
  assert.equal(resumed.evaluate("NarrativeTrials.court.remaining"), 16000);
  assert.equal(resumed.evaluate("PhenomenonBattle.selected"), 2);
  assert.equal(resumed.ids.get("battleTargets").children[2].classList.contains("selected"), true);
  resumed.evaluate("advanceDialog()"); resumed.frame(16001); finishDialog(resumed); assertEnding(resumed, "bad_owned");
});

test("completed ownership acts stop the deadline before the collision narrative", () => {
  const game = courtDecisionGame(); finishDialog(game); choose(game, "我拒绝");
  assert.equal(game.evaluate("NarrativeTrials.court.mode"), "won");
  const before = game.evaluate("NarrativeTrials.court.remaining"); game.frame(60000);
  assert.equal(game.evaluate("NarrativeTrials.court.remaining"), before);
  assert.equal(game.evaluate("endingId"), null);
  const resumed = harness(game.snapshot()); resumed.ids.get("startButton").click(); finishDialog(resumed);
  assert.equal(resumed.evaluate("NarrativeTrials.court.mode"), "won");
  choose(resumed, "让世界崩坏"); assert.equal(resumed.evaluate("NarrativeTrials.rainActive()"), true);
});

test("twilight rain waits for an explicit start and all four catches resume the interrupted canonical paragraph", () => {
  const game = twilightGame(); game.frame(120000);
  assert.equal(game.evaluate("NarrativeTrials.rain.elapsed"), 0);
  assert.equal(game.ids.get("rainStart").hidden, false);
  completeTwilightRain(game);
  assert.equal(game.evaluate("!!F.twilightCaught"), true);
  assert.equal(game.evaluate("!!F.rainMemory"), false, "the minigame must not grant the later original answer");
  assert.equal(game.evaluate("NarrativeTrials.rain"), null);
  assert.equal(game.ids.get("rainTrial").hidden, true);
  assert.ok(game.evaluate("currentFullText()").includes("显意识的边缘"));
  choose(game, "抵达雨塔"); assert.equal(game.evaluate("G.area"), "rain");
});

test("missing zero or one of the four critical rains produces the twilight failure instead of reaching the tower", () => {
  for (const caught of [0, 3]) {
    const game = twilightGame(); game.ids.get("rainStart").click();
    for (let step = 0; step < 30 && game.evaluate("NarrativeTrials.rain.mode") === "play"; step++) {
      game.frame(1000);
      if (caught) for (const button of [...game.ids.get("rainDrops").children]) {
        if (button.classList.contains("key-drop") && button.textContent !== "意志") button.click();
      }
    }
    assert.equal(game.evaluate("NarrativeTrials.rain.mode"), "lost");
    assert.equal(game.evaluate("!!F.twilightCaught || !!F.refused"), false);
    finishDialog(game); assertEnding(game, "bad_rain");
    assert.equal(game.ids.get("rainDrops").children.length, 0);
  }
});

test("rain catches and elapsed time survive refresh, with stale buttons unable to award a second catch", () => {
  const game = twilightGame(); game.ids.get("rainStart").click(); game.frame(1300);
  const gold = game.ids.get("rainDrops").children.find(button => button.classList.contains("key-drop"));
  gold.click(); const saved = game.value("NarrativeTrials.rain"); gold.click();
  assert.deepEqual(game.value("NarrativeTrials.rain"), saved);
  const resumed = harness(game.snapshot()); resumed.ids.get("startButton").click();
  assert.equal(resumed.evaluate("NarrativeTrials.rain.elapsed"), 1300);
  assert.equal(resumed.evaluate("NarrativeTrials.rain.mask"), 1);
  assert.equal(resumed.ids.get("rainStart").hidden, true);
  completeTwilightRain(resumed); choose(resumed, "抵达雨塔");
  assert.equal(resumed.evaluate("G.area"), "rain");
});

test("rain keeps retries for missed keys, pauses catches with utility panels, and supports keyboard and touch continuation", () => {
  const game = twilightGame(); game.ids.get("touchInteract").click(); game.frame(1300);
  const first = game.ids.get("rainDrops").children.find(button => button.classList.contains("key-drop"));
  game.ids.get("settingsButton").click(); first.click(); game.frame(90000);
  assert.equal(game.evaluate("NarrativeTrials.rain.elapsed"), 1300);
  assert.equal(game.evaluate("NarrativeTrials.rain.mask"), 0);
  game.document.querySelector('[data-close="settingsDialog"]').click();
  game.frame(12000);
  const retry = game.ids.get("rainDrops").children.find(button => button.classList.contains("key-drop") && button.textContent === "自我");
  assert.ok(retry, "an uncaught key must return before the deadline");
  for (let step = 0; step < 12 && game.evaluate("NarrativeTrials.selected") !== game.evaluate("NarrativeTrials.rain.drops.find(d => d.key === 0).id"); step++) game.document.dispatchEvent(new MockEvent("keydown", { key: "ArrowRight" }));
  game.document.dispatchEvent(new MockEvent("keydown", { key: "e" }));
  assert.equal(game.evaluate("NarrativeTrials.rain.mask & 1"), 1);
  completeTwilightRain(game);
});

test("reduced motion freezes rain scenery and drop positions but preserves the challenge and its timing", () => {
  const game = twilightGame(); game.ids.get("settingsButton").click();
  game.ids.get("motionControl").checked = true; game.ids.get("motionControl").dispatchEvent(new MockEvent("change"));
  game.document.querySelector('[data-close="settingsDialog"]').click();
  game.ids.get("rainStart").click(); game.frame(1300);
  const gold = game.ids.get("rainDrops").children.find(button => button.classList.contains("key-drop"));
  const top = gold.style.top; game.frame(1000); assert.equal(gold.style.top, top);
  assert.equal(game.evaluate("NarrativeTrials.rain.elapsed"), 2300);
  completeTwilightRain(game);
});

test("restarting cancels every new trial and malformed trial data does not bypass the story", () => {
  for (const factory of [familyRiskGame, courtDecisionGame, twilightGame]) {
    const game = factory(); finishDialog(game);
    const stale = game.ids.get("rainStart"); game.evaluate("resetRun()"); stale.click(); game.frame(40000);
    assert.equal(game.evaluate("NarrativeTrials.family || NarrativeTrials.court || NarrativeTrials.rain"), null);
    assert.equal(game.ids.get("rainTrial").hidden, true);
    assert.equal(game.ids.get("trialHUD").hidden, true);
    assert.equal(game.evaluate("G.area"), "mirror");
  }
  const game = harness({ [SAVE]: JSON.stringify({ area: "blood", px: 195, py: 226, flags: { sister: true, parents: true }, counters: {}, memories: [], trials: { version: 1, court: { mode: "choice", remaining: -1, script: "refusal", index: 99, claimed: [true] }, rain: { mode: "play", mask: 31, elapsed: null, drops: [null] } } }) });
  game.ids.get("startButton").click();
  assert.equal(game.evaluate("currentDialogScript === SCRIPTS.accuse"), true);
  assert.equal(game.evaluate("NarrativeTrials.rain"), null);
});

test("novel speaker identities and the internal heart-space question follow chapters 053 and 057", () => {
  const game=harness();
  assert.equal(game.evaluate("SCRIPTS.storm2.lines.at(-1).s"),'无名者');
  assert.equal(game.evaluate("SCRIPTS.echoStorm.lines.at(-1).s"),'无名者');
  game.evaluate("ui.start.hidden=true;G.area='rain';playScript('repress')");
  advanceToText(game,'心象空间有两种形式');assert.equal(game.ids.get('dialogSpeaker').textContent,'压抑');
  nextLine(game);assert.equal(game.evaluate('currentFullText()'),'为什么？');assert.equal(game.ids.get('dialogSpeaker').textContent,'周防');
  nextLine(game);assert.equal(game.evaluate('currentFullText()'),'你说的是哪一个？');assert.equal(game.ids.get('dialogSpeaker').textContent,'压抑');
  nextLine(game);assert.equal(game.evaluate('currentFullText()'),'所有的。');assert.equal(game.ids.get('dialogSpeaker').textContent,'周防');
});

test("the dropped heart remains released through the guest room and an old courtyard checkpoint", () => {
  const game=harness({[SAVE]:JSON.stringify({area:'blood',px:195,py:130,flags:{},memories:[],counters:{}})});
  game.ids.get('startButton').click();advanceToText(game,'抓力松去');
  assert.equal(game.evaluate('StoryStaging.playerOptions().pose'),'kneel');
  assert.equal(game.evaluate('StoryStaging.playerOptions().heldHeart'),false);assert.equal(game.evaluate('StoryStaging.playerOptions().blood'),true);
  finishDialog(game);assert.equal(game.evaluate('StoryStaging.playerOptions().heldHeart'),false);
  const resumed=harness(game.snapshot());resumed.ids.get('startButton').click();
  assert.equal(resumed.evaluate('StoryStaging.playerOptions().heldHeart'),false);assert.equal(resumed.evaluate('!!F.sister'),true);
  beginInteraction(resumed,'parents');assert.equal(resumed.evaluate('StoryStaging.playerOptions().heldHeart'),false);
});

test("optional investigations expose the depicted objects without consuming the rain answer or inventing memories", () => {
  const game=harness();game.evaluate("ui.start.hidden=true;G.area='rain';StoryStaging.reset();buildTileCache()");
  for(const id of ['rainPool','rainCrack']){beginInteraction(game,id);assert.ok(game.evaluate('currentFullText()').includes(id==='rainPool'?'水潭':'裂隙'));finishDialog(game);}
  assert.equal(game.evaluate('!!F.rainMemory||!!F.rainDone'),false);
  game.evaluate("G.area='garden';buildTileCache()");beginInteraction(game,'coffinWood');assert.ok(game.evaluate('currentFullText()').includes('什么都没有留下'));finishDialog(game);
  assert.equal(game.evaluate('!!F.sleptOnce'),false);
});

test("camera sampling snaps to source pixels while movement retains subpixel precision", () => {
  const game=harness();game.evaluate("ui.start.hidden=true;G.area='garden';G.px=245.375;G.py=155.875;StoryStaging.reset();buildTileCache();globalThis.samples=[];ctx.drawImage=(image,...args)=>{if(image===tileCache)samples.push(args)}");
  game.frame(16);const sample=game.value('samples[0]');assert.ok(sample);assert.equal(sample[0],Math.round(sample[0]));assert.equal(sample[1],Math.round(sample[1]));
  assert.equal(game.evaluate('G.px'),245.375);assert.equal(game.evaluate('G.py'),155.875);
});

test("map pointer coordinates account for camera offset and mobile letterboxing", () => {
  const game=harness();
  game.evaluate("Expedition.camera={x:80,y:16};canvas.getBoundingClientRect=()=>({left:10,top:20,width:640,height:384})");
  assert.deepEqual(game.value('Expedition.mapPoint(58,116)'),{x:104,y:64});
  game.evaluate("canvas.getBoundingClientRect=()=>({left:10,top:20,width:320,height:280})");
  assert.equal(game.evaluate('Expedition.mapPoint(50,30)'),null);
  assert.deepEqual(game.value('Expedition.mapPoint(34,112)'),{x:104,y:64});
  assert.equal(game.evaluate('Expedition.mapPoint(340,112)'),null);
});


function startBodyAct() {
  const game = harness({[SAVE]:JSON.stringify({area:'rain',px:195,py:258,flags:{repress:true},counters:{},memories:[]})});
  game.ids.get('startButton').click();game.evaluate("playScript('rainMemory')");
  advanceToText(game,'这似乎是个死局');nextLine(game);
  assert.equal(game.evaluate('NarrativeAgency.pending.kind'),'body');return game;
}
function startSelfAct() {
  const game = harness(finaleSave({finaleStarted:true,finaleRewritten:true,rainMemory:true},{finaleNode:8,finaleStep:3,finaleFlow:2}));
  game.ids.get('startButton').click();advanceToText(game,'我的过往由我对他们重新的编排');nextLine(game);
  assert.equal(game.evaluate('NarrativeAgency.pending.kind'),'self');return game;
}
function startHistoryAct() {
  const game=harness(finaleSave());game.ids.get('startButton').click();summonFinaleHelp(game);
  game.ids.get('historyAnchors').children[0].click();assert.equal(game.evaluate('NarrativeAgency.pending.kind'),'history');return game;
}

test('body shards resist imposed attribution and need a connected whole before the canonical reunion',()=>{
 const game=startBodyAct(),index=game.evaluate('dialogIndex');
 agencyButton(game,'让枯手');assert.equal(game.evaluate('!!F.agencyBody'),false);
 assert.deepEqual(game.value('NarrativeAgency.body.held'),[false,false,false,false]);
 game.evaluate('advanceDialog();keys.add("d");movePlayer(1)');assert.equal(game.evaluate('dialogIndex'),index);
 for(const i of [3,1,0,2]){game.ids.get('agencyCards').children[i].click();agencyButton(game,'以自己的回答');}
 assert.equal(game.evaluate('NarrativeAgency.connected()'),false);
 const connect=(a,b)=>{game.ids.get('agencyCards').children[a].click();game.ids.get('agencyCards').children[b].click();agencyButton(game,'连接选中的');};
 connect(2,3);connect(1,3);assert.equal(game.evaluate('NarrativeAgency.connected()'),false);connect(0,2);
 assert.equal(game.evaluate('NarrativeAgency.connected()'),true);agencyButton(game,'合而为一');
 assert.ok(game.evaluate('currentFullText()').includes('再度合而为一'));assert.equal(game.evaluate('!!F.rainMemory'),false);
 finishDialog(game);choose(game,'继续追问黄昏');assert.equal(game.evaluate('!!F.rainMemory'),true);assert.equal(game.evaluate('NarrativeAgency.pending'),null);
});

test('shard progress, links and the unread reunion survive refresh without prematurely awarding rain memory',()=>{
 let game=startBodyAct();game.ids.get('agencyCards').children[2].click();agencyButton(game,'以自己的回答');
 game=harness(game.snapshot());game.ids.get('startButton').click();assert.deepEqual(game.value('NarrativeAgency.body.held'),[false,false,true,false]);
 for(const i of [0,1,3]){game.ids.get('agencyCards').children[i].click();agencyButton(game,'以自己的回答');}
 game.ids.get('agencyCards').children[1].click();game.ids.get('agencyCards').children[2].click();agencyButton(game,'连接选中的');
 game=harness(game.snapshot());game.ids.get('startButton').click();assert.deepEqual(game.value('NarrativeAgency.body.links'),[[1,2]]);
 completeAgency(game);const joined=harness(game.snapshot());joined.ids.get('startButton').click();
 assert.equal(joined.evaluate('NarrativeAgency.active()'),false);assert.ok(joined.evaluate('currentFullText()').includes('再度合而为一'));
 finishDialog(joined);choose(joined,'继续追问黄昏');assert.equal(joined.evaluate('!!F.rainMemory'),true);
});

test('new acts pause under utilities and blur and cannot be changed by replaced controls',()=>{
 const game=startBodyAct(),old=game.ids.get('agencyActions').children[0];
 game.ids.get('settingsButton').click();old.click();assert.equal(game.evaluate('NarrativeAgency.body.held[0]'),false);
 game.document.querySelector('[data-close="settingsDialog"]').click();
 game.window.dispatchEvent(new MockEvent('blur'));old.click();assert.equal(game.evaluate('NarrativeAgency.body.held[0]'),false);
 game.window.dispatchEvent(new MockEvent('focus'));old.click();assert.equal(game.evaluate('NarrativeAgency.body.held[0]'),true);
 game.ids.get('agencyCards').children[1].click();old.click();assert.equal(game.evaluate('NarrativeAgency.body.held[1]'),false);
 game.evaluate('resetRun()');old.click();assert.equal(game.evaluate('NarrativeAgency.active()'),false);assert.equal(game.ids.get('dialog').inert,false);
 assert.deepEqual(game.value('NarrativeAgency.body.held'),[false,false,false,false]);
});

test('history investigation changes premises before committing an insertion, not a stronger victory claim',()=>{
 const game=startHistoryAct();assert.equal(game.evaluate('Finale.step()'),0);
 game.ids.get('agencyCards').children[1].click();assert.equal(game.evaluate('NarrativeAgency.pending.stage'),0);
 game.ids.get('agencyCards').children[0].click();game.ids.get('agencyActions').children[2].click();
 assert.equal(game.evaluate('NarrativeAgency.pending.stage'),1);assert.equal(game.evaluate('Finale.step()'),0);
 game.ids.get('agencyActions').children[1].click();assert.equal(game.evaluate('NarrativeAgency.pending.stage'),2);
 assert.ok(game.ids.get('agencyCards').textContent.includes('真的定义吗'));
 const stale=game.ids.get('agencyActions').children[0];stale.click();stale.click();game.tick();
 assert.equal(game.evaluate('Finale.step()'),1);assert.deepEqual(game.value('NarrativeAgency.history[0]'),{method:1});
 assert.ok(game.evaluate('currentFullText()').includes('真的定义吗'));
});

test('an incomplete history premise and its recovered wording resume before either next insertion or chapter rewrite',()=>{
 let game=startHistoryAct();game.ids.get('agencyCards').children[0].click();
 game=harness(game.snapshot());game.ids.get('startButton').click();assert.equal(game.evaluate('NarrativeAgency.pending.stage'),1);
 game.ids.get('agencyActions').children[0].click();
 game=harness(game.snapshot());game.ids.get('startButton').click();assert.equal(game.evaluate('NarrativeAgency.pending.stage'),2);
 assert.equal(game.evaluate('Finale.step()'),0);agencyButton(game,'返回现在');game.tick();finishDialog(game);
 choose(game,'幻海消息');assert.equal(game.evaluate('Finale.step()'),2);
 choose(game,'朴素分层');assert.equal(game.evaluate('Finale.step()'),3);
 assert.equal(game.evaluate('!!F.finaleRewritten'),false);assert.ok(game.value('NarrativeAgency.history').every(Boolean));
});

test('self attribution supports both interpretations and narrative ordering without changing the novel',()=>{
 const game=startSelfAct(),canonical=game.value('FinaleScenes.ending.text');
 agencyButton(game,'交给先于');assert.deepEqual(game.value('NarrativeAgency.self.decisions'),[-1,-1,-1,-1]);
 game.ids.get('agencyCards').children[3].click();agencyButton(game,'将这一段向前');agencyButton(game,'将这一段向前');agencyButton(game,'将这一段向前');
 assert.deepEqual(game.value('NarrativeAgency.self.order'),[3,0,1,2]);
 for(let pos=0;pos<4;pos++){game.ids.get('agencyCards').children[pos].click();agencyButton(game,pos%2?'承认':'重释');}
 assert.equal(game.evaluate('!!F.finaleTrue'),false);agencyButton(game,'由我决定这些过往');
 assert.ok(game.ids.get('finaleLedger').textContent.includes('本轮自我编排'));assert.deepEqual(game.value('FinaleScenes.ending.text'),canonical);
 assert.ok(game.value('Expedition.journal').some(e=>e.area.includes('本轮自我编排')&&e.text.startsWith('手心里的雨水')));
 finishDialog(game);assertEnding(game,'true');assert.equal(game.value('META.endings').length,1);
});

test('partial self choices and their ordering survive refresh; completed choices resume the unread original lines',()=>{
 let game=startSelfAct();game.ids.get('agencyCards').children[1].click();agencyButton(game,'重释');agencyButton(game,'将这一段向前');
 game=harness(game.snapshot());game.ids.get('startButton').click();assert.deepEqual(game.value('NarrativeAgency.self.order'),[1,0,2,3]);
 assert.deepEqual(game.value('NarrativeAgency.self.decisions'),[-1,1,-1,-1]);
 completeAgency(game);assert.equal(game.evaluate('!!F.finaleTrue'),false);
 game=harness(game.snapshot());game.ids.get('startButton').click();assert.equal(game.evaluate('NarrativeAgency.active()'),false);
 assert.ok(game.evaluate('currentFullText()').includes('只有我能够决定'));finishDialog(game);assertEnding(game,'true');
});

function epilogueGame(overlay=false) {
 const data=finaleSave({finaleStarted:true,finaleRewritten:true,finaleTrue:true},{finaleNode:8,finaleStep:3,finaleFlow:2});
 if(overlay){const saved=JSON.parse(data[SAVE]);saved.endingId='true';data[SAVE]=JSON.stringify(saved);}
 const game=harness(data);game.ids.get('startButton').click();
 if(overlay)game.ids.get('endingResearch').click();else{finishDialog(game);game.ids.get('dialogChoices').children.find(b=>b.textContent.includes('研究院尾声')).click();}
 return game;
}

test('research epilogue is true-only, retains the novel archive and returns to usable terminal controls',()=>{
 const normal=harness(finaleSave({finaleStarted:true,finaleNormal:true},{finaleNode:7,finaleFlow:2}));normal.ids.get('startButton').click();finishDialog(normal);
 assert.ok(normal.ids.get('dialogChoices').children.every(b=>!b.textContent.includes('研究院')));
 const game=epilogueGame();assert.equal(game.evaluate('NarrativeAgency.pending.kind'),'epilogue');
 assert.ok(game.ids.get('agencyQuote').textContent.includes('非(非(非(非我-我)-我)-我)'));
 agencyButton(game,'继续看见');for(let i=0;i<3;i++){agencyButton(game,'剪开');agencyButton(game,i%2?'交叉':'沿另一侧');}
 agencyButton(game,'查看研究院');assert.ok(game.ids.get('agencyQuote').textContent.includes('课题：无穷游戏-已然决定的胜利'));
 assert.ok(game.ids.get('agencyQuote').textContent.includes('地点：猫岛，理型界'));agencyButton(game,'保存档案');
 assert.equal(game.evaluate('!!F.agencyEpilogue'),true);assert.equal(JSON.parse(game.storage.get(SAVE)).flags.agencyEpilogue,true);
 finishDialog(game);assert.ok(game.ids.get('dialogChoices').children.some(b=>b.textContent.includes('修改周防')));
});

test('epilogue scissors resume at an open cut and preserve the completed ending behind them',()=>{
 let game=epilogueGame(true);agencyButton(game,'继续看见');agencyButton(game,'剪开');
 game=harness(game.snapshot());game.ids.get('startButton').click();assert.equal(game.evaluate('NarrativeAgency.epilogue.cut'),true);
 assert.equal(game.evaluate('endingId'),'true');assert.equal(game.ids.get('endingOverlay').inert,true);
 agencyButton(game,'交叉');agencyButton(game,'暂时');assert.equal(game.ids.get('endingOverlay').hidden,false);
 assert.equal(game.ids.get('endingOverlay').inert,false);assert.equal(game.evaluate('endingId'),'true');
 game.ids.get('endingResearch').click();assert.equal(game.evaluate('NarrativeAgency.epilogue.cuts'),1);assert.deepEqual(game.value('NarrativeAgency.epilogue.ties'),[1]);
 game.evaluate('resetRun()');assert.equal(game.evaluate('NarrativeAgency.active()'),false);assert.equal(game.evaluate('NarrativeAgency.pending'),null);
});

test('malformed narrative checkpoints reject out of range edges, order and history phase',()=>{
 const game=harness(finaleSave({finaleSummoned:true},{finaleStep:0}));
 game.evaluate(`NarrativeAgency.restore({version:1,body:{held:[true,true,true,true],links:[[0,9],[-1,2],[2,2],[0,1],[0,1]]},self:{decisions:[0,1,0,2],order:[0,0,2,3]},history:[{method:9},null,null],epilogue:{stage:9,cuts:-1,cut:'yes'},pending:{kind:'history',step:4,stage:99,method:0}})`);
 assert.deepEqual(game.value('NarrativeAgency.body.links'),[[0,1]]);assert.deepEqual(game.value('NarrativeAgency.self.decisions'),[-1,-1,-1,-1]);
 assert.equal(game.evaluate('NarrativeAgency.pending'),null);assert.equal(game.evaluate('NarrativeAgency.connected()'),false);
});

test('the epilogue retains all 49 supplied chapter 059 paragraphs in their source order',()=>{
 const game=harness(),paragraphs=game.value('AgencyEpilogue.flat()');assert.equal(paragraphs.length,49);
 // Golden digest comes from the supplied novel, excluding publisher navigation.
 const digest=require('node:crypto').createHash('sha256').update(paragraphs.join('\n'),'utf8').digest('hex');
 assert.equal(digest,'9c6d2b9a09e58228ebbac9a4d868918dc4057edf5c07e75f6bd6b0a1c28d0e67');
});

/* ---------- Exploration feedback, reading aids, light and gait ---------- */

test("investigation markers follow the story's own gates and optional inspections persist without story flags", () => {
  const game = harness();
  game.ids.get("startButton").click(); finishDialog(game);
  const state = id => game.evaluate(`PlayAids.state(MAPS.mirror.interact.find(it => it.id === ${JSON.stringify(id)}))`);
  assert.deepEqual(["m1", "m2", "m3"].map(state), ["new", "gated", "gated"]);
  interact(game, "m1");
  assert.deepEqual(["m1", "m2", "m3"].map(state), ["done", "new", "gated"]);
  game.evaluate("Expedition.sync()");
  assert.deepEqual(game.value("PlayAids.progress()"), { done: 1, total: 3 });
  assert.ok(game.ids.get("chapterLabel").textContent.includes("调查 1/3"));
  game.frame(16);
  assert.deepEqual(game.value("PlayAids.lastMarkers.map(m => [m.id, m.state])"), [["m1", "done"], ["m2", "new"], ["m3", "gated"]]);
  // The tank remains a trap: no marker warns that opening it early ends the run.
  game.evaluate("G.area = 'house_empty'; buildTileCache()");
  assert.equal(game.evaluate("PlayAids.state(MAPS.house_empty.interact.find(it => it.id === 'toilet'))"), "new");
  const flags = game.value("F");
  game.evaluate("G.area = 'garden'; StoryStaging.reset(); buildTileCache()");
  interact(game, "coffinWood");
  assert.deepEqual(game.value("G.seen"), ["coffinWood"]);
  assert.deepEqual(game.value("F"), flags, "an optional inspection must not become a story flag");
  assert.equal(game.evaluate("PlayAids.state(MAPS.garden.interact.find(it => it.id === 'coffinWood'))"), "done");
  game.evaluate("saveRun()");
  const reloaded = harness(game.snapshot());
  assert.deepEqual(reloaded.value("G.seen"), ["coffinWood"]);
  const record = JSON.parse(game.storage.get(SAVE)); record.seen = ["bogus", 5, "rainPool", "rainPool", "__proto__"];
  assert.deepEqual(harness({ [SAVE]: JSON.stringify(record) }).value("G.seen"), ["rainPool"]);
  reloaded.evaluate("resetRun()");
  assert.deepEqual(reloaded.value("G.seen"), []);
});

test("shard resonance guides toward an uncollected fragment without collecting it", () => {
  const game = harness();
  // Pin chance so sparkle spawning is deterministic in this check.
  game.evaluate("Math.random = () => 0.001; ui.start.hidden = true; G.area = 'garden'; F.gardenWoke = true; StoryStaging.reset(); buildTileCache(); G.px = 4 * TILE + 3; G.py = 18 * TILE + 2");
  for (let i = 0; i < 40; i++) game.frame(16);
  assert.ok(game.evaluate("PlayAids.resonance") > 0.4, "standing three tiles away should resonate");
  assert.ok(game.ids.get("statusMessage").textContent.includes("共鸣"));
  assert.equal(game.value("META.shards").includes("花园碎片"), false);
  assert.ok(game.evaluate("particles.some(p => p.k === 'spark')"), "resonance sparkles around the fragment");
  game.evaluate("G.px = 25 * TILE + 3; G.py = 3 * TILE + 2");
  for (let i = 0; i < 80; i++) game.frame(16);
  assert.ok(game.evaluate("PlayAids.resonance") < 0.05);
  game.evaluate("particles = []; Expedition.prefs.motion = true; G.px = 2 * TILE + 3; G.py = 19 * TILE + 2");
  for (let i = 0; i < 40; i++) game.frame(16);
  assert.equal(game.evaluate("particles.length"), 0, "reduced motion keeps the resonance still");
  walkToTile(game, 1, 20);
  assert.ok(game.value("META.shards").includes("花园碎片"));
  for (let i = 0; i < 40; i++) game.frame(16);
  assert.ok(game.evaluate("PlayAids.resonance") < 0.05, "a collected fragment stops resonating");
});

test("auto-play advances finished lines, waits at choices, acts and secret answers, and pauses under utilities", () => {
  const game = harness();
  game.evaluate("ui.start.hidden = true; playScript('coffinFirst')");
  game.ids.get("autoButton").click();
  assert.equal(game.evaluate("PlayAids.auto"), true);
  assert.equal(game.ids.get("autoButton").getAttribute("aria-pressed"), "true");
  assert.equal(game.evaluate("dialogIndex"), 0, "toggling must not advance the line itself");
  for (let i = 0; i < 25; i++) game.frame(50);
  assert.equal(game.evaluate("typeDone"), true);
  const first = game.evaluate("dialogIndex");
  game.ids.get("settingsButton").click();
  for (let i = 0; i < 200; i++) game.frame(50);
  assert.equal(game.evaluate("dialogIndex"), first, "auto-play advanced underneath settings");
  game.document.querySelector("[data-close='settingsDialog']").click();
  for (let i = 0; i < 600 && !game.evaluate("!!dialogChoices"); i++) game.frame(50);
  assert.equal(game.evaluate("!!dialogChoices"), true, "auto-play should reach the coffin choices");
  for (let i = 0; i < 200; i++) game.frame(50);
  assert.equal(game.evaluate("dialogActive && !!dialogChoices"), true, "auto-play must never choose");
  // A phenomenon act waits for the player's target.
  game.evaluate("closeDialog(); G.area = 'blood'; F.sister = true; F.parents = true; buildTileCache(); playScript('refusal')");
  assert.equal(game.evaluate("PhenomenonBattle.pending"), true);
  for (let i = 0; i < 200; i++) game.frame(50);
  assert.equal(game.evaluate("dialogIndex"), 0);
  assert.deepEqual(game.value("PhenomenonBattle.claimed"), [false, false, false]);
  // The finale's clickable answer is never read past automatically.
  game.evaluate("closeDialog(); playLines([{ t: 'answer', secretAction: 'trueEnding' }, 'after'], () => {})");
  for (let i = 0; i < 200; i++) game.frame(50);
  assert.equal(game.evaluate("dialogIndex"), 0);
  game.ids.get("autoButton").click();
  assert.equal(game.evaluate("PlayAids.auto"), false);
});

test("skip-read fast-forwards lines read in any run and stops at the first unread line", () => {
  const game = harness();
  game.evaluate("ui.start.hidden = true; playScript('coffinFirst')");
  finishDialog(game); game.tick(1000);
  const read = game.storage.get("wuzhong-returner-pixel-read-v1");
  assert.ok(read && JSON.parse(read).length >= 4, "read lines are remembered across runs");
  const next = harness(game.snapshot());
  next.evaluate("ui.start.hidden = true; ((lines) => playLines([lines[0], lines[1], 'a sentence nobody has read', lines[2]], () => {}))(SCRIPTS.coffinFirst.lines)");
  next.ids.get("skipButton").click();
  assert.equal(next.evaluate("PlayAids.skip"), true);
  for (let i = 0; i < 40; i++) next.frame(50);
  assert.equal(next.evaluate("dialogIndex"), 2, "skip must stop at the unread sentence");
  assert.equal(next.evaluate("PlayAids.skip"), false);
  assert.ok(next.ids.get("statusMessage").textContent.includes("未读"));
  // Holding Ctrl skips only while read lines continue.
  next.evaluate("closeDialog(); ((lines) => playLines([lines[0], lines[1], lines[2]], () => {}))(SCRIPTS.coffinFirst.lines)");
  next.window.dispatchEvent(new MockEvent("keydown", { key: "Control", target: next.document.body }));
  for (let i = 0; i < 40; i++) next.frame(50);
  assert.equal(next.evaluate("dialogActive"), false, "Ctrl skip should finish a fully read passage");
  next.window.dispatchEvent(new MockEvent("keyup", { key: "Control", target: next.document.body }));
  assert.equal(next.evaluate("PlayAids.ctrl"), false);
  next.evaluate("resetRun()");
  assert.ok(JSON.parse(next.storage.get("wuzhong-returner-pixel-read-v1") || "[]").length >= 4 || next.evaluate("PlayAids.read.size") >= 4, "restarting keeps read memory");
});

test("lighting is quantised on whole pixels, follows its sources and can be switched off", () => {
  const game = harness();
  const levels = game.value(`(() => {
    const px = Atmosphere.compute([{ x: 160, y: 96, r: 48, i: 1, color: [255, 255, 255], tint: 0 }], { dark: [0, 0, 0], depth: 0.6 });
    const alpha = i => px[i] >>> 24;
    return { center: alpha(96 * 320 + 160), corner: alpha(2 * 320 + 2), set: [...new Set([...px].map(v => v >>> 24))].sort((a, b) => a - b) };
  })()`);
  assert.equal(levels.center, 0, "the light source itself is unshaded");
  assert.ok(levels.corner > 100, "far corners are shaded");
  assert.ok(levels.set.length <= 5, "darkness uses a small set of dithered bands");
  game.evaluate("ui.start.hidden = true");
  for (const area of ["mirror", "garden", "house_empty", "house_family", "blood", "rain"]) {
    game.evaluate(`G.area = ${JSON.stringify(area)}; StoryStaging.reset(); particles = []; buildTileCache()`);
    for (let i = 0; i < 4; i++) game.frame(30);
    assert.ok(game.evaluate("Atmosphere.lastLights.length") >= 1, `${area} has no light sources`);
  }
  game.evaluate("Atmosphere.lastLights = []; Expedition.prefs.lighting = false");
  game.frame(30);
  assert.equal(game.evaluate("Atmosphere.render(ctx, MAPS[G.area], { x: 0, y: 0 }, 0)"), false);
  const saved = harness({ "wuzhong-returner-pixel-settings-v1": JSON.stringify({ lighting: false }) });
  assert.equal(saved.evaluate("Expedition.prefs.lighting"), false);
  assert.equal(saved.ids.get("lightingControl").checked, false);
});

test("the walk cycle alternates feet, profiles face travel and interaction turns toward the object", () => {
  const game = harness();
  assert.deepEqual(game.value("personGait({ walk: 0 }, 'stand').lift"), [0, 0]);
  assert.deepEqual(game.value("personGait({ walk: 0.01, dir: 0 }, 'stand').lift"), [1, 0]);
  assert.deepEqual(game.value("personGait({ walk: 0.23, dir: 0 }, 'stand').lift"), [0, 1]);
  assert.equal(game.evaluate("personGait({ walk: 0.12, dir: 0 }, 'stand').bob"), -1);
  const left = game.value("personGait({ walk: 0.01, dir: 1 }, 'stand')"), right = game.value("personGait({ walk: 0.01, dir: 2 }, 'stand')");
  // The near (lighter) leg leads in the direction of travel on a stride.
  assert.notEqual(left.far, right.far);
  assert.ok(right.legX[1 - right.far] > right.legX[right.far], "facing right, the near leg leads to the right");
  assert.ok(left.legX[1 - left.far] < left.legX[left.far], "facing left, the near leg leads to the left");
  assert.equal(game.value("personGait({ walk: 0.5, dir: 0 }, 'bound').phase"), -1, "staged poses never walk");
  game.evaluate("ui.start.hidden = true; G.area = 'garden'; F.gardenWoke = true; StoryStaging.reset(); buildTileCache(); G.px = 10 * TILE + 3; G.py = 7 * TILE + 2; G.dir = 0");
  assert.equal(game.evaluate("nearestInteractable()?.it.id"), "coffinWood");
  game.evaluate("tryInteract()");
  assert.equal(game.evaluate("G.dir"), 2, "the player turns toward the coffin's side before reading it");
  finishDialog(game);
  // Footfalls leave marks on wet ground; reduced motion keeps the floor still.
  game.evaluate("ui.start.hidden = true; G.area = 'rain'; F = { rainDone: true }; StoryStaging.reset(); particles = []; buildTileCache(); G.px = 10 * TILE + 3; G.py = 20 * TILE + 2; keys.add('d')");
  for (let i = 0; i < 40; i++) game.frame(16);
  assert.ok(game.evaluate("particles.some(p => p.k === 'splash')"));
  game.evaluate("keys.clear(); particles = []; Expedition.prefs.motion = true; keys.add('a')");
  for (let i = 0; i < 40; i++) game.frame(16);
  assert.equal(game.evaluate("particles.length"), 0);
  game.evaluate("keys.clear()");
});

/* ---------- Cutscenes at the story's turning points ---------- */

test("leaving the mirror stage shatters the frame without changing transition timing; reduced motion keeps the fade", () => {
  const game = harness();
  game.evaluate("ui.start.hidden = true; F = { m1: true, m2: true, m3: true }; Expedition.prefs.motion = false; gotoArea('storm')");
  assert.equal(game.ids.get("fade").classList.contains("on"), false, "the shatter replaces the black fade");
  assert.ok(game.evaluate("Cutscenes.shatter && Cutscenes.shatter.shards.length") > 40);
  game.tick(1600);
  assert.equal(game.evaluate("G.area"), "storm");
  assert.equal(game.evaluate("transitionLock"), false);
  for (let i = 0; i < 160 && game.evaluate("!!Cutscenes.shatter"); i++) game.frame(16);
  assert.equal(game.evaluate("Cutscenes.shatter"), null, "the shards finish falling");
  const still = harness();
  still.evaluate("ui.start.hidden = true; F = { m1: true, m2: true, m3: true }; Expedition.prefs.motion = true; gotoArea('storm')");
  assert.equal(still.ids.get("fade").classList.contains("on"), true);
  assert.equal(still.evaluate("Cutscenes.shatter"), null);
});

test("waking opens the eyes with a blink and a hop, and pauses under utilities", () => {
  const game = harness();
  game.evaluate("ui.start.hidden = true; G.area = 'house_empty'; StoryStaging.reset(); buildTileCache(); playScript('bed')");
  assert.ok(game.evaluate("!!Cutscenes.wake"));
  assert.equal(game.evaluate("Cutscenes.openness(0.1)"), 0);
  assert.ok(game.evaluate("Cutscenes.openness(0.5)") < game.evaluate("Cutscenes.openness(0.4)"), "the eyes blink before opening");
  assert.equal(game.evaluate("Cutscenes.openness(1.1)"), 1);
  // Frames are clamped to 50 ms, so use real-time sized steps.
  for (let i = 0; i < 40; i++) game.frame(16);
  const t = game.evaluate("Cutscenes.wake.t");
  assert.ok(game.evaluate("Cutscenes.playerLift()") < 0, "the boy springs up as his eyes open");
  game.ids.get("settingsButton").click();
  for (let i = 0; i < 20; i++) game.frame(50);
  assert.equal(game.evaluate("Cutscenes.wake.t"), t);
  game.document.querySelector("[data-close='settingsDialog']").click();
  for (let i = 0; i < 40; i++) game.frame(16);
  assert.equal(game.evaluate("Cutscenes.wake"), null);
  assert.equal(game.evaluate("Cutscenes.playerLift()"), 0);
});

test("the coffin lid closes over the sleeper and leaves the scene once the curtain falls", () => {
  const game = harness();
  game.evaluate("ui.start.hidden = true; G.area = 'garden'; F = { gardenWoke: true }; StoryStaging.reset(); buildTileCache(); playScript('coffinSleep')");
  assert.ok(game.evaluate("!!Cutscenes.lid"));
  assert.equal(game.evaluate("Cutscenes.lidActive()"), true);
  for (let i = 0; i < 170; i++) game.frame(16);
  assert.ok(game.evaluate("Cutscenes.lid.t") > 2.5);
  nextLine(game);
  assert.equal(game.evaluate("StoryStaging.scene"), "curtain");
  assert.equal(game.evaluate("Cutscenes.lidActive()"), false);
});

test("the courtyard cracks in place on the first clash line and dissolves on the third", () => {
  const game = harness();
  game.evaluate("ui.start.hidden = true; G.area = 'blood'; F = { sister: true, parents: true }; StoryStaging.reset(); buildTileCache(); playScript('clash')");
  for (let i = 0; i < 10; i++) game.frame(50);
  assert.equal(game.evaluate("Cutscenes.clash.progress"), 0);
  assert.ok(game.evaluate("Cutscenes.clash.cracks.length") >= 10);
  nextLine(game); nextLine(game);
  for (let i = 0; i < 10; i++) game.frame(50);
  assert.equal(game.evaluate("Cutscenes.clash.progress"), 2);
  assert.ok(game.evaluate("Cutscenes.clash.t") > 0.3);
  game.evaluate("Expedition.prefs.motion = true");
  assert.equal(game.evaluate("Cutscenes.collapse(ctx, { x: 0, y: 0 }, 0)"), true, "reduced motion still shows the broken courtyard");
  game.evaluate("resetRun()");
  assert.equal(game.evaluate("Cutscenes.clash.progress"), -1);
});

test("the mother walks while she carries the dish and stops at the table", () => {
  const game = harness({ [SAVE]: JSON.stringify({ area: "house_family", px: 227, py: 82, flags: { familyWoke: true, father: true }, memories: [], counters: {} }) });
  game.ids.get("startButton").click();
  game.evaluate("StoryStaging.carryElapsed = 0; StoryStaging.renderSpecial(performance.now(), 0.8)");
  const moving = game.value("StoryStaging.npc(MAPS.house_family.npcs.find(n => n.id === 'mother'))");
  assert.ok(moving.walk > 0);
  assert.ok(game.evaluate(`personGait({ walk: ${moving.walk}, dir: ${moving.dir} }, 'carry').phase`) >= 0);
  game.evaluate("StoryStaging.renderSpecial(performance.now(), 5)");
  assert.equal(game.value("StoryStaging.npc(MAPS.house_family.npcs.find(n => n.id === 'mother'))").walk || 0, 0);
});

let failed = 0;
for (const [name, callback] of tests) {
  try { callback(); console.log(`PASS ${name}`); }
  catch (error) { failed += 1; console.error(`FAIL ${name}\n${error.stack}`); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed (${scriptOrder.join(" + ")}).`);
if (failed) process.exitCode = 1;
