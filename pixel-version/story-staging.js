"use strict";

// Visual cues belong to the offered line, never to the saved story state.
const StoryStaging = {
  scene: "map",
  pose: "stand",
  focus: null,
  mother: null,
  family: null,
  coffin: false,
  heartReleased: false,
  time: 0,
  carryElapsed: 0,
  carryDuration: 2.5,
  tower: null,

  reset() {
    this.scene = "map";
    this.pose = "stand";
    this.focus = null;
    this.mother = G.area === "house_family" && F.mother ? "carry" : null;
    this.family = G.area === "house_family" && F.familyDone ? "gone" : null;
    this.coffin = false;
    this.heartReleased = !!F.sister;
    this.time = 0;
    this.carryElapsed = this.mother ? this.carryDuration : 0;
    this.tower = { x: 144, y: 160, time: 0, scroll: 0, pose: 0.7, shadow: 1, approach: 0.18 };
  },

  finish() {
    this.scene = "map";
    this.pose = "stand";
    this.focus = null;
    this.coffin = false;
  },

  onLine(line) {
    const cue = line?.stage || {};
    if (this.mother === "carry" && cue.mother !== "carry") this.carryElapsed = this.carryDuration;
    if (["map", "tower", "curtain"].includes(cue.scene) && cue.scene !== this.scene) {
      this.scene = cue.scene;
      this.time = 0;
      this.focus = null;
    }
    if (["wake", "sleep", "pain", "mirror", "search", "photo", "eat", "bound", "kneel", "stand"].includes(cue.pose)) this.pose = cue.pose;
    if (cue.focus === null) this.focus = null;
    else if (cue.focus && Number.isFinite(cue.focus.x) && Number.isFinite(cue.focus.y)) this.focus = { x: cue.focus.x, y: cue.focus.y };
    if (["carry", "table"].includes(cue.mother)) {
      if (cue.mother === "carry" && this.mother !== "carry") this.carryElapsed = 0;
      this.mother = cue.mother;
    }
    if (["table", "gone"].includes(cue.family)) this.family = cue.family;
    if (typeof cue.coffin === "boolean") this.coffin = cue.coffin;
    if (typeof cue.heldHeart === "boolean") this.heartReleased = !cue.heldHeart;
  },

  camera(map, fallback) {
    if (!this.focus) return fallback;
    return {
      x: Math.max(0, Math.min(Math.max(0, map.grid[0].length * TILE - VIEW_W), this.focus.x * TILE + TILE / 2 - VIEW_W / 2)),
      y: Math.max(0, Math.min(Math.max(0, map.grid.length * TILE - VIEW_H), this.focus.y * TILE + TILE / 2 - VIEW_H / 2)),
    };
  },

  playerOptions() {
    const blood = G.area === "blood";
    return { pose: dialogActive ? this.pose : "stand", blood, heldHeart: blood && !F.sister && !this.heartReleased, reclined: dialogActive && this.coffin };
  },

  npc(n) {
    const result = { hidden: false, x: n.x, y: n.y, pose: n.kind === "father" ? "sit" : "stand", dir: n.dir ?? 0 };
    if (n.kind !== "father" && n.kind !== "mother") return result;
    if (this.family === "gone") return { ...result, hidden: true };
    if (this.family === "table") {
      return n.kind === "father" ? { ...result, x: 10, y: 1, pose: "eat", dir: 0 } : { ...result, x: 12, y: 3, pose: "eat", dir: 1 };
    }
    if (n.kind === "mother" && this.mother === "table") return { ...result, x: 12, y: 3, dir: 1 };
    if (n.kind === "mother" && this.mother === "carry") {
      const path = [[24, 9], [24, 10], [22, 10], [22, 7], [22, 4], [16, 4], [14, 4], [12, 5]];
      const progress = Expedition.prefs.motion ? 1 : Math.min(1, this.carryElapsed / this.carryDuration);
      let total = 0;
      for (let i = 1; i < path.length; i++) total += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
      let distance = progress * total;
      for (let i = 1; i < path.length; i++) {
        const [x, y] = path[i - 1], [nx, ny] = path[i];
        const length = Math.hypot(nx - x, ny - y);
        if (distance <= length) {
          const ratio = distance / length;
          // Still walking while she carries the dish; the gait follows her progress.
          return { ...result, x: x + (nx - x) * ratio, y: y + (ny - y) * ratio, pose: "carry", dir: ny < y ? 3 : ny > y ? 0 : nx < x ? 1 : 2, walk: progress < 1 ? 0.01 + this.carryElapsed * 0.62 : 0 };
        }
        distance -= length;
      }
      return { ...result, x: 12, y: 5, pose: "carry", dir: 0 };
    }
    return result;
  },

  renderSpecial(now, dt) {
    const active = !Expedition.paused() && !transitionLock && ui.start.hidden && ui.ending.hidden;
    if (active && Number.isFinite(dt) && dt > 0) {
      if (!Expedition.prefs.motion) this.time += dt;
      if (this.mother === "carry") this.carryElapsed = Math.min(this.carryDuration, this.carryElapsed + dt);
    }
    if (this.scene === "map") return false;
    if (this.scene === "tower") {
      if (!this.tower) this.tower = { x: 144, y: 160, time: 0, scroll: 0, pose: 0.7, shadow: 1, approach: 0.18 };
      const t = this.time;
      // Borrow only the drawing method with an independent visual snapshot.
      this.tower.time = t;
      this.tower.scroll = t * 24;
      this.tower.y = 160 - 88 * (1 - Math.exp(-t / 5));
      StormFlight.render.call(this.tower, now);
      const climberX = 193 + (Expedition.prefs.motion ? 0 : Math.sin(t * 0.7) * 5);
      const climberY = 130 - 35 * (1 - Math.exp(-t / 9));
      ctx.fillStyle = "rgba(95,108,136,0.17)";
      ctx.fillRect(143, 75, 1, 96);
      for (let i = 0; i < 8; i++) ctx.fillRect(186 + i % 2 * 9, 91 + i * 9, 7, 1);
      drawPerson(ctx, climberX - 6, climberY - 8, { coat: "#252334", hair: "#0b0b13", skin: "#302c39", dir: 3 });
      return true;
    }
    // The interlude is a dark stage and an audience, not a furnished living room.
    ctx.fillStyle = "#030308";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = i % 2 ? "#180d15" : "#100910";
      const width = 7 + i % 3;
      ctx.fillRect(i * 7, 0, width, VIEW_H);
      ctx.fillRect(VIEW_W - i * 7 - width, 0, width, VIEW_H);
    }
    ctx.fillStyle = "#140b13";
    ctx.fillRect(0, 0, VIEW_W, 17);
    ctx.fillStyle = "rgba(157,130,143,0.05)";
    ctx.beginPath(); ctx.moveTo(152, 18); ctx.lineTo(168, 18); ctx.lineTo(242, VIEW_H); ctx.lineTo(78, VIEW_H); ctx.closePath(); ctx.fill();
    for (let i = 0; i < 11; i++) {
      const x = 64 + i * 19, y = 32 + i % 3 * 11;
      ctx.fillStyle = "#24222f";
      ctx.fillRect(x, y, 5, 2); ctx.fillRect(x + 8, y, 5, 2);
      ctx.fillStyle = "#0b0910";
      ctx.fillRect(x + 2, y, 1, 2); ctx.fillRect(x + 10, y, 1, 2);
    }
    return true;
  },

  renderProps(cam, _t) {
    if (G.area === "house_family" && this.family !== "gone" && (this.mother === "table" || this.family === "table")) {
      const x = 10 * TILE + 8 - cam.x, y = 2 * TILE + 8 - cam.y;
      // Three bowls of white congee, pickles, salted egg, buns and the carried dish.
      ctx.fillStyle = "#241b15"; ctx.fillRect(x - 22, y - 9, 44, 21);
      ctx.fillStyle = "#806148"; ctx.fillRect(x - 21, y - 8, 42, 18);
      for (const [dx, dy] of [[-13, -3], [0, 5], [13, -3]]) {
        ctx.fillStyle = "#bbb7a7"; ctx.fillRect(x + dx - 4, y + dy - 1, 8, 4);
        ctx.fillStyle = "#ece9d4"; ctx.fillRect(x + dx - 3, y + dy - 2, 6, 3);
        ctx.fillStyle = "#d9d5c1"; ctx.fillRect(x + dx - 2, y + dy - 3, 4, 1);
      }
      ctx.fillStyle = "#c2bcab"; ctx.fillRect(x - 5, y - 7, 10, 5);
      ctx.fillStyle = "#7c8a49"; ctx.fillRect(x - 4, y - 6, 8, 3);
      ctx.fillStyle = "#b4b06c"; ctx.fillRect(x - 2, y - 5, 2, 1); ctx.fillRect(x + 2, y - 6, 2, 2);
      ctx.fillStyle = "#baa997"; ctx.fillRect(x - 19, y + 5, 7, 3);
      ctx.fillStyle = "#8b6739"; ctx.fillRect(x - 18, y + 5, 5, 2);
      ctx.fillStyle = "#ece1bf"; ctx.fillRect(x + 9, y + 5, 4, 3);
      ctx.fillStyle = "#d7b255"; ctx.fillRect(x + 10, y + 6, 2, 2);
      ctx.fillStyle = "#d7ceb6"; ctx.fillRect(x + 15, y + 5, 4, 4); ctx.fillRect(x + 16, y + 4, 2, 1);
    }
    if (!dialogActive || this.pose !== "photo") return;
    const playerX = this.coffin ? 12 * TILE : G.px;
    const playerY = this.coffin ? 7.5 * TILE : G.py;
    const x = Math.max(10, Math.min(VIEW_W - 108, playerX - cam.x + 22));
    const y = Math.max(20, Math.min(VIEW_H - 88, playerY - cam.y - 43));
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(3, 5, 99, 64);
    const torn = () => {
      ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(14, 1); ctx.lineTo(25, 6); ctx.lineTo(39, 0); ctx.lineTo(50, 5); ctx.lineTo(63, 1); ctx.lineTo(74, 7); ctx.lineTo(99, 3); ctx.lineTo(97, 60); ctx.lineTo(84, 64); ctx.lineTo(71, 60); ctx.lineTo(57, 66); ctx.lineTo(42, 61); ctx.lineTo(29, 65); ctx.lineTo(16, 59); ctx.lineTo(1, 63); ctx.closePath();
    };
    torn(); ctx.fillStyle = "#ddd4ba"; ctx.fill();
    ctx.save(); torn(); ctx.clip();
    ctx.fillStyle = "#6a6b65"; ctx.fillRect(5, 7, 89, 49);
    ctx.fillStyle = "#92958b"; ctx.fillRect(5, 7, 89, 19);
    // The fragment shows only the four legs behind the young man.
    ctx.fillStyle = "#3c3c3b";
    for (const legX of [22, 31, 68, 77]) ctx.fillRect(legX, 7, 6, 32);
    ctx.fillStyle = "#24282b";
    for (const legX of [21, 30, 67, 76]) ctx.fillRect(legX, 37, 8, 3);
    ctx.translate(49, 31); ctx.scale(2, 2);
    drawPerson(ctx, -6, -8, { coat: "#626771", hair: "#242529", skin: "#c0b49e", dir: 0 });
    ctx.restore(); ctx.restore();
  },
};
