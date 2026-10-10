"use strict";

// Exploration and presentation stay separate from the story and ending rules.
const Expedition = {
  prefs: { speed: 0.016, volume: 0.55, hints: true, motion: false, lighting: true, music: true },
  journal: [],
  chapterTime: 0,
  effect: null,
  selectedPoint: null,
  camera: { x: 0, y: 0 },
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
    for (const id of ["objectiveText", "chapterLabel", "chapterCard", "chapterNumber", "chapterQuote", "interactButton", "mapButton", "mapPanel", "mapTitle", "mapStatus", "areaMap", "statusMessage", "journalDialog", "journalEntries", "settingsDialog", "textSpeed", "volumeControl", "hintsControl", "motionControl", "lightingControl", "musicControl", "startStatus", "touchInteract"]) this.dom[id] = byId(id);
    this.prefs.motion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || false;
    try {
      const saved = JSON.parse(localStorage.getItem(this.key) || "null");
      if (saved && typeof saved === "object") {
        if ([0, 0.008, 0.016, 0.032].includes(saved.speed)) this.prefs.speed = saved.speed;
        if (Number.isFinite(saved.volume)) this.prefs.volume = Math.max(0, Math.min(1, saved.volume));
        if (typeof saved.hints === "boolean") this.prefs.hints = saved.hints;
        if (typeof saved.motion === "boolean") this.prefs.motion = saved.motion;
        if (typeof saved.lighting === "boolean") this.prefs.lighting = saved.lighting;
        if (typeof saved.music === "boolean") this.prefs.music = saved.music;
      }
      const entries = JSON.parse(localStorage.getItem(this.journalKey) || "[]");
      if (Array.isArray(entries)) this.journal = entries.filter(e => e && typeof e.text === "string" && typeof e.area === "string").slice(-300);
    } catch { /* Optional preferences never prevent a fresh run. */ }
    this.dom.textSpeed.value = String(this.prefs.speed);
    this.dom.volumeControl.value = String(this.prefs.volume);
    this.dom.hintsControl.checked = this.prefs.hints;
    this.dom.motionControl.checked = this.prefs.motion;
    if (this.dom.lightingControl) this.dom.lightingControl.checked = this.prefs.lighting;
    if (this.dom.musicControl) this.dom.musicControl.checked = this.prefs.music;
    this.applyPrefs();
    for (const id of ["textSpeed", "volumeControl", "hintsControl", "motionControl", "lightingControl", "musicControl"]) {
      this.dom[id]?.addEventListener("change", () => {
        this.prefs = { speed: Number(this.dom.textSpeed.value), volume: Number(this.dom.volumeControl.value), hints: this.dom.hintsControl.checked, motion: this.dom.motionControl.checked, lighting: this.dom.lightingControl ? this.dom.lightingControl.checked : true, music: this.dom.musicControl ? this.dom.musicControl.checked : true };
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
      if (NarrativeTrials.interact()) return;
      if (dialogActive) advanceDialog(); else tryInteract();
      this.focusGameplay();
    };
    this.dom.interactButton.addEventListener("click", interact);
    this.dom.touchInteract.addEventListener("click", interact);
    document.querySelectorAll("[data-direction]").forEach(button => {
      button.addEventListener("pointerdown", event => {
        event.preventDefault();
        if (dialogActive || this.paused() || transitionLock || !ui.start.hidden || !ui.ending.hidden) return;
        if (NarrativeTrials.rainActive()) { if (["arrowleft", "arrowright"].includes(button.dataset.direction)) NarrativeTrials.select(button.dataset.direction === "arrowleft" ? -1 : 1); return; }
        button.setPointerCapture(event.pointerId);
        touchKeys.add(button.dataset.direction);
        button.classList.add("pressed");
      });
      const release = () => { touchKeys.delete(button.dataset.direction); button.classList.remove("pressed"); };
      for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) button.addEventListener(type, release);
    });
    const resumed = Boolean(F.m1 || G.area !== "mirror" || endingId);
    ui.startButton.textContent = resumed ? "继续这段旅途" : "进入回廊";
    this.dom.startStatus.textContent = resumed ? `已停留于${MAPS[G.area].name} · 图鉴 ${META.shards.length} / 8` : `八处梦境 · 八枚碎片 · ${Object.keys(ENDINGS).length} 种结局`;
    this.initMapPointer();
    this.initPixelScale();
    this.sync();
  },

  initPixelScale() {
    const frame=document.querySelector('.screen-frame'), wrap=document.querySelector('.game-wrap');
    if(!frame||!wrap||typeof ResizeObserver==='undefined')return;
    const fit=()=>{
      const column=window.innerWidth<=820;
      const aside=!column&&!ui.codex.hidden?ui.codex.getBoundingClientRect().width+14:0;
      const available=Math.max(1,wrap.getBoundingClientRect().width-aside-2), dpr=window.devicePixelRatio||1;
      const scale=Math.max(1,Math.floor(available*dpr/VIEW_W));
      // Every source pixel spans a whole number of device pixels when space permits.
      const width=Math.min(available,VIEW_W*scale/dpr);
      frame.style.setProperty('--pixel-width',(width+2)+'px');
    };
    this.scaleObserver=new ResizeObserver(fit);this.scaleObserver.observe(wrap);this.scaleObserver.observe(ui.codex);
    window.addEventListener('resize',fit);fit();
  },

  mapPoint(clientX,clientY) {
    const box=canvas.getBoundingClientRect(), scale=Math.min(box.width/VIEW_W,box.height/VIEW_H);
    if(!scale)return null;
    const x=(clientX-box.left-(box.width-VIEW_W*scale)/2)/scale;
    const y=(clientY-box.top-(box.height-VIEW_H*scale)/2)/scale;
    if(x<0||y<0||x>=VIEW_W||y>=VIEW_H)return null;
    return {x:x+this.camera.x,y:y+this.camera.y};
  },

  initMapPointer() {
    canvas.addEventListener('click',event=>{
      if(dialogActive||this.paused()||transitionLock||!ui.start.hidden||!ui.ending.hidden||['storm','meta'].includes(G.area)||NarrativeTrials.rainActive())return;
      const point=this.mapPoint(event.clientX,event.clientY);if(!point)return;
      const map=MAPS[G.area];
      const targets=[...(map.interact||[]),...(map.npcs||[]).filter(n=>!n.passive&&(!n.cond||F[n.cond])&&!StoryStaging.npc(n).hidden)];
      const target=targets.map(it=>({it,at:(map.npcs||[]).includes(it)?StoryStaging.npc(it):it})).filter(({at})=>Math.hypot(point.x-(at.x*TILE+8),point.y-(at.y*TILE+8))<=16).sort((a,b)=>Math.hypot(point.x-a.at.x*TILE-8,point.y-a.at.y*TILE-8)-Math.hypot(point.x-b.at.x*TILE-8,point.y-b.at.y*TILE-8))[0];
      if(!target){this.selectedPoint=null;return;}
      const near=nearestInteractable();
      if(near?.it===target.it){tryInteract();return;}
      this.selectedPoint={...target.at,id:target.it.id,label:target.it.label};
      this.status('已标记 · '+target.it.label+'。靠近后按 E 或「调查」。');
      canvas.focus({preventScroll:true});
    });
  },

  applyPrefs() {
    document.body.classList.toggle("reduced-motion", this.prefs.motion);
    if (this.prefs.motion) { particles = []; lightning = 0; houseFlicker = 0; }
    if (AudioEngine.master) AudioEngine.master.gain.setTargetAtTime(this.prefs.volume, AudioEngine.ctx.currentTime, 0.1);
    this.sync();
  },

  paused() {
    return document.hidden || NarrativeAgency.active() || Boolean(this.dom?.journalDialog.open || this.dom?.settingsDialog.open || document.getElementById("renameDialog")?.open || !ui.codex.hidden);
  },

  focusGameplay() {
    if (!ui.start.hidden) { ui.startButton.focus({ preventScroll: true }); return; }
    if (NarrativeAgency.active()) { (NarrativeAgency.dom.agencyActions.querySelector("button:not([disabled])") || NarrativeAgency.dom.agencyCards.querySelector("button"))?.focus({ preventScroll: true }); return; }
    if (!ui.ending.hidden) { ui.endingRestart.focus({ preventScroll: true }); return; }
    if (NarrativeTrials.rainActive()) { (NarrativeTrials.rain.mode === "intro" ? NarrativeTrials.dom.rainStart : canvas).focus({ preventScroll: true }); return; }
    const first = dialogChoices && ui.dialogChoices.querySelector("button");
    (first || canvas).focus({ preventScroll: true });
  },

  open(dialog) {
    clearInput();
    dialog.showModal();
  },

  goal() {
    const target = (id, text) => ({ id, text });
    if (NarrativeTrials.rainActive()) return target(null, "黄昏之海：点击雨滴，或左右选中、E 接住；收齐四滴关键雨水。");
    switch (G.area) {
      case "mirror": return !F.m1 ? target("m1", "调查第一面镜。") : !F.m2 ? target("m2", "倾听第二面镜。") : !F.m3 ? target("m3", "走向第三面镜。") : target("exit", "回廊的尽头已经打开。走进雨幕。");
      case "storm": return target(null, !F.storm1 ? "你正向天空中的红月逆落。倾听雨中的声音。" : !F.storm2 ? "按 E / 空格或「伸手」留住雨滴；左右可略微偏移，触及雨中的碎片。" : "下一个奇点再见吧，无名的旅伴。");
      case "garden": return target("coffin", F.photoReturned ? "带着照片残片，回到苏醒的容器。" : "调查棺底的铭文。世界边界与记忆的暗处，也可以探索。");
      case "house_empty": return !F.emptyLiving ? target("emptyLiving", "推开房门，看看没有声音的客厅。") : target(F.hasPhoto ? "toilet" : "washer", F.hasPhoto ? "照片残片已经握在手里。继续调查房间。" : "调查这间没有声音的家。洗衣机仍在震动。");
      case "house_family": return !F.father ? target("father", "向沙发上的父亲打个招呼，随后继续家中的早晨。") : target(null, "继续倾听：母亲端菜入场，一家人坐下吃早饭。");
      case "blood": return !F.sister ? target("sister", "先看清那只手，和心脏的主人。") : !F.parents ? target("parents", "穿过庭院尽头的门，走向褐色客房中的残骸。") : target(null, "那些声音在等待你的回答。");
      case "rain": return F.rainDone ? target("exit", "塔顶的裂缝已经开启。") : target("repress", "走向以压抑之名者，听完尚未说完的话。");
      case "meta": return target(null, FinaleScenes[Finale.node()].echo || "让字句显现，读见这一段故事的改变。");
      default: return target(null, "靠近发光的事物，调查与倾听。");
    }
  },

  goalPoint() {
    if (this.selectedPoint) return this.selectedPoint;
    const id = this.goal().id;
    const map = MAPS[G.area];
    if (id === "gold") return goldDrop ? { x: (goldDrop.x - 8) / TILE, y: (goldDrop.catchY - 8) / TILE } : null;
    if (id === "exit") return map.exits[0];
    const point = [...(map.interact || []), ...(map.npcs || [])].find(it => it.id === id);
    if (point && (map.npcs || []).includes(point)) {
      const actor = StoryStaging.npc(point);
      return actor.hidden ? null : actor;
    }
    return point;
  },

  sync() {
    if (!this.dom) return;
    const chapter = this.chapters[G.area];
    const setText = (element, text) => { if (element.textContent !== text) element.textContent = text; };
    setText(this.dom.chapterLabel, `${chapter[0]} / ${chapter[1]}${PlayAids.progressText()}`);
    setText(this.dom.objectiveText, this.prefs.hints || G.area === "storm" ? this.goal().text : "靠近发光的事物，调查与倾听。");
    const unavailable = transitionLock || this.paused() || !ui.start.hidden || !ui.ending.hidden;
    const near = !dialogActive && !unavailable ? nearestInteractable() : null;
    this.dom.interactButton.disabled = unavailable || (dialogActive ? Boolean(dialogChoices) : !near);
    setText(this.dom.interactButton, dialogActive ? (dialogChoices ? "选择你的回答" : typeDone ? (PhenomenonBattle.pending ? "写入选中现象" : "继续倾听") : "显示全文") : near ? (G.area === "storm" ? near.it.label : `调查 · ${near.it.label}`) : G.area === "storm" ? "向红月逆落" : "靠近事物 · 调查");
    this.dom.touchInteract.disabled = unavailable || Boolean(dialogChoices);
    setText(this.dom.touchInteract, G.area === "storm" && !dialogActive ? "伸手" : dialogActive ? (PhenomenonBattle.pending && typeDone ? "写入" : "继续") : "调查");
    if (NarrativeTrials.rainActive()) {
      this.dom.interactButton.disabled = unavailable;
      this.dom.touchInteract.disabled = unavailable;
      setText(this.dom.interactButton, NarrativeTrials.rain.mode === "intro" ? "伸出双手 · 开始接雨" : "接住选中的雨水");
      setText(this.dom.touchInteract, "接雨");
    }
    if (NarrativeAgency.active()) {
      setText(this.dom.interactButton, "在画面中完成当前操作");
      setText(this.dom.touchInteract, "选择片段与联系");
      this.dom.mapPanel.hidden = true;
    }
    this.dom.mapButton.disabled = G.area === "storm" || NarrativeTrials.rainActive() || NarrativeAgency.active();
    this.dom.mapButton.hidden = G.area === "meta";
    if (G.area === "meta") this.dom.mapPanel.hidden = true;
    if (G.area === "storm") this.dom.mapPanel.hidden = true;
    for (const button of document.querySelectorAll('[data-direction="arrowup"], [data-direction="arrowdown"]')) button.disabled = G.area === "storm";
    const progress = PlayAids.progress();
    setText(this.dom.mapStatus, `${META.shards.includes(MAPS[G.area].shard.name) ? "本区碎片已经拾取" : "本区仍有一枚碎片"} · 总计 ${META.shards.length} / 8${progress ? ` · 已调查 ${progress.done} / ${progress.total}` : ""}`);
    setText(this.dom.mapTitle, MAPS[G.area].name);
  },

  onAreaChange() {
    this.selectedPoint = null;
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
    this.selectedPoint = null;
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
    const stateColor = { new: "#e2c27c", gated: "#77746c", done: "#4f6458" };
    for (const it of map.interact || []) dot(it.x, it.y, stateColor[PlayAids.state(it)]);
    for (const n of map.npcs || []) if (!n.cond || F[n.cond]) {
      const actor = StoryStaging.npc(n);
      if (!actor.hidden) dot(actor.x, actor.y, n.passive ? "#4c6a7c" : PlayAids.state(n) === "done" ? "#4f6458" : "#7fb3d5");
    }
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
    if (!dialogActive && !transitionLock && ui.start.hidden && ui.ending.hidden && !this.paused()) {
      const point=this.selectedPoint || nearestInteractable()?.it;
      if(point && Number.isFinite(point.x)) {
        const x=Math.round(point.x*TILE-cam.x),y=Math.round(point.y*TILE-cam.y);
        ctx.fillStyle=this.selectedPoint?'#82b9c5':'#e2c581';
        for(const [dx,dy,sx,sy] of [[-2,-2,1,1],[18,-2,-1,1],[-2,18,1,-1],[18,18,-1,-1]]){
          ctx.fillRect(x+dx,y+dy,4*sx,1);ctx.fillRect(x+dx,y+dy,1,4*sy);
        }
      }
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
