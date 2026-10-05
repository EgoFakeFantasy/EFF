"use strict";

// Adaptation branches requested by the author. Canonical dialogue stays in its
// scripts; risk, response windows and the twilight rain act at explicit gates.
const NarrativeTrials = {
  family: null,
  court: null,
  rain: null,
  focused: true,
  resuming: false,
  saveElapsed: 0,
  buttons: new Map(),
  selected: null,
  keyNames: ["自我", "来处", "牵系", "意志"],

  init() {
    this.dom = Object.fromEntries(["trialHUD", "trialHeading", "trialStatus", "trialMeter", "rainTrial", "rainCanvas", "rainDrops", "rainKeys", "rainClock", "rainFeedback", "rainStart"].map(id => [id, document.getElementById(id)]));
    this.canvas = this.dom.rainCanvas.getContext("2d");
    this.canvas.imageSmoothingEnabled = false;
    this.dom.rainStart.addEventListener("click", () => {
      if (!this.rain || this.rain.mode !== "intro" || this.paused()) return;
      this.rain.mode = "play";
      lastT = performance.now();
      this.checkpoint(); this.sync();
      canvas.focus({ preventScroll: true });
    });
    window.addEventListener("pagehide", () => this.checkpoint());
    document.addEventListener("visibilitychange", () => { if (document.hidden) this.checkpoint(); });
    window.addEventListener("blur", () => { this.focused = false; this.checkpoint(); });
    window.addEventListener("focus", () => { this.focused = true; lastT = performance.now(); });
    document.addEventListener("keydown", event => {
      if (!this.rainActive() || this.paused()) return;
      const key = event.key.toLowerCase();
      if (!["arrowleft", "arrowright", "a", "d", "e", " ", "enter"].includes(key)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.repeat) return;
      if (["arrowleft", "arrowright", "a", "d"].includes(key)) this.select(key === "arrowleft" || key === "a" ? -1 : 1);
      else this.interact();
    }, { capture: true });
    this.sync();
  },

  paused() { return !this.focused || Expedition.paused() || !ui.start.hidden || !ui.ending.hidden || transitionLock; },
  rainActive() { return !!this.rain && ["intro", "play"].includes(this.rain.mode); },
  familyRisk() { return Math.min(60, 20 + (this.family?.stays || 0) * 10); },

  offerFamily() {
    if (!this.family) this.family = { seed: Math.floor(Math.random() * 0x100000000), stays: 0, mode: "choice" };
    this.family.mode = "choice";
    const risk = this.familyRisk();
    playLines([staged("熟悉的早饭，熟悉的房间。只要再留一天，似乎就能把那些疑问暂且放下。", { at: [11, 5], focus: { x: 11, y: 3 }, family: "gone", pose: "stand" })], null, {
      choices: [
        { label: `在日常里再留一天（${risk}% 会被锁入黄昏）`, run: () => this.linger() },
        { label: "不再停留，继续追索记忆", run: () => { this.family = null; this.sync(); playScript("familyCurtain"); } },
      ],
    });
    this.checkpoint(); this.sync();
  },

  linger() {
    if (!this.family || this.family.mode !== "choice") return;
    const risk = this.familyRisk();
    // Draw once, then checkpoint the outcome. Refresh cannot reroll a day.
    this.family.seed = (Math.imul(this.family.seed, 1664525) + 1013904223) >>> 0;
    this.family.stays += 1;
    this.family.mode = this.family.seed / 0x100000000 < risk / 100 ? "locked" : "wait";
    this.familyScene();
  },

  familyScene() {
    const locked = this.family.mode === "locked";
    const lines = locked ? [
      staged("于是，早餐之后仍然是早餐。周防把下一步的计划留给了明天。", { at: [10, 3], focus: { x: 11, y: 3 }, family: "table", pose: "eat" }),
      "明天变成下一周，下一周变成下一年。那些问题逐渐不再被提起。",
      "少年长大，又老去。他在这个普通的家中度过了一生，却再没有找回来到花园以前的记忆。",
      staged("直到日常的最后一天。房间失去轮廓，昏黄的海淹没了所有。", { family: "gone", pose: "stand", scene: "curtain" }),
    ] : [
      staged("又一个普通的早晨过去了。白粥仍然温热，生活的痕迹仍然在这里。", { at: [10, 3], focus: { x: 11, y: 3 }, family: "table", pose: "eat" }),
      "可是，照片背后的人影、那口棺材，还有水箱中的异常，都没有因此得到解释。",
    ];
    playLines(lines, () => {
      if (locked) { this.family = null; showEnding("bad_family"); }
      else this.offerFamily();
    });
    this.checkpoint(); this.sync();
  },

  onChoices(script) {
    if (this.resuming || script !== SCRIPTS.accuse) return;
    if (!this.court) this.court = { mode: "choice", remaining: 24000, script: "accuse", index: 6, selected: 0, claimed: [false, false, false], written: false };
    lastT = performance.now();
    this.checkpoint(); this.sync();
  },

  onLine() {
    if (!this.court || this.resuming || this.court.mode === "lost") return;
    if (currentDialogScript === SCRIPTS.refusal && this.court.mode !== "won") this.court.mode = "ownership";
    const id = ["accuse", "refusal", "clash"].find(id => currentDialogScript === SCRIPTS[id]);
    if (!id) return;
    this.court.script = id;
    this.court.index = dialogIndex;
    this.court.selected = PhenomenonBattle.selected;
    this.court.claimed = [...PhenomenonBattle.claimed];
    this.court.written = !PhenomenonBattle.pending;
    this.checkpoint(); this.sync();
  },

  onCommit() {
    if (!this.court || this.court.mode !== "ownership") return;
    this.court.claimed = [...PhenomenonBattle.claimed];
    this.court.written = true;
    this.court.remaining = Math.min(24000, this.court.remaining + 5000);
    if (this.court.claimed.every(Boolean)) this.court.mode = "won";
    this.checkpoint(); this.sync();
  },

  loseCourt() {
    this.court.mode = "lost";
    this.court.remaining = 0;
    playLines([
      staged(fracture("如果只是这样的话，那么故事应该就此迎来结尾了吧。"), { takeover: 3, pose: "bound" }),
      staged("周防没有把回应写入现实。撕扯的力量封住了最后的间隙，身体继续行动，决定它去向的却已经是外来者。", { takeover: 3, pose: "bound" }),
    ], () => showEnding("bad_owned"));
    this.checkpoint(); this.sync();
  },

  beforeAdvance() {
    if (currentDialogScript !== SCRIPTS.clash || dialogIndex !== 4 || F.twilightCaught) return false;
    this.startRain();
    return true;
  },

  startRain() {
    closeDialog(); clearInput();
    this.court = null;
    this.rain = { mode: "intro", elapsed: 0, ordinary: 0, keyIndex: 0, nextId: 0, mask: 0, score: 0, drops: [] };
    this.selected = null;
    Expedition.dom.mapPanel.hidden = true;
    Expedition.dom.mapButton.setAttribute("aria-expanded", "false");
    Expedition.chapterTime = 0;
    Expedition.dom.chapterCard.classList.remove("visible");
    this.checkpoint(); this.sync();
  },

  select(direction) {
    const drops = this.rain?.drops || [];
    if (!drops.length) return;
    const index = drops.findIndex(d => d.id === this.selected);
    this.selected = drops[(index + direction + drops.length) % drops.length].id;
    this.paintDrops();
    this.buttons.get(this.selected)?.focus({ preventScroll: true });
  },

  interact() {
    if (!this.rainActive()) return false;
    if (this.paused()) return true;
    if (this.rain.mode === "intro") this.dom.rainStart.click();
    else if (this.selected !== null) this.catch(this.selected);
    return true;
  },

  catch(id) {
    if (this.paused() || this.rain?.mode !== "play") return;
    const drop = this.rain.drops.find(d => d.id === id);
    if (!drop) return;
    if (drop.key >= 0) {
      this.rain.mask |= 1 << drop.key;
      this.rain.drops = this.rain.drops.filter(d => d.key !== drop.key);
      this.dom.rainFeedback.textContent = `留下了「${this.keyNames[drop.key]}」。`;
      Expedition.chime(660, .15);
    } else {
      this.rain.score += 1;
      this.rain.drops = this.rain.drops.filter(d => d.id !== id);
      this.dom.rainFeedback.textContent = "有一滴留在手心。";
      Expedition.chime(330, .08);
    }
    this.selected = null;
    if (this.rain.mask === 15) { this.finishRain(); return; }
    this.checkpoint(); this.sync();
  },

  finishRain() {
    G.counters.twilightRain = this.rain.score;
    F.twilightCaught = true;
    this.rain = null; this.clearDrops(); this.sync();
    // Resume the next canonical paragraph; no reward substitutes for the later
    // rain-memory answer or the finale's original textual operations.
    playScript("clash");
    dialogIndex = 5; renderLine();
    this.court = { mode: "won", remaining: 0, script: "clash", index: 5, selected: 0, claimed: [true, true, true], written: true };
    this.checkpoint();
  },

  loseRain() {
    this.rain.mode = "lost";
    this.rain.elapsed = 30000;
    this.clearDrops(); this.sync();
    playLines([
      staged("雨水穿过手心。尚未留下的部分沿着裂隙流向塔底，而昏黄的海不再给周防下一次醒来的机会。", { scene: "curtain" }),
      "这一次，显意识的边缘没有出现。真灵落入那昏黄的大海，泯灭于高塔尽头的红月。",
    ], () => showEnding("bad_rain"));
    this.checkpoint();
  },

  update(milliseconds) {
    if (this.paused()) return;
    const ms = Math.max(0, milliseconds * 1000);
    if (this.court && G.area === "blood" && ["choice", "ownership"].includes(this.court.mode)) {
      const deciding = currentDialogScript === SCRIPTS.accuse && !!dialogChoices;
      const writing = currentDialogScript === SCRIPTS.refusal && typeDone && PhenomenonBattle.pending;
      if (deciding || writing) {
        this.court.remaining = Math.max(0, this.court.remaining - ms);
        if (!this.court.remaining) { this.loseCourt(); return; }
      }
    }
    if (this.rain?.mode === "play") {
      const r = this.rain;
      r.elapsed = Math.min(30000, r.elapsed + ms);
      while (r.ordinary * 750 <= r.elapsed) {
        const born = r.ordinary++ * 750;
        r.drops.push({ id: r.nextId++, key: -1, born, x: 20 + (r.ordinary * 83 % 280) });
      }
      while (1000 + r.keyIndex * 3000 <= r.elapsed) {
        const key = r.keyIndex % 4, born = 1000 + r.keyIndex++ * 3000;
        if (!(r.mask & 1 << key)) r.drops.push({ id: r.nextId++, key, born, x: [54, 122, 196, 265][key] });
      }
      r.drops = r.drops.filter(d => r.elapsed - d.born < (d.key >= 0 ? 6500 : 3500));
      if (r.elapsed >= 30000) { this.loseRain(); return; }
    }
    this.saveElapsed += ms;
    if (this.saveElapsed >= 1000) { this.saveElapsed = 0; this.checkpoint(); }
    this.sync();
  },

  sync() {
    if (!this.dom) return;
    const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };
    const family = this.family && G.area === "house_family";
    const court = this.court && G.area === "blood" && this.court.mode !== "won";
    this.dom.trialHUD.hidden = !ui.start.hidden || !ui.ending.hidden || (!family && !court);
    if (family || court) {
      this.dom.trialHUD.dataset.kind = family ? "family" : "court";
      setText(this.dom.trialHeading, family ? `日常之家 · 第 ${4 + this.family.stays} 日` : "身体所有权争夺");
      setText(this.dom.trialStatus, family ? this.family.mode === "locked" ? "岁月已被锁定 · 此生不再继续追索" : `再留一天：${this.familyRisk()}% 锁入黄昏 · 可随时选择继续追索` : this.court.mode === "lost" ? "外来者已完成占据" : `${Math.ceil(this.court.remaining / 1000)} 秒 · 阅读时暂停`);
      this.dom.trialMeter.style.width = `${family ? this.familyRisk() : this.court.remaining / 240}%`;
      this.dom.trialHUD.classList.toggle("urgent", !!court && this.court.remaining < 8000);
    }
    this.dom.rainTrial.hidden = !this.rainActive() || !ui.start.hidden || !ui.ending.hidden;
    document.body.classList.toggle("rain-trial-active", !this.dom.rainTrial.hidden);
    if (this.rainActive()) {
      this.dom.rainStart.hidden = this.rain.mode !== "intro";
      setText(this.dom.rainClock, `${Math.ceil((30000 - this.rain.elapsed) / 1000)} 秒`);
      setText(this.dom.rainKeys, this.keyNames.map((name, i) => `${this.rain.mask & 1 << i ? "◆" : "◇"} ${name}`).join("　"));
      this.dom.rainKeys.setAttribute("aria-label", `关键雨水 ${this.keyNames.filter((_, i) => this.rain.mask & 1 << i).length} / 4`);
      this.paintDrops();
    } else this.clearDrops();
  },

  paintDrops() {
    if (!this.dom || !this.rainActive()) return;
    const live = new Set(this.rain.drops.map(d => d.id));
    for (const [id, button] of this.buttons) if (!live.has(id)) { button.remove(); this.buttons.delete(id); }
    if (!live.has(this.selected)) this.selected = this.rain.drops.find(d => d.key >= 0)?.id ?? this.rain.drops[0]?.id ?? null;
    for (const d of this.rain.drops) {
      let button = this.buttons.get(d.id);
      if (!button) {
        button = document.createElement("button"); button.type = "button";
        button.className = `trial-drop${d.key >= 0 ? " key-drop" : ""}`;
        button.textContent = d.key >= 0 ? this.keyNames[d.key] : "·";
        button.setAttribute("aria-label", d.key >= 0 ? `接住关键雨水：${this.keyNames[d.key]}` : "接住普通雨水");
        button.addEventListener("click", event => { event.stopPropagation(); this.catch(d.id); });
        button.addEventListener("focus", () => { if (!this.paused()) this.selected = d.id; });
        this.buttons.set(d.id, button); this.dom.rainDrops.append(button);
      }
      const life = d.key >= 0 ? 6500 : 3500;
      const progress = Math.max(0, Math.min(1, (this.rain.elapsed - d.born) / life));
      const y = Expedition.prefs.motion ? 82 + (d.key >= 0 ? d.key % 2 * 35 : 62) : 56 + progress * 86;
      button.style.left = `${d.x / 320 * 100}%`; button.style.top = `${y / 192 * 100}%`;
      button.style.setProperty("--drop-life", `${(1 - progress) * 100}%`);
      button.classList.toggle("selected", d.id === this.selected);
    }
  },

  render() {
    if (!this.rainActive() || !this.dom) return false;
    const c = this.canvas, t = Expedition.prefs.motion ? 0 : this.rain.elapsed / 1000;
    c.fillStyle = "#11121e"; c.fillRect(0, 0, 320, 192);
    for (let y = 36; y < 154; y += 3) {
      c.fillStyle = `rgba(143,91,57,${.03 + (y - 36) / 700})`; c.fillRect(0, y, 320, 3);
      for (let x = 0; x < 320; x += 22) { const grain = hash(x, y, 9); c.fillStyle = `rgba(165,130,83,${.05 + grain * .13})`; c.fillRect(x + Math.round(Math.sin(t * .5 + y + x) * 4) + Math.floor(grain * 8), y, 3 + Math.floor(grain * 13), 1); }
    }
    PixelArt.moon(c, 268, 48, 23);
    c.fillStyle = "#251e2766"; c.fillRect(252, 25, 37, 45);
    c.fillStyle = "#9e805540"; c.fillRect(0, 147, 320, 2);
    drawPerson(c, 153, 156, { coat: "#3b475a", hair: "#20232b", skin: "#d9b89b", dir: 3 });
    c.fillStyle = "#dec29b"; c.fillRect(143, 154, 8, 3); c.fillRect(165, 154, 8, 3);
    c.fillStyle = "#4c657c"; c.fillRect(143, 157, 10, 2); c.fillRect(163, 157, 10, 2);
    return true;
  },

  clearDrops() {
    for (const button of this.buttons.values()) button.remove();
    this.buttons.clear(); this.selected = null;
  },

  canCheckpoint() {
    return !!((this.family && G.area === "house_family") || ((this.court || this.rain) && G.area === "blood")) && !transitionLock && !endingId;
  },
  checkpoint() {
    if (this.resuming || !this.canCheckpoint()) return;
    if (this.court && currentDialogScript === SCRIPTS.refusal) this.court.selected = PhenomenonBattle.selected;
    saveRun(true);
  },
  snapshot() { return { version: 1, family: G.area === "house_family" ? this.family : null, court: G.area === "blood" ? this.court : null, rain: G.area === "blood" ? this.rain : null }; },

  restore(value) {
    this.family = null; this.court = null; this.rain = null;
    if (!value || value.version !== 1) return;
    const integer = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
    const f = value.family, b = value.court, r = value.rain;
    if (G.area === "house_family" && !F.familyDone && f && ["choice", "wait", "locked"].includes(f.mode) && integer(f.seed, 0, 0xffffffff) && integer(f.stays, 0, 10000)) {
      this.family = { seed: f.seed, stays: f.stays, mode: f.mode };
    }
    if (G.area !== "blood") return;
    if (F.parents && b && ["choice", "ownership", "won", "lost"].includes(b.mode) && ["accuse", "refusal", "clash"].includes(b.script) && integer(b.index, 0, { accuse: SCRIPTS.accuse.lines.length - 1, refusal: SCRIPTS.refusal.lines.length - 1, clash: SCRIPTS.clash.lines.length - 1 }[b.script]) && Number.isFinite(b.remaining) && b.remaining >= 0 && b.remaining <= 24000 && Array.isArray(b.claimed) && b.claimed.length === 3 && b.claimed.every(v => typeof v === "boolean")) {
      this.court = { mode: b.mode, script: b.script, index: b.index, remaining: b.remaining, selected: integer(b.selected, 0, 2) ? b.selected : 0, claimed: [...b.claimed], written: b.written === true };
    }
    if (F.parents && r && ["intro", "play", "lost"].includes(r.mode) && Number.isFinite(r.elapsed) && r.elapsed >= 0 && r.elapsed <= 30000 && integer(r.mask, 0, 15) && integer(r.ordinary, 0, 41) && integer(r.keyIndex, 0, 10) && integer(r.nextId, 0, 51) && integer(r.score, 0, 41) && Array.isArray(r.drops)) {
      const ids = new Set();
      const drops = r.drops.slice(0, 51).filter(d => {
        if (!d || !integer(d.id, 0, r.nextId - 1) || ids.has(d.id) || !integer(d.key, -1, 3) || !Number.isFinite(d.born) || d.born < 0 || d.born > r.elapsed || !Number.isFinite(d.x) || d.x < 20 || d.x > 300) return false;
        ids.add(d.id); return !(d.key >= 0 && r.mask & 1 << d.key);
      }).map(d => ({ id: d.id, key: d.key, born: d.born, x: d.x }));
      this.rain = { mode: r.mode, elapsed: r.elapsed, mask: r.mask, ordinary: r.ordinary, keyIndex: r.keyIndex, nextId: r.nextId, score: r.score, drops };
      this.court = null;
    }
  },

  resume() {
    lastT = performance.now();
    if (this.family && G.area === "house_family") {
      if (this.family.mode === "choice") this.offerFamily(); else this.familyScene();
      return true;
    }
    if (this.rain && G.area === "blood") {
      if (this.rain.mode === "lost") this.loseRain();
      else if (this.rain.mask === 15) this.finishRain();
      else if (this.rain.elapsed >= 30000) this.loseRain();
      else { closeDialog(); this.sync(); }
      return true;
    }
    if (this.court && G.area === "blood") {
      if (this.court.mode === "lost" || this.court.mode !== "won" && this.court.remaining <= 0) { this.loseCourt(); return true; }
      const b = { ...this.court, claimed: [...this.court.claimed] };
      this.resuming = true;
      try {
        playScript(b.script); dialogIndex = b.index; renderLine();
        PhenomenonBattle.selected = b.selected; PhenomenonBattle.claimed = b.claimed;
        if (b.written) PhenomenonBattle.pending = false;
        if (b.script === "refusal" && PhenomenonBattle.cue?.target !== undefined) {
          PhenomenonBattle.markSelected();
          if (b.written) {
            for (const button of PhenomenonBattle.dom.battleTargets.children) button.disabled = true;
            PhenomenonBattle.dom.battleTargets.children[PhenomenonBattle.cue.target]?.classList.add("written");
            PhenomenonBattle.dom.battleStatus.textContent = "这句回应已经写入现象。继续倾听。";
          }
        }
        if (b.mode === "choice") {
          typeDone = true; paintText(currentFullText(), dialogLines[dialogIndex].c);
          showChoices(SCRIPTS.accuse.choices);
        }
        this.court = b; updateDialogStatus(); this.sync();
      } finally { this.resuming = false; }
      return true;
    }
    return false;
  },

  reset() {
    this.family = null; this.court = null; this.rain = null;
    this.saveElapsed = 0; this.resuming = false;
    this.clearDrops(); this.sync();
  },
};
