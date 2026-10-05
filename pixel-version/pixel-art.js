"use strict";

// All art is drawn on integer pixels. Portraits are interpretations, not new
// claims about a disembodied voice's physical appearance.
const PixelArt = {
  init() {
    this.frame = document.getElementById("portraitFrame");
    this.canvas = document.getElementById("speakerPortrait");
    this.context = this.canvas.getContext("2d");
    this.context.imageSmoothingEnabled = false;
  },

  profile(line) {
    const speaker = line?.s;
    if (!speaker || ["故事状态", "旁白"].includes(speaker)) return null;
    const role = speaker === "周防" ? "zhou" : speaker === "父亲" ? "father" : speaker === "母亲" ? "mother" : speaker === "妹妹" ? "sister" : ["压抑", "无意识", "旅伴", "浑黑的身影"].includes(speaker) ? "shadow" : ["外来者", "背景"].includes(speaker) ? "intruder" : null;
    if (!role) return null;
    return { role, blood: role === "zhou" && G.area === "blood", young: ["house_empty", "house_family", "blood"].includes(G.area), tense: G.area === "blood" || !!line.rewrite, shouting: /拽入深渊|绝不可能/.test(line.t || ""), speaker };
  },

  onLine(line) {
    const profile = this.profile(line);
    this.frame.hidden = !profile || ui.dialog.dataset.presentation === "takeover";
    ui.dialog.classList.toggle("with-portrait", !this.frame.hidden);
    if (this.frame.hidden) return;
    this.frame.dataset.role = profile.role;
    this.canvas.setAttribute("aria-label", profile.role === "shadow" || profile.role === "intruder" ? profile.speaker + "的象征像" : profile.speaker + (profile.blood ? "，脸颊与衣服沾有血迹" : "的头像"));
    this.portrait(this.context, profile);
  },

  // Scanline rasterization avoids antialiased edges in the larger busts.
  polygon(c, points, color) {
    c.fillStyle = color;
    const low = Math.floor(Math.min(...points.map(p => p[1]))), high = Math.ceil(Math.max(...points.map(p => p[1])));
    for (let y = low; y < high; y++) {
      const intersections = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        if ((a[1] <= y + .5 && b[1] > y + .5) || (b[1] <= y + .5 && a[1] > y + .5)) intersections.push(a[0] + (y + .5 - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      intersections.sort((a, b) => a - b);
      for (let i = 0; i + 1 < intersections.length; i += 2) c.fillRect(Math.ceil(intersections[i]), y, Math.floor(intersections[i + 1]) - Math.ceil(intersections[i]) + 1, 1);
    }
  },

  portrait(c, p) {
    c.clearRect(0, 0, 64, 80);
    const r = (x, y, w, h, color) => { c.fillStyle = color; c.fillRect(x, y, w, h); };
    r(0, 0, 64, 80, "#10151e");
    for (let y = 2; y < 80; y += 3) for (let x = 2; x < 64; x += 3) if ((x + y) % 4) r(x, y, 1, 1, p.blood ? "#372029" : "#1c2733");
    r(4, 3, 1, 71, "#4e5157"); r(5, 3, 51, 1, "#4e5157"); r(58, 8, 1, 67, "#272e3b");
    if (["shadow", "intruder"].includes(p.role)) {
      this.polygon(c, [[9, 80], [12, 54], [19, 26], [25, 12], [42, 9], [50, 26], [53, 53], [60, 80]], "#171923");
      this.polygon(c, [[17, 60], [22, 25], [30, 17], [42, 21], [47, 54], [40, 68]], "#353540");
      this.polygon(c, [[22, 31], [30, 23], [41, 25], [46, 42], [39, 53], [27, 51]], "#0b0e18");
      const color = p.role === "intruder" ? "#c9676d" : "#7bb9ac";
      for (let i = 0; i < 8; i++) r(25 + i % 3 * 6, 27 + i * 3, 5, 1, i % 2 ? "#46414e" : color);
      r(19, 59, 4, 1, color); r(43, 68, 7, 1, color);
      // Fractured writing, rather than invented eyes, represents the outsider.
      if (p.role === "intruder") for (let i = 0; i < 7; i++) r(8 + i * 7, 20 + i % 3 * 15, 4, 2, "#984450");
      return;
    }
    const elder = p.role === "father" || p.role === "mother";
    const hair = p.role === "mother" ? "#463831" : p.role === "father" ? "#6a645e" : "#222530";
    const lightHair = p.role === "mother" ? "#796257" : elder ? "#a49784" : "#414756";
    this.polygon(c, [[7, 80], [9, 65], [20, 58], [25, 54], [42, 53], [50, 60], [58, 68], [62, 80]], "#131821");
    this.polygon(c, [[10, 80], [12, 66], [24, 58], [41, 57], [51, 63], [58, 80]], p.role === "mother" ? "#615750" : p.role === "father" ? "#515151" : "#3c526b");
    this.polygon(c, [[14, 68], [25, 62], [28, 80], [13, 80]], "#5b6c7d");
    this.polygon(c, [[40, 60], [49, 63], [56, 80], [39, 80]], "#26374d");
    r(29, 50, 12, 12, "#a97c69"); r(30, 51, 8, 9, "#c9977c");
    this.polygon(c, [[22, 23], [43, 21], [47, 34], [44, 49], [36, 56], [28, 54], [22, 45], [20, 32]], "#805b55");
    this.polygon(c, [[24, 22], [40, 23], [44, 31], [41, 46], [34, 53], [27, 49], [23, 38]], "#d5aa89");
    this.polygon(c, [[25, 27], [35, 23], [36, 35], [32, 44], [26, 44]], "#e5c29e");
    r(20, 33, 3, 8, "#ba8d73"); r(43, 32, 3, 8, "#ab7b6d");
    this.polygon(c, [[18, 31], [17, 21], [21, 11], [27, 8], [35, 11], [44, 9], [49, 19], [47, 33], [42, 28], [40, 21], [37, 27], [32, 23], [27, 31], [24, 25], [21, 35]], hair);
    for (const [x, y, w] of [[22, 17, 8], [29, 13, 6], [38, 15, 7], [20, 22, 3], [40, 21, 4], [26, 20, 4]]) r(x, y, w, 1, lightHair);
    r(24, p.tense ? 32 : 31, 6, 1, "#493633"); r(36, 31, 6, 1, "#493633");
    r(25, 34, 5, 2, "#e7d5bd"); r(36, 34, 5, 2, "#d9c6b0");
    r(28, 34, 2, 3, "#26313b"); r(37, 34, 2, 3, "#26313b"); r(28, 34, 1, 1, "#aab4ad");
    r(33, 36, 1, 6, "#ae806b"); r(34, 42, 3, 1, "#926357"); r(31, 47, 7, 1, "#945f5a"); r(32, 49, 5, 1, "#e0b598");
    if (p.tense && p.role === "zhou") { r(24, 31, 2, 1, "#493633"); r(26, 32, 4, 1, "#493633"); r(36, 32, 4, 1, "#493633"); r(40, 31, 2, 1, "#493633"); }
    if (p.shouting) { r(31, 46, 7, 4, "#57343b"); r(32, 46, 5, 1, "#e3ccb4"); r(32, 50, 5, 1, "#c58f7f"); }
    if (p.role === "zhou" && !p.young) { r(24, 39, 3, 1, "#c09278"); r(38, 39, 3, 1, "#c09278"); }
    if (elder) { r(24, 38, 5, 1, "#b88876"); r(38, 38, 4, 1, "#a97669"); r(23, 41, 2, 3, "#a67968"); }
    if (p.role === "father") for (let y = 44; y < 54; y += 2) for (let x = 25; x < 43 - (y - 44) / 2; x += 3) r(x, y, 1, 1, "#74716a");
    if (p.role === "mother") { r(44, 9, 7, 8, hair); r(45, 10, 4, 1, lightHair); r(29, 13, 1, 4, "#d7d1c1"); }
    r(25, 59, 4, 8, "#111b2a"); r(40, 57, 3, 11, "#111b2a"); r(32, 65, 1, 15, "#8b9ba5");
    for (const [x, y] of [[20, 72], [23, 69], [44, 72], [48, 77], [34, 72]]) r(x, y, 4, 1, "#708091");
    if (p.blood) {
      for (const [x, y, w, h] of [[39, 30, 4, 2], [41, 32, 2, 7], [25, 42, 2, 4], [19, 64, 7, 4], [24, 68, 3, 6], [44, 73, 6, 4], [39, 59, 2, 4]]) r(x, y, w, h, "#732438");
      r(41, 32, 1, 2, "#bb5a60"); r(21, 64, 3, 1, "#a64c53");
    }
  },

  moon(c, x, y, radius) {
    const r = Math.max(2, Math.round(radius));
    this.moons ||= new Map();
    if (!this.moons.has(r)) {
      const surface = document.createElement('canvas'); surface.width = surface.height = r * 2 + 3;
      const brush = surface.getContext('2d');
      const colors = ['#351d2c','#512735','#70313e','#8b3c45','#a84a4d','#c35d55','#da7a64'];
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const nx = dx / r, ny = dy / r;
        let light = 3.8 - nx * 1.4 - ny * 1.1;
        if ((nx - .28) ** 2 + (ny + .12) ** 2 < .58) light -= 1.9;
        for (const [cx,cy,size] of [[-.36,-.24,.15],[.1,.38,.2],[-.53,.3,.09],[.35,-.52,.1]]) {
          const d = Math.hypot(nx-cx,ny-cy); if(d < size) light += d < size * .7 ? -.7 : .45;
        }
        light += hash(dx + r, dy + r, 91) > .5 ? .35 : -.35;
        brush.fillStyle = colors[Math.max(0,Math.min(6,Math.round(light)))];
        brush.fillRect(dx+r+1,dy+r+1,1,1);
      }
      this.moons.set(r, surface);
    }
    c.drawImage(this.moons.get(r),Math.round(x-r-1),Math.round(y-r-1));
  },

  tile(c, ch, x, y, map) {
    const px = x * TILE, py = y * TILE, P = map.palette;
    const r = (dx, dy, w, h, color) => { c.fillStyle = color; c.fillRect(px + dx, py + dy, w, h); };
    if ([".", " ", "#", "|"].includes(ch)) {
      const color = ch === "#" ? P.wall : P.floor;
      for (let i = 0; i < 8; i++) r(Math.floor(hash(x, y, i + 41) * 16), Math.floor(hash(x, y, i + 73) * 13), 1 + i % 2, 1, shade(color, i % 2 ? 1.2 : .83));
    }
    if (ch === "#") {
      r(0, 6, 16, 1, shade(P.wall, .65)); r(0, 7, 16, 1, shade(P.wall, 1.17));
      r((y % 2) * 8 + 3, 0, 1, 6, shade(P.wall, .7)); r((y % 2) * 8 + 6, 8, 1, 5, shade(P.wall, .7));
      r(0, 13, 16, 1, shade(P.trim, 1.4)); r(0, 15, 16, 1, shade(P.wall, .6));
    } else if (ch === "|") { r(5, 3, 1, 10, shade(P.trim, 1.6)); r(10, 3, 1, 10, shade(P.trim, .7)); }
    else if (ch === "T") {
      for (const [a, b, w] of [[5, 2, 4], [3, 5, 3], [9, 4, 3], [6, 8, 4]]) { r(a, b, w, 1, shade(P.glow, .95)); r(a + 1, b + 1, 1, 1, shade(P.glow, 1.2)); }
      r(7, 11, 1, 4, shade(P.trim, 1.3)); r(4, 15, 8, 1, shade(P.floor, .65));
    } else if (ch === "*") { r(6, 5, 1, 1, "#f6ddb7"); r(8, 7, 1, 1, shade(P.glow, .6)); r(6, 12, 1, 1, shade(P.glow, .7)); }
    else if (["C", "f", "K"].includes(ch)) {
      for (const [a, b, w] of [[2, 10, 4], [9, 12, 5], [3, 4, 7]]) r(a, b, w, 1, "#8a6947");
      r(1, 14, 14, 1, "#32251d");
      if (ch === "C") { r(2, 2, 1, 11, "#97764b"); r(13, 2, 1, 11, "#302119"); r(7, 3, 1, 9, "#efcf88"); }
      if (ch === "K") { r(7, 7, 1, 6, "#483626"); r(3, 7, 2, 1, "#bdad88"); r(10, 7, 2, 1, "#bdad88"); }
    } else if (["m", "M"].includes(ch)) {
      r(2, 0, 1, 16, "#a4977b"); r(12, 0, 1, 16, "#252331"); r(4, 12, 8, 1, "#53697e");
      for (let i = 0; i < 7; i++) r(5 + i, 9 - i, 1, 1, "#c5d9e6");
      r(8, 8, 2, 3, "#778aa0"); r(7, 11, 4, 1, "#697b92");
    } else if (ch === "B") { r(9, 4, 1, 8, "#786378"); r(11, 5, 2, 1, "#645068"); r(9, 10, 3, 1, "#30283d"); r(2, 3, 5, 1, "#f0eadb"); }
    else if (ch === "F") { r(2, 7, 12, 1, "#917a62"); r(7, 8, 1, 5, "#3c302a"); r(2, 13, 12, 1, "#382c27"); }
    else if (ch === "W") { r(3, 2, 10, 1, "#eeece1"); r(4, 3, 3, 1, "#656b78"); r(11, 3, 1, 1, "#90bcb7"); r(5, 6, 1, 4, "#ece7dd"); r(7, 10, 3, 1, "#9ea8b1"); }
    else if (ch === "L") { r(5, 2, 6, 1, "#f9f5e7"); r(5, 10, 1, 2, "#f4efe3"); r(6, 12, 5, 1, "#b4b4b4"); }
    else if (ch === "b") { r(2, 4, 2, 1, "#863838"); r(6, 6, 3, 1, "#9c4a44"); r(10, 10, 2, 1, "#7f332b"); r(1, 12, 1, 1, "#5b2021"); }
    else if (ch === "O") this.moon(c, px + 8, py + 8, 6);
    else if (ch === "D") { r(3, 1, 1, 14, shade(P.trim, 1.8)); r(12, 1, 1, 14, shade(P.trim, .65)); r(10, 9, 1, 1, "#f0d393"); }
  },

  person(c, px, py, lowered, opt, pose) {
    // Detail stays inside the original pose transform and collision footprint.
    c.fillStyle = shade(opt.coat || "#3a4a6a", 1.25); c.fillRect(px + 3, py + 7 + lowered, 1, 4); c.fillRect(px + 6, py + 8 + lowered, 2, 1);
    c.fillStyle = shade(opt.coat || "#3a4a6a", .62); c.fillRect(px + 8, py + 7 + lowered, 1, 4); c.fillRect(px + 5, py + 7 + lowered, 1, 5);
    c.fillStyle = "#b2aa98"; c.fillRect(px + 5, py + 6 + lowered, 2, 1);
    if (!opt.hood) { c.fillStyle = shade(opt.hair || "#222222", 1.7); c.fillRect(px + 4, py + lowered, 2, 1); c.fillRect(px + 8, py + 1 + lowered, 1, 1); }
    if (opt.dir !== 3 && pose !== "mirror") { c.fillStyle = "#bb927e"; c.fillRect(px + 6, py + 4 + lowered, 1, 1); }
    if (!["kneel", "eat", "sit"].includes(pose)) { c.fillStyle = "#191e2b"; c.fillRect(px + 2, py + 13, 3, 1); c.fillRect(px + 7, py + 13, 3, 1); }
  },
};
