"use strict";

// Half-pixel material detail for 2× surfaces. Every call adds marks on top of
// the existing 1× tile art, so 1× surfaces (and the logic) are unchanged.
const HDTiles = {
  applies(c) { return HDSprites.applies(c); },

  // f(x, y, w, h) works in fine pixels inside one 16px tile (32 fine pixels).
  fine(c, x, y) {
    const px = x * TILE, py = y * TILE;
    return (fx, fy, w, h, col) => { if (w > 0 && h > 0) { c.fillStyle = col; c.fillRect(px + fx / 2, py + fy / 2, w / 2, h / 2); } };
  },

  context(map, x, y) {
    const house = map === MAPS.house_empty || map === MAPS.house_family;
    if (house) return x < 16 ? "wood" : "tile";
    if (map === MAPS.blood) return y > 10 ? "wood" : "ash";
    if (map === MAPS.garden) return "grass";
    if (map === MAPS.rain) return "wet";
    if (map === MAPS.mirror) return "polished";
    return "stone";
  },

  // Under objects: called from PixelArt.floor once the base floor is drawn.
  floorDetail(c, x, y, map) {
    this.floor(this.fine(c, x, y), k => hash(x, y, 200 + k), this.context(map, x, y), x, y);
  },

  // Over objects: called at the end of drawTile.
  detail(c, ch, x, y, map, t = 0) {
    const f = this.fine(c, x, y), h = k => hash(x, y, 200 + k);
    if (ch === "#") this.wall(f, h, map, x, y);
    else if (ch === "D") this.door(f, h, map);
    else if (ch === "*") this.flower(f, h, x, y, t);
    else this.object(f, h, ch, map, x, y, t);
  },

  floor(f, h, kind, x, y) {
    if (kind === "wood") {
      // Two planks per tile: grain streaks, an occasional knot, nails at the joints.
      for (let row = 0; row < 2; row++) {
        const base = row * 16;
        for (let k = 0; k < 4; k++) {
          const gy = base + 3 + Math.floor(h(row * 10 + k) * 11), gx = Math.floor(h(row * 10 + k + 5) * 20), gw = 6 + Math.floor(h(row * 10 + k + 9) * 12);
          f(gx, gy, gw, 1, k % 2 ? "rgba(20,12,6,0.22)" : "rgba(255,226,180,0.07)");
        }
        if (h(row + 40) > 0.86) { const kx = 6 + Math.floor(h(row + 41) * 18), ky = base + 5 + Math.floor(h(row + 42) * 6); f(kx, ky, 4, 3, "rgba(30,16,6,0.35)"); f(kx + 1, ky + 1, 2, 1, "rgba(10,5,2,0.45)"); f(kx - 1, ky - 1, 6, 1, "rgba(255,220,170,0.06)"); }
        f(0, base + 14, 32, 1, "rgba(255,230,190,0.05)");
        if ((x + row) % 3 === 0) { f(2, base + 6, 1, 1, "rgba(200,190,170,0.35)"); f(2, base + 9, 1, 1, "rgba(200,190,170,0.25)"); }
      }
      return;
    }
    if (kind === "tile") {
      f(1, 1, 30, 1, "rgba(255,255,255,0.07)"); f(1, 1, 1, 30, "rgba(255,255,255,0.05)");
      f(1, 30, 30, 1, "rgba(0,0,0,0.18)"); f(30, 1, 1, 30, "rgba(0,0,0,0.14)");
      if (h(1) > 0.6) { const gx = 4 + Math.floor(h(2) * 20), gy = 3 + Math.floor(h(3) * 8); f(gx, gy, 4, 1, "rgba(255,255,255,0.16)"); f(gx + 1, gy + 1, 2, 1, "rgba(255,255,255,0.09)"); }
      if (h(4) > 0.92) { const cx = 8 + Math.floor(h(5) * 14); for (let i = 0; i < 6; i++) f(cx + i, 10 + (i % 3), 1, 1, "rgba(0,0,0,0.25)"); }
      return;
    }
    if (kind === "grass") {
      // Dense blades in three greens, tips catching the coffin's light.
      for (let k = 0; k < 16; k++) {
        const bx = Math.floor(h(k) * 31), by = 3 + Math.floor(h(k + 30) * 27), len = 2 + Math.floor(h(k + 60) * 4);
        const col = ["#1d3324", "#254231", "#2f5139"][k % 3];
        f(bx, by - len, 1, len, col); f(bx, by - len, 1, 1, k % 4 ? "#3e6646" : "#557d58");
        if (k % 5 === 0) f(bx + 1, by - len + 1, 1, len - 1, "#17291d");
      }
      for (let k = 0; k < 3; k++) { const sx = Math.floor(h(k + 90) * 30), sy = Math.floor(h(k + 95) * 30); f(sx, sy, 2, 1, "rgba(60,48,36,0.5)"); }
      if (h(120) > 0.9) { const sx = 6 + Math.floor(h(121) * 20), sy = 6 + Math.floor(h(122) * 20); f(sx, sy, 1, 1, "#d9d6c2"); f(sx + 1, sy + 1, 1, 1, "#c9c39f"); }
      return;
    }
    // Stone-like floors: speckle and a bevel around each slab.
    const speck = kind === "ash" ? ["rgba(0,0,0,0.25)", "rgba(180,90,70,0.12)"] : ["rgba(0,0,0,0.2)", "rgba(255,255,255,0.06)"];
    for (let k = 0; k < 10; k++) f(Math.floor(h(k) * 32), Math.floor(h(k + 20) * 32), 1, 1, speck[k % 2]);
    f(1, 1, 30, 1, "rgba(255,255,255,0.05)"); f(1, 2, 1, 28, "rgba(255,255,255,0.04)"); f(1, 31, 31, 1, "rgba(0,0,0,0.16)");
    if (kind === "polished") {
      // Long faint streaks: the floor of a hall of mirrors keeps reflections.
      f(4 + (x % 3) * 6, 4, 1, 22, "rgba(170,175,230,0.07)"); f(5 + (x % 3) * 6, 4, 1, 14, "rgba(220,220,255,0.05)");
    }
    if (kind === "wet" && h(50) > 0.55) {
      const wx = 2 + Math.floor(h(51) * 16), wy = 6 + Math.floor(h(52) * 18);
      f(wx, wy, 12, 1, "rgba(150,190,225,0.18)"); f(wx + 3, wy + 2, 7, 1, "rgba(150,190,225,0.1)"); f(wx + 1, wy - 1, 3, 1, "rgba(230,240,255,0.18)");
    }
    if (kind === "ash" && h(60) > 0.7) { const ax = Math.floor(h(61) * 24), ay = Math.floor(h(62) * 24); f(ax, ay, 6, 3, "rgba(15,8,8,0.3)"); f(ax + 2, ay + 1, 2, 1, "rgba(200,100,60,0.2)"); }
  },

  wall(f, h, map, x, y) {
    if (map === MAPS.garden) {
      // The garden's edge is a hedge, not masonry.
      for (let k = 0; k < 18; k++) { const lx = Math.floor(h(k) * 30), ly = Math.floor(h(k + 30) * 30); f(lx, ly, 2, 2, k % 3 ? "#1f3a28" : "#2c4f35"); f(lx, ly, 1, 1, k % 4 ? "#36603f" : "#4b7a52"); }
      return;
    }
    const open = map.grid[y + 1]?.[x] && map.grid[y + 1][x] !== "#";
    // Bricks: 16×8 fine, staggered rows, mortar, lit top edges, rare chips.
    for (let row = 0; row < 4; row++) {
      const by = row * 8, off = (row + y) % 2 ? 8 : 0;
      f(0, by + 7, 32, 1, "rgba(0,0,0,0.35)");
      for (let bx = -off; bx < 32; bx += 16) {
        f(bx + 15, by, 1, 7, "rgba(0,0,0,0.3)");
        f(bx + 1, by, 13, 1, "rgba(255,255,255,0.07)");
        f(bx + 1, by + 6, 13, 1, "rgba(0,0,0,0.12)");
        if (hash(x * 4 + Math.floor((bx + 16) / 16), y * 4 + row, 230) > 0.88) { f(bx + 2, by + 1, 3, 2, "rgba(0,0,0,0.28)"); f(bx + 2, by + 3, 2, 1, "rgba(255,255,255,0.08)"); }
      }
    }
    if (open) { f(0, 24, 32, 1, "rgba(255,255,255,0.12)"); f(0, 30, 32, 2, "rgba(0,0,0,0.25)"); }
    const house = map === MAPS.house_empty || map === MAPS.house_family;
    if (house && y === 0 && [3, 11, 24].includes(x)) {
      // A window with mullions, sill and curtains; warm at home, cold in the empty house.
      const warm = map === MAPS.house_family;
      f(3, 3, 26, 23, "#22262b"); f(5, 5, 22, 19, warm ? "#d4bf86" : "#7f97a8");
      for (let i = 0; i < 4; i++) f(5, 5 + i * 5, 22, 5, warm ? ["#e7d6a0", "#d9c58e", "#c8b37b", "#b9a46d"][i] : ["#9db3c2", "#88a0b2", "#7389a0", "#61778e"][i]);
      f(15, 5, 2, 19, "#3a3f44"); f(5, 14, 22, 2, "#3a3f44");
      for (let k = 0; k < 4; k++) f(7 + k, 11 - k, 1, 1, "rgba(255,255,255,0.45)");
      f(2, 25, 28, 3, "#8a7d66"); f(2, 25, 28, 1, "#b5a68a");
      f(1, 2, 4, 23, warm ? "#7a5e6e" : "#56606c"); f(27, 2, 4, 23, warm ? "#6d5262" : "#4b5560"); f(2, 2, 1, 23, "rgba(255,255,255,0.12)");
    }
  },

  door(f, h, map) {
    f(8, 4, 16, 1, "rgba(255,240,200,0.12)"); f(8, 5, 1, 22, "rgba(255,240,200,0.08)");
    f(10, 7, 12, 8, "rgba(0,0,0,0.12)"); f(10, 18, 12, 8, "rgba(0,0,0,0.12)");
    f(11, 7, 10, 1, "rgba(255,255,255,0.08)"); f(11, 18, 10, 1, "rgba(255,255,255,0.08)");
    f(21, 17, 2, 2, "#e8d39a"); f(21, 17, 1, 1, "#fff2c4");
  },

  flower(f, h, x, y, t) {
    const ox = t ? Math.round(Math.sin(t * 2 + x * 2 + y)) * 2 : 0;
    f(15 + ox, 14, 2, 2, "#fff8dc"); f(13 + ox, 12, 1, 1, "rgba(255,255,255,0.4)"); f(18 + ox, 17, 1, 1, "rgba(255,255,255,0.3)");
    f(14, 20, 1, 6, "#3f6b44"); f(10, 23, 4, 1, "#4f7c4c");
  },

  object(f, h, ch, map, x, y, t) {
    if (ch === "T") {
      for (let k = 0; k < 22; k++) { const lx = 4 + Math.floor(h(k) * 24), ly = 2 + Math.floor(h(k + 40) * 18); f(lx, ly, 2, 1, k % 3 ? "#5b7f55" : "#88a873"); if (k % 4 === 0) f(lx, ly + 1, 2, 1, "#1a2b1f"); }
      f(15, 18, 1, 12, "#5c4c33"); f(17, 20, 1, 9, "#2f2618");
    } else if (ch === "m" || ch === "M") {
      f(8, 4, 16, 1, "rgba(255,255,255,0.18)"); f(9, 6, 2, 16, "rgba(220,235,255,0.14)"); f(12, 6, 1, 10, "rgba(220,235,255,0.1)");
      f(5, 0, 22, 1, "#e0d0a6"); f(4, 1, 1, 26, "#a99470"); f(27, 1, 1, 26, "#5a4e3e");
      for (const cx of [4, 26]) { f(cx, 0, 2, 2, "#f0dfb0"); f(cx, 27, 2, 2, "#8b7656"); }
    } else if (ch === "B") {
      for (let yy = 8; yy < 26; yy += 3) f(16, yy, 12, 1, "rgba(255,255,255,0.08)");
      for (let xx = 17; xx < 28; xx += 3) f(xx, 8, 1, 18, "rgba(0,0,0,0.08)");
      f(5, 7, 8, 1, "rgba(255,255,255,0.25)"); f(4, 13, 10, 1, "rgba(0,0,0,0.15)");
    } else if (ch === "F") {
      for (let yy = 16; yy < 24; yy += 2) for (let xx = 6; xx < 26; xx += 2) if ((xx + yy) % 4 === 0) f(xx, yy, 1, 1, "rgba(255,240,210,0.07)");
      f(15, 15, 1, 9, "rgba(0,0,0,0.25)"); f(5, 5, 22, 1, "rgba(255,240,210,0.12)");
    } else if (ch === "f" || ch === "K") {
      for (let k = 0; k < 5; k++) f(2 + Math.floor(h(k) * 10), 11 + k * 2, 10 + Math.floor(h(k + 9) * 12), 1, k % 2 ? "rgba(30,18,8,0.2)" : "rgba(255,220,170,0.08)");
      f(0, 6, 32, 1, "rgba(255,255,255,0.12)");
    } else if (ch === "W") {
      const ox = t ? Math.round(Math.sin(t * 9 + x)) * 2 : 0;
      f(6 + ox, 3, 20, 1, "rgba(255,255,255,0.35)"); f(22 + ox, 6, 2, 2, "#9fd7c4");
      f(12 + ox, 13, 6, 1, "rgba(255,255,255,0.35)"); f(11 + ox, 14, 1, 4, "rgba(255,255,255,0.2)");
    } else if (ch === "L") {
      f(11, 4, 10, 1, "rgba(255,255,255,0.4)"); f(8, 17, 1, 6, "rgba(255,255,255,0.25)"); f(13, 21, 6, 1, "rgba(120,160,175,0.4)");
    } else if (ch === "|") {
      f(11, 4, 1, 22, "rgba(220,235,255,0.2)"); f(20, 4, 1, 22, "rgba(0,0,0,0.25)");
      for (let yy = 6; yy < 26; yy += 5) f(12, yy, 7, 1, "rgba(0,0,0,0.12)");
    }
  },

  // Objects fully redrawn at fine resolution in HD; 1× surfaces keep the old art.
  OWNED: new Set(["T", "*", "B", "F", "f", "K", "W", "L", "m", "M", "|", "x"]),

  // fn draws in fine pixels (0..31) with integer coordinates.
  paint(c, x, y, fn) {
    c.save(); c.translate(x * TILE, y * TILE); c.scale(0.5, 0.5);
    const r = (a, b, w, h, col) => { if (w > 0 && h > 0) { c.fillStyle = col; c.fillRect(a, b, w, h); } };
    const poly = (pts, col) => PixelArt.polygon(c, pts, col);
    const disc = (cx, cy, rad, col, sy = 1) => { for (let dy = -rad; dy <= rad; dy++) { const w = Math.floor(Math.sqrt(rad * rad - dy * dy)); r(cx - w, cy + Math.round(dy * sy), 2 * w + 1, 1, col); } };
    fn(r, poly, disc);
    c.restore();
  },

  drawObject(c, ch, x, y, map, t) {
    const h = k => hash(x, y, 300 + k);
    this.paint(c, x, y, (r, poly, disc) => {
      if (ch === "T") {
        r(6, 27, 22, 3, "rgba(0,0,0,0.35)"); r(9, 26, 16, 1, "rgba(0,0,0,0.2)");
        poly([[14, 17], [19, 17], [20, 29], [13, 29]], "#4a3b28"); r(15, 18, 1, 10, "#7a6545"); r(18, 19, 1, 10, "#2c2216"); r(11, 28, 4, 1, "#3a2e1f"); r(19, 28, 4, 1, "#3a2e1f");
        disc(16, 12, 12, "#1b3023"); disc(10, 12, 7, "#284631"); disc(22, 11, 7, "#284631"); disc(16, 7, 7, "#30533a");
        disc(12, 7, 4, "#41684a"); disc(20, 5, 3, "#4f7a52"); disc(8, 14, 3, "#365b3f");
        for (let k = 0; k < 26; k++) { const lx = 4 + Math.floor(h(k) * 25), ly = 1 + Math.floor(h(k + 40) * 21); r(lx, ly, 1, 1, k % 3 ? "#6c955f" : "#13231a"); }
        r(13, 2, 3, 1, "#8ab275"); r(19, 1, 2, 1, "#8ab275");
      } else if (ch === "*") {
        const ox = t ? Math.round(Math.sin(t * 2 + x * 2 + y)) : 0;
        const petal = ["#d8d4b0", "#a7c8b8", "#bdbcd6"][(x + y) % 3];
        for (const [fx, fy, s] of [[11, 12, 1], [21, 17, 0]]) {
          r(fx, fy + 3, 1, 10 - s * 3, "#4c6b48"); r(fx - 3, fy + 8, 3, 1, "#5a7d52"); r(fx + 1, fy + 10, 3, 1, "#3e5e40");
          const cx = fx + ox, cy = fy;
          for (const [dx, dy] of [[0, -2], [2, 0], [0, 2], [-2, 0], [1, -1], [-1, 1]]) r(cx + dx, cy + dy, 2, 2, petal);
          r(cx, cy, 2, 2, "#e0bd62"); r(cx, cy, 1, 1, "#fff0b0"); r(cx - 2, cy - 2, 1, 1, "rgba(255,255,255,0.5)");
        }
      } else if (ch === "B") {
        r(2, 2, 28, 28, "#2a2230"); r(3, 1, 26, 5, "#6e5743"); r(3, 1, 26, 1, "#9b8064"); r(4, 4, 24, 1, "#4d3c2e");
        r(5, 7, 12, 6, "#e3ded0"); r(5, 7, 12, 1, "#f4f0e4"); r(6, 11, 10, 1, "#b9b3a4"); r(10, 8, 1, 3, "#cfc9ba");
        r(3, 13, 26, 15, "#5e5778"); r(3, 13, 26, 2, "#dcd6c8"); r(3, 15, 26, 1, "#a8a2b6");
        for (let yy = 17; yy < 27; yy += 3) r(4, yy, 24, 1, "#6b6488"); for (let xx = 7; xx < 28; xx += 6) r(xx, 16, 1, 11, "#514a69");
        r(27, 15, 2, 13, "#433d59"); r(3, 28, 26, 1, "#3a3046"); r(3, 29, 2, 2, "#2a2018"); r(27, 29, 2, 2, "#2a2018");
      } else if (ch === "F") {
        r(2, 26, 28, 3, "rgba(0,0,0,0.35)");
        r(2, 3, 28, 11, "#6f5d4a"); r(3, 4, 26, 1, "#9a8366"); r(3, 5, 26, 8, "#7d6a55");
        r(1, 9, 5, 16, "#64523f"); r(26, 9, 5, 16, "#584837"); r(1, 9, 5, 1, "#937a5c"); r(26, 9, 5, 1, "#7f6a50");
        r(6, 13, 10, 11, "#8a765f"); r(16, 13, 10, 11, "#83705a"); r(6, 13, 20, 1, "#a99073"); r(15, 13, 1, 11, "#4e4234");
        for (let yy = 15; yy < 23; yy += 2) for (let xx = 7; xx < 25; xx += 3) r(xx + (yy % 4 ? 1 : 0), yy, 1, 1, "rgba(255,240,210,0.08)");
        r(3, 24, 26, 2, "#3e3328"); r(4, 26, 2, 3, "#2a221a"); r(26, 26, 2, 3, "#2a221a");
      } else if (ch === "f") {
        r(1, 24, 30, 3, "rgba(0,0,0,0.3)");
        r(0, 6, 32, 16, "#7a6040"); r(0, 6, 32, 1, "#a78a5e"); r(0, 21, 32, 2, "#4d3c28");
        for (let k = 0; k < 6; k++) r(Math.floor(h(k) * 12), 8 + k * 2, 10 + Math.floor(h(k + 9) * 16), 1, k % 2 ? "#6a5236" : "#8a6f4a");
        r(2, 23, 3, 7, "#4a3925"); r(27, 23, 3, 7, "#4a3925"); r(2, 23, 1, 7, "#6b553a");
      } else if (ch === "K") {
        r(0, 3, 32, 7, "#b9b2a2"); r(0, 3, 32, 1, "#ddd7c8"); r(0, 9, 32, 1, "#8a8476");
        for (let k = 0; k < 8; k++) r(Math.floor(h(k) * 30), 4 + Math.floor(h(k + 10) * 4), 1, 1, k % 2 ? "#a49d8d" : "#cfc8b8");
        r(0, 10, 32, 19, "#7a6a50"); r(15, 10, 1, 19, "#4e4332"); r(1, 11, 13, 1, "#94815f"); r(16, 11, 15, 1, "#94815f");
        r(12, 16, 1, 5, "#cfcfcf"); r(18, 16, 1, 5, "#cfcfcf"); r(0, 29, 32, 3, "#3a3128");
      } else if (ch === "W") {
        const ox = t ? Math.round(Math.sin(t * 9 + x)) : 0;
        r(4 + ox, 30, 24, 2, "rgba(0,0,0,0.35)");
        r(3 + ox, 2, 26, 28, "#c9ccc6"); r(3 + ox, 2, 2, 28, "#e6e8e2"); r(27 + ox, 3, 2, 27, "#9da19c"); r(3 + ox, 29, 26, 1, "#7f837f");
        r(4 + ox, 3, 24, 6, "#b8bcb7"); r(4 + ox, 8, 24, 1, "#8e928d"); disc(9 + ox, 6, 2, "#7f878d"); r(9 + ox, 5, 1, 1, "#dfe3e6");
        r(20 + ox, 5, 2, 1, "#7fd6b8"); r(24 + ox, 5, 2, 1, "#d9a36b");
        disc(16 + ox, 19, 9, "#8d969b"); disc(16 + ox, 19, 8, "#c2c9cc"); disc(16 + ox, 19, 6, "#2b3d4d");
        const a = t * 6; for (let k = 0; k < 3; k++) { const ang = a + k * 2.1; r(Math.round(16 + ox + Math.cos(ang) * 3), Math.round(19 + Math.sin(ang) * 3), 2, 1, "#7d9bb0"); }
        r(12 + ox, 15, 3, 1, "#d5e5ee"); r(11 + ox, 16, 1, 2, "#a9c3d2");
      } else if (ch === "L") {
        r(8, 28, 16, 2, "rgba(0,0,0,0.3)");
        r(9, 2, 14, 8, "#ecebe4"); r(9, 2, 14, 1, "#ffffff"); r(9, 9, 14, 1, "#b8b8b0"); r(15, 4, 3, 1, "#c8c8c0");
        disc(16, 20, 9, "#e8e7e0", 0.85); disc(16, 20, 7, "#d7d6ce", 0.8); disc(16, 21, 5, "#8fb0b9", 0.7); r(13, 19, 3, 1, "#c9e0e6");
        r(8, 18, 1, 5, "#ffffff");
      } else if (ch === "m" || ch === "M") {
        r(3, 0, 26, 31, "#1d1a12"); r(4, 0, 24, 30, "#a8905a"); r(4, 0, 24, 1, "#e6d39b"); r(4, 1, 1, 28, "#d2bc83"); r(27, 1, 1, 29, "#6b5733"); r(4, 29, 24, 1, "#6b5733");
        for (const [cx, cy] of [[5, 1], [25, 1], [5, 27], [25, 27]]) { r(cx, cy, 2, 2, "#f2e2ae"); r(cx + 1, cy + 1, 1, 1, "#7a6640"); }
        const bands = ["#88a6c0", "#6f8fab", "#587794", "#465f7a", "#384d65", "#2f4157"];
        bands.forEach((col, i) => r(7, 3 + i * 4, 18, 4, col));
        for (let k = 0; k < 7; k++) r(10 + k, 20 - k * 2, 1, 2, "rgba(230,240,250,0.45)"); r(19, 6, 1, 6, "rgba(230,240,250,0.3)");
        r(7, 3, 18, 1, "rgba(255,255,255,0.35)");
      } else if (ch === "|") {
        r(6, 27, 20, 5, "#3a5163"); r(6, 27, 20, 1, "#6d8aa0"); r(9, 4, 14, 23, "#4c667b");
        for (const xx of [11, 14, 17, 20]) { r(xx, 5, 1, 22, "#354c5f"); r(xx + 1, 5, 1, 22, "#6c8aa1"); }
        r(6, 0, 20, 5, "#5b778d"); r(6, 0, 20, 1, "#8fadbf"); r(6, 4, 20, 1, "#2c3f50"); r(9, 24, 14, 1, "rgba(160,200,230,0.25)");
      } else if (ch === "x") {
        r(3, 22, 26, 6, "#140b09"); poly([[4, 23], [10, 14], [17, 17], [24, 11], [28, 22], [26, 27], [6, 27]], "#1d110e");
        r(6, 19, 14, 2, "#2e1a14"); r(14, 14, 2, 12, "#2a1712"); r(18, 16, 9, 2, "#311c15");
        const glow = t ? 0.6 + Math.sin(t * 5 + x) * 0.3 : 0.75;
        for (const [ex, ey, w] of [[9, 20, 4], [16, 18, 3], [21, 23, 5], [12, 25, 3]]) { r(ex, ey, w, 1, `rgba(220,96,52,${glow})`); r(ex + 1, ey, 1, 1, "#ffc47a"); }
        if (t) for (let k = 0; k < 4; k++) { const rise = (t * 10 + h(k) * 14) % 14; r(8 + Math.floor(h(k + 5) * 16), 18 - Math.round(rise), 1, 1, `rgba(255,170,90,${1 - rise / 14})`); }
      }
    });
  },

  // Large props drawn each frame on the 2× canvas, over sceneProps' 1× art.
  paintAt(c, wx, wy, cam, fn) {
    c.save(); c.translate(wx - cam.x, wy - cam.y); c.scale(0.5, 0.5);
    const r = (a, b, w, h, col) => { if (w > 0 && h > 0) { c.fillStyle = col; c.fillRect(a, b, w, h); } };
    const poly = (pts, col) => PixelArt.polygon(c, pts, col);
    fn(r, poly);
    c.restore();
  },

  props(c, map, cam) {
    if (!this.applies(c)) return;
    if (map === MAPS.garden) this.coffin(c, cam);
    if (map === MAPS.house_empty || map === MAPS.house_family) this.livingRoom(c, cam, map === MAPS.house_family);
  },

  coffin(c, cam) {
    const open = StoryStaging.coffin;
    this.paintAt(c, 11 * TILE, 7 * TILE, cam, (r, poly) => {
      const W = 96, H = 64;
      poly([[14, 6], [W - 16, 6], [W - 4, 16], [W - 4, H - 8], [W - 14, H], [12, H], [2, H - 10], [2, 16]], "#0a0d0e");
      // Front thickness, then the board face.
      poly([[4, 16], [W - 6, 16], [W - 6, H - 8], [W - 15, H - 2], [13, H - 2], [4, H - 10]], "#3a2a1d");
      r(6, H - 12, W - 12, 1, "#5a4330"); r(8, H - 6, W - 22, 1, "#231810");
      poly([[15, 4], [W - 17, 4], [W - 7, 13], [W - 7, H - 14], [W - 16, H - 7], [14, H - 7], [5, H - 15], [5, 13]], "#7f5f3e");
      if (open) {
        poly([[18, 9], [W - 20, 9], [W - 12, 16], [W - 12, H - 17], [W - 19, H - 11], [17, H - 11], [10, H - 18], [10, 16]], "#191617");
        poly([[20, 12], [W - 22, 12], [W - 15, 18], [W - 15, H - 20], [W - 21, H - 14], [19, H - 14], [13, H - 21], [13, 18]], "#5b3f4a");
        for (let y = 16; y < H - 18; y += 4) r(16, y, W - 32, 1, "rgba(255,220,230,0.08)");
        r(14, 15, W - 28, 2, "#2a2023");
        return;
      }
      // Four boards with grain and gaps.
      for (let b = 0; b < 4; b++) {
        const y0 = 8 + b * 12;
        r(8, y0 + 11, W - 16, 1, "#3d2b1c");
        for (let k = 0; k < 5; k++) { const gx = 10 + Math.floor(hash(b, k, 401) * 50), gw = 10 + Math.floor(hash(b, k, 402) * 30); r(gx, y0 + 2 + k * 2, gw, 1, k % 2 ? "#6c4f33" : "#957250"); }
        r(8, y0, W - 16, 1, "#a7845d");
      }
      // Engraved inscription lines near the head of the lid.
      for (let i = 0; i < 6; i++) { r(22, 12 + i * 5, 30 - (i % 3) * 6, 1, "#4a3523"); r(22, 13 + i * 5, 30 - (i % 3) * 6, 1, "#c4a26c"); }
      r(64, 12, 1, 26, "#4a3523"); r(65, 12, 1, 26, "#c4a26c");
      // Brass corner plates and rivets.
      for (const [x0, y0, fx, fy] of [[8, 9, 1, 1], [W - 18, 9, -1, 1], [8, H - 22, 1, -1], [W - 18, H - 22, -1, -1]]) {
        r(x0, y0, 10, 10, "#8a6d35"); r(x0 + 1, y0 + 1, 8, 8, "#b8924c"); r(x0 + 1, y0 + 1, 8, 1, "#e3c27c");
        r(x0 + 3, y0 + 3, 2, 2, "#4a3a1e"); r(x0 + 3, y0 + 3, 1, 1, "#f2dda0");
      }
      for (const hx of [24, W - 32]) { r(hx, H - 6, 8, 2, "#2b241c"); r(hx, H - 6, 8, 1, "#9c8558"); }
    });
  },

  livingRoom(c, cam, warm) {
    // The living-room window that casts the room's light.
    this.paintAt(c, 9 * 16 + 4, 16, cam, (r) => {
      r(0, 0, 80, 34, "#1c1f22"); r(2, 2, 76, 26, "#2b2f33");
      const glass = warm ? ["#e3d3a3", "#d6c592", "#c9b582", "#bba673", "#ae9966"] : ["#8fa5b2", "#7f96a5", "#6f8697", "#61788a", "#566c7e"];
      glass.forEach((col, i) => { r(4, 4 + i * 4, 34, 4, col); r(42, 4 + i * 4, 34, 4, col); });
      r(38, 2, 4, 26, "#2b2f33"); r(4, 13, 72, 2, "#2b2f33"); r(4, 4, 72, 1, "rgba(255,255,255,0.3)");
      for (let k = 0; k < 6; k++) { r(10 + k, 11 - k, 1, 1, "rgba(255,255,255,0.5)"); r(50 + k, 11 - k, 1, 1, "rgba(255,255,255,0.4)"); }
      r(-2, 28, 84, 4, "#7d6e55"); r(-2, 28, 84, 1, "#a89676"); r(0, 32, 80, 2, "rgba(0,0,0,0.3)");
    });
    // The father's sofa.
    this.paintAt(c, 13 * 16 - 6, 2 * 16 - 1, cam, (r) => {
      const base = warm ? "#666354" : "#3e474a", hi = warm ? "#8a8673" : "#566164", lo = warm ? "#4a483d" : "#2c3335";
      r(0, 38, 58, 4, "rgba(0,0,0,0.35)");
      r(1, 1, 56, 24, "#0d1316"); r(2, 2, 54, 22, base); r(3, 3, 52, 1, hi);
      r(2, 22, 10, 16, lo); r(46, 22, 10, 16, lo); r(2, 22, 10, 1, hi); r(46, 22, 10, 1, hi);
      r(12, 20, 17, 16, hi); r(29, 20, 17, 16, warm ? "#7e7b69" : "#4f5a5d"); r(28, 20, 1, 16, lo);
      for (let y = 23; y < 34; y += 2) for (let x = 13; x < 45; x += 3) r(x + (y % 4 ? 1 : 0), y, 1, 1, "rgba(255,245,220,0.07)");
      r(12, 35, 34, 2, "#262826"); r(4, 38, 3, 3, "#1f1a15"); r(51, 38, 3, 3, "#1f1a15");
    });
    // The breakfast table.
    this.paintAt(c, 10 * 16 - 3, 2 * 16 + 3, cam, (r) => {
      const top = warm ? "#86663f" : "#574f44";
      r(0, 0, 48, 4, warm ? "#c09c66" : "#857a6a"); r(0, 4, 48, 22, top); r(0, 25, 48, 2, "#3a2d20");
      for (let k = 0; k < 6; k++) r(2 + Math.floor(hash(k, 1, 410) * 14), 7 + k * 3, 14 + Math.floor(hash(k, 2, 410) * 20), 1, k % 2 ? "rgba(30,18,8,0.25)" : "rgba(255,225,170,0.1)");
      r(2, 27, 4, 12, "#302924"); r(42, 27, 4, 12, "#302924"); r(3, 27, 1, 12, "#4d433a");
    });
    // The double bed in the adjoining room.
    this.paintAt(c, 5 * 16 + 2, 8 * 16 + 2, cam, (r) => {
      r(0, 0, 56, 6, "#6c5848"); r(0, 0, 56, 1, "#9b8269"); r(1, 6, 54, 22, "#2a2230");
      for (const px of [3, 30]) { r(px, 7, 22, 9, "#d8d3c3"); r(px, 7, 22, 1, "#f1ece0"); r(px + 1, 14, 20, 1, "#ada797"); r(px + 10, 9, 1, 4, "#c6c0b0"); }
      r(2, 17, 52, 11, "#605c76"); r(2, 17, 52, 1, "#8a85a0");
      for (let x = 6; x < 52; x += 8) r(x, 18, 1, 10, "#514d66"); for (let y = 21; y < 28; y += 3) r(3, y, 50, 1, "rgba(255,255,255,0.05)");
      r(1, 28, 54, 1, "#39313c");
    });
  },
};
