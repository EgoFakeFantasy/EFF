"use strict";

// Exploration feedback and reading tools. They read story flags but never set
// them, so markers, resonance and auto/skip cannot change a branch.
const PlayAids = {
  resonance: 0,
  resonanceTimer: 0,
  resonanceNoted: null,
  lastMarkers: [],
  stepTimer: 0,
  lastPos: null,
  auto: false,
  skip: false,
  ctrl: false,
  wait: 0,
  read: new Set(),
  readKey: "wuzhong-returner-pixel-read-v1",
  flushTimer: null,

  // Completion follows the story's own flags; optional inspections use G.seen.
  // `ready` mirrors the game's existing locked messages only. Traps such as the
  // tank stay unmarked, because an order that ends the run is part of the play.
  rules: {
    m1: { done: () => F.m1 },
    m2: { ready: () => F.m1, done: () => F.m2 },
    m3: { ready: () => F.m2, done: () => F.m3 },
    coffin: { done: () => F.sleptOnce && !(F.photoReturned && !F.familyDone) },
    recall: { done: () => G.memories.includes("偏头痛") },
    edge: { done: () => G.memories.includes("花园边界") },
    bed: { done: () => F.emptyWoke },
    emptyLiving: { done: () => F.emptyLiving },
    bathMirror: { done: () => G.memories.includes("镜中的周防") },
    washer: { done: () => F.hasPhoto },
    toilet: { done: () => F.photoReturned },
    famBed: { done: () => F.familyWoke },
    father: { done: () => F.father },
    sister: { done: () => F.sister },
    parents: { ready: () => F.sister, done: () => F.parents },
    echoBlood: { done: () => G.memories.includes("妹妹的回声") },
    repress: { done: () => F.rainDone },
  },

  init() {
    this.dom = Object.fromEntries(["autoButton", "skipButton"].map(id => [id, document.getElementById(id)]));
    try {
      const saved = JSON.parse(localStorage.getItem(this.readKey) || "[]");
      if (Array.isArray(saved)) this.read = new Set(saved.filter(v => typeof v === "string" && v.length <= 16).slice(-6000));
    } catch { /* Read memory is optional. */ }
    this.dom.autoButton?.addEventListener("click", event => { event.stopPropagation(); this.setAuto(!this.auto); });
    this.dom.skipButton?.addEventListener("click", event => { event.stopPropagation(); this.setSkip(!this.skip); });
    window.addEventListener("keydown", event => { if (event.key === "Control") this.ctrl = true; });
    window.addEventListener("keyup", event => { if (event.key === "Control") this.ctrl = false; });
    window.addEventListener("blur", () => { this.ctrl = false; this.flush(); });
    window.addEventListener("pagehide", () => this.flush());
    this.sync();
  },

  inspectIds() {
    return new Set(Object.values(MAPS).flatMap(map => (map.interact || []).filter(it => it.inspect).map(it => it.id)));
  },

  noteInspect(id) {
    const it = (MAPS[G.area].interact || []).find(item => item.id === id);
    if (!it?.inspect || G.seen.includes(id)) return;
    G.seen.push(id);
  },

  state(it) {
    const rule = this.rules[it.id];
    if (it.inspect) return G.seen.includes(it.id) ? "done" : "new";
    if (!rule) return "new";
    if (rule.done()) return "done";
    if (rule.ready && !rule.ready()) return "gated";
    return "new";
  },

  targets(map = MAPS[G.area]) {
    const list = [...(map.interact || [])].map(it => ({ it, at: it }));
    for (const n of map.npcs || []) {
      if (n.passive || (n.cond && !F[n.cond])) continue;
      const actor = StoryStaging.npc(n);
      if (!actor.hidden) list.push({ it: n, at: actor });
    }
    return list;
  },

  progress(area = G.area) {
    if (["storm", "meta"].includes(area) || area !== G.area) return null;
    const list = this.targets();
    if (!list.length) return null;
    return { done: list.filter(({ it }) => this.state(it) === "done").length, total: list.length };
  },

  progressText() {
    const p = this.progress();
    return p ? ` · 调查 ${p.done}/${p.total}` : "";
  },

  // Pixel glyphs keep markers crisp and readable above the shadow layer.
  drawMarkers(c, map, cam, t) {
    this.lastMarkers = [];
    if (dialogActive) return;
    const near = nearestInteractable();
    const still = Expedition.prefs.motion;
    for (const { it, at } of this.targets(map)) {
      const state = this.state(it), active = near && near.it === it;
      const sx = Math.round(at.x * TILE + 8 - cam.x);
      const bob = state === "new" && !still ? Math.round(Math.sin(t * 4 + at.x) * 2) : 0;
      const sy = Math.round(at.y * TILE - 4 - cam.y + bob);
      if (sx < -8 || sx > VIEW_W + 8 || sy < -8 || sy > VIEW_H + 8) continue;
      this.lastMarkers.push({ id: it.id, x: sx, y: sy, state });
      const box = (x, y, w, h, color) => { c.fillStyle = color; c.fillRect(sx + x, sy + y, w, h); };
      if (state === "done") {
        // A small settled diamond: already heard, still available to revisit.
        const col = active ? "#c9d6c8" : "rgba(170,186,172,0.55)";
        box(-1, -3, 2, 1, col); box(-2, -2, 1, 2, col); box(1, -2, 1, 2, col); box(-1, 0, 2, 1, col);
        continue;
      }
      if (state === "gated") {
        const col = active ? "#b3b0a6" : "rgba(150,148,140,0.6)";
        for (const dx of [-3, 0, 3]) box(dx, -1, 1, 1, col);
        continue;
      }
      const fill = active ? "#ffe9a6" : "#e8cf86";
      if (it.inspect) {
        box(-3, -5, 6, 1, "#1b1612"); box(-3, 0, 6, 1, "#1b1612");
        box(-2, -4, 4, 1, fill); box(-3, -3, 1, 2, fill); box(2, -3, 1, 2, fill); box(-2, -1, 4, 1, fill);
      } else {
        box(-2, -7, 4, 9, "#1b1612");
        box(-1, -6, 2, 5, fill); box(-1, 0, 2, 1, fill);
        if (active) box(-1, -6, 1, 2, "#fff8de");
      }
    }
  },

  face(near) {
    if (!near?.it || !Number.isFinite(near.it.x)) return;
    const n = (MAPS[G.area].npcs || []).includes(near.it) ? StoryStaging.npc(near.it) : near.it;
    const dx = n.x * TILE + 8 - (G.px + 6), dy = n.y * TILE + 8 - (G.py + 8);
    if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
    G.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 2) : (dy < 0 ? 3 : 0);
  },

  surface() {
    const tx = Math.floor((G.px + 6) / TILE), ty = Math.floor((G.py + 13) / TILE);
    const area = G.area;
    if (area === "garden") return "grass";
    if (area === "rain") return "wet";
    if (area === "house_empty" || area === "house_family") return tx < 16 ? "wood" : "tile";
    if (area === "blood") return ty > 10 ? "wood" : "ash";
    return "stone";
  },

  footstep(fast) {
    const surface = this.surface();
    const fx = G.px + 6 + (this.stepIndex % 2 ? 2 : -2), fy = G.py + 14;
    this.stepIndex = (this.stepIndex || 0) + 1;
    if (!Expedition.prefs.motion && particles.length < 110) {
      if (surface === "wet") particles.push({ k: "splash", x: fx, y: fy, life: 0.35, max: 0.35 });
      else if (surface === "grass") particles.push({ k: "blade", x: fx, y: fy - 1, vy: -10, vx: (Math.random() - .5) * 12, life: 0.4, max: 0.4 });
      else if (surface === "ash" || fast) particles.push({ k: "puff", x: fx, y: fy, vx: (Math.random() - .5) * 8, vy: -4, life: 0.45, max: 0.45 });
    }
    const a = AudioEngine;
    if (!a.enabled || !a.ctx || document.hidden || a.ctx.state !== "running") return;
    const tone = { grass: ["highpass", 2600, 0.018], wet: ["bandpass", 1100, 0.04], wood: ["bandpass", 420, 0.05], tile: ["bandpass", 1900, 0.032], ash: ["lowpass", 700, 0.03], stone: ["bandpass", 1300, 0.03] }[surface];
    try {
      this.stepBuffer ||= a.noiseBuffer(0.12);
      const src = a.ctx.createBufferSource(), filter = a.ctx.createBiquadFilter(), gain = a.ctx.createGain(), now = a.ctx.currentTime;
      src.buffer = this.stepBuffer; filter.type = tone[0]; filter.frequency.value = tone[1] * (0.9 + (this.stepIndex % 3) * 0.08);
      gain.gain.setValueAtTime(tone[2], now); gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
      src.connect(filter); filter.connect(gain); gain.connect(a.master);
      src.start(now); src.stop(now + 0.1);
      src.onended = () => { src.disconnect(); filter.disconnect(); gain.disconnect(); };
    } catch { /* Footsteps are decoration only. */ }
  },

  updateMovement(dt) {
    const pos = [G.px, G.py, G.area];
    const last = this.lastPos;
    this.lastPos = pos;
    if (!last || last[2] !== pos[2] || dialogActive || ["storm", "meta"].includes(G.area)) { this.stepTimer = 0; return; }
    const moved = Math.hypot(pos[0] - last[0], pos[1] - last[1]);
    if (moved < 0.2 || moved > 8) { this.stepTimer = Math.min(this.stepTimer, 0.12); return; }
    const fast = moved / Math.max(dt, 0.001) > 64;
    this.stepTimer += dt;
    if (this.stepTimer >= (fast ? 0.21 : 0.3)) { this.stepTimer = 0; this.footstep(fast); }
  },

  updateResonance(dt) {
    const map = MAPS[G.area];
    let target = 0;
    // A collected (or absent) fragment has nothing left to shine.
    if (!map.shard || META.shards.includes(map.shard.name) || ["storm", "meta"].includes(G.area)) { this.resonance = 0; return; }
    if (!dialogActive) {
      const d = Math.hypot(G.px + 6 - (map.shard.x * TILE + 8), G.py + 8 - (map.shard.y * TILE + 8)) / TILE;
      target = Math.max(0, Math.min(1, 1 - (d - 1) / 7));
    }
    this.resonance += (target - this.resonance) * Math.min(1, dt * 4);
    if (target < 0.01) { if (this.resonance < 0.01) this.resonance = 0; return; }
    if (target > 0.35 && this.resonanceNoted !== map.shard.name) {
      this.resonanceNoted = map.shard.name;
      Expedition.status("附近有记忆碎片在共鸣。越靠近，光与声越明显。");
    }
    if (!Expedition.prefs.motion && Math.random() < dt * this.resonance * 7 && particles.length < 110) {
      const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 10;
      particles.push({ k: "spark", x: map.shard.x * TILE + 8 + Math.cos(a) * r, y: map.shard.y * TILE + 8 + Math.sin(a) * r, life: 0.6 });
    }
    this.resonanceTimer -= dt;
    if (this.resonanceTimer <= 0) {
      this.resonanceTimer = 1.7 - target * 1.15;
      Expedition.chime(480 + target * 420, 0.1);
    }
  },

  update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.updateMovement(dt);
    this.updateResonance(dt);
  },

  /* ---------- Reading: auto and skip-read ---------- */

  lineKey(line) {
    const text = line.rewrite ? line.rewrite.original + "\u0002" + line.rewrite.replacement : line.t || "";
    let h = 0x811c9dc5;
    const source = (line.s || "") + "\u0001" + text;
    for (let i = 0; i < source.length; i++) { h ^= source.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36) + source.length.toString(36);
  },

  onLine(line) {
    if (!line) return;
    const key = this.lineKey(line);
    line._read = this.read.has(key);
    this.wait = 0;
    if (!line._read) {
      this.read.add(key);
      if (this.flushTimer === null) this.flushTimer = setTimeout(() => this.flush(), 900);
    }
    if (this.skip && !line._read) {
      this.setSkip(false);
      Expedition.status("快进停在尚未读过的句子。");
    }
  },

  flush() {
    if (this.flushTimer !== null) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    try { localStorage.setItem(this.readKey, JSON.stringify([...this.read].slice(-6000))); } catch { /* Optional. */ }
  },

  setAuto(on) {
    this.auto = !!on; this.wait = 0;
    if (this.auto) this.skip = false;
    Expedition.status(this.auto ? "自动播放：开。选择、现象写入与操作仍由你决定。" : "自动播放：关。");
    this.sync(); Expedition.focusGameplay();
  },

  setSkip(on) {
    this.skip = !!on; this.wait = 0;
    if (this.skip) this.auto = false;
    Expedition.status(this.skip ? "快进已读：开。遇到未读的句子、选择与操作时停下。" : "快进已读：关。");
    this.sync(); Expedition.focusGameplay();
  },

  sync() {
    if (!this.dom?.autoButton) return;
    for (const [button, on] of [[this.dom.autoButton, this.auto], [this.dom.skipButton, this.skip]]) {
      button.setAttribute("aria-pressed", String(on));
      button.classList.toggle("on", on);
    }
  },

  // Every gate that needs a decision or an act stops both tools.
  readingBlocked() {
    const line = dialogLines[dialogIndex];
    return !dialogActive || !line || !!dialogChoices || PhenomenonBattle.pending || NarrativeAgency.active() || NarrativeTrials.rainActive() ||
      Expedition.paused() || transitionLock || !ui.start.hidden || !ui.ending.hidden || !!line.secretAction;
  },

  updateReading(dt) {
    if (!this.auto && !this.skip && !this.ctrl) return;
    if (this.readingBlocked()) { this.wait = 0; return; }
    const line = dialogLines[dialogIndex];
    if ((this.skip || this.ctrl) && line._read) {
      this.wait += dt;
      if (this.wait < 0.07) return;
      this.wait = 0;
      if (!typeDone) advanceDialog();
      if (!this.readingBlocked()) advanceDialog();
      return;
    }
    if (!this.auto || !typeDone) { this.wait = 0; return; }
    this.wait += dt;
    const length = (line.t || line.rewrite?.replacement || "").length;
    const pace = Expedition.prefs.speed >= 0.032 ? 1.3 : Expedition.prefs.speed && Expedition.prefs.speed <= 0.008 ? 0.8 : 1;
    if (this.wait >= (1.1 + Math.min(5.5, length * 0.055)) * pace) { this.wait = 0; advanceDialog(); }
  },

  reset() {
    this.resonance = 0; this.resonanceNoted = null; this.lastPos = null; this.stepTimer = 0; this.wait = 0;
  },
};
