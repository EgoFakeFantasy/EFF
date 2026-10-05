"use strict";

// The contested objects are body, attribution and ending, then the history of
// the event itself. No HP, reaction deadline, or additional ending prerequisite.
const PhenomenonBattle = {
  phase: null,
  time: 0,
  pending: false,
  selected: 0,
  claimed: [false, false, false],
  labels: ["身体控制权", "被强加的罪责", "被强写的结局"],

  init() {
    this.dom = Object.fromEntries(["battlePanel", "battleHeading", "battleStatus", "battleTargets", "phenomenonStage", "historyAnchors"].map(id => [id, document.getElementById(id)]));
    this.stage = this.dom.phenomenonStage.getContext("2d");
    this.stage.imageSmoothingEnabled = false;
    document.addEventListener("keydown", event => {
      if (!this.pending || Expedition.paused() || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      this.selected = (this.selected + (event.key === "ArrowLeft" ? 2 : 1)) % 3;
      this.markSelected();
      this.dom.battleTargets.children[this.selected]?.focus({ preventScroll: true });
      event.preventDefault();
      event.stopImmediatePropagation();
    }, { capture: true });
  },

  clear() {
    this.phase = null;
    this.pending = false;
    this.claimed = [false, false, false];
    if (!this.dom) return;
    this.dom.battlePanel.hidden = true;
    this.dom.phenomenonStage.hidden = true;
    this.dom.historyAnchors.hidden = true;
    delete ui.dialog.dataset.battle;
  },

  onLine(line) {
    if (!this.dom) return;
    const cue = line.stage?.battle;
    this.pending = false;
    if (line.stage?.finale) {
      if (this.phase !== "history") this.time = 0;
      this.phase = "history";
      this.dom.battlePanel.hidden = true;
      this.dom.phenomenonStage.hidden = false;
      this.dom.historyAnchors.hidden = false;
      this.history();
      return;
    }
    this.dom.phenomenonStage.hidden = true;
    this.dom.historyAnchors.hidden = true;
    if (!cue) { this.clear(); return; }
    if (this.phase !== cue.phase) {
      if (cue.phase === "ownership") this.claimed = [false, false, false];
      this.phase = cue.phase;
      this.time = 0;
    }
    this.cue = cue;
    ui.dialog.dataset.battle = cue.phase;
    if (cue.phase === "clash") ui.areaName.textContent = ["崩坏的庭院", "红灰光团的碰撞", "场地消解 · 无色雨水", "圣塔底部 · 向上坠落", "黄昏的海", "显意识的边缘"][cue.progress];
    if (cue.phase === "rain-rise") ui.areaName.textContent = "圣塔底部 · 向上坠落";
    this.dom.battlePanel.hidden = cue.target === undefined;
    if (cue.target === undefined) return;
    this.pending = true;
    this.selected = 0;
    this.dom.battleHeading.textContent = "把这句话写入它所否定的现象";
    this.dom.battleStatus.textContent = "选择对象 · ← / → 切换 · E 确认";
    this.dom.battleTargets.replaceChildren();
    this.labels.forEach((label, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("focus", () => { if (!this.pending || Expedition.paused()) return; this.selected = index; this.markSelected(); });
      button.addEventListener("click", event => { event.stopPropagation(); if (!this.pending || Expedition.paused()) return; this.selected = index; this.commit(index); });
      this.dom.battleTargets.append(button);
    });
    this.markSelected();
  },

  markSelected() {
    [...this.dom.battleTargets.children].forEach((button, index) => { button.classList.toggle("selected", index === this.selected); button.setAttribute("aria-pressed", String(index === this.selected)); });
  },

  commit(index) {
    if (!this.pending || Expedition.paused() || !dialogActive) return false;
    this.selected = index;
    this.markSelected();
    if (!typeDone) { advanceDialog(); return false; }
    if (index !== this.cue.target) {
      this.dom.battleStatus.textContent = "这句话还没有落到对应的现象上。重新选择它要否定的对象。";
      this.markSelected();
      return false;
    }
    this.pending = false;
    this.claimed[index] = true;
    this.dom.battleStatus.textContent = ["撕扯的力道突然消失了一点。", "造下这一切的不是我。我否定这样的事情。", "这样的结局绝不可能发生！"][index];
    for (const button of this.dom.battleTargets.children) button.disabled = true;
    this.dom.battleTargets.children[index].classList.add("written");
    updateDialogStatus();
    return true;
  },

  // A timeline anchor is another surface for the original offered choice. It
  // stays disabled until the full passage has been read and that choice exists.
  history() {
    this.dom.historyAnchors.replaceChildren();
    this.dom.historyAnchors.hidden = !Finale.intervening();
    if (!Finale.intervening()) { this.renderHistory(); return; }
    const labels = ["定义之前", "幻海的消息", "分层之前"];
    labels.forEach((label, index) => {
      const step = index + 1;
      const option = dialogChoices?.find(item => item.step === step);
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = (Finale.step() >= step ? "已回写 · " : "过去 · ") + label;
      button.disabled = !option;
      button.className = Finale.step() >= step ? "recovered" : "";
      button.title = option ? option.label : "读完当前段落后，在原文允许的位置回写过去";
      button.addEventListener("click", event => {
        event.stopPropagation();
        if (!option || !dialogChoices?.includes(option) || Expedition.paused()) return;
        const originalButton = [...ui.dialogChoices.children].find(item => item.textContent === option.label);
        originalButton?.click();
      });
      this.dom.historyAnchors.append(button);
    });
    this.renderHistory();
  },

  renderHistory() {
    const c = this.stage;
    c.fillStyle = "#0b111b"; c.fillRect(0, 0, 320, 64);
    // Crystal petals are the arena of manifestation, not higher external tiers.
    for (let i = 0; i < 12; i++) {
      const angle = i * Math.PI / 6, x = 256 + Math.cos(angle) * 24, y = 29 + Math.sin(angle) * 19;
      PixelArt.polygon(c, [[256, 29], [x - 4, y - 3], [x, y - 5], [x + 4, y + 3]], i % 2 ? "#576475" : "#7a8192");
    }
    c.fillStyle = "#d8d7c9"; c.fillRect(254, 27, 4, 4);
    if (!Finale.intervening()) {
      // The present is contested by Zhou and the outsider. No past-directed
      // stroke or third participant appears until Zhou asks for help.
      const node = Finale.node(), asking = Finale.requesting();
      this.dom.phenomenonStage.dataset.mode = asking ? "summons" : "appearance";
      drawPerson(c, 236, 43, { coat: "#36465b", hair: "#222531", skin: "#d9b89b", dir: 2 });
      c.fillStyle = "#b36c79"; c.fillRect(285, 26, 8, 23); c.fillRect(282, 30, 14, 3);
      c.fillStyle = "#151421"; c.fillRect(286, 33, 4, 8);
      const outsiderWrites = node === "meta_state_2";
      c.fillStyle = outsiderWrites ? "#b36c79" : "#9babbd";
      c.fillRect(28, 28, 179, 2); c.fillRect(48, 34, 147, 1);
      c.fillStyle = outsiderWrites ? "#9babbd" : "#b36c79";
      c.fillRect(34, 31, 158, 1);
      c.font = "9px sans-serif";
      c.fillStyle = "#d8d7c9";
      c.fillText(node === "meta_state_1" ? "侵略者被赶出" : node === "meta_state_2" ? "无能为力的谎言" : node === "meta_state_3" ? "一切才刚刚开始" : "显现的场域", 30, 22);
      if (asking) {
        c.fillStyle = "#a3afa7";
        for (let y = 5; y < 25; y += 4) c.fillRect(239, y, 1, 2);
        c.fillText("呼唤", 212, 12);
      }
      c.fillStyle = "#685037";
      for (let x = 0; x < 320; x += 4) c.fillRect(x, 59 + x % 3, 4, 4);
      this.dom.phenomenonStage.setAttribute("aria-label", asking ? "周防正在呼唤无意识，一起阻止改写；尚未回写过去。" : "表象争夺：周防与外来者在显现的场域争夺主导权。");
      return;
    }
    this.dom.phenomenonStage.dataset.mode = "history";
    const rewritten = F.finaleRewritten, step = Finale.step();
    const overwrite = ["meta_state_2", "meta_state_3"].includes(Finale.node());
    for (let i = 0; i < 4; i++) {
      const x = 22 + i * 63;
      c.fillStyle = "#2b3745"; c.fillRect(x, 45, 57, 1);
      c.fillStyle = i < step || rewritten ? "#7cbaad" : overwrite && i === 3 ? "#c37b82" : "#768391";
      c.fillRect(x, 39, 5, 11); c.fillRect(x - 2, 42, 9, 5);
      for (let k = 0; k < 3; k++) { c.fillRect(x + 8, 30 - k * 4, 14 + k * 4, 1); }
      if (i < step || rewritten) {
        c.fillStyle = "#8cc9b5";
        c.fillRect(x + 7, 14, 25, 2); c.fillRect(x + 7, 11, 1, 8);
        c.fillRect(x + 33, 11, 1, 8);
      }
    }
    if (step || rewritten) {
      const to = 24 + (Math.min(3, step) - 1) * 63;
      c.fillStyle = "#82bfae";
      c.fillRect(to, 7, 190 - to, 1); c.fillRect(190, 7, 1, 25);
      if (!Expedition.prefs.motion) c.fillRect(Math.round(190 - (this.time * 35 % Math.max(1, 190 - to))), 6, 3, 3);
      c.fillRect(to, 7, 1, 11); c.fillRect(to - 2, 15, 5, 1); c.fillRect(to - 1, 16, 3, 1);
    }
    // Two opposing strokes work on the same phenomenon. Colors exchange in
    // the earlier courtyard battle; here each voice keeps its writing motif.
    drawPerson(c, 236, 43, { coat: "#36465b", hair: "#222531", skin: "#d9b89b", dir: 2 });
    c.fillStyle = "#b36c79"; c.fillRect(285, 26, 8, 23); c.fillRect(282, 30, 14, 3); c.fillRect(286, 29, 5, 13);
    c.fillStyle = "#151421"; c.fillRect(286, 33, 4, 8);
    if (overwrite && !rewritten) {
      c.fillStyle = "#a66d79"; c.fillRect(186, 26, 32, 1); c.fillRect(197, 20, 21, 1);
      c.fillStyle = "#647083"; c.fillRect(191, 31, 19, 1);
    }
    // Assistance is now present; its first strokes still wait for the chosen anchors.
    c.fillStyle = "#82bfae"; c.fillRect(207, 8, 5, 6); c.fillRect(204, 15, 11, 2); c.fillRect(208, 18, 3, 6);
    // The sea remains a threat until the actual offered line says it is avoided.
    const history = Finale.raw.slice(0, Finale.offset + dialogIndex + 1).map(raw => Finale.text(raw)).join("\n");
    const ward = history.split("\n").some(text => text.includes("黄昏") && (text.includes("避开") || text.includes("避过") || text.includes("避免"))) || rewritten;
    c.fillStyle = ward ? "#35594f" : "#685037";
    for (let x = 0; x < 320; x += 4) c.fillRect(x, 59 + x % 3, 4, 4);
    this.dom.phenomenonStage.setAttribute("aria-label", "过程争夺：" + (step ? "无意识从现在回到过去，已回写" + step + "处。" : "无意识回应了周防的呼唤，过去的三处锚点尚未回写。") + (overwrite ? "刚发生的过程正在被覆盖。" : "") + (rewritten ? "整章已被重写。" : ""));
  },

  render(now, dt, cam) {
    if (!this.phase || this.phase === "history" || !dialogActive) return;
    if (!Expedition.paused() && !Expedition.prefs.motion) this.time += dt;
    const c = ctx, t = this.time;
    if (this.phase === "ownership") {
      const x = G.px - cam.x + 6, y = G.py - cam.y + 8;
      const bound = !this.claimed[0];
      c.fillStyle = "rgba(18,8,17,.32)"; c.fillRect(0, 0, VIEW_W, VIEW_H);
      if (bound) {
        c.strokeStyle = "#a06270";
        for (let i = 0; i < 7; i++) { c.beginPath(); c.moveTo(i % 2 ? 0 : VIEW_W, 25 + i * 15); c.lineTo(x + (i % 2 ? -7 : 7), y + i % 3 * 3); c.stroke(); }
      }
      c.font = "9px sans-serif";
      const claims = ["身体被牵引", "是你亲自杀害了家中的所有人", "陷入逃避而郁郁一生"];
      const replies = ["不，我拒绝这一切。", "造下这一切的不是我。", "我否定这样的结局。"];
      for (let i = 0; i < 3; i++) {
        const bx = 9, by = 24 + i * 16;
        c.fillStyle = "#140c16df"; c.fillRect(bx - 2, by - 10, 158, 14);
        c.fillStyle = this.claimed[i] ? "#c7d1b8" : "#c68d91"; c.fillText(this.claimed[i] ? replies[i] : i === 2 && this.cue.progress < 5 ? "……" : claims[i], bx, by);
        if (this.claimed[i]) { c.fillStyle = "#72a397"; c.fillRect(bx - 3, by - 10, 1, 13); }
      }
      return;
    }
    if (this.phase === "clash") {
      c.fillStyle = "#0c111b"; c.fillRect(0, 0, VIEW_W, VIEW_H);
      const progress = this.cue.progress || 0, twilight = progress >= 4;
      // The floor falls downward as the red/grey confusion falls upward.
      for (let i = 0; i < 36; i++) {
        const x = Math.floor(hash(i, 8, 7) * VIEW_W), y = (Math.floor(hash(i, 9, 1) * 150) + t * 24) % VIEW_H;
        c.fillStyle = twilight ? "#625039" : i % 3 ? "#344253" : "#83959d";
        if (progress < 2) c.drawImage(tileCache, Math.floor(hash(i, 5, 2) * (tileCache.width - 16)), Math.floor(hash(i, 6, 3) * (tileCache.height - 16)), 16, 16, x, y, 12, 8);
        else c.fillRect(x, y, 2, 1);
        if (progress >= 2) { c.fillStyle = "#819caa"; c.fillRect(x, y + 4, 1, 4); }
      }
      if (progress >= 3) for (let layer = 0; layer < 4; layer++) {
        const y = Math.floor((layer * 48 + t * 24) % 192);
        c.fillStyle = "#253343"; c.fillRect(54, y, 75, 3); c.fillRect(192, y, 75, 3);
        c.fillStyle = "#536074"; c.fillRect(70, y + 3, 2, 10); c.fillRect(248, y + 3, 2, 10);
      }
      for (let side = 0; progress >= 1 && side < 2; side++) {
        const exchange = Math.floor(t * 1.8 / Math.PI) % 2;
        const color = (side + exchange) % 2 ? "#8b8c98" : "#b54855";
        const x = 160 + (side ? 1 : -1) * (Expedition.prefs.motion ? 7 : Math.abs(Math.sin(t * 1.8)) * 38);
        const y = 55 + (side ? 1 : -1) * (Expedition.prefs.motion ? 0 : Math.sin(t * .7) * 3);
        for (let row = -9; row <= 9; row++) { const width = Math.floor(Math.sqrt(81 - row * row)); c.fillStyle = Math.abs(row) > 6 ? "#3b2f40" : color; c.fillRect(Math.round(x - width), Math.round(y + row), width * 2, 1); }
        c.fillStyle = "#dfb2aa"; c.fillRect(Math.round(x - 3), Math.round(y - 5), 3, 2);
      }
      if (twilight) { c.fillStyle = "#9d795456"; c.fillRect(0, 0, VIEW_W, VIEW_H); c.fillStyle = "#68503b"; c.fillRect(0, 90, VIEW_W, 102); }
      if (!Expedition.prefs.motion && progress === 0) { c.fillStyle = "#8d9ba233"; for (let i = 0; i < 30; i++) c.fillRect(Math.floor(hash(i, Math.floor(t * 4), 2) * 320), i * 6, 2, 1); }
      return;
    }
    if (this.phase === "rain-rise") {
      const snapshot = { x: 160, y: 112 - 42 * (1 - Math.exp(-t / 6)), scroll: t * 24, time: t, approach: .2 + .5 * (1 - Math.exp(-t / 8)), pose: .7, shadow: .8 };
      StormFlight.render.call(snapshot, now);
      return;
    }
    if (this.phase === "rain-body") {
      const split = this.cue.progress >= 8 && this.cue.progress < 11;
      const x = G.px - cam.x + 6, y = G.py - cam.y;
      if (split) {
        c.fillStyle = "#101b2bed"; c.fillRect(x - 12, y - 2, 27, 24);
        for (let i = 0; i < 12; i++) { c.fillStyle = i % 3 ? "#53647d" : "#d4bba0"; c.fillRect(Math.round(x + (i % 4 - 1.5) * 6), y + Math.floor(i / 4) * 6, 3, 3); }
        c.fillStyle = "#767c7a"; for (const side of [-1, 1]) for (let i = 0; i < 4; i++) c.fillRect(x + side * (16 + i * 2), y + 4 + i, 3, 2);
      } else if (this.cue.progress >= 11) { c.fillStyle = "#a7c7b3"; c.fillRect(x - 6, y - 1, 14, 1); c.fillRect(x - 7, y, 1, 16); c.fillRect(x + 7, y, 1, 16); }
    }
  },
};
