"use strict";

// A single body falls upward through the tower. Story progression stays in game.js.
const StormFlight = {
  x: 160,
  y: 112,
  time: 0,
  scroll: 0,
  stage: 0,
  pose: 0,
  shadow: 0,
  approach: 0,
  poseTarget: 0,
  shadowTarget: 0,
  approachTarget: 0,
  footsteps: [],
  stepTime: 0,
  stepIndex: 0,

  reset() {
    this.x = 160;
    this.y = 112;
    this.time = 0;
    this.scroll = 0;
    this.stage = 0;
    this.pose = 0;
    this.shadow = 0;
    this.approach = 0;
    this.poseTarget = 0;
    this.shadowTarget = 0;
    this.approachTarget = 0;
    this.footsteps = [];
    this.stepTime = 0;
    this.stepIndex = 0;
  },

  reach() {
    this.stage = Math.max(this.stage, 1);
    this.poseTarget = 1;
  },

  onLine(line) {
    const text = typeof line === "string" ? line : line?.t || "";
    if (text.includes("这双手似乎还想留住什么")) this.reach();
    if (text.includes("噔。噔。噔。")) {
      this.stage = Math.max(this.stage, 2);
      this.footsteps = [0, 0.3, 0.6];
      this.stepTime = 0;
      this.stepIndex = 0;
    }
    if (text.includes("向上看去")) {
      this.stage = Math.max(this.stage, 2);
      this.approachTarget = Math.max(this.approachTarget, 0.32);
    }
    if (text.includes("浑黑的身影")) {
      this.stage = Math.max(this.stage, 3);
      this.shadowTarget = 1;
      this.approachTarget = Math.max(this.approachTarget, 0.58);
    }
    if (text.includes("下一个奇点再见吧，无名的旅伴。")) {
      this.stage = 4;
      this.shadowTarget = 1;
      this.approachTarget = 1;
      this.poseTarget = 0.65;
    }
  },

  update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const still = Expedition.prefs.motion;
    if (!still) {
      this.time += dt;
      this.scroll += dt * (22 + this.approach * 10);
    }
    // Controls only change this screen-space body, never saved map coordinates.
    if (!dialogActive && this.stage < 4) {
      const held = key => keys.has(key) || touchKeys.has(key);
      const direction = Number(held("arrowright") || held("d")) - Number(held("arrowleft") || held("a"));
      this.x = Math.max(118, Math.min(202, this.x + direction * 40 * dt));
    }
    const poseRate = still ? 1 : 1 - Math.exp(-dt * 4.5);
    const viewRate = still ? 1 : 1 - Math.exp(-dt * 0.9);
    this.pose += (this.poseTarget - this.pose) * poseRate;
    this.shadow += (this.shadowTarget - this.shadow) * poseRate;
    this.approach += (this.approachTarget - this.approach) * viewRate;
    if (this.stage === 4) this.x += (160 - this.x) * viewRate;
    this.y = 112 - this.approach * 26;

    // Frame-driven scheduling means pause and reset also pause or discard footsteps.
    this.stepTime += dt;
    while (this.footsteps.length && this.stepTime >= this.footsteps[0]) {
      this.footsteps.shift();
      if (AudioEngine.enabled) Expedition.chime(118 - this.stepIndex * 8, 0.085);
      this.stepIndex += 1;
    }
  },

  render(_now) {
    const w = VIEW_W, h = VIEW_H;
    const travel = this.scroll;
    const near = this.approach;
    ctx.fillStyle = "#070a14";
    ctx.fillRect(0, 0, w, h);
    // The brighter sky remains above the body; no floor or tiled moon is drawn.
    for (let band = 0; band < 5; band++) {
      ctx.fillStyle = ["#10101c", "#0e0e1a", "#0b0d19", "#090c17", "#080b15"][band];
      ctx.fillRect(0, band * 20, w, 20);
    }

    const limb = (x1, y1, x2, y2, size, color) => {
      ctx.fillStyle = color;
      const distance = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1);
      const count = Math.ceil(distance / 2);
      for (let i = 0; i <= count; i++) {
        const amount = i / count;
        ctx.fillRect(Math.round(x1 + (x2 - x1) * amount - size / 2), Math.round(y1 + (y2 - y1) * amount - size / 2), size, size);
      }
    };

    // Two depths of window tiers pass downward, making upward travel readable.
    const towers = [
      { center: 44, width: 46, speed: 0.55, tint: "#0e1829", trim: "#1b2638", window: "#334158", spacing: 42 },
      { center: w - 44, width: 46, speed: 0.55, tint: "#0e1829", trim: "#1b2638", window: "#334158", spacing: 42 },
      { center: 90, width: 29, speed: 1, tint: "#0a1221", trim: "#253146", window: "#536177", spacing: 48 },
      { center: w - 90, width: 29, speed: 1, tint: "#0a1221", trim: "#253146", window: "#536177", spacing: 48 },
    ];
    for (const tower of towers) {
      const depthTravel = travel * tower.speed;
      const offset = depthTravel % tower.spacing;
      ctx.fillStyle = tower.tint;
      ctx.fillRect(tower.center - tower.width / 2, 0, tower.width, h);
      for (let y = -tower.spacing * 2 + offset; y < h + tower.spacing; y += tower.spacing) {
        const turn = (y - depthTravel) / 74;
        const shift = Math.sin(turn) * (tower.speed === 1 ? 13 : 8);
        const x = Math.round(tower.center + shift);
        const py = Math.round(y);
        ctx.fillStyle = tower.trim;
        ctx.fillRect(x - tower.width / 2 - 4, py, tower.width + 8, 2);
        ctx.fillStyle = "#050812";
        ctx.fillRect(x - 7, py + 7, 14, 15);
        ctx.fillStyle = tower.window;
        ctx.fillRect(x - 5, py + 9, 4, 9);
        ctx.fillRect(x + 1, py + 9, 4, 9);
        // Masonry, narrow arches and weathered joints preserve the scroll's
        // depth while giving each layer a material surface.
        ctx.fillStyle = '#344357'; ctx.fillRect(x - tower.width / 2 - 3, py + 2, tower.width + 6, 1);
        ctx.fillStyle = '#101a2a'; ctx.fillRect(x - tower.width / 2, py + 23, tower.width, 1);
        for (let brick = 0; brick < 4; brick++) {
          const bx = Math.round(x - tower.width / 2 + 3 + brick * 7);
          ctx.fillStyle = '#1a2638'; ctx.fillRect(bx, py + 25 + brick % 2 * 6, 1, 4);
          ctx.fillStyle = '#283449'; ctx.fillRect(bx + 1, py + 24 + brick % 2 * 6, 5, 1);
        }
        ctx.fillStyle = '#8290a0'; ctx.fillRect(x - 5, py + 9, 1, 8); ctx.fillRect(x + 1, py + 9, 1, 8);
        ctx.fillStyle = '#263344'; ctx.fillRect(x - 7, py + 22, 14, 1);
        ctx.fillStyle = '#1e293c'; ctx.fillRect(x - 5, py + 5, 10, 1); ctx.fillRect(x - 3, py + 4, 6, 1);
        // A sloping stair trace belongs to the tower, never a walkable ground.
        limb(x - tower.width / 2, py + 26, x + tower.width / 2, py + 35, 1, tower.trim);
      }
    }

    const mx = w / 2, my = 26, radius = 9 + near * 34;
    for (const [extra, alpha] of [[19, 0.045], [10, 0.08], [4, 0.12]]) {
      ctx.fillStyle = `rgba(173,47,48,${alpha})`;
      ctx.beginPath();
      ctx.arc(mx, my, radius + extra, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#ac4147";
    ctx.beginPath(); ctx.arc(mx, my, radius, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(37,18,31,0.4)";
    ctx.beginPath(); ctx.arc(mx + radius * 0.22, my - radius * 0.13, radius * 0.86, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(238,106,95,0.48)";
    ctx.fillRect(Math.round(mx - radius * 0.55), Math.round(my - radius * 0.35), Math.max(2, Math.round(radius * 0.14)), Math.max(2, Math.round(radius * 0.32)));

    PixelArt.moon(ctx, mx, my, radius);

    // Every drop descends, independent of the story's tower reveal.
    ctx.fillStyle = "rgba(120,153,194,0.42)";
    for (let i = 0; i < 72; i++) {
      const rx = (41 + i * 73) % w;
      const ry = ((i * 29 + this.time * (118 + i % 7 * 11)) % (h + 16)) - 8;
      ctx.fillRect(rx, Math.round(ry), 1, 5 + i % 3);
    }

    // The very same body darkens; there is no second randomly spawned figure.
    const px = Math.round(this.x), py = Math.round(this.y);
    const shade = (start, end) => {
      const a = parseInt(start.slice(1), 16), b = parseInt(end.slice(1), 16);
      const channels = [16, 8, 0].map(shift => Math.round(((a >> shift) & 255) * (1 - this.shadow) + ((b >> shift) & 255) * this.shadow));
      return `rgb(${channels.join(",")})`;
    };
    const outline = "#02040a";
    const coat = shade("#52627c", "#090b13");
    const edge = shade("#8492a7", "#232331");
    const skin = shade("#c0c1bf", "#10111b");
    const handY = py + 3 - this.pose * 30;
    const handSpread = 9 + this.pose * 3;
    // Raised hands are silhouetted against the sky, rather than a text-only cue.
    limb(px - 5, py - 7, px - handSpread, handY, 5, outline);
    limb(px + 5, py - 7, px + handSpread, handY, 5, outline);
    limb(px - 5, py - 7, px - handSpread, handY, 3, coat);
    limb(px + 5, py - 7, px + handSpread, handY, 3, coat);
    ctx.fillStyle = outline; ctx.fillRect(px - 6, py - 9, 12, 19);
    ctx.fillStyle = coat; ctx.fillRect(px - 4, py - 8, 8, 17);
    ctx.fillStyle = edge; ctx.fillRect(px - 4, py - 8, 1, 14);
    ctx.fillStyle = outline; ctx.fillRect(px - 5, py - 20, 10, 10);
    ctx.fillStyle = "#11131d"; ctx.fillRect(px - 4, py - 19, 8, 6);
    ctx.fillStyle = skin; ctx.fillRect(px - 3, py - 14, 6, 4);
    // Boots point downward while the surrounding tower slides past them.
    limb(px - 2, py + 8, px - 4, py + 22, 5, outline);
    limb(px + 2, py + 8, px + 4, py + 22, 5, outline);
    limb(px - 2, py + 8, px - 4, py + 19, 3, coat);
    limb(px + 2, py + 8, px + 4, py + 19, 3, coat);
    ctx.fillStyle = skin;
    for (const side of [-1, 1]) {
      const hx = Math.round(px + handSpread * side), hy = Math.round(handY);
      ctx.fillRect(hx - 2, hy - 3, 4, 4);
      if (this.pose > 0.6) {
        ctx.fillRect(hx - 2, hy - 5, 1, 3);
        ctx.fillRect(hx + 1, hy - 6, 1, 4);
      }
    }
  },
};
