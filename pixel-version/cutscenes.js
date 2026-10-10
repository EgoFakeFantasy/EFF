"use strict";

// Short animated beats at the story's own turning points. They are visual
// only: dialogue, saves and transitions keep their timing, and every beat
// freezes while utilities are open. Reduced motion shows a still final frame
// or the ordinary fade instead.
const Cutscenes = {
  shatter: null,
  wake: null,
  lid: null,
  clash: { progress: -1, t: 0, cracks: null },

  still() { return Expedition.prefs.motion; },

  reset() {
    this.shatter = null; this.wake = null; this.lid = null;
    this.clash = { progress: -1, t: 0, cracks: null };
  },

  // Pixel-stepped line so every crack and edge lands on whole pixels.
  line(c, x0, y0, x1, y1, color) {
    c.fillStyle = color;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= steps; i++) c.fillRect(Math.round(x0 + (x1 - x0) * i / steps), Math.round(y0 + (y1 - y0) * i / steps), 1, 1);
  },

  onLine(line) {
    const cue = line?.stage || {};
    if (cue.pose === "wake" && !this.still()) this.wake = { t: 0 };
    if (cue.pose === "sleep" && cue.coffin === true) this.lid = { t: 0 };
  },

  update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (this.shatter) { this.shatter.t += dt; if (this.shatter.t > this.shatter.end) this.shatter = null; }
    if (this.wake) { this.wake.t += dt; if (this.wake.t > 1.15) this.wake = null; }
    if (this.lid) this.lid.t += dt;
    this.clash.t += dt;
  },

  /* ---------- 01 → 02: the mirror stage breaks and the body falls out of it ---------- */

  beginShatter() {
    if (this.still()) return false;
    const snapshot = document.createElement("canvas");
    snapshot.width = VIEW_W; snapshot.height = VIEW_H;
    snapshot.getContext("2d")?.drawImage?.(canvas, 0, 0);
    const cam = Expedition.camera || { x: 0, y: 0 };
    const ox = G.px + 6 - cam.x, oy = G.py + 8 - cam.y;
    // A jittered vertex grid keeps neighbouring shards' cracks connected.
    const cols = 10, rows = 6, cw = VIEW_W / cols, ch = VIEW_H / rows, v = [];
    for (let j = 0; j <= rows; j++) {
      v[j] = [];
      for (let i = 0; i <= cols; i++) {
        const edgeX = i === 0 || i === cols, edgeY = j === 0 || j === rows;
        v[j][i] = [Math.round(i * cw + (edgeX ? 0 : (hash(i, j, 11) - 0.5) * cw * 0.7)), Math.round(j * ch + (edgeY ? 0 : (hash(i, j, 12) - 0.5) * ch * 0.7))];
      }
    }
    const shards = [], edges = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const a = v[j][i], b = v[j][i + 1], c2 = v[j + 1][i + 1], d = v[j + 1][i];
      const tris = (i + j) % 2 ? [[a, b, c2], [a, c2, d]] : [[a, b, d], [b, c2, d]];
      for (const tri of tris) {
        const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
        const dist = Math.hypot(cx - ox, cy - oy);
        shards.push({ tri, delay: dist / 520 + hash(i, j, tris.indexOf(tri) + 20) * 0.12, vx: (cx - ox) / Math.max(40, dist) * 26, dist });
      }
      edges.push([a, b], [b, c2], (i + j) % 2 ? [a, c2] : [b, d]);
    }
    for (const e of edges) e.dist = Math.hypot((e[0][0] + e[1][0]) / 2 - ox, (e[0][1] + e[1][1]) / 2 - oy);
    const maxDelay = Math.max(...shards.map(s => s.delay));
    this.shatter = { t: 0, snapshot, shards, edges, crack: 0.5, end: 0.5 + maxDelay + 0.75 };
    return true;
  },

  drawShatter(c) {
    const s = this.shatter;
    if (!s) return;
    const reach = Math.min(1, s.t / s.crack) * 420;
    for (const shard of s.shards) {
      const tf = s.t - s.crack - shard.delay;
      const dy = tf > 0 ? Math.round(0.5 * 560 * tf * tf) : 0, dx = tf > 0 ? Math.round(shard.vx * tf) : 0;
      if (dy > VIEW_H + 40) continue;
      const [p, q, r] = shard.tri;
      c.save();
      c.beginPath(); c.moveTo(p[0] + dx, p[1] + dy); c.lineTo(q[0] + dx, q[1] + dy); c.lineTo(r[0] + dx, r[1] + dy); c.closePath(); c.clip();
      c.drawImage(s.snapshot, dx, dy);
      // Falling glass dims and catches a little of the storm's light.
      if (tf > 0) { c.fillStyle = `rgba(150,170,220,${Math.min(0.28, tf * 0.5)})`; c.fillRect(Math.min(p[0], q[0], r[0]) + dx, Math.min(p[1], q[1], r[1]) + dy, 60, 60); }
      c.restore();
      if (tf > 0) this.line(c, p[0] + dx, p[1] + dy, q[0] + dx, q[1] + dy, "#dfe6f7");
    }
    for (const e of s.edges) {
      // A crack stays until the glass around it begins to fall.
      if (e.dist > reach || s.t > s.crack + e.dist / 520) continue;
      this.line(c, e[0][0] + 1, e[0][1] + 1, e[1][0] + 1, e[1][1] + 1, "rgba(16,16,34,0.8)");
      this.line(c, e[0][0], e[0][1], e[1][0], e[1][1], "rgba(220,228,248,0.72)");
    }
    if (s.t < 0.12) { c.fillStyle = `rgba(230,236,250,${0.35 * (1 - s.t / 0.12)})`; c.fillRect(0, 0, VIEW_W, VIEW_H); }
  },

  /* ---------- 04 / 05: waking in the bed ---------- */

  openness(t) {
    const ease = x => x * x * (3 - 2 * x);
    if (t < 0.18) return 0;
    if (t < 0.42) return ease((t - 0.18) / 0.24) * 0.32;
    if (t < 0.56) return 0.32 * (1 - ease((t - 0.42) / 0.14)) + 0.04;
    return 0.04 + 0.96 * ease(Math.min(1, (t - 0.56) / 0.45));
  },

  drawWake(c) {
    if (!this.wake) return;
    const open = this.openness(this.wake.t), half = open * VIEW_H * 1.6, cx = VIEW_W / 2, cy = VIEW_H / 2;
    for (let x = 0; x < VIEW_W; x++) {
      const k = 1 - ((x - cx) / (cx + 12)) ** 2;
      const h = Math.round(half * Math.sqrt(Math.max(0, k)));
      const top = Math.max(0, cy - h), bottom = Math.min(VIEW_H, cy + h);
      c.fillStyle = "#050307";
      if (top > 0) c.fillRect(x, 0, 1, top);
      if (bottom < VIEW_H) c.fillRect(x, bottom, 1, VIEW_H - bottom);
      // A warm rim marks the eyelid's edge.
      c.fillStyle = "#3a1d1c";
      if (top > 0 && top < VIEW_H) c.fillRect(x, top, 1, 1);
      if (bottom > 0 && bottom < VIEW_H) c.fillRect(x, bottom - 1, 1, 1);
    }
  },

  // "猛然从床上弹起": a short hop as the eyes open.
  playerLift() {
    if (!this.wake) return 0;
    const t = this.wake.t;
    return t > 0.5 && t < 0.9 ? -Math.round(Math.sin(Math.PI * (t - 0.5) / 0.4) * 5) : 0;
  },

  /* ---------- 03: the coffin lid closes over the sleeper ---------- */

  lidActive() {
    return !!this.lid && G.area === "garden" && dialogActive && StoryStaging.coffin && StoryStaging.pose === "sleep" && StoryStaging.scene === "map";
  },

  drawLid(c, cam) {
    if (!this.lid) return;
    if (!this.lidActive()) { if (!dialogActive || !StoryStaging.coffin) this.lid = null; return; }
    const k = this.still() ? 1 : Math.min(1, this.lid.t / 1.1), ease = 1 - (1 - k) ** 3;
    const ox = 11 * TILE - cam.x + Math.round((1 - ease) * 46), oy = 7 * TILE - cam.y, w = 48, h = 32;
    const poly = (pts, col) => PixelArt.polygon(c, pts.map(([a, b]) => [ox + a, oy + b]), col);
    poly([[8, 1], [w - 10, 1], [w - 3, 6], [w - 3, h - 7], [w - 8, h - 3], [6, h - 3], [2, h - 8], [2, 7]], "#4d392b");
    poly([[8, 2], [w - 10, 2], [w - 5, 6], [w - 5, h - 9], [w - 9, h - 5], [7, h - 5], [4, h - 9], [4, 7]], "#8f6c47");
    c.fillStyle = "#b09b70"; c.fillRect(ox + 8, oy + 4, w - 19, 1);
    for (let i = 0; i < 5; i++) { c.fillStyle = i % 2 ? "#a8946c" : "#7a6347"; c.fillRect(ox + 10, oy + 8 + i * 3, w - 24 - i % 3 * 2, 1); }
    c.fillStyle = "#231f1c"; c.fillRect(ox + 7, oy + h - 4, w - 14, 1);
    if (k < 1) { c.fillStyle = "#e1cf9f"; c.fillRect(ox + 1, oy + 8, 1, h - 16); }
  },

  // After the lid shuts, the view narrows to a slit around the coffin.
  drawSlit(c, cam) {
    if (!this.lidActive()) return;
    const s = this.still() ? 1 : Math.max(0, Math.min(1, (this.lid.t - 1.25) / 1.1));
    if (s <= 0) return;
    const cy = Math.round(7 * TILE - cam.y + 16), gap = 13;
    const top = Math.round(s * Math.max(0, cy - gap)), bottomStart = Math.round(VIEW_H - s * Math.max(0, VIEW_H - cy - gap));
    c.fillStyle = "rgba(3,3,6,0.94)";
    c.fillRect(0, 0, VIEW_W, top);
    c.fillRect(0, bottomStart, VIEW_W, VIEW_H - bottomStart);
  },

  /* ---------- 06: the courtyard breaks, then falls away as colourless rain ---------- */

  cracks(ox, oy) {
    const branches = [];
    for (let b = 0; b < 10; b++) {
      let a = b * Math.PI * 2 / 10 + (hash(b, 1, 31) - 0.5) * 0.5, x = ox, y = oy;
      const pts = [];
      for (let i = 0; i < 80; i++) {
        a += (hash(b, i, 32) - 0.5) * 0.7;
        x += Math.cos(a) * 3; y += Math.sin(a) * 3;
        pts.push([Math.round(x), Math.round(y)]);
        if (i === 22 + b % 5 && branches.length < 22) {
          let ba = a + (hash(b, i, 33) > 0.5 ? 0.9 : -0.9), bx = x, by = y;
          const sub = [];
          for (let k = 0; k < 30; k++) { ba += (hash(b, k, 34) - 0.5) * 0.6; bx += Math.cos(ba) * 3; by += Math.sin(ba) * 3; sub.push([Math.round(bx), Math.round(by)]); }
          branches.push({ pts: sub, start: i });
        }
      }
      branches.push({ pts, start: 0 });
    }
    return branches;
  },

  clashClock(progress) {
    if (this.clash.progress !== progress) this.clash = { progress, t: 0, cracks: null };
    return this.still() ? 4 : this.clash.t;
  },

  // Called by PhenomenonBattle before its background. Line 0 breaks the
  // courtyard frame in place and returns true, replacing the background.
  collapse(c, cam, progress) {
    const t = this.clashClock(progress);
    if (progress === 0) {
      // The map frame beneath is the courtyard itself; break it in place.
      if (!this.still() && t > 0.4) {
        for (let i = 0; i < 4; i++) {
          const y = Math.floor(hash(Math.floor(t * 10), i, 41) * VIEW_H), hgt = 3 + Math.floor(hash(Math.floor(t * 10), i, 42) * 8);
          const shift = Math.round((hash(Math.floor(t * 10), i, 43) - 0.5) * 14);
          c.drawImage(canvas, 0, y, VIEW_W, hgt, shift, y, VIEW_W, hgt);
        }
      }
      this.clash.cracks ||= this.cracks(G.px + 6 - cam.x, G.py + 8 - cam.y);
      const shown = Math.min(80, Math.floor(t * 70));
      for (const branch of this.clash.cracks) {
        const count = Math.min(branch.pts.length, shown - branch.start);
        for (let i = 0; i < count; i++) {
          const [x, y] = branch.pts[i];
          c.fillStyle = "#070306"; c.fillRect(x, y, 2, 1);
          c.fillStyle = i > count - 4 && !this.still() ? "#ffd2a8" : "#b34a42"; c.fillRect(x, y - 1, 1, 1);
        }
      }
      // "画面如同老旧电视机屏幕般闪过雪花纹"
      const seed = this.still() ? 1 : Math.floor(t * 14), rowsCount = Math.min(36, 6 + Math.floor(t * 14));
      for (let i = 0; i < rowsCount; i++) {
        const y = Math.floor(hash(seed, i, 44) * VIEW_H);
        for (let x = 0; x < VIEW_W; x += 2) {
          const n = hash(x, y + seed * 7, 45);
          if (n > 0.55) { c.fillStyle = n > 0.85 ? "rgba(235,232,228,0.7)" : "rgba(150,148,150,0.45)"; c.fillRect(x, y, 2, 1); }
        }
      }
      return true;
    }
    return false;
  },

  // Called after the background on line 2: the floor itself falls and dissolves.
  dissolve(c, cam, progress) {
    const t = this.clashClock(progress);
    if (progress === 2 && !this.still()) {
      // "周围的场地不断下落，不断消解……变成泡沫，变成无色的雨水落下。"
      const x0 = Math.floor(cam.x / TILE), y0 = Math.floor(cam.y / TILE);
      for (let ty = y0; ty <= y0 + VIEW_H / TILE + 1; ty++) for (let tx = x0; tx <= x0 + VIEW_W / TILE + 1; tx++) {
        const sx = tx * TILE - cam.x, sy = ty * TILE - cam.y;
        const delay = 0.1 + hash(tx, ty, 46) * 0.55 + Math.hypot(sx + 8 - VIEW_W / 2, sy + 8 - VIEW_H / 2) / 700;
        const tf = t - delay, dy = tf > 0 ? Math.round(0.5 * 300 * tf * tf) : 0;
        if (dy < 22) { c.drawImage(tileCache, tx * TILE, ty * TILE, TILE, TILE, sx, sy + dy, TILE, TILE); if (dy > 8) { c.fillStyle = "rgba(12,17,27,0.5)"; c.fillRect(sx, sy + dy, TILE, TILE); } continue; }
        const fy = sy + dy;
        if (fy > VIEW_H + 8) continue;
        for (let k = 0; k < 3; k++) {
          const fx = sx + 3 + Math.floor(hash(tx, ty, 47 + k) * 10);
          c.fillStyle = "rgba(214,224,230,0.75)"; c.fillRect(fx, fy - k * 5, 2, 2);
          c.fillStyle = "rgba(160,182,194,0.55)"; c.fillRect(fx + 1, fy - k * 5 + 4, 1, 4);
        }
      }
    }
    return false;
  },

  // Screen-space beats drawn last, over every other renderer.
  overlay(c) {
    this.drawShatter(c);
    this.drawWake(c);
  },
};
