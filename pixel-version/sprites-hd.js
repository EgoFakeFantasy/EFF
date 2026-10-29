"use strict";

// Like shade(), but also accepts the rgb() strings that shade() returns.
function hdShade(color, f) {
  let r, g, b;
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color);
  if (m) [r, g, b] = [+m[1], +m[2], +m[3]];
  else { const n = parseInt(String(color).slice(1, 7), 16); r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255; }
  const k = v => Math.min(255, Math.max(0, Math.round(v * f)));
  return `rgb(${k(r)},${k(g)},${k(b)})`;
}

// Half-pixel character sprites for 2× surfaces (the main canvas). Each figure
// is built once per pose/frame on a 40×66 fine-pixel canvas, outlined, cached,
// then blitted 1:1 onto the 2× canvas. 1× surfaces keep PixelArt's actor.
const HDSprites = {
  W: 40,
  H: 66,
  GROUND: 62,
  cache: new Map(),

  applies(c) {
    // Scale magnitude, so rotated figures (the fallen sister) also count as 2×.
    try { const m = c?.getTransform?.(); return !!m && Math.hypot(m.a || 0, m.b || 0) >= 1.99; } catch { return false; }
  },

  color(v) { return typeof v === "string" && v.length === 4 ? "#" + [...v.slice(1)].map(a => a + a).join("") : v; },

  // Identity follows the existing actor options; no new character facts.
  kind(opt) {
    if (opt.hood) return "hood";
    if (opt.beard) return "father";
    if (opt.bun) return "mother";
    if (opt.dead) return "longhair";
    return "zhou";
  },

  blinking(opt) {
    if (Expedition.prefs.motion || opt.dead) return false;
    const seed = [...(opt.coat || "")].reduce((a, ch) => a + ch.charCodeAt(0) * 37, 0);
    return (performance.now() + seed * 13) % 4100 < 120;
  },

  draw(c, x, y, opt = {}) {
    const pose = opt.pose || "stand";
    const gait = personGait(opt, pose);
    const still = Expedition.prefs.motion;
    const back = opt.dir === 3 || pose === "mirror";
    const side = back ? 0 : opt.dir === 1 ? -1 : opt.dir === 2 ? 1 : 0;
    const heart = !!(opt.blood && opt.heldHeart !== false && ["stand", "bound", "kneel"].includes(pose));
    const beat = heart && !still && Math.sin(StoryStaging.time * 8) > 0.86 ? 1 : 0;
    const spec = {
      kind: this.kind(opt), pose, view: back ? "back" : side ? "side" : "front",
      phase: still ? -1 : gait.phase, coat: this.color(opt.coat || "#3a4a6a"), hair: this.color(opt.hair || "#222222"), skin: this.color(opt.skin || "#e8c8a8"),
      blink: !back && (pose === "sleep" || !!opt.dead || this.blinking(opt)), dead: !!opt.dead || pose === "sleep", blood: !!opt.blood, heart, beat, glow: opt.glow || "",
    };
    const key = JSON.stringify(spec);
    let sprite = this.cache.get(key);
    if (!sprite) {
      if (this.cache.size > 400) this.cache.clear();
      sprite = this.build(spec);
      this.built = (this.built || 0) + 1;
      this.cache.set(key, sprite);
    }
    const shake = pose === "pain" && !still ? Math.round(Math.sin(StoryStaging.time * 8)) : 0;
    const bob = still ? 0 : gait.bob * 0.5;
    c.save();
    c.translate(Math.round(x) + 6 + shake, Math.round(y) + 8);
    if (pose === "sleep" || opt.reclined) c.rotate(-Math.PI / 2);
    if (side < 0) c.scale(-1, 1);
    c.drawImage(sprite, -this.W / 4, -25 + bob, this.W / 2, this.H / 2);
    c.restore();
    return true;
  },

  build(s) {
    const cv = document.createElement("canvas");
    cv.width = this.W; cv.height = this.H;
    const c = cv.getContext("2d");
    if (!c) return cv;
    const r = (x, y, w, h, col) => { if (w > 0 && h > 0) { c.fillStyle = col; c.fillRect(x, y, w, h); } };
    const poly = (pts, col) => PixelArt.polygon(c, pts, col);
    const line = (x0, y0, x1, y1, col, w = 1) => {
      const n = Math.max(1, Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let i = 0; i <= n; i++) r(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), w, w, col);
    };
    const coat = s.coat, hair = s.hair, skin = s.skin;
    const coatHi = hdShade(coat, 1.45), coatLo = hdShade(coat, 0.68), coatDeep = hdShade(coat, 0.5);
    const skinLo = hdShade(skin, 0.82), skinDeep = hdShade(skin, 0.66);
    // Very dark hair catches a cool sheen rather than turning grey.
    const hn = parseInt(hair.slice(1, 7), 16), dark = (((hn >> 16) & 255) + ((hn >> 8) & 255) + (hn & 255)) / 3 < 60;
    const hairHi = dark ? "#5a6886" : hdShade(hair, 2.1), hairMid = dark ? "#353f54" : hdShade(hair, 1.45);
    const trousers = s.kind === "father" ? "#4a4036" : s.kind === "mother" ? "#3c3036" : s.kind === "hood" ? "#22252e" : hdShade(coat, 0.62);
    const seated = ["kneel", "eat", "sit"].includes(s.pose);
    const low = s.pose === "kneel" ? 10 : seated ? 8 : 0;
    const view = s.view, phase = s.phase;
    const lift = phase === 0 ? [2, 0] : phase === 2 ? [0, 2] : [0, 0];
    const swing = phase === 0 ? 2 : phase === 2 ? -2 : 0;

    // --- shadow (drawn after outline so it stays soft) ---
    const shadow = () => { if (s.pose === "sleep" || s.dead) return; r(12, 61, 16, 1, "rgba(5,8,16,0.45)"); r(10, 62, 20, 2, "rgba(5,8,16,0.4)"); r(13, 64, 14, 1, "rgba(5,8,16,0.25)"); };

    // --- legs ---
    const legs = () => {
      if (s.kind === "hood") return;
      if (seated) {
        // Thighs fold forward; shins and shoes show beneath.
        const y0 = 44 + low;
        r(11, y0, 8, 6, trousers); r(21, y0, 8, 6, hdShade(trousers, 0.85));
        r(10, y0 + 6, 9, 3, "#141922"); r(21, y0 + 6, 9, 3, "#141922");
        r(11, y0, 8, 1, hdShade(trousers, 1.3)); r(21, y0, 8, 1, hdShade(trousers, 1.15));
        return;
      }
      const skirt = s.kind === "mother";
      if (view === "side") {
        const pos = phase === 0 ? [11, 23] : phase === 2 ? [23, 11] : [16, 18];
        for (const i of [0, 1]) {
          const far = i === 0, x0 = pos[i], up = lift[i];
          const col = far ? hdShade(trousers, 0.7) : trousers;
          r(x0, 44, 6, 15 - up, col); r(x0 + 1, 45, 1, 12 - up, hdShade(col, 1.35));
          r(x0 - 1, 59 - up, 8, 3, far ? "#0e1219" : "#161b25"); r(x0 + 4, 59 - up, 3, 1, "#3a4252");
        }
        return;
      }
      for (const i of [0, 1]) {
        const x0 = i ? 21 : 13, up = lift[i];
        const col = i ? hdShade(trousers, 0.86) : trousers;
        r(x0, 44, 6, 15 - up, col);
        r(x0 + 1, 45, 1, 12 - up, hdShade(col, 1.35));
        r(x0 + 4, 46, 1, 10 - up, hdShade(col, 0.75));
        if (skirt) r(x0 + 1, 52, 4, 7 - up, skinLo);
        r(x0 - 1, 59 - up, 8, 3, "#151a24"); r(x0, 59 - up, 3, 1, "#3d4555");
      }
    };

    // --- torso (and long garments) ---
    const torso = () => {
      const top = 29 + low, bottom = 45 + low;
      if (s.kind === "hood") {
        // A hooded cloak falls to the ground; no limbs are disclosed.
        poly([[12, 27], [28, 27], [31, 44], [33, 61], [7, 61], [9, 44]], coat);
        poly([[13, 28], [18, 28], [15, 60], [9, 60], [10, 44]], hdShade(coat, 1.25));
        poly([[24, 28], [27, 28], [30, 44], [31, 60], [26, 60]], coatLo);
        for (let y = 34; y < 60; y += 5) r(19, y, 2, 3, coatDeep);
        r(8, 60, 24, 1, coatDeep);
        return;
      }
      const w = view === "side" ? 10 : 16, x0 = 20 - w / 2;
      poly([[x0, top + 1], [x0 + 2, top], [x0 + w - 2, top], [x0 + w, top + 1], [x0 + w - 1, bottom], [x0 + 1, bottom]], coat);
      r(x0 + 1, top + 1, 2, bottom - top - 2, coatHi);
      r(x0 + w - 3, top + 2, 2, bottom - top - 3, coatLo);
      if (s.kind === "mother") {
        // An apron over a long skirt.
        poly([[x0 + 1, bottom - 1], [x0 + w - 1, bottom - 1], [x0 + w + 1, 56], [x0 - 1, 56]], hdShade(coat, 0.9));
        r(x0 - 1, 55, w + 2, 1, coatDeep);
        poly([[x0 + 4, top + 4], [x0 + w - 4, top + 4], [x0 + w - 3, 54], [x0 + 3, 54]], "#cfc6b4");
        r(x0 + 4, top + 4, w - 8, 1, "#ece4d2"); r(x0 + 3, top + 9, w - 6, 1, "#a99f8d");
        r(x0 + 3, top + 2, 1, 3, "#a99f8d"); r(x0 + w - 4, top + 2, 1, 3, "#a99f8d");
      } else if (view === "back") {
        r(x0 + 3, top, w - 6, 2, coatDeep); r(19, top + 3, 2, bottom - top - 4, coatLo);
        r(x0 + 1, bottom - 2, w - 2, 1, coatDeep);
      } else if (s.kind === "father") {
        // A knit cardigan over a pale shirt.
        r(18, top, 4, 6, "#c9c2b0"); r(19, top + 6, 2, bottom - top - 7, "#b9b19e");
        for (let y = top + 2; y < bottom - 1; y += 2) for (let x = x0 + 2; x < x0 + w - 2; x += 3) if (x < 18 || x > 21) r(x + (y % 4 ? 1 : 0), y, 1, 1, hdShade(coat, 1.18));
        for (let y = top + 8; y < bottom; y += 4) r(17, y, 1, 1, "#d6cdb6");
      } else if (view === "side") {
        r(23, top + 1, 2, 4, "#d8d2c0"); r(22, top, 3, 1, coatHi);
        r(x0 + 1, bottom - 2, w - 2, 1, coatDeep); r(24, top + 6, 1, 6, coatDeep);
      } else {
        // Blazer with lapels over a white collar.
        poly([[17, top], [23, top], [20, top + 6]], "#e3ddcc");
        r(19, top + 1, 2, 2, "#c9c1ae");
        poly([[15, top + 1], [18, top], [20, top + 7], [18, top + 9]], coatHi);
        poly([[25, top + 1], [22, top], [20, top + 7], [22, top + 9]], hdShade(coat, 1.15));
        r(20, top + 7, 1, bottom - top - 8, coatDeep);
        for (const y of [top + 10, top + 13]) r(21, y, 1, 1, "#c7c0ac");
        r(x0 + 2, bottom - 4, 3, 1, coatDeep); r(x0 + w - 5, bottom - 4, 3, 1, coatDeep);
        r(x0 + 1, bottom - 1, w - 2, 1, coatDeep);
      }
    };

    // --- arms: hands follow each pose ---
    const hands = () => {
      const y = low;
      const p = {
        stand: [[10, 44 + swing], [30, 44 - swing]],
        mirror: [[10, 44], [30, 44]],
        wake: [[6, 12], [34, 11]],
        pain: [[10, 44], [27, 15]],
        search: [[12, 32], [28, 32]],
        photo: [[15, 37], [25, 37]],
        carry: [[10, 37], [30, 37]],
        catch: [[12, 35], [28, 35]],
        eat: [[13, 40 + y], [25, 27 + y]],
        sit: [[10, 44 + y], [30, 44 + y]],
        kneel: [[10, 50], [31, 50]],
        bound: [[3, 31], [37, 31]],
        refuse: [[10, 43], [34, 19]],
        sleep: [[10, 44], [30, 44]],
      }[s.pose] || [[10, 44], [30, 44]];
      if (s.heart && s.pose !== "bound") p[1] = [31, 38 + (s.pose === "kneel" ? 6 : 0)];
      if (view === "side") {
        const hx = s.pose === "stand" ? 21 + swing * 2 : 25, hy = s.pose === "stand" ? 43 : p[1][1];
        return { side: [hx, hy] };
      }
      return { left: p[0], right: p[1] };
    };
    const arms = h => {
      if (s.kind === "hood") return;
      const top = 30 + low;
      if (h.side) {
        line(20, top + 1, h.side[0], h.side[1], coatLo, 4); line(19, top + 1, h.side[0] - 1, h.side[1] - 1, coat, 3);
        r(h.side[0], h.side[1] + 1, 3, 3, skin); r(h.side[0] + 2, h.side[1] + 2, 1, 2, skinDeep);
        return;
      }
      const sh = [[12, top], [28, top]];
      [h.left, h.right].forEach((hand, i) => {
        line(sh[i][0], sh[i][1], hand[0], hand[1], i ? coatLo : coat, 4);
        line(sh[i][0] + (i ? 1 : 0), sh[i][1], hand[0] + (i ? 1 : 0), hand[1], i ? coat : coatHi, 2);
        r(hand[0] - 1, hand[1] + 2, 4, 1, coatDeep);
        r(hand[0] - 1, hand[1] + 3, 4, 3, skin); r(hand[0] + 2, hand[1] + 4, 1, 2, skinDeep);
      });
    };

    // --- head ---
    const head = () => {
      const y = low;
      const hy = v => v + y;
      if (s.kind === "hood") {
        poly([[12, hy(10)], [16, hy(5)], [24, hy(5)], [28, hy(10)], [29, hy(26)], [11, hy(26)]], hdShade(coat, 1.1));
        poly([[14, hy(12)], [26, hy(12)], [26, hy(25)], [14, hy(25)]], "#0e141e");
        r(16, hy(18), 2, 1, "#86c2b4"); r(22, hy(18), 2, 1, "#86c2b4"); r(17, hy(18), 1, 1, "#d2efe6"); r(23, hy(18), 1, 1, "#d2efe6");
        r(13, hy(7), 2, 18, hdShade(coat, 1.4)); r(26, hy(9), 1, 16, coatLo);
        return;
      }
      r(18, hy(26), 4, 4, skinDeep);
      if (view === "side") {
        // Profile facing right: forehead, nose and chin lead, the ear sits behind.
        poly([[14, hy(12)], [24, hy(11)], [26, hy(15)], [27, hy(20)], [25, hy(22)], [25, hy(25)], [22, hy(27)], [16, hy(26)], [14, hy(22)]], skin);
        r(27, hy(19), 1, 2, skin); r(26, hy(21), 1, 1, skinLo);
        r(15, hy(17), 3, 5, skinLo); r(16, hy(18), 1, 3, skinDeep);
        r(22, hy(24), 2, 1, "#9b6a5c"); r(16, hy(25), 5, 1, skinLo);
        if (!s.blink) { r(23, hy(18), 2, 2, "#1e2633"); r(23, hy(18), 1, 1, "#e9eef4"); } else r(22, hy(19), 3, 1, skinDeep);
        r(22, hy(16), 3, 1, hdShade(hair, 0.9));
        this.hair(r, poly, s, "side", y, hair, hairHi, hairMid);
        return;
      }
      if (view === "back") {
        poly([[13, hy(12)], [27, hy(12)], [27, hy(24)], [24, hy(27)], [16, hy(27)], [13, hy(24)]], skinLo);
        this.hair(r, poly, s, "back", y, hair, hairHi, hairMid);
        return;
      }
      // Front face: cheeks narrow to the chin; light falls from the upper left.
      poly([[14, hy(12)], [26, hy(12)], [26, hy(22)], [24, hy(25)], [21, hy(27)], [19, hy(27)], [16, hy(25)], [14, hy(22)]], skin);
      r(24, hy(14), 2, 8, skinLo); r(23, hy(23), 2, 2, skinLo); r(15, hy(14), 1, 6, hdShade(skin, 1.07));
      r(13, hy(18), 1, 4, skinLo); r(26, hy(18), 1, 4, skinDeep);
      if (s.blink) { r(15, hy(19), 3, 1, skinDeep); r(22, hy(19), 3, 1, skinDeep); }
      else for (const ex of [15, 22]) {
        r(ex, hy(18), 3, 1, "#1b2230");
        r(ex, hy(19), 3, 2, "#2c3a52"); r(ex + 1, hy(19), 1, 1, "#e7edf3"); r(ex + 2, hy(20), 1, 1, "#4e6286");
      }
      r(15, hy(16), 3, 1, hdShade(hair, 0.9)); r(22, hy(16), 3, 1, hdShade(hair, 0.9));
      if (s.pose === "pain") { r(15, hy(15), 2, 1, hdShade(hair, 0.9)); r(23, hy(15), 2, 1, hdShade(hair, 0.9)); }
      r(20, hy(20), 1, 3, skinLo); r(19, hy(23), 2, 1, skinDeep);
      if (s.pose === "pain" || s.pose === "bound" || s.pose === "refuse") { r(18, hy(25), 4, 1, "#5d3a3a"); r(19, hy(25), 2, 1, "#d8cfc0"); }
      else r(19, hy(25), 3, 1, "#a06a5d");
      if (s.kind === "father") { for (let yy = hy(23); yy <= hy(27); yy++) for (let xx = 15; xx <= 25; xx += 2) if ((xx + yy) % 3) r(xx, yy, 1, 1, "#8d8273"); r(17, hy(24), 6, 1, "#7a6f60"); }
      this.hair(r, poly, s, "front", y, hair, hairHi, hairMid);
    };

    const props = h => {
      const y = low;
      if (s.pose === "photo") { r(15, 33, 11, 8, "#d8cfb5"); r(16, 34, 9, 5, "#6a7480"); r(19, 35, 3, 2, "#c0aa8e"); r(17, 37, 1, 2, "#3b4552"); r(23, 37, 1, 2, "#3b4552"); }
      if (s.pose === "carry") { r(7, 35, 26, 3, "#d6cfb8"); r(8, 34, 24, 1, "#ece6d3"); r(10, 32, 20, 2, "#6f8a4c"); for (const xx of [12, 16, 21, 26]) r(xx, 32, 2, 1, "#b9b472"); }
      if (s.pose === "eat") { r(10, 41 + y, 9, 4, "#b9c0b4"); r(11, 40 + y, 7, 2, "#f0e8cc"); line(26, 28 + y, 21, 22 + y, "#b49f73", 1); }
      if (s.pose === "catch") { r(12, 33, 3, 1, "#a8d0d8"); r(26, 33, 3, 1, "#a8d0d8"); r(20, 31, 1, 2, "#e5f3f6"); }
      if (s.pose === "bound" && h.left) {
        for (const [hx, hy] of [h.left, h.right]) { r(hx - 2, hy + 3, 6, 1, "#8a6680"); r(hx - 2, hy + 5, 6, 1, "#6e4f66"); }
        r(11, 37, 18, 1, "#7c5a73"); line(h.left[0], h.left[1] + 4, -2, 20, "#7c5a7388", 1); line(h.right[0] + 2, h.right[1] + 4, 41, 20, "#7c5a7388", 1);
      }
      if (s.blood) {
        for (const [a, b, w, hh] of [[23, 15 + y, 2, 3], [16, 21 + y, 1, 2], [14, 33 + y, 3, 3], [22, 38 + y, 2, 4], [15, 50, 2, 2], [24, 53, 2, 3]]) r(a, b, w, hh, "#7a1e2e");
        r(24, 16 + y, 1, 1, "#c8545a"); r(15, 34 + y, 1, 1, "#b94850");
        if (h.left) for (const hand of [h.left, h.right]) { r(hand[0] - 1, hand[1] + 3, 3, 2, "#7a1e2e"); r(hand[0], hand[1] + 3, 1, 1, "#c8545a"); }
      }
      if (s.heart && h.right) {
        const [hx, hy] = h.right, b = s.beat;
        poly([[hx + 1, hy - 3], [hx + 4, hy - 5 - b], [hx + 7, hy - 3], [hx + 7, hy + 1], [hx + 4, hy + 4 + b], [hx + 1, hy + 1]], "#9d2a3f");
        r(hx + 2, hy - 3, 2, 2, "#d27b74"); r(hx + 5, hy - 1, 2, 3, "#6b1527"); r(hx + 3, hy - 6 - b, 2, 2, "#5a1424");
      }
    };

    // Build: far parts first, then outline every silhouette pixel by its own colour.
    legs();
    const h = hands();
    torso(); arms(h);
    head();
    props(h);
    this.outline(c, s.glow);
    const g = c.globalCompositeOperation; c.globalCompositeOperation = "destination-over"; shadow(); c.globalCompositeOperation = g;
    return cv;
  },

  hair(r, poly, s, view, y, hair, hi, mid) {
    const hy = v => v + y;
    if (s.kind === "mother") {
      poly([[13, hy(17)], [14, hy(9)], [18, hy(6)], [24, hy(6)], [27, hy(10)], [27, hy(20)], [25, hy(14)], [20, hy(12)], [15, hy(15)]], hair);
      r(26, hy(4), 6, 6, hair); r(27, hy(5), 2, 1, hi);
      if (view === "back") { poly([[13, hy(10)], [27, hy(10)], [27, hy(28)], [13, hy(28)]], hair); r(17, hy(12), 1, 12, mid); }
      else { r(13, hy(17), 2, 10, hair); r(26, hy(18), 1, 9, hair); }
      r(17, hy(8), 4, 1, mid); r(21, hy(7), 1, 6, "#d8d3c8");
      return;
    }
    if (s.kind === "longhair") {
      poly([[13, hy(18)], [14, hy(9)], [19, hy(6)], [25, hy(7)], [27, hy(12)], [27, hy(34)], [24, hy(30)], [25, hy(16)], [20, hy(12)], [16, hy(15)], [16, hy(34)], [13, hy(34)]], hair);
      r(16, hy(8), 5, 1, mid);
      return;
    }
    if (s.kind === "father") {
      poly([[13, hy(16)], [14, hy(9)], [18, hy(7)], [24, hy(7)], [27, hy(10)], [27, hy(17)], [25, hy(13)], [16, hy(13)]], hair);
      for (const [a, b] of [[15, 10], [19, 9], [23, 10], [25, 13], [14, 14]]) r(a, hy(b), 2, 1, "#9a9284");
      if (view === "back") poly([[13, hy(10)], [27, hy(10)], [27, hy(23)], [13, hy(23)]], hair);
      return;
    }
    // 周防: a messy black crop with a ragged fringe over the brows.
    if (view === "back") {
      poly([[12, hy(12)], [13, hy(7)], [16, hy(3)], [19, hy(5)], [21, hy(2)], [23, hy(5)], [26, hy(4)], [28, hy(12)], [28, hy(24)], [26, hy(27)], [23, hy(25)], [21, hy(27)], [18, hy(25)], [15, hy(27)], [12, hy(24)]], hair);
      for (const [a, b, w] of [[16, 8, 4], [21, 7, 3], [14, 13, 2], [24, 14, 2]]) r(a, hy(b), w, 1, mid);
      r(17, hy(24), 1, 2, hair); r(22, hy(25), 1, 2, hair);
      return;
    }
    if (view === "side") {
      poly([[11, hy(14)], [13, hy(7)], [16, hy(4)], [19, hy(5)], [21, hy(2)], [24, hy(5)], [27, hy(6)], [28, hy(10)], [29, hy(13)], [27, hy(15)], [25, hy(13)], [22, hy(15)], [19, hy(13)], [17, hy(20)], [15, hy(25)], [12, hy(23)]], hair);
      r(25, hy(14), 2, 2, hair); r(16, hy(7), 5, 1, mid); r(20, hy(6), 3, 1, hi);
      return;
    }
    poly([[11, hy(20)], [12, hy(11)], [13, hy(7)], [15, hy(6)], [16, hy(3)], [19, hy(5)], [21, hy(2)], [23, hy(5)], [26, hy(4)], [27, hy(8)], [29, hy(11)], [28, hy(20)], [26, hy(15)], [26, hy(18)], [24, hy(14)], [23, hy(17)], [21, hy(14)], [19, hy(18)], [17, hy(14)], [16, hy(17)], [14, hy(14)], [13, hy(18)]], hair);
    r(11, hy(9), 1, 2, hair); r(29, hy(13), 1, 2, hair);
    for (const [a, b, w] of [[15, 8, 4], [21, 7, 3], [17, 10, 2], [24, 10, 2]]) r(a, hy(b), w, 1, mid);
    r(18, hy(6), 3, 1, hi); r(23, hy(8), 1, 1, hi);
    r(12, hy(19), 1, 3, hair); r(27, hy(19), 1, 3, hair);
  },

  // A 1px outline in each neighbour's own darkened colour; an optional glow ring.
  outline(c, glow) {
    let image;
    try { image = c.getImageData(0, 0, this.W, this.H); } catch { return; }
    if (!image?.data) return;
    const d = image.data, W = this.W, H = this.H, out = new Uint8ClampedArray(d);
    const solid = i => d[i * 4 + 3] > 140;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (solid(i)) continue;
      let n = -1;
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && solid(ny * W + nx)) { n = ny * W + nx; break; }
      }
      if (n < 0) continue;
      out[i * 4] = d[n * 4] * 0.28; out[i * 4 + 1] = d[n * 4 + 1] * 0.28; out[i * 4 + 2] = d[n * 4 + 2] * 0.34; out[i * 4 + 3] = 235;
    }
    if (glow) {
      const g = parseInt(glow.slice(1, 7), 16), gr = (g >> 16) & 255, gg = (g >> 8) & 255, gb = g & 255;
      const base = new Uint8ClampedArray(out);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (base[i * 4 + 3] > 0) continue;
        if ([[0, 1], [1, 0], [-1, 0], [0, -1]].some(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < W && ny < H && base[(ny * W + nx) * 4 + 3] > 200; })) {
          out[i * 4] = gr; out[i * 4 + 1] = gg; out[i * 4 + 2] = gb; out[i * 4 + 3] = 150;
        }
      }
    }
    image.data.set(out);
    c.putImageData(image, 0, 0);
  },
};
