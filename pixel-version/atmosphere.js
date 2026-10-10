"use strict";

// Light and shadow are presentation only. Darkness is quantised with an
// ordered 4×4 dither so every shaded mark still sits on a source pixel.
const Atmosphere = {
  CELL: 2,
  BAYER: [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16),
  // Solid bands with dithering only along each seam read as light, not noise.
  SEAM: 0.42,
  // dark: shadow colour; depth: strongest shadow alpha; halo: radius carried by the player.
  moods: {
    mirror: { dark: [5, 4, 16], depth: 0.66, halo: 54 },
    garden: { dark: [2, 9, 8], depth: 0.6, halo: 54 },
    house_empty: { dark: [4, 7, 12], depth: 0.56, halo: 50 },
    house_family: { dark: [18, 10, 4], depth: 0.44, halo: 56 },
    blood: { dark: [14, 2, 5], depth: 0.58, halo: 46 },
    rain: { dark: [2, 6, 16], depth: 0.56, halo: 50 },
  },
  image: null,
  canvas: null,
  pixels: null,
  disabled: false,
  lastLights: [],

  ensure() {
    if (this.pixels) return true;
    const cols = VIEW_W / this.CELL, rows = VIEW_H / this.CELL;
    this.light = new Float32Array(cols * rows);
    this.tint = new Float32Array(cols * rows * 4);
    try {
      this.canvas = document.createElement("canvas");
      this.canvas.width = VIEW_W; this.canvas.height = VIEW_H;
      this.context = this.canvas.getContext("2d");
      const image = this.context?.createImageData?.(VIEW_W, VIEW_H);
      if (image?.data?.buffer) { this.image = image; this.pixels = new Uint32Array(image.data.buffer); }
    } catch { this.image = null; }
    // Without ImageData (very old browsers, the regression VM) the field is still computed.
    if (!this.pixels) this.pixels = new Uint32Array(VIEW_W * VIEW_H);
    return true;
  },

  // A small deterministic shimmer; reduced motion keeps every light still.
  flicker(seed, t, amount) {
    if (!amount || Expedition.prefs.motion) return 1;
    const slow = Math.sin(t * 2.3 + seed * 1.7) * 0.5 + Math.sin(t * 5.1 + seed * 3.1) * 0.3;
    const step = hash(Math.floor(t * 9), seed | 0, 77) - 0.5;
    return 1 + (slow * 0.6 + step * 0.4) * amount;
  },

  lightsFor(map, cam, t) {
    const out = [];
    const add = (wx, wy, r, i, color, tint = 0, squash = 1) => {
      const x = wx - cam.x, y = wy - cam.y;
      if (x + r < 0 || y + r < 0 || x - r > VIEW_W || y - r > VIEW_H || i <= 0) return;
      out.push({ x, y, r, i, color, tint, squash });
    };
    const area = G.area, mood = this.moods[area];
    if (!mood) return out;
    const coffin = StoryStaging.coffin;
    const pxw = (coffin ? 12 * TILE : G.px) + 6, pyw = (coffin ? 7.5 * TILE : G.py) + 8;
    add(pxw, pyw, mood.halo, 0.55, [235, 225, 200], 0.04);
    // Uncollected fragments shine through the dark and pulse as the player nears them.
    if (map.shard && !META.shards.includes(map.shard.name)) {
      const pulse = Expedition.prefs.motion ? 1 : 1 + Math.sin(t * 3) * 0.18;
      const near = typeof PlayAids !== "undefined" ? PlayAids.resonance : 0;
      add(map.shard.x * TILE + 8, map.shard.y * TILE + 8, 26 + near * 18, (0.55 + near * 0.4) * pulse, [240, 228, 186], 0.45);
    }
    // "靠近发光的事物": what has not yet been examined glows faintly; read things go quiet.
    if (typeof PlayAids !== "undefined") for (const { it, at } of PlayAids.targets(map)) {
      if (PlayAids.state(it) !== "new") continue;
      add(at.x * TILE + 8, at.y * TILE + 8, 24, 0.42 * (Expedition.prefs.motion ? 1 : 1 + Math.sin(t * 2 + at.x) * 0.12), [240, 214, 150], 0.22);
    }
    for (const exit of map.exits || []) {
      if (exit.need && !exit.need()) continue;
      add(exit.x * TILE + 8, exit.y * TILE + 8, 44, 0.85 * this.flicker(exit.x, t, 0.12), [230, 214, 160], 0.4);
    }
    if (area === "mirror") {
      for (const mx of [2, 6, 11, 16, 21]) {
        // Light spreads along the wall; the polished floor returns a weaker column.
        add(mx * TILE + 8, TILE + 10, 66, 0.86 * this.flicker(mx, t, 0.08), [150, 170, 236], 0.3, 0.62);
        add(mx * TILE + 8, TILE + 50, 34, 0.24, [150, 170, 236], 0.26, 1.5);
      }
    } else if (area === "garden") {
      add(12 * TILE + 8, 8 * TILE, 72, 0.72 * this.flicker(4, t, 0.1), [214, 178, 110], 0.3);
      let fireflies = 0;
      for (const p of particles) {
        if (p.k !== "firefly" || fireflies++ > 14) continue;
        add(p.x, p.y, 13, 0.42 + 0.3 * Math.sin(performance.now() / 320 + p.ph), [215, 235, 140], 0.55);
      }
    } else if (area === "house_empty" || area === "house_family") {
      const warm = area === "house_family";
      const color = warm ? [236, 196, 120] : [176, 204, 216];
      for (const wx of [3, 11, 24]) {
        // Follow the slanting window shaft painted on the floor.
        add(wx * TILE + 8, TILE + 10, 42, warm ? 0.8 : 0.66, color, warm ? 0.32 : 0.22);
        add(wx * TILE + 8 - 22, 4.5 * TILE, 46, warm ? 0.5 : 0.38, color, warm ? 0.22 : 0.14);
      }
      if (warm) {
        const tvOn = !["table", "gone"].includes(StoryStaging.family);
        if (tvOn) add(14 * TILE + 8, TILE + 10, 40, 0.7 * this.flicker(14, t, 0.45), [140, 176, 232], 0.5);
        add(24 * TILE + 8, 9 * TILE + 4, 58, 0.7, [238, 186, 110], 0.3);
        add(21 * TILE, 13 * TILE + 8, 40, 0.42, [238, 186, 110], 0.2);
      } else {
        add(23 * TILE + 8, 9 * TILE + 8, 22, 0.55 * this.flicker(23, t, 0.3), [127, 179, 213], 0.45);
        // The bathroom's cold ceiling light and a dim lamp in the empty bedroom.
        add(23 * TILE + 8, 5 * TILE, 64, 0.62, [184, 206, 214], 0.16, 0.8);
        add(23 * TILE + 8, 13 * TILE, 58, 0.5, [184, 206, 214], 0.14, 0.8);
        add(6 * TILE, 12 * TILE, 64, 0.4, [176, 204, 216], 0.1);
      }
    } else if (area === "blood") {
      for (const d of map._dynamic || []) {
        if (d.ch === "x") add(d.x * TILE + 8, d.y * TILE + 6, 34, 0.62 * this.flicker(d.x * 7 + d.y, t, 0.35), [232, 108, 58], 0.45);
        else if (d.ch === "D") add(d.x * TILE + 8, d.y * TILE + 8, 26, 0.45, [208, 90, 58], 0.35);
      }
      // The fallen sister and the trail of blood stay legible beneath the fire.
      add(13 * TILE + 8, 7 * TILE + 8, 52, 0.72, [200, 70, 64], 0.3);
      add(12 * TILE + 8, 13 * TILE, 40, 0.45, [200, 90, 70], 0.2);
      // The burning sword through the two remains.
      add(13 * TILE + 5, 15 * TILE + 4, 50, 0.85 * this.flicker(91, t, 0.4), [240, 120, 58], 0.5);
      let embers = 0;
      for (const p of particles) if (p.k === "ember" && embers++ < 16) add(p.x, p.y, 8, 0.32, [240, 140, 70], 0.6);
    } else if (area === "rain") {
      if (map._moon) add(map._moon.x, map._moon.y, 118, 0.95, [208, 74, 58], 0.34);
      add(6 * TILE + 8, 13 * TILE + 8, 54, 0.5, [120, 170, 214], 0.35, 0.8);
      add(17 * TILE + 8, 13 * TILE + 8, 54, 0.5, [120, 170, 214], 0.35, 0.8);
      add(12 * TILE + 8, 19 * TILE, 40, 0.3, [120, 170, 214], 0.25);
      for (const n of map.npcs || []) if (n.kind === "repress") add(n.x * TILE + 8, n.y * TILE + 8, 44, 0.6 * this.flicker(5, t, 0.12), [127, 179, 213], 0.42);
    }
    return out;
  },

  // Pure field computation, used by render and by the regression tests.
  compute(lights, mood, extra = 0) {
    this.ensure();
    const C = this.CELL, cols = VIEW_W / C, rows = VIEW_H / C;
    const light = this.light, tint = this.tint;
    light.fill(extra);
    tint.fill(0);
    for (const l of lights) {
      const x0 = Math.max(0, Math.floor((l.x - l.r) / C)), x1 = Math.min(cols - 1, Math.ceil((l.x + l.r) / C));
      const ry = l.r * (l.squash || 1);
      const y0 = Math.max(0, Math.floor((l.y - ry) / C)), y1 = Math.min(rows - 1, Math.ceil((l.y + ry) / C));
      const inv = 1 / (l.r * l.r), squash = 1 / (l.squash || 1);
      for (let cy = y0; cy <= y1; cy++) {
        const dy = (cy * C + C / 2 - l.y) * squash;
        for (let cx = x0; cx <= x1; cx++) {
          const dx = cx * C + C / 2 - l.x;
          const d = (dx * dx + dy * dy) * inv;
          if (d >= 1) continue;
          const f = l.i * (1 - d) * (1 - d);
          const k = cy * cols + cx;
          light[k] += f;
          if (l.tint) {
            const w = f * l.tint, j = k * 4;
            tint[j] += w; tint[j + 1] += w * l.color[0]; tint[j + 2] += w * l.color[1]; tint[j + 3] += w * l.color[2];
          }
        }
      }
    }
    const pixels = this.pixels, depth = mood.depth, seam = this.SEAM;
    const bayer = this.BAYER.map(v => 0.5 + (v - 0.5) * seam);
    const [dr, dg, db] = mood.dark;
    const step = depth / 4;
    const cx0 = VIEW_W / 2, cy0 = VIEW_H / 2, vMax = 1 / Math.hypot(cx0, cy0);
    for (let y = 0; y < VIEW_H; y++) {
      const row = y * VIEW_W, cellRow = (y >> 1) * cols, by = (y & 3) * 4;
      const vy = (y - cy0) * (y - cy0);
      for (let x = 0; x < VIEW_W; x++) {
        const k = cellRow + (x >> 1);
        const threshold = bayer[by + (x & 3)];
        // A soft vignette deepens the far corners of every lit room.
        const vignette = Math.max(0, Math.sqrt((x - cx0) * (x - cx0) + vy) * vMax - 0.62) * 0.9;
        const dark = Math.min(1, Math.max(0, 1 - light[k]) + vignette) * depth;
        const level = Math.min(4, Math.floor(dark / step + threshold));
        if (level > 0) {
          const a = Math.round(level * step * 255);
          pixels[row + x] = ((a << 24) | (db << 16) | (dg << 8) | dr) >>> 0;
          continue;
        }
        const j = k * 4, w = tint[j];
        if (w > 0.03) {
          const glow = Math.min(0.27, w * 0.34);
          const tl = Math.floor(glow / 0.09 + threshold);
          if (tl > 0) {
            const a = Math.round(tl * 0.09 * 255);
            const r = Math.min(255, tint[j + 1] / w) | 0, g = Math.min(255, tint[j + 2] / w) | 0, b = Math.min(255, tint[j + 3] / w) | 0;
            pixels[row + x] = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
            continue;
          }
        }
        pixels[row + x] = 0;
      }
    }
    return pixels;
  },

  render(c, map, cam, now) {
    const mood = this.moods[G.area];
    if (!mood || this.disabled || Expedition.prefs.lighting === false) return false;
    const t = Expedition.prefs.motion ? 0 : now / 1000;
    const lights = this.lightsFor(map, cam, t);
    this.lastLights = lights;
    // Lightning lights the whole room at once.
    // Without ImageData there is nowhere to show the field; skip the work.
    this.ensure();
    if (!this.image) return false;
    const extra = Expedition.prefs.motion ? 0 : Math.min(1, Math.max(0, lightning) * 4.5);
    this.compute(lights, mood, extra);
    this.context.putImageData(this.image, 0, 0);
    c.drawImage(this.canvas, 0, 0);
    return true;
  },
};
