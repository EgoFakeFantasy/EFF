"use strict";

// One pixel illustration per ending, drawn from that ending's own text.
// Presentation only: the ending overlay, its text and its actions are unchanged.
const EndingArt = {
  W: 320,
  H: 96,
  scenes: {
    // "只有不断下沉的雨水……以及一只没有抓住任何东西的手。"
    bad_nophoto(c, t, k) {
      k.sky(["#06070d", "#0a0e18", "#0d1422", "#101a2a"]);
      k.rain(70, "#4d6787", t, 1);
      k.hand(160, 70, "#5b5c66", "#2d2f39", 0.3);
    },
    // A complete, written ending pressing down on the one it names.
    bad_accept(c, t, k) {
      k.sky(["#140306", "#1d050a", "#26070d", "#2f0a10"]);
      for (let i = 0; i < 7; i++) {
        const y = 8 + i * 9 + Math.round(Math.sin(t * 0.8 + i) * (k.still ? 0 : 1));
        c.fillStyle = i % 2 ? "#8c2c34" : "#b8434a"; c.fillRect(30 + i * 6, y, 260 - i * 12, 3);
        c.fillStyle = "#e9b8ad"; c.fillRect(34 + i * 6, y + 1, 30 + (i * 37) % 120, 1);
      }
      drawPerson(c, 154, 72, { coat: "#3a4a6a", pose: "bound", blood: true, heldHeart: false, dir: 0 });
    },
    // "陷入逃避而郁郁一生": a back turned, walking into a long dark corridor.
    bad_escape(c, t, k) {
      k.sky(["#08080c", "#0b0b11", "#0e0e16", "#11111a"]);
      for (let i = 0; i < 9; i++) { const w = 300 - i * 30, x = (320 - w) / 2, y = 6 + i * 5; c.fillStyle = i % 2 ? "#15151f" : "#1a1a26"; c.fillRect(x, y, w, 90 - i * 10); }
      c.fillStyle = "#050508"; c.fillRect(150, 30, 20, 32);
      const walk = k.still ? 0 : t;
      drawPerson(c, 154, 58, { coat: "#2c3446", hair: "#151821", dir: 3, walk: walk ? walk * 0.6 + 0.01 : 0 });
      c.fillStyle = "rgba(0,0,0,0.35)"; c.fillRect(158, 74, 4, 20);
    },
    // "能够回应他的……是高塔底部不断合拢的晦暗……落入那昏黄的大海，泯灭于高塔尽头的红月。"
    bad_twilight(c, t, k) {
      k.sky(["#1a0f12", "#2a1512", "#3d2015", "#5a3218"]);
      PixelArt.moon(c, 250, 20, 11);
      c.fillStyle = "#0e0b10"; c.fillRect(40, 0, 26, 64); c.fillRect(254, 32, 12, 32);
      k.sea(60, ["#6b4a2c", "#7d5833", "#8e683c", "#5a3c24"], t);
    },
    // "少年在熟悉的家中长大、老去……昏黄的海淹没了所有。"
    bad_family(c, t, k) {
      k.sky(["#2a1b10", "#3a2615", "#4a311a", "#5a3c20"]);
      c.fillStyle = "#1f150d"; c.fillRect(214, 10, 70, 44);
      c.fillStyle = "#d6a35a"; c.fillRect(218, 14, 62, 20);
      k.sea(34, ["#a5733c", "#b8844a", "#8d6232", "#a5733c"], t, 218, 62, 54);
      c.fillStyle = "#3a2a1a"; c.fillRect(214, 33, 70, 2); c.fillRect(248, 10, 2, 44);
      c.fillStyle = "#4a3522"; c.fillRect(40, 62, 160, 6); c.fillStyle = "#2a1e14"; c.fillRect(46, 68, 4, 26); c.fillRect(190, 68, 4, 26);
      for (const x of [70, 116, 162]) { c.fillStyle = "#bdb6a2"; c.fillRect(x - 6, 56, 13, 6); c.fillStyle = "#ece6cf"; c.fillRect(x - 5, 55, 11, 2); }
      for (const x of [56, 186]) { c.fillStyle = "#2c2016"; c.fillRect(x, 50, 3, 30); c.fillRect(x - 6, 76, 15, 3); }
      c.fillStyle = "rgba(230,170,90,0.12)"; c.fillRect(0, 0, 320, 96);
    },
    // "那副身体走完了被他者决定的故事。"
    bad_owned(c, t, k) {
      k.sky(["#120610", "#1a0914", "#220c19", "#2a0f1e"]);
      const sway = k.still ? 0 : Math.round(Math.sin(t * 1.4) * 2);
      for (const [hx, hy] of [[-4, -1], [14, -1], [2, 14], [8, 14], [6, -10]]) k.line(150 + hx + sway * 2, 0, 154 + hx + sway, 58 + hy, "#b98393");
      drawPerson(c, 148 + sway, 58, { coat: "#3d3546", hair: "#18131c", skin: "#9c8d93", pose: "bound", dir: 0 });
      c.fillStyle = "#6e3c4e"; c.fillRect(120, 2, 80, 3);
    },
    // "雨水沿着裂隙流向塔底。那只试图留住什么的手，没能留下完整的回归契机。"
    bad_rain(c, t, k) {
      k.sky(["#1b1418", "#2a1c1c", "#3b261f", "#4e3222"]);
      PixelArt.moon(c, 270, 18, 9);
      k.sea(70, ["#6b4a2c", "#7d5833", "#8e683c", "#5a3c24"], t);
      k.hand(160, 58, "#c9a88d", "#7a5d4b", 0.6);
      for (let i = 0; i < 4; i++) {
        const y = (k.still ? 40 + i * 6 : (t * 30 + i * 21) % 40 + 50);
        c.fillStyle = "rgba(240,210,120,0.5)"; c.fillRect(150 + i * 6, Math.round(y), 2, 3);
      }
    },
    // "他再度踏上了对更高层次礁石的新征途。"
    normal(c, t, k) {
      k.sky(["#0b0f1c", "#101629", "#151d36", "#1b2542"]);
      for (let i = 0; i < 5; i++) { const x = 40 + i * 56, y = 80 - i * 12; c.fillStyle = "#273149"; c.fillRect(x, y, 46, 96 - y); c.fillStyle = "#3d4a68"; c.fillRect(x, y, 46, 2); }
      PixelArt.crystal(c, 270, 26, 16);
      const climb = k.still ? 0 : (t * 0.15) % 1;
      drawPerson(c, 58 + Math.round(climb * 40), 64 - Math.round(climb * 12), { coat: "#3a4a6a", dir: 2, walk: k.still ? 0 : t + 0.01 });
      k.stars(t);
    },
    // "不如，就叫做无垠之萍吧。" / "手心里仍然留下了一滴。"
    true(c, t, k) {
      k.sky(["#0c1220", "#121b2e", "#1a263c", "#22314a"]);
      k.stars(t);
      c.fillStyle = "#1d3346"; c.fillRect(0, 62, 320, 34);
      for (let i = 0; i < 26; i++) {
        const x = Math.floor(hash(i, 3, 70) * 320), y = 64 + Math.floor(hash(i, 4, 70) * 30);
        const drift = k.still ? 0 : Math.round(Math.sin(t * 0.5 + i) * 2);
        c.fillStyle = i % 3 ? "#5f8a5a" : "#86b07a"; c.fillRect(x + drift, y, 4, 2); c.fillRect(x + drift + 1, y - 1, 2, 1);
      }
      for (let y = 66; y < 96; y += 6) { c.fillStyle = "#2a4760"; c.fillRect(0, y, 320, 1); }
      k.hand(160, 46, "#d8b89b", "#8f6c58", 1);
      const glow = k.still ? 0.5 : 0.4 + Math.sin(t * 2) * 0.15;
      c.fillStyle = `rgba(240,226,160,${glow})`; c.fillRect(154, 34, 12, 12);
      c.fillStyle = "#f6edc2"; c.fillRect(158, 37, 4, 6); c.fillRect(159, 36, 2, 1); c.fillStyle = "#ffffff"; c.fillRect(159, 38, 1, 2);
    },
  },

  init() {
    this.canvas = document.getElementById("endingArt");
    this.context = this.canvas?.getContext("2d");
    if (this.context) this.context.imageSmoothingEnabled = false;
  },

  kit(c, t) {
    const still = Expedition.prefs.motion;
    return {
      still,
      sky: colors => colors.forEach((col, i) => { c.fillStyle = col; c.fillRect(0, i * 24, 320, 24); }),
      line: (x0, y0, x1, y1, col) => Cutscenes.line(c, x0, y0, x1, y1, col),
      rain: (n, col, time, speed) => { c.fillStyle = col; for (let i = 0; i < n; i++) { const x = (i * 53) % 320, y = still ? (i * 29) % 96 : ((i * 29 + time * 90 * speed) % 110) - 8; c.fillRect(x, Math.round(y), 1, 4); } },
      sea: (top, cols, time, x0 = 0, w = 320, bottom = 96) => {
        for (let y = top; y < bottom; y += 3) {
          c.fillStyle = cols[((y - top) / 3) % cols.length]; c.fillRect(x0, y, w, 3);
          const shift = still ? 0 : Math.round(Math.sin(time * 0.8 + y) * 6);
          c.fillStyle = "rgba(255,220,160,0.12)"; for (let x = x0 + ((y * 7) % 23); x < x0 + w; x += 23) c.fillRect(x + shift, y, 6, 1);
        }
      },
      // An open palm seen from above; `cup` raises the fingers to hold something.
      hand: (x, y, skin, shadow, cup) => {
        const p = (pts, col) => PixelArt.polygon(c, pts.map(([a, b]) => [x + a, y + b]), col);
        p([[-14, 0], [14, 0], [16, 12], [8, 22], [-8, 22], [-16, 12]], shadow);
        p([[-13, 0], [13, 0], [14, 11], [7, 20], [-7, 20], [-14, 11]], skin);
        for (let f = 0; f < 4; f++) { const fx = -12 + f * 7, lift = Math.round(cup * (f === 0 || f === 3 ? 6 : 9)); c.fillStyle = skin; c.fillRect(x + fx, y - lift, 5, lift + 2); c.fillStyle = shadow; c.fillRect(x + fx + 4, y - lift, 1, lift + 2); }
        c.fillStyle = skin; c.fillRect(x + 14, y + 4, 6, 4); c.fillStyle = shadow; c.fillRect(x + 4, y + 8, 6, 1);
      },
      stars: time => { for (let i = 0; i < 30; i++) { const x = Math.floor(hash(i, 1, 71) * 320), y = Math.floor(hash(i, 2, 71) * 50); const on = still || hash(i, Math.floor(time * 2), 72) > 0.2; if (on) { c.fillStyle = i % 4 ? "#7f8ca8" : "#d8dcef"; c.fillRect(x, y, 1, 1); } } },
    };
  },

  render(now) {
    if (!this.context || ui.ending.hidden || !endingId) return false;
    const scene = this.scenes[endingId];
    this.canvas.hidden = !scene;
    if (!scene) return false;
    const c = this.context, t = Expedition.prefs.motion ? 0 : now / 1000;
    c.clearRect(0, 0, this.W, this.H);
    scene(c, t, this.kit(c, t));
    this.drawn = endingId;
    return true;
  },
};
