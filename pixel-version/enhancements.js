"use strict";

// Exploration and presentation stay separate from the story and ending rules.
const Expedition = {
  prefs: { speed: 0.016, volume: 0.55, hints: true, motion: false },
  journal: [],
  chapterTime: 0,
  effect: null,
  saveElapsed: 0,
  mapElapsed: 0,
  transitionTimers: [],
  key: "wuzhong-returner-pixel-settings-v1",
  journalKey: "wuzhong-returner-pixel-journal-v1",

  chapters: {
    mirror: ["01", "镜像阶段", "那是，[我]吧。"],
    storm: ["02", "无尽圆塔", "下一个奇点再见吧，无名的旅伴。"],
    garden: ["03", "棺之花园", "自无中归来的人啊，醒来，醒来"],
    house_empty: ["04", "空屋", "我是……是了，我是周防。"],
    house_family: ["05", "家 · 日常", "慢慢喝，没人抢你的吃。"],
    blood: ["06", "血色庭院", "第二幕，荒诞的转变。"],
    rain: ["07", "显意识的边缘", "就算大多数从指缝漏过，也有些许被留在了手心"],
    meta: ["08", "话语表面", "然而，并非只是如此，一切才刚刚开始"],
  },

  init() {
    const byId = (id) => document.getElementById(id);
    this.dom = {};
    for (const id of ["objectiveText", "chapterLabel", "chapterCard", "chapterNumber", "chapterQuote", "interactButton", "mapButton", "mapPanel", "mapTitle", "mapStatus", "areaMap", "statusMessage", "journalDialog", "journalEntries", "settingsDialog", "textSpeed", "volumeControl", "hintsControl", "motionControl", "startStatus", "touchInteract"]) this.dom[id] = byId(id);
    this.prefs.motion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || false;
    try {
      const saved = JSON.parse(localStorage.getItem(this.key) || "null");
      if (saved && typeof saved === "object") {
        if ([0, 0.008, 0.016, 0.032].includes(saved.speed)) this.prefs.speed = saved.speed;
        if (Number.isFinite(saved.volume)) this.prefs.volume = Math.max(0, Math.min(1, saved.volume));
        if (typeof saved.hints === "boolean") this.prefs.hints = saved.hints;
        if (typeof saved.motion === "boolean") this.prefs.motion = saved.motion;
      }
      const entries = JSON.parse(localStorage.getItem(this.journalKey) || "[]");
      if (Array.isArray(entries)) this.journal = entries.filter(e => e && typeof e.text === "string" && typeof e.area === "string").slice(-300);
    } catch { /* Optional preferences never prevent a fresh run. */ }
    this.dom.textSpeed.value = String(this.prefs.speed);
    this.dom.volumeControl.value = String(this.prefs.volume);
    this.dom.hintsControl.checked = this.prefs.hints;
    this.dom.motionControl.checked = this.prefs.motion;
    this.applyPrefs();
    for (const id of ["textSpeed", "volumeControl", "hintsControl", "motionControl"]) {
      this.dom[id].addEventListener("change", () => {
        this.prefs = { speed: Number(this.dom.textSpeed.value), volume: Number(this.dom.volumeControl.value), hints: this.dom.hintsControl.checked, motion: this.dom.motionControl.checked };
        this.applyPrefs();
        try { localStorage.setItem(this.key, JSON.stringify(this.prefs)); } catch { /* Optional. */ }
      });
    }
    byId("journalButton").addEventListener("click", () => {
      if (dialogActive && !typeDone && dialogLines[dialogIndex]) {
        typeDone = true;
        paintText(currentFullText(), dialogLines[dialogIndex].c);
        updateDialogStatus();
      }
      this.showJournal();
      this.open(this.dom.journalDialog);
    });
    byId("settingsButton").addEventListener("click", () => this.open(this.dom.settingsDialog));
    document.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => byId(button.dataset.close).close()));
    for (const dialog of [this.dom.journalDialog, this.dom.settingsDialog]) dialog.addEventListener("close", () => this.focusGameplay());
    this.dom.mapButton.addEventListener("click", () => {
      this.dom.mapPanel.hidden = !this.dom.mapPanel.hidden;
      this.dom.mapButton.setAttribute("aria-expanded", String(!this.dom.mapPanel.hidden));
      this.drawMap();
    });
    const interact = () => {
      clearInput();
      if (this.paused()) return;
      if (dialogActive) advanceDialog(); else tryInteract();
      this.focusGameplay();
    };
    this.dom.interactButton.addEventListener("click", interact);
    this.dom.touchInteract.addEventListener("click", interact);
    document.querySelectorAll("[data-direction]").forEach(button => {
      button.addEventListener("pointerdown", event => {
        event.preventDefault();
        if (dialogActive || this.paused() || transitionLock || !ui.start.hidden || !ui.ending.hidden) return;
        button.setPointerCapture(event.pointerId);
        touchKeys.add(button.dataset.direction);
        button.classList.add("pressed");
      });
      const release = () => { touchKeys.delete(button.dataset.direction); button.classList.remove("pressed"); };
      for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) button.addEventListener(type, release);
    });
    const resumed = Boolean(F.m1 || G.area !== "mirror" || endingId);
    ui.startButton.textContent = resumed ? "继续这段旅途" : "进入回廊";
    this.dom.startStatus.textContent = resumed ? `已停留于${MAPS[G.area].name} · 图鉴 ${META.shards.length} / 8` : "八处梦境 · 八枚碎片 · 六种结局";
    this.sync();
  },

  applyPrefs() {
    document.body.classList.toggle("reduced-motion", this.prefs.motion);
    if (this.prefs.motion) { particles = []; lightning = 0; houseFlicker = 0; }
    if (AudioEngine.master) AudioEngine.master.gain.setTargetAtTime(this.prefs.volume, AudioEngine.ctx.currentTime, 0.1);
    this.sync();
  },

  paused() {
    return document.hidden || Boolean(this.dom?.journalDialog.open || this.dom?.settingsDialog.open || !ui.codex.hidden);
  },

  focusGameplay() {
    if (!ui.start.hidden) { ui.startButton.focus({ preventScroll: true }); return; }
    if (!ui.ending.hidden) { ui.endingRestart.focus({ preventScroll: true }); return; }
    const first = dialogChoices && ui.dialogChoices.querySelector("button");
    (first || canvas).focus({ preventScroll: true });
  },

  open(dialog) {
    clearInput();
    dialog.showModal();
  },

  goal() {
    const target = (id, text) => ({ id, text });
    switch (G.area) {
      case "mirror": return !F.m1 ? target("m1", "调查第一面镜。") : !F.m2 ? target("m2", "倾听第二面镜。") : !F.m3 ? target("m3", "走向第三面镜。") : target("exit", "回廊的尽头已经打开。走进雨幕。");
      case "storm": return !F.storm1 ? target("storm1", "靠近向上抓去的雨滴。") : !F.storm2 ? target("storm2", "沿着镂空带之间的回廊，走向红月下的人影。") : target("exit", "红月下方的道路已经开启。");
      case "garden": return target("coffin", F.photoReturned ? "带着照片残片，回到苏醒的容器。" : "调查棺底的铭文。世界边界与记忆的暗处，也可以探索。");
      case "house_empty": return target(F.hasPhoto ? "toilet" : "washer", F.hasPhoto ? "照片残片已经握在手里。继续调查房间。" : "调查这间没有声音的家。洗衣机仍在震动。");
      case "house_family": return !F.father ? target("father", "向沙发上的父亲打个招呼。") : !F.mother ? target("mother", "走向厨房，见过母亲。") : target("table", "早餐还冒着热气。");
      case "blood": return !F.sister ? target("sister", "先看清那只手，和心脏的主人。") : !F.parents ? target("parents", "庭院里还有什么没有看清。") : target("accuse", "那些声音在等待你的回答。");
      case "rain": return F.rainDone ? target("exit", "塔顶的裂缝已经开启。") : target("repress", "走向以压抑之名者，听完尚未说完的话。");
      case "meta": return !F.stele1 ? target("stele1", "从左往右，阅读三座石碑。") : !F.stele2 ? target("stele2", "第一句话留下了位置。阅读第二座石碑。") : !F.stele3 ? target("stele3", "第二句话被覆盖。阅读第三座石碑。") : !F.metaDone ? target("senpai", "听见前传人物的回答。") : F.rainMemory && !F.golden ? target("gold", "水晶花已经醒来。金色的雨会再来，站到光圈里，留住一滴。") : target("flower", "水晶花还在活动。让故事抵达它的结尾。");
      default: return target(null, "靠近发光的事物，调查与倾听。");
    }
  },

  goalPoint() {
    const id = this.goal().id;
    const map = MAPS[G.area];
    if (id === "gold") return goldDrop ? { x: (goldDrop.x - 8) / TILE, y: (goldDrop.catchY - 8) / TILE } : null;
    if (id === "exit") return map.exits[0];
    return [...(map.interact || []), ...(map.npcs || [])].find(it => it.id === id);
  },

  sync() {
    if (!this.dom) return;
    const chapter = this.chapters[G.area];
    const setText = (element, text) => { if (element.textContent !== text) element.textContent = text; };
    setText(this.dom.chapterLabel, `${chapter[0]} / ${chapter[1]}`);
    setText(this.dom.objectiveText, this.prefs.hints ? this.goal().text : "靠近发光的事物，调查与倾听。");
    const unavailable = transitionLock || this.paused() || !ui.start.hidden || !ui.ending.hidden;
    const near = !dialogActive && !unavailable ? nearestInteractable() : null;
    this.dom.interactButton.disabled = unavailable || (dialogActive ? Boolean(dialogChoices) : !near);
    setText(this.dom.interactButton, dialogActive ? (dialogChoices ? "选择你的回答" : typeDone ? "继续倾听" : "显示全文") : near ? `调查 · ${near.it.label}` : "靠近事物 · 调查");
    this.dom.touchInteract.disabled = unavailable || Boolean(dialogChoices);
    setText(this.dom.mapStatus, `${META.shards.includes(MAPS[G.area].shard.name) ? "本区碎片已经拾取" : "本区仍有一枚碎片"} · 总计 ${META.shards.length} / 8`);
    setText(this.dom.mapTitle, MAPS[G.area].name);
  },

  onAreaChange() {
    clearInput();
    this.chapterTime = this.prefs.motion ? 1.5 : 3;
    this.effect = null;
    if (!this.dom) return;
    const chapter = this.chapters[G.area];
    this.dom.chapterNumber.textContent = `${chapter[0]} / ${chapter[1]}`;
    this.dom.chapterQuote.textContent = chapter[2];
    this.dom.chapterCard.classList.add("visible");
    this.sync();
    this.drawMap();
    this.focusGameplay();
  },

  onLine(line) {
    clearInput();
    ui.dialog.dataset.tone = line.c || (line.rewrite ? "rewrite" : "narration");
    // The log contains offered lines only, never the rest of a scene or a branch.
    const text = line.rewrite ? `${line.rewrite.original}\n→ ${line.rewrite.replacement}` : line.t || "";
    const entry = { area: MAPS[G.area].name, speaker: line.s || "", text };
    const previous = this.journal[this.journal.length - 1];
    if (text && (!previous || previous.text !== text || previous.area !== entry.area)) {
      this.journal.push(entry);
      this.journal = this.journal.slice(-300);
      try { localStorage.setItem(this.journalKey, JSON.stringify(this.journal)); } catch { /* Optional. */ }
    }
    if (line.rewrite) this.effect = { kind: "rewrite", left: 1.2, total: 1.2 };
    if (text.includes("世界开始崩坏")) this.effect = { kind: "fracture", left: 2.5, total: 2.5 };
    if (text.includes("两个光团，一红一灰")) this.effect = { kind: "duel", left: 3, total: 3 };
  },

  onDialogClose() { this.sync(); },
  onMemory(name) {
    this.status(`记忆锚点 · ${name}`);
    this.chime(440, 0.13);
    if (!ui.codex.hidden) renderCodex();
    this.sync();
  },

  status(text) { if (this.dom) this.dom.statusMessage.textContent = text; },

  chime(freq = 330, duration = 0.07) {
    if (!AudioEngine.enabled || !AudioEngine.ctx || document.hidden) return;
    const c = AudioEngine.ctx;
    const oscillator = c.createOscillator();
    const gain = c.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(freq, c.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(freq * 0.7, c.currentTime + duration);
    gain.gain.setValueAtTime(0.06, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(AudioEngine.master);
    oscillator.start();
    oscillator.stop(c.currentTime + duration);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  },

  cancelTransition() {
    for (const timer of this.transitionTimers) clearTimeout(timer);
    this.transitionTimers = [];
  },

  reset() {
    this.cancelTransition();
    this.journal = [];
    this.effect = null;
    this.chapterTime = 0;
    this.saveElapsed = 0;
    this.dom?.chapterCard.classList.remove("visible");
    try { localStorage.removeItem(this.journalKey); } catch { /* Optional. */ }
    this.status("新的周目开始。碎片与结局图鉴仍然保留。");
    this.sync();
    this.focusGameplay();
  },

  showJournal() {
    this.dom.journalEntries.replaceChildren();
    const entries = this.journal.length ? this.journal : [{ area: "回廊", text: "还没有听见新的句子。", speaker: "" }];
    for (const entry of entries) {
      const li = document.createElement("li");
      const label = document.createElement("small");
      label.textContent = `${entry.area}${entry.speaker ? ` / ${entry.speaker}` : ""}`;
      const p = document.createElement("p");
      p.textContent = entry.text;
      li.append(label, p);
      this.dom.journalEntries.append(li);
    }
    this.dom.journalEntries.lastElementChild?.scrollIntoView({ block: "nearest" });
  },

  drawMap() {
    if (!this.dom || this.dom.mapPanel.hidden) return;
    const map = MAPS[G.area];
    const c = this.dom.areaMap.getContext("2d");
    const w = this.dom.areaMap.width, h = this.dom.areaMap.height;
    const scale = Math.min((w - 16) / map.grid[0].length, (h - 16) / map.grid.length);
    const ox = (w - map.grid[0].length * scale) / 2, oy = (h - map.grid.length * scale) / 2;
    c.fillStyle = "#0b0b10"; c.fillRect(0, 0, w, h);
    for (let y = 0; y < map.grid.length; y++) for (let x = 0; x < map.grid[0].length; x++) {
      c.fillStyle = BLOCKED.has(map.grid[y][x] || "#") ? map.palette.trim : map.palette.floor;
      c.fillRect(ox + x * scale, oy + y * scale, scale - 0.5, scale - 0.5);
    }
    const dot = (x, y, color, size = 3) => { c.fillStyle = color; c.fillRect(ox + (x + 0.5) * scale - size / 2, oy + (y + 0.5) * scale - size / 2, size, size); };
    for (const it of map.interact || []) dot(it.x, it.y, "#c9a86a");
    for (const n of map.npcs || []) if (!n.cond || F[n.cond]) dot(n.x, n.y, "#7fb3d5");
    for (const exit of map.exits || []) { c.strokeStyle = "#c9a86a"; c.strokeRect(ox + exit.x * scale, oy + exit.y * scale, scale, scale); }
    if (!META.shards.includes(map.shard.name)) {
      const x = ox + (map.shard.x + 0.5) * scale, y = oy + (map.shard.y + 0.5) * scale;
      c.strokeStyle = "#f0e8c8"; c.beginPath(); c.moveTo(x, y - 3); c.lineTo(x + 3, y); c.lineTo(x, y + 3); c.lineTo(x - 3, y); c.closePath(); c.stroke();
    }
    dot((G.px + 6) / TILE - 0.5, (G.py + 8) / TILE - 0.5, "#ffffff", 5);
  },

  render(dt, cam, now) {
    if (!this.dom) return;
    this.sync();
    if (this.chapterTime > 0 && ui.start.hidden && !this.paused()) {
      this.chapterTime -= dt;
      if (this.chapterTime <= 0) this.dom.chapterCard.classList.remove("visible");
    }
    this.saveElapsed += dt;
    if (this.saveElapsed >= 3 && !this.paused() && ui.start.hidden) { this.saveElapsed = 0; saveRun(); }
    this.mapElapsed += dt;
    if (this.mapElapsed > 0.15) { this.mapElapsed = 0; this.drawMap(); }
    if (this.effect && !this.paused()) {
      this.effect.left -= dt;
      const alpha = Math.max(0, this.effect.left / this.effect.total);
      if (!this.prefs.motion) {
        ctx.save();
        if (this.effect.kind === "duel") {
          for (let i = 0; i < 2; i++) {
            const x = VIEW_W / 2 + Math.sin(now / 200 + i * Math.PI) * 40;
            ctx.fillStyle = i ? `rgba(170,175,180,${alpha * 0.65})` : `rgba(160,40,40,${alpha * 0.65})`;
            ctx.beginPath(); ctx.arc(x, VIEW_H / 2 - 15, 16, 0, Math.PI * 2); ctx.fill();
          }
        } else {
          ctx.fillStyle = this.effect.kind === "rewrite" ? `rgba(200,185,245,${alpha * 0.13})` : `rgba(190,190,200,${alpha * 0.12})`;
          for (let y = 0; y < VIEW_H; y += 5) ctx.fillRect((Math.sin(y + now / 40) + 1) * 20, y, VIEW_W, 1);
        }
        ctx.restore();
      }
      if (this.effect.left <= 0) this.effect = null;
    }
    if (!this.prefs.hints || dialogActive || transitionLock || !ui.start.hidden || !ui.ending.hidden || this.paused()) return;
    const goal = this.goalPoint();
    if (!goal) return;
    const gx = goal.x * TILE + 8 - cam.x, gy = goal.y * TILE + 8 - cam.y;
    if (gx > 12 && gx < VIEW_W - 12 && gy > 24 && gy < VIEW_H - 20) return;
    const angle = Math.atan2(gy - VIEW_H / 2, gx - VIEW_W / 2);
    const x = Math.max(10, Math.min(VIEW_W - 10, gx)), y = Math.max(28, Math.min(VIEW_H - 26, gy));
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.fillStyle = "#c9a86a";
    ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(-4, -3); ctx.lineTo(-4, 3); ctx.closePath(); ctx.fill(); ctx.restore();
  },
};
