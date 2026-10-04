"use strict";

// The last chapter is played on the surface of language, not at three map props.
const Finale = {
  keys: ["meta_1", "meta_state_1", "meta_state_2", "meta_state_3", "meta_observers", "meta_prequel", "meta_compensation", "normal_ending", "ending"],
  open: false,
  timer: null,
  raw: [],
  prior: [],
  offset: 0,

  init() {
    this.dom = Object.fromEntries(["finaleHeading", "finalePhase", "finaleLedger", "endingRename", "endingGallery", "renameDialog", "renameForm", "protagonistName"].map(id => [id, document.getElementById(id)]));
    ENDINGS.normal.text = FinaleScenes.normal_ending.text.map(line => this.text(line)).join("\n\n");
    ENDINGS.true.text = FinaleScenes.ending.text.map(line => this.text(line)).join("\n\n");
    this.renameResume = false;
    this.dom.renameForm.addEventListener("submit", event => {
      event.preventDefault();
      const name = this.dom.protagonistName.value.trim().slice(0, 40);
      if (!name || !(F.finaleTrue || endingId === "true")) return;
      G.protagonistName = name;
      saveRun();
      this.dom.renameDialog.close();
    });
    this.dom.renameDialog.addEventListener("close", () => {
      const resume = this.renameResume;
      this.renameResume = false;
      if (resume && G.area === "meta" && F.finaleTrue && ui.ending.hidden && ui.start.hidden) this.terminal();
      else Expedition.focusGameplay();
    });
    this.dom.endingRename.addEventListener("click", () => this.rename());
    this.dom.endingGallery.addEventListener("click", () => { renderCodex(); ui.codex.hidden = false; });
  },

  text(line) { return typeof line === "string" ? line : line.text || line.replacement || ""; },
  active() { return this.open && G.area === "meta" && ui.start.hidden && ui.ending.hidden; },
  step() { return Math.min(3, Math.max(0, G.counters.finaleStep || 0)); },
  node() { return this.keys[G.counters.finaleNode] || "meta_1"; },

  reset() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.renameResume = false;
    if (this.dom?.renameDialog.open) this.dom.renameDialog.close();
    this.open = false;
    this.raw = [];
    this.prior = [];
    document.body.classList.remove("finale-active");
    this.dismiss();
    document.title = "无中归来者 · 箱庭版";
  },

  dismiss() {
    if (!this.dom) return;
    for (const id of ["finaleHeading", "finalePhase", "finaleLedger"]) this.dom[id].hidden = true;
  },

  enter() {
    if (dialogActive || this.timer !== null || !ui.ending.hidden) return;
    this.open = true;
    document.body.classList.add("finale-active");
    goldDrop = null;
    Expedition.chapterTime = 0;
    Expedition.dom.chapterCard.classList.remove("visible");
    // Former stele/golden-drop saves restart at the missing chapter, not after it.
    if (!F.finaleStarted) {
      F.finaleStarted = true;
      G.counters.finaleNode = 0;
      G.counters.finaleStep = 0;
      G.counters.finaleFrom = 0;
    }
    if (F.finaleNormal || F.finaleTrue) this.terminal();
    else this.offer();
  },

  compose(id) {
    const scene = FinaleScenes[id];
    let lines = scene.text.filter(line => !line.requiresMemory || F.rainMemory || G.memories.includes(line.requiresMemory));
    if (scene.progressiveRetroactive) {
      const [first, second] = scene.retroactiveReveals;
      if (this.step() === 0) lines = lines.slice(0, first.at);
      else if (this.step() === 1) lines = [...lines.slice(0, first.at), ...first.text, ...lines.slice(first.at, second.at)];
      else lines = [...lines.slice(0, first.at), ...first.text, ...lines.slice(first.at, second.at), ...second.text, ...lines.slice(second.at)];
    } else {
      for (const reveal of scene.retroactiveReveals || []) if (this.step() >= reveal.step) lines.splice(reveal.at, 0, ...reveal.text);
    }
    if (F.finaleRewritten && scene.revealAfterRewrite) lines.splice(scene.revealAt || 0, 0, ...scene.revealAfterRewrite);
    return lines;
  },

  options(id) {
    const scene = FinaleScenes[id];
    if (F.finaleRewritten && scene.choicesAfterRewrite) return scene.choicesAfterRewrite;
    return scene.phaseChoices?.[String(id === "meta_1" ? Math.min(2, this.step()) : this.step())] || scene.choices || [];
  },

  line(raw) {
    const line = typeof raw === "string" ? { t: raw } : { t: this.text(raw), s: raw.speaker, c: raw.className, secretAction: raw.secretAction };
    if (raw.kind === "rewrite") line.rewrite = { original: raw.original, replacement: raw.replacement };
    line.stage = { finale: true };
    return line;
  },

  offer() {
    const id = this.node(), scene = FinaleScenes[id];
    this.raw = this.compose(id);
    this.offset = Math.min(Math.max(0, G.counters.finaleFrom || 0), Math.max(0, this.raw.length - 1));
    const terminal = id === "normal_ending" || id === "ending";
    const script = { choices: terminal ? null : this.options(id).map(option => ({ label: option.label, run: () => this.act(option) })) };
    const complete = () => {
      for (const memory of scene.memories || []) addMemory(memory);
      if (terminal) {
        const ending = id === "ending" ? "true" : "normal";
        F[ending === "true" ? "finaleTrue" : "finaleNormal"] = true;
        this.open = false;
        document.body.classList.remove("finale-active");
        showEnding(ending);
      }
    };
    script.then = complete;
    playLines(this.raw.slice(this.offset).map(raw => this.line(raw)), complete, script);
  },

  to(id, from = 0) {
    this.prior = this.raw.slice(-2);
    G.counters.finaleNode = this.keys.indexOf(id);
    G.counters.finaleFrom = from;
    // Let finishDialog commit the completed action before offering the next page.
    this.timer = setTimeout(() => {
      this.timer = null;
      if (G.area === "meta" && this.open && ui.ending.hidden && ui.start.hidden) this.offer();
    }, 0);
  },

  act(option) {
    if (Expedition.paused()) return;
    if (option.action === "unconsciousStep") {
      G.counters.finaleStep = Math.max(this.step(), option.step);
      const id = option.target || this.node();
      const anchor = FinaleScenes[id].retroactiveReveals.find(reveal => reveal.step === option.step).text[0];
      const from = this.compose(id).findIndex(line => this.text(line) === this.text(anchor));
      this.to(id, Math.max(0, from));
    } else if (option.action === "rewriteChapter") {
      F.finaleRewritten = true;
      addMemory("重写者启程");
      const shard = MAPS.meta.shard.name;
      if (!META.shards.includes(shard)) { META.shards.push(shard); saveMeta(); updateHud(); notify("拾取记忆碎片：" + shard + "（跨周目保留）"); }
      this.to("meta_1");
    } else if (option.action === "resetRun") resetRun();
    else if (option.action === "openGallery") { renderCodex(); ui.codex.hidden = false; this.terminal(); }
    else if (option.action === "renameProtagonist") this.rename(true);
    else if (option.to) this.to(option.to);
  },

  answer() {
    if (!this.active() || Expedition.paused() || this.node() !== "meta_compensation" || !F.finaleRewritten || !(F.rainMemory || G.memories.includes("手心里的雨水"))) return;
    finishDialog(() => this.to("ending"));
  },

  onLine(line) {
    if (!line.stage?.finale) { this.dismiss(); return; }
    const scene = FinaleScenes[this.node()];
    this.dom.finaleHeading.hidden = false;
    this.dom.finaleHeading.textContent = scene.title;
    this.dom.finalePhase.hidden = false;
    this.dom.finalePhase.textContent = scene.kicker + (F.finaleRewritten ? " · 回写后" : "");
    this.dom.finaleLedger.replaceChildren();
    const history = this.raw.slice(0, this.offset + dialogIndex);
    for (const raw of (history.length ? history : this.prior).slice(-2)) {
      const p = document.createElement("p");
      p.textContent = this.text(raw);
      if (raw.className?.includes("revealed")) p.className = "recovered";
      this.dom.finaleLedger.append(p);
    }
    this.dom.finaleLedger.hidden = !this.dom.finaleLedger.children.length;
    ui.dialog.dataset.voice = line.rewrite ? "rewrite" : line.s === "外来者" || line.s === "背景" ? "intruder" : line.s === "无意识" ? "unconscious" : line.s === "周防" ? "protagonist" : "narration";
    if (line.s === "周防") ui.dialogSpeaker.textContent = G.protagonistName || "周防";
  },

  terminal() {
    this.open = true;
    document.body.classList.add("finale-active");
    const id = F.finaleTrue ? "ending" : "normal_ending";
    G.counters.finaleNode = this.keys.indexOf(id);
    this.raw = FinaleScenes[id].text;
    this.offset = this.raw.length - 1;
    playLines([this.line(this.raw.at(-1))], null, { choices: FinaleScenes[id].choices.map(option => ({ label: option.label, run: () => this.act(option) })) });
  },

  rename(resume = false) {
    if (!(F.finaleTrue || endingId === "true")) return;
    this.renameResume = resume;
    this.dom.protagonistName.value = G.protagonistName || "周防";
    Expedition.open(this.dom.renameDialog);
    this.dom.protagonistName.focus();
  },

  render() {
    ctx.fillStyle = "#070910";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  },
};
