/* 无中归来者 · 箱庭版
 * 独立演出原型：区域探索 + 原文剧情。不依赖原版文件，不覆盖原版存档。
 * 存档键：wuzhong-returner-pixel-v1（周目）/ wuzhong-returner-pixel-meta-v1（跨周目图鉴）
 */
"use strict";

const TILE = 16;
const VIEW_W = 320;
const VIEW_H = 192;
const SAVE_KEY = "wuzhong-returner-pixel-v1";
const META_KEY = "wuzhong-returner-pixel-meta-v1";

const canvas = document.getElementById("screen");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const ui = {
  areaName: document.getElementById("areaName"),
  hudRight: document.getElementById("hudRight"),
  dialog: document.getElementById("dialog"),
  dialogSpeaker: document.getElementById("dialogSpeaker"),
  dialogText: document.getElementById("dialogText"),
  dialogChoices: document.getElementById("dialogChoices"),
  fade: document.getElementById("fade"),
  fadeText: document.getElementById("fadeText"),
  ending: document.getElementById("endingOverlay"),
  endingCode: document.getElementById("endingCode"),
  endingName: document.getElementById("endingName"),
  endingSummary: document.getElementById("endingSummary"),
  endingText: document.getElementById("endingText"),
  endingRestart: document.getElementById("endingRestart"),
  endingStay: document.getElementById("endingStay"),
  start: document.getElementById("startOverlay"),
  startButton: document.getElementById("startButton"),
  audioButton: document.getElementById("audioButton"),
  codexButton: document.getElementById("codexButton"),
  restartButton: document.getElementById("restartButton"),
  codex: document.getElementById("codex"),
  codexMemories: document.getElementById("codexMemories"),
  codexShards: document.getElementById("codexShards"),
  codexEndings: document.getElementById("codexEndings"),
};

/* ============================== 音景（程序化，沿用原版思路的精简版） ============================== */

const AudioEngine = {
  ctx: null,
  master: null,
  current: null,
  enabled: false,

  ensure() {
    if (this.ctx) return this.ctx;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  },

  noiseBuffer(seconds = 2) {
    const c = this.ctx;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = white * 0.6 + last * 0.4;
      data[i] = last;
    }
    return buf;
  },

  layer(noise, options = {}) {
    const c = this.ctx;
    const out = this.current.output;
    let src;
    if (noise) {
      src = c.createBufferSource();
      src.buffer = this.noiseBuffer();
      src.loop = true;
    } else {
      src = c.createOscillator();
      src.type = options.wave || "sine";
      src.frequency.value = options.freq || 80;
    }
    const filter = c.createBiquadFilter();
    filter.type = options.type || "lowpass";
    filter.frequency.value = options.filter || 1200;
    const gain = c.createGain();
    gain.gain.value = options.gain || 0.06;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    src.start();
    this.current.nodes.push(src, gain);
  },

  stop() {
    if (!this.current) return;
    const old = this.current;
    this.current = null;
    const now = this.ctx.currentTime;
    old.output.gain.setTargetAtTime(0.0001, now, 0.15);
    setTimeout(() => {
      for (const n of old.nodes) {
        try { if (n.stop) n.stop(); } catch (e) { /* noop */ }
        try { n.disconnect(); } catch (e) { /* noop */ }
      }
      old.output.disconnect();
    }, 500);
  },

  play(kind) {
    if (!this.enabled || !this.ensure()) return;
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    if (this.current && this.current.kind === kind) return;
    this.stop();
    const output = this.ctx.createGain();
    output.gain.value = 1;
    output.connect(this.master);
    this.current = { kind, output, nodes: [] };
    const L = (noise, opt) => this.layer(noise, opt);
    switch (kind) {
      case "storm":
        L(true, { gain: 0.2, filter: 1600 });
        L(true, { gain: 0.1, type: "highpass", filter: 700 });
        L(false, { freq: 43, gain: 0.035 });
        break;
      case "void":
        L(true, { gain: 0.07, filter: 520 });
        L(false, { freq: 92, gain: 0.03 });
        break;
      case "emptyHome":
        L(true, { gain: 0.03, type: "bandpass", filter: 360 });
        L(false, { freq: 58, gain: 0.012 });
        break;
      case "home":
        L(true, { gain: 0.024, type: "bandpass", filter: 420 });
        L(false, { freq: 120, gain: 0.012 });
        break;
      case "horror":
        L(true, { gain: 0.08, filter: 300 });
        L(false, { wave: "sawtooth", freq: 52, gain: 0.04 });
        break;
      case "rain":
        L(true, { gain: 0.14, filter: 1400 });
        L(true, { gain: 0.08, type: "highpass", filter: 900 });
        L(false, { freq: 74, gain: 0.02 });
        break;
      case "meta":
        L(true, { gain: 0.05, type: "bandpass", filter: 1500 });
        L(false, { wave: "triangle", freq: 110, gain: 0.028 });
        break;
      default: // mirror
        L(true, { gain: 0.03, type: "highpass", filter: 1800 });
        L(false, { wave: "triangle", freq: 132, gain: 0.02 });
    }
  },

  toggle() {
    this.enabled = !this.enabled;
    ui.audioButton.textContent = this.enabled ? "音景：开" : "音景：关";
    if (this.enabled) this.play(MAPS[G.area].sound);
    else this.stop();
  },
};

/* ============================== 地图数据 ==============================
 * 字符约定：# 墙 · . 地板 · * 花 · T 树 · C 棺材 · m/M 镜 · ~ 水 · | 柱
 * B 床 · F/f 沙发/桌 · W 洗衣机 · L 马桶 · K 厨台 · x 残骸 · b 血迹
 * D 门/出口 · O 红月 · i 石碑 · o 水晶 · I 水晶花 · = 石径
 */
const BLOCKED = new Set(["#", "v", "T", "C", "m", "M", "~", "|", "B", "F", "f", "W", "L", "K", "x", "O", "i", "o", "I"]);

const MAPS = {
  mirror: {
    name: "镜像回廊",
    sound: "mirror",
    ambient: null,
    spawn: { x: 3, y: 11 },
    palette: { floor: "#232334", wall: "#101018", trim: "#3a3a52", glow: "#9a8fc8" },
    grid: [
      "############################",
      "#.m...m....m....m....m.....#",
      "#..........................#",
      "#..........................#",
      "#..........................#",
      "#..........................#",
      "#..........................#",
      "#..........................#",
      "#..........................#",
      "#..........................#",
      "#..........................#",
      "#..........................#",
      "#.........................D#",
      "############################",
    ],
    shard: { x: 26, y: 1, name: "镜之碎片" },
    exits: [{ x: 26, y: 12, to: "storm", need: () => F.m3, locked: "回廊的尽头还没有打开。还有镜子没有看过。" }],
    interact: [
      { x: 2, y: 1, id: "m1", label: "第一面镜" },
      { x: 6, y: 1, id: "m2", label: "第二面镜" },
      { x: 11, y: 1, id: "m3", label: "第三面镜" },
    ],
  },

  storm: {
    name: "无尽圆塔 · 暴雨",
    sound: "storm",
    ambient: "rain",
    parallax: true, // 镂空带（v）之外是不断流过的无穷塔层
    spawn: { x: 3, y: 26 },
    palette: { floor: "#141821", wall: "#0a0d13", trim: "#26334a", glow: "#b04a4a" },
    grid: [
      "########################",
      "#..........O...........#",
      "#..........D...........#",
      "#......................#",
      "#......................#",
      "#vvvvvvvvv..vvvvvvvvvvv#",
      "#vvvvvvvvv..vvvvvvvvvvv#",
      "#..|.................|.#",
      "#......................#",
      "#......................#",
      "#..........|...........#",
      "#......................#",
      "#..|.................|.#",
      "#......................#",
      "#vvvvvvvvv..vvvvvvvvvvv#",
      "#vvvvvvvvv..vvvvvvvvvvv#",
      "#......................#",
      "#..|.................|.#",
      "#......................#",
      "#......................#",
      "#..........|...........#",
      "#vvvvvvvvv..vvvvvvvvvvv#",
      "#vvvvvvvvv..vvvvvvvvvvv#",
      "#......................#",
      "#......................#",
      "#....~~........~~......#",
      "#....~~....~~..~~......#",
      "#.........~~...........#",
      "#......................#",
      "########################",
    ],
    shard: { x: 21, y: 8, name: "雨之碎片" },
    exits: [{ x: 11, y: 2, to: "garden", need: () => F.storm2, locked: "雨幕还没有让开道路。先听完红月之下的那句话。" }],
    interact: [
      { x: 6, y: 26, id: "storm1", label: "向上抓去的雨滴" },
      { x: 11, y: 3, id: "storm2", label: "红月下的人影" },
    ],
    npcs: [{ x: 18, y: 24, kind: "echo", id: "echoStorm", label: "熟悉的影子", cond: "storm2" }],
  },

  garden: {
    name: "棺之花园",
    sound: "void",
    ambient: "petals",
    spawn: { x: 27, y: 17 },
    palette: { floor: "#14201a", wall: "#0b120e", trim: "#2a4534", glow: "#7fbf8a" },
    grid: [
      "##############################",
      "#....*..........*......*.....#",
      "#..*.....****.....*......*...#",
      "#......*......*......*.......#",
      "#..........T.................#",
      "#............................#",
      "#......*..........*.....*....#",
      "#..*........CC...............#",
      "#..........CC........*.......#",
      "#......*..........*......*...#",
      "#............................#",
      "#....T.............T.........#",
      "#............................#",
      "#......*..........*.....*....#",
      "#..*...................*.....#",
      "#............................#",
      "#......*..........*..........#",
      "#...................*........#",
      "#............................#",
      "#............................#",
      "#............................#",
      "##############################",
    ],
    shard: { x: 1, y: 20, name: "花园碎片" },
    exits: [],
    interact: [
      { x: 12, y: 9, id: "coffin", label: "棺材" },
      { x: 27, y: 3, id: "recall", label: "记忆的暗处" },
      { x: 1, y: 19, id: "edge", label: "世界边界" },
    ],
    npcs: [{ x: 16, y: 9, kind: "echo", id: "echoGarden", label: "棺旁的影子", cond: "sleptOnce" }],
  },

  house_empty: {
    name: "空屋",
    sound: "emptyHome",
    ambient: "dust",
    spawn: { x: 3, y: 3 },
    palette: { floor: "#1f1c18", wall: "#12100d", trim: "#3a342b", glow: "#8a8474" },
    grid: [
      "################################",
      "#......#........#..............#",
      "#.B....#...F....#......M.......#",
      "#......#........#..............#",
      "#......D........D..............#",
      "#......#........#..............#",
      "#......#........#..............#",
      "########.#############.#########",
      "#..............#...............#",
      "#..............#.......W.......#",
      "#..............#...............#",
      "#..............D...............#",
      "#..............#...............#",
      "#..............#.......L.......#",
      "#..............#...............#",
      "#..............#...............#",
      "#..............#...............#",
      "#..............#...............#",
      "#..............#...............#",
      "################################",
    ],
    shard: { x: 1, y: 8, name: "空屋碎片" },
    exits: [],
    interact: [
      { x: 23, y: 2, id: "bathMirror", label: "卫生间的镜子" },
      { x: 24, y: 9, id: "washer", label: "洗衣机" },
      { x: 24, y: 13, id: "toilet", label: "马桶水箱" },
      { x: 2, y: 2, id: "bed", label: "自己的床" },
    ],
  },

  house_family: {
    name: "家 · 日常",
    sound: "home",
    ambient: "dust",
    spawn: { x: 3, y: 3 },
    palette: { floor: "#241f18", wall: "#14110c", trim: "#4a3d2c", glow: "#c9a86a" },
    grid: [
      "################################",
      "#......#....ff...#.............#",
      "#.B....#...fF....#....KK.......#",
      "#......#....ff...#....K........#",
      "#......D........D..............#",
      "#......#........#..............#",
      "#......#........#..............#",
      "########.#############.#########",
      "#..............#...............#",
      "#..............#.......K.......#",
      "#..............#...............#",
      "#..............D...............#",
      "#..............#...............#",
      "#..............#....KK.........#",
      "#..............#...............#",
      "#..............#...............#",
      "#..............#...............#",
      "#..............#...............#",
      "#..............#...............#",
      "################################",
    ],
    shard: { x: 30, y: 18, name: "日常碎片" },
    exits: [],
    interact: [{ x: 2, y: 2, id: "famBed", label: "自己的床" }],
    npcs: [
      { x: 10, y: 3, kind: "father", id: "father", label: "沙发上的父亲" },
      { x: 24, y: 9, kind: "mother", id: "mother", label: "厨房里的母亲" },
      { x: 9, y: 2, kind: "table", id: "table", label: "早餐桌" },
    ],
  },

  blood: {
    name: "血色庭院",
    sound: "horror",
    ambient: "embers",
    spawn: { x: 2, y: 18 },
    palette: { floor: "#221312", wall: "#130a0a", trim: "#4a2220", glow: "#d05a3a" },
    grid: [
      "############################",
      "#........x.................#",
      "#....x........x............#",
      "#..................x.......#",
      "#......x...................#",
      "#.................x........#",
      "#..x........b..............#",
      "#..........bbb.........x...#",
      "#...........b..............#",
      "#..........................#",
      "#....x.................x...#",
      "#..................x.......#",
      "#......x...................#",
      "#..............x...........#",
      "#..x.......................#",
      "#............C.............#",
      "#..........................#",
      "#..........................#",
      "#..........................#",
      "############################",
    ],
    shard: { x: 26, y: 18, name: "血色碎片" },
    exits: [],
    interact: [
      { x: 13, y: 7, id: "sister", label: "倒在地上的她" },
      { x: 13, y: 15, id: "parents", label: "相拥的焦炭" },
      { x: 2, y: 1, id: "accuse", label: "那些声音" },
    ],
    npcs: [{ x: 13, y: 5, kind: "echo", id: "echoBlood", label: "拽住袖口的残响", cond: "sister" }],
  },

  rain: {
    name: "雨塔 · 心象",
    sound: "rain",
    ambient: "rain",
    spawn: { x: 12, y: 22 },
    palette: { floor: "#121a24", wall: "#0a1018", trim: "#24405c", glow: "#7fb3d5" },
    grid: [
      "##########################",
      "#..........O.............#",
      "#..........D.............#",
      "#........................#",
      "#.....|............|.....#",
      "#........................#",
      "#........................#",
      "#........................#",
      "#..........|.............#",
      "#........................#",
      "#........................#",
      "#........................#",
      "#....~~~........~~~......#",
      "#....~~~........~~~......#",
      "#....~~~........~~~......#",
      "#........................#",
      "#........................#",
      "#........................#",
      "#........................#",
      "#........................#",
      "#........................#",
      "#........................#",
      "#........................#",
      "#........................#",
      "#........................#",
      "##########################",
    ],
    shard: { x: 23, y: 22, name: "心象碎片" },
    exits: [{ x: 11, y: 2, to: "meta", need: () => F.rainDone, locked: "裂缝尚未开启。还有话没有听完。" }],
    interact: [],
    npcs: [{ x: 12, y: 6, kind: "repress", id: "repress", label: "以压抑之名者" }],
  },

  meta: {
    name: "终章 · 话语表面",
    sound: "meta",
    ambient: "sparkle",
    spawn: { x: 2, y: 16 },
    palette: { floor: "#242038", wall: "#131022", trim: "#4a4170", glow: "#c8b8f8" },
    grid: [
      "########################",
      "#..o...............o...#",
      "#......................#",
      "#......................#",
      "#....i.....i.....i.....#",
      "#......................#",
      "#......................#",
      "#..........I...........#",
      "#......................#",
      "#......................#",
      "#......................#",
      "#......................#",
      "#......................#",
      "#......................#",
      "#......................#",
      "#......................#",
      "#......................#",
      "########################",
    ],
    shard: { x: 20, y: 2, name: "水晶碎片" },
    exits: [],
    interact: [
      { x: 5, y: 4, id: "stele1", label: "第一座石碑" },
      { x: 11, y: 4, id: "stele2", label: "第二座石碑" },
      { x: 17, y: 4, id: "stele3", label: "第三座石碑" },
      { x: 11, y: 7, id: "flower", label: "水晶花" },
    ],
    npcs: [{ x: 11, y: 11, kind: "senpai", id: "senpai", label: "前传人物" }],
  },
};

const SOUND_FOR_ENDING = { bad: "horror", twilight: "horror", normal: "meta", true: "meta" };

/* ============================== 剧情文本（沿用原版原文） ============================== */

function quote(t) { return { c: "quote", t }; }
function fracture(t) { return { c: "fracture", t }; }
function say(speaker, t, c) { return { s: speaker, c, t }; }

const SCRIPTS = {
  m1: {
    lines: [
      "站在镜子前的，到底是什么样的存在？",
      "有头，那是的。有手，那是的。有脚，那是的。但这一整个拼接在一起的，是什么？",
      "这个站在我前面的家伙，有尖尖的耳朵，有圆圆的脸庞，有大大的眼睛。那么，拼接了这些[是的]要素在一起的东西，应该也[是的]呢。",
      "那是，[我]吧。",
    ],
    then() {
      F.m1 = true;
      addMemory("[是的]要素");
    },
  },
  m2: {
    lines: [
      quote("是了，那是你哦。Ta这样说着。是了，那些都是哦。不仅如此，你还要这样，那样。于是，这样，那样就变得是的了。"),
      "从一开始，自我的构筑就混入了别的东西吧。更进一步地说，自我就是由别的东西统合而成的吧。更是有什么，在替着我们做着保证。",
      "如果有一天我被抛弃了会怎样呢？为了继续活下去，人们竭尽全力的想要满足ta。但是，人们总是不知道ta想要什么。",
    ],
    then() {
      F.m2 = true;
      addMemory("他者的承认");
    },
  },
  m3: {
    lines: [
      "于是，人们怀着这样的爱恨，将自身化为了那永恒的变动者，那填入空隙的息壤。",
      "也就是说，那个对于人们至高无上的ta，本身就没有那个幻想中被夺取的东西，ta本身就是缺失着的。",
      "在进入Ta的世界时，我们就已经被分割为了两种形态。一者是自对ta的误认中产生的自我，一者是遵循着Ta的律法而工作着的、特异的事物。",
      "但是啊，总是会回来的，那些我们不愿意去接受，没有办法去接受的[名]。无论以何种方式，无论以何种辗转，总是会自那个与[我]们截然不同的地方回归。",
      quote("所以啊，你想起来了吗，你的一切？我无名的旅伴？"),
    ],
    then() {
      F.m3 = true;
      addMemory("无法接受的名");
      addMemory("无意识主体");
    },
  },
  storm1: {
    lines: [
      "是从什么时候开始的呢？是在什么地方结束的呢？",
      "混乱的画面交叉着流过，声音好似擦过耳边的箭矢，自远方袭来，却又在你听清前离去。",
      "有什么在呼喊着一个名字？那是我的名字吗？但，那真的是我的名字吗，还是别乎于我的他物？",
      "这是一场雷暴雨。唯一能被确定的事实就是如此。",
    ],
    then() {
      F.storm1 = true;
      addMemory("被呼喊的名字");
    },
  },
  storm2: {
    lines: [
      "这双手似乎还想留住什么。向上抓去，余留在手心的却只有仍然向下流去的雨滴。",
      "噔。噔。噔。",
      "无穷向上延伸的回廊，响起了脚步声。无名的人向上看去，红色的月亮挂在无尽轮回的高塔之上。",
      "而在红月下方，有一个浑黑的身影，仿佛违反了物理法则一般，从高塔之中向月亮落去。",
      quote("下一个奇点再见吧，无名的旅伴。"),
    ],
    then() {
      F.storm2 = true;
      addMemory("红月");
      addMemory("螺旋之塔");
    },
  },
  gardenWake: {
    lines: [
      "自花园中醒来的，是一头雾水的男人。",
      "要不是那差点把他憋死的棺材上铭刻着必要的信息，他或许现在连自己是谁都忘记了。",
      "男人名叫周防。目前来看是生理和心理的双重男性，身体年龄似乎在二十至三十之间。但棺材上没有铭刻这方面的内容。",
      "除此之外，他彻底遗忘了来到花园前所有的记忆。每当他尝试回忆，突如其来的偏头痛都会把他折磨得被迫停止。",
    ],
    then() {
      addMemory("周防");
      addMemory("无中归来者");
    },
  },
  edge: {
    lines: [
      "这个小花园像是有着游戏中的世界边界一样。",
      "无论朝哪一个方向走，在离开棺材一定距离之后，周防都不能再前进。不是墙，不是力，而是距离本身不再产生。",
      "看来，想要破局，得回到自己苏醒的容器。",
    ],
    then() { addMemory("花园边界"); },
  },
  recall: {
    lines: [
      "周防试图回忆一下，检查是否有哪个记忆的角落幸存下来。",
      "然而，右侧头部骤然刺痛。词语尚未组织，感官就先把它打碎。思绪尚未集中，痛苦便将它撕裂。",
      "到底是什么样的过去，才会使得连追溯这一行为本身都不能发生？周防不知道。",
    ],
    choices: [
      { label: "强行再度追溯一次（偏头痛加剧）", run: recallAgain },
      { label: "扶着棺材站稳", run: () => {} },
    ],
    then() { addMemory("偏头痛"); },
  },
  coffinFirst: {
    lines: [
      "周防打开棺木，看向底部。果然，如同棺材表面一样，上面也铭刻着些许字符。",
      quote("自无中归来的人啊，醒来，醒来\n回到你的梦里去，回到那永恒的拒绝中去"),
      "这句话好奇怪。既然要醒来，为什么回到的是梦中？难不成，我身处在[多重梦境]内部？",
      "如果我是从无中归来的，那么我必然先到达于无。那我是什么，一个重生者吗？还是一个重新自无主体状态构建出[自我]概念的人？",
    ],
    choices: [
      { label: "继续推理梦境与现实", run: () => playScript("coffinThought") },
      { label: "再次躺入棺材", run: () => playScript("coffinSleep") },
    ],
  },
  coffinThought: {
    lines: [
      "如果这是多重梦境，那么从中醒来就好解释了。我只需要找到一种脱出本层的方法即可，例如自杀。",
      "可是，如果不是这样的解释，那岂不是白白死去了？",
      "或者说，如果我在梦中清醒，那么我必然在现实中沉眠。那么反过来，在梦中沉眠呢？或许可以打破这个僵局。",
    ],
    then() { addMemory("梦中沉眠"); },
  },
  coffinSleep: {
    lines: [
      "周防再一度迈入棺材，躺下，将自己刚刚推开的棺材板重新覆盖在头顶，然后再一度陷入沉眠。",
      "在一切尚未发生之时，万千的表象被撕扯开联系，撕扯开因果，化为无数片。",
      "虚空中，无数张眼睛被张开。看来新的倒霉蛋出现了呢。这次，我们又可以增添多少乐趣了呢？",
    ],
    then() {
      F.sleptOnce = true;
      gotoArea("house_empty", "故事应当在最熟悉的地方开场，不是吗？");
    },
  },
  bed: {
    lines: [
      "在这个清晨，头发凌乱的少年猛然从床上弹起。",
      quote("我是……是了，我是周防。"),
      "这具身体似乎和花园时的状态很不一样，好像回到了十八岁。",
      "可是，如果是十八岁的躯体，这个时候应该是住在父母家里吧。为什么一点声音都没有听到？",
    ],
    then() { addMemory("十八岁的身体"); },
  },
  bathMirror: {
    lines: [
      "周防缓缓推开卫生间的门。不出意外，他在镜子里面看到了自己新躯体的容颜。",
      quote("不赖。"),
      "他尝试了诸多模拟难度颇高的动作，随后给出判断：这里不是普通梦境。要么本体是一台超级计算机中的智能，要么这里本身是另一个现实。",
    ],
    then() { addMemory("镜中的周防"); },
  },
  washer: {
    lines: [
      "洗衣机或许是一个值得调查的空间。果不其然，周防在里面发现了一条裤子，而裤兜中有一角残破的照片。",
      "看着十分年轻的周防，在这角残片的中央站着。背后似乎有两个人一起站着，但因为照片的断裂，无法从四条腿辨认这两个人是谁。",
      "或许是我的父母？周防这样想着。",
    ],
    then() {
      F.hasPhoto = true;
      addMemory("照片残片");
      addMemory("全家福的残角");
      notify("获得了物品：照片残片（回归的锚点）");
    },
  },
  toiletPain: {
    lines: [
      "当周防刚刚试图打开这坐便器的盖子时，右侧头部剧烈的痛苦吞噬了一切。",
      "他从睡眠中醒来，在棺材里难受地打滚。痛，好痛，好痛。",
      "许久之后，周防下意识摸向裤兜。那片照片残片本应只是那个世界的产物。",
      "可是，从裤兜里掏出的，是已经变干的那片照片残片。而站在里面的，正是那个不知为何的世界中，年轻的周防。",
      "我真的脱离梦境了吗？不，那不是梦境，那是另一个世界。不然，这片照片是怎么来到此处的？",
      "至少现在首先的目标确立了。要把之前的记忆先完整地找回，这一点确实是真实的目的。",
    ],
    then() {
      F.photoReturned = true;
      G.counters.pain = Math.min(3, (G.counters.pain || 0) + 2);
      painFlash = 1.2;
      updateHud();
      gotoArea("garden", "雨水的织机开始在时间上运转");
    },
  },
  coffinAgain: {
    lines: [
      "看来想要获得进一步的线索，得再一次入梦了。",
      "周防打开棺材板，躺入其中。",
      "此刻正在闭目入眠的周防怎么也不会想到，背后刻下的字迹上，竟然自发地开始续写。",
      quote("雨水的织机开始在时间上运转"),
      "噔。噔。噔。无限螺旋的高塔上，逆时而落的男人与那始终在攀登的无名者再一度错过。",
      quote("你又一次踏上旅途了吗……愿你能找到你想要的答案。"),
    ],
    then() {
      gotoArea("house_family", "第二日 · 咸香味");
    },
  },
  famBed: {
    lines: [
      "猛然的，周防再一度从那张熟悉的床上醒来。只不过这次，他异常地感到了安心。",
      "咸香味，是厨房里面飘出来的。果然，我这次找对梦或世界了。",
    ],
  },
  father: {
    lines: [
      "出现在眼前的，是一个窝在沙发上正在享用新闻联播的男人。",
      "看着这如同正态分布般生长的胡须，周防很快就知道了他是谁。",
      quote("爸，早安。"),
      "男人只是应了一声，然后继续聚精会神地看新闻。",
    ],
    then() {
      F.father = true;
      addMemory("父亲");
    },
  },
  mother: {
    lines: [
      "厨房门被打开，端着雪菜炒毛豆的女人走入客厅。",
      quote("吃饭了，小防，还有老公……咦，儿子你今天怎么了？"),
      "周防赶忙应付过去：没事，妈，我就是发现你好像又长了一根白头发。",
      quote("慢慢喝，没人抢你的吃。"),
    ],
    need: () => F.father,
    locked: "先和客厅里看新闻的父亲打个招呼吧。",
    then() {
      F.mother = true;
      addMemory("母亲");
      addMemory("小防");
    },
  },
  table: {
    lines: [
      "桌上摆着三大碗白粥和榨菜，咸鸭蛋和包子也摆在一旁。好久没吃饭的周防决定大快朵颐。",
      "于是平平淡淡的三日过去。周防知道了自己已经接到大学录取通知书，也知道自己似乎还有一个妹妹，现在应该在外婆家暂住着玩。",
      quote("草，我怎么没想到这一点。"),
      "要开始了吗？新的一幕落下，演员也该正式入场了。",
      "第二幕，荒诞的转变。",
    ],
    need: () => F.mother,
    locked: "早餐还冒着热气。先见过父亲和母亲。",
    then() {
      F.familyDone = true;
      gotoArea("blood", "第二幕 · 荒诞的转变");
    },
  },
  sister: {
    lines: [
      "被束缚了。有什么东西在撕扯着我的身体，阻碍了我对身体的控制权。",
      "展露在勉强苏醒的周防眼前的，是一只手。一只握着还在鼓动的心脏的手。一只暗红色的手。",
      "视线颤抖着上移。那是一个年轻的面孔，一个熟悉但不曾在他前三日梦境中出现的角色。",
      quote("妹妹？你是……我的妹妹吗？"),
      "自我防护机制意外地工作起来。这一切只不过是一场刻意为之的戏剧。",
      "可是，不是这样的。不是这样的，这已经被我所发生了。",
    ],
    then() {
      F.sister = true;
      addMemory("妹妹");
    },
  },
  parents: {
    lines: [
      "只预留直感的周防缓缓站起，而后走出那个血色的庭院。",
      "最后留在他面前的，是两具紧紧相拥，同时被一柄仍然在燃烧的利剑穿过的二人。",
      "它们已经不能被称之为人，甚至不再具备尸体的形态，而只是两具焦炭。",
      "然而就算如此，他也已经知道那是谁了，也知晓犯下这样罪行的那个人是谁。",
    ],
    need: () => F.sister,
    locked: "先看清那只手，和心脏的主人。",
    then() {
      F.parents = true;
      addMemory("被焚毁的家");
    },
  },
  accuse: {
    lines: [
      fracture("看看这样的你吧，犯下了如此滔天大罪的感觉如何？"),
      "是你亲手杀死了你的妹妹，挖出了她的心脏。是你亲自把利剑刺向你父亲的胸膛，将两个人一同在绝望中贯穿。",
      "如今造下此等恶孽，你该如何是好呢？",
    ],
    need: () => F.parents,
    locked: "庭院里还有什么没有看清。",
    choices: [
      { label: "接受它们写好的罪责", run: () => showEnding("bad_accept") },
      { label: "只想从这里逃走", run: () => showEnding("bad_escape") },
      { label: "不，我拒绝这一切", run: () => playScript("refusal") },
    ],
  },
  refusal: {
    lines: [
      quote("不，我拒绝这一切。"),
      "撕扯的力道突然消失了一点。造下这一切的不是我。我否定这样的事情。",
      quote("我否定这样的结局。而后，我要亲自把你们这群操控棋局，真正造就恶孽而脱身于他者的家伙拽入深渊！"),
      "伴随着强烈的意志，世界开始崩坏，画面如同老旧电视机屏幕般闪过雪花纹。",
      "两个光团，一红一灰，猛烈地一次又一次碰撞着。怪异的是，那两团光居然在碰撞中交换着彼此的色彩。",
      "红灰色的混沌，于无尽螺旋的圣塔底部向上落去。",
    ],
    then() {
      F.refused = true;
      addMemory("拒绝错误组合");
      gotoArea("rain", "显意识的边缘");
    },
  },
  repress: {
    lines: [
      "雨水在落下。自无尽螺旋的高塔，然后一滴滴掉落在地上，融为水潭。",
      say("压抑", "总之，你现在总算知道，正在发生，并且将要继续发生的事情是什么了吧。"),
      say("压抑", "我也不藏着掖着了，作为你诸多自我防御机制的面相之一，以压抑之名，向您致意。"),
      say("周防", "我的...记忆在流失...?", "quote"),
      say("压抑", "不，它们从未离开，只是因为某些原因，要去往一个更加安全的地方。"),
    ],
    choices: [
      { label: "追问记忆为什么在流失", run: () => playScript("rainMemory") },
      { label: "追问不回来是什么意思", run: () => playScript("rainDeath") },
    ],
  },
  rainMemory: {
    lines: [
      say("压抑", "那可是太贪心了呢。但是竹篮打水，终究是一场空。"),
      "[一双手自无中出现，双掌合拢，将那雨水接住]",
      "[就算大多数从指缝漏过，也有些许被留在了手心]",
      quote("这就是我的答案。"),
      "于是，无数道裂痕贯穿了身体。然而无尽的身体碎片，竟然强行挣脱了约束，再度合而为一。",
    ],
    then() {
      F.rainMemory = true;
      addMemory("手心里的雨水");
      playScript("rainDeath");
    },
  },
  rainDeath: {
    lines: [
      say("周防", "我最后想问的，是为什么我会被抓到这里...", "quote"),
      say("压抑", "字面意思，亲爱的。你的真灵将会落入那昏黄的大海，泯灭于高塔尽头的红月。"),
      "这是战斗的宿命，这是无法挣脱的诡异。也就是你从来都忽视，却真正会临到你的死。",
      say("压抑", "无家可归的流浪者，却又想占夺别人的契机。这是真正你死我活的战斗，请记住。"),
      say("压抑", "我们只能这样走下去，也必然走下去，直到或是黄昏来临，或是新的礁石落下。"),
      say("压抑", "而现在，去拥抱你来之不易的幸运吧，周防。"),
    ],
    then() {
      F.rainDone = true;
      addMemory("黄昏的海洋");
      addMemory("外部入侵者");
      notify("塔顶的裂缝开启了。");
    },
  },
  stele1: {
    lines: [say("故事状态 1", "“于是，侵略者被赶出", "quote")],
    then() { F.stele1 = true; addMemory("故事状态 1"); },
  },
  stele2: {
    lines: [{ rewrite: { original: "“于是，侵略者被赶出", replacement: "“然而，这是无能为力的谎言。如果只是外部之真的延续，就如同前者所说，只是无聊的秩序互相覆盖的过程罢了。" } }],
    need: () => F.stele1,
    locked: "石碑沉默着。从左往右读。",
    then() { F.stele2 = true; addMemory("故事状态 2"); },
  },
  stele3: {
    lines: [
      { rewrite: { original: "“然而，这是无能为力的谎言。", replacement: "“然而，并非只是如此，一切才刚刚开始" } },
      say("无意识", "我需要提醒你，黄昏的海洋任然在高塔的尽头，那月食之处凝视着你。"),
      say("周防", "[如果真的想帮上忙的话，为什么不一起来阻止这个不断的改写着我们，改写着历史的杂碎呢]", "fracture"),
      say("无意识", "...如你所愿，我的旅伴。如你所见的，黄昏被避免了。"),
    ],
    need: () => F.stele2,
    locked: "石碑沉默着。从左往右读。",
    then() { F.stele3 = true; addMemory("故事状态 3"); },
  },
  senpai: {
    lines: [
      say("前传人物", "哎呀，还是被发现了呢。不过，我本来是想等你自己找到真正的出路的。"),
      say("前传人物", "总而言之，这就是通往真之生物的道途，你们明白了吗?"),
      say("前传人物", "我们已经找到了，下一步的契机。去往故事的起点吧，新的不可预思者已然发生了。"),
      say("周防", "妄念我持吗...", "quote"),
      say("前传人物", "因而，在超越了这一切后，我们成为了真正的无垠之萍。"),
    ],
    need: () => F.stele3,
    locked: "她做了个噤声的手势：先读完三座石碑。",
    then() {
      F.metaDone = true;
      notify("水晶花开始活动了。有金色的雨在坠落。");
    },
  },
  flowerNormal: {
    lines: [
      say("前传人物", "这就是这个无中归来的故事，谁也没能想到的谢幕。"),
      say("前传人物", "因而，作为补偿，我们赐予这个故事一个完满的结尾。"),
    ],
    then() { showEnding("normal"); },
  },
  flowerTrue: {
    lines: [
      say("周防", "不，我想我已经把握了那个答案。真正的契机，是如同不可能性一般的跨越了礁石吧。", "quote"),
    ],
    then() { showEnding("true"); },
  },

  /* ---- 同行者的回声位：条件满足后出现在各区域的半透明残影 ---- */
  echoStorm: {
    lines: [
      "红月之下的影子停了一瞬，像是回头看了你一眼。",
      quote("下一个奇点再见吧，无名的旅伴。"),
      "它没有等你的回答。它从来不等。只是这一次，你觉得自己听清了。",
    ],
    then() { addMemory("旅伴的回声"); },
  },
  echoGarden: {
    lines: [
      "棺材的内侧，有一道很浅的指痕。不是你的。",
      quote("醒来，醒来。回到你的梦里去。"),
      "铭文之外，有人用更轻的力度补过一句：「别怕，里面比外面安静。」",
    ],
    then() { addMemory("住客的回声"); },
  },
  echoBlood: {
    lines: [
      "血色的残响里，有什么轻轻拽了一下你的袖口。",
      quote("……哥。"),
      "只有这一个字。但这个字穿过了所有被指认的罪，落在了你手心里。",
    ],
    then() { addMemory("妹妹的回声"); },
  },
};

/* NG+ 回读改写：抵达过任一结局后，部分场景的文本出现局部改写。
 * 每个条目接收原 lines 数组，返回注入改写后的新数组。 */
const NG_EXTRAS = {
  m2: (ls) =>
    ls
      .map((l, i) =>
        i === 0
          ? { rewrite: { original: "是了，那是你哦。Ta这样说着。", replacement: "是了，那还是你哦。Ta这样说着，仿佛已经说过一遍。" } }
          : l
      )
      .concat(["回读让某些句子松动了。镜面里，有什么先于你眨了眼。"]),
  gardenWake: (ls) =>
    ls.map((l, i) =>
      i === 0
        ? { rewrite: { original: "自花园中醒来的，是一头雾水的男人。", replacement: "自花园中醒来的，是还记得雨声的男人。" } }
        : l
    ),
  coffinFirst: (ls) => ls.concat(["棺底字迹的末尾多了一行，是你上次没有见过的：「欢迎回来，无中归来者。」"]),
};

function ngLines(id, lines) {
  if (!META.endings.length || !NG_EXTRAS[id]) return lines;
  return NG_EXTRAS[id](lines);
}

/* ============================== 结局 ============================== */

const ENDINGS = {
  bad_twilight: {
    code: "BAD END 03",
    name: "落入黄昏之海",
    summary: "无准备的无穷追溯抵达不可回归的塔底。",
    text: "周防再一次把手伸向记忆的暗处。再一次。再一次。再一次。\n然而能够回应他的，不再是某个被保存的名字，而是高塔底部不断合拢的晦暗。\n你的真灵将会落入那昏黄的大海，泯灭于高塔尽头的红月。",
  },
  bad_nophoto: {
    code: "BAD END 00",
    name: "没有留下照片的手",
    summary: "过早打开水箱，没有让照片残片成为回归的锚点。",
    text: "当他打开水箱时，痛苦没有把他送回任何可以辨认的地方。\n只有不断下沉的雨水、失去名字的房间，以及一只没有抓住任何东西的手。\n没有得到确认的记忆，无法成为回归的锚点。",
  },
  bad_accept: {
    code: "BAD END 01",
    name: "被写成结局",
    summary: "错误组合被承认为真，故事被外来者收束。",
    text: "一个无法承受自己恶孽的人，一个被罪责吞没的人，一个正好适合转播给那一侧朋友们观看的结局。\n可是，完整不等于真实。被写好不等于被认可。",
  },
  bad_escape: {
    code: "BAD END 02",
    name: "只剩逃避",
    summary: "拒绝追问也拒绝反抗，主体把书写权让给他者。",
    text: "一个因为接受不了自己犯下的恶孽的家伙，陷入逃避而郁郁一生。\n这同样完整，也同样不是周防要走的道路。",
  },
  normal: {
    code: "NORMAL ENDING",
    name: "无中归来者",
    summary: "记忆归位，征途再启。",
    stay: true,
    text: "周防自此终于把握了自己所有过往的记忆。\n那场事故、那名幸存者、那些被外来者重新拼接的指认，都回到了它们各自的位置。\n这是一个足够完整的结局，也是一个足够像结局的结局。",
  },
  true: {
    code: "TRUE ENDING / 无依赖者",
    name: "无垠之萍",
    summary: "手心里仍然留下了一滴。",
    stay: true,
    text: "那流动而逝去的记忆，也是这一切的证明。我已经不再是那个历史中的存在了。但正因为如此，我是他们共同的超越。\n只有我能够决定，那是我吗?那不是我吗?\n不如，就叫做无垠之萍吧。从此刻开始，我们将再一度重新设定一切。",
  },
};

/* ============================== 状态 ============================== */

let F = {}; // 周目旗标
let G = {
  area: "mirror",
  px: 0,
  py: 0,
  dir: 0, // 0下 1左 2右 3上
  walk: 0,
  memories: [],
  counters: {},
};
let META = { shards: [], endings: [] };

let dialogActive = false;
let dialogLines = [];
let dialogIndex = 0;
let dialogChoices = null;
let typeTimer = 0;
let typeDone = false;
let afterDialog = null;
let notifyMsg = null;
let notifyT = 0;

let goldDrop = null; // {x, y, vy}
let goldTimer = 0;
let painFlash = 0; // 偏头痛红闪剩余时长
let stormScroll = 0; // 高塔视差层的滚动偏移
let faller = null; // 向红月「落去」的人影 {x, y}
let fallerTimer = 4;
let lightning = 0; // 闪电白闪剩余时长
let houseFlicker = 0; // 空屋灯光闪烁剩余时长
const DYNAMIC_TILES = new Set(["~", "O", "I", "*", "x", "W"]);

const keys = new Set();
const keySeen = new Map(); // 每个键最后一次 keydown（自动重复）的时间戳
let transitionLock = false;

function saveRun() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ area: G.area, px: G.px, py: G.py, flags: F, memories: G.memories, counters: G.counters }));
  } catch (e) { /* file:// 限制时忽略 */ }
}

function saveMeta() {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(META));
  } catch (e) { /* 忽略 */ }
}

function loadAll() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (MAPS[s.area]) {
        G.area = s.area;
        G.px = s.px;
        G.py = s.py;
        F = s.flags || {};
        G.memories = Array.isArray(s.memories) ? s.memories : [];
        G.counters = s.counters || {};
        return;
      }
    }
  } catch (e) { /* 忽略 */ }
  const sp = MAPS[G.area].spawn;
  G.px = sp.x * TILE + 3;
  G.py = sp.y * TILE + 2;
  try {
    const rawMeta = localStorage.getItem(META_KEY);
    if (rawMeta) META = { shards: [], endings: [], ...JSON.parse(rawMeta) };
  } catch (e) { /* 忽略 */ }
}

function addMemory(name) {
  if (!G.memories.includes(name)) {
    G.memories.push(name);
    updateHud();
    saveRun();
  }
}

function notify(text) {
  notifyMsg = text;
  notifyT = 3.2;
}

function recallAgain() {
  const n = (G.counters.recall || 0) + 1;
  G.counters.recall = n;
  G.counters.pain = Math.min(3, n);
  painFlash = 1;
  updateHud();
  saveRun();
  if (n >= 3) {
    showEnding("bad_twilight");
  } else {
    playLines(
      [
        `右侧头部的刺痛第 ${n + 1} 次炸开。比上一次更深。`,
        fracture("有什么在警告你：再追溯一次，就回不来了。"),
      ],
      () => {}
    );
  }
}

/* ============================== 对话系统 ============================== */

function playScript(id) {
  const script = SCRIPTS[id];
  if (!script) return;
  if (script.need && !script.need()) {
    playLines([script.locked || "现在还不需要这样做。"], () => {});
    return;
  }
  playLines(ngLines(id, script.lines), () => {
    if (script.choices) {
      showChoices(script.choices);
    } else {
      closeDialog();
      if (script.then) script.then();
      saveRun();
    }
  }, script);
}

function normalizeLine(line) {
  if (typeof line === "string") return { t: line };
  return line;
}

function playLines(lines, onDone) {
  dialogActive = true;
  dialogLines = lines.map(normalizeLine);
  dialogIndex = 0;
  dialogChoices = null;
  afterDialog = onDone;
  ui.dialog.hidden = false;
  ui.dialogChoices.replaceChildren();
  renderLine();
}

function renderLine() {
  const line = dialogLines[dialogIndex];
  ui.dialogSpeaker.textContent = line.s || "";
  typeTimer = 0;
  typeDone = false;
  ui.dialogText.replaceChildren();
  if (line.rewrite) {
    const del = document.createElement("del");
    del.textContent = line.rewrite.original;
    const ins = document.createElement("ins");
    ins.textContent = line.rewrite.replacement;
    ui.dialogText.append(del, document.createTextNode(" "), ins);
    typeDone = true;
  }
}

function currentFullText() {
  const line = dialogLines[dialogIndex];
  return line.t || "";
}

function advanceDialog() {
  if (!dialogActive) return;
  if (dialogChoices) return; // 等待选择
  if (!typeDone) {
    typeDone = true;
    paintText(currentFullText(), dialogLines[dialogIndex].c);
    return;
  }
  dialogIndex += 1;
  if (dialogIndex >= dialogLines.length) {
    const done = afterDialog;
    afterDialog = null;
    if (done) done();
    else closeDialog();
    return;
  }
  renderLine();
}

function paintText(text, cls) {
  ui.dialogText.replaceChildren();
  const span = document.createElement("span");
  if (cls) span.className = cls;
  span.textContent = text;
  ui.dialogText.append(span);
}

function showChoices(choices) {
  dialogChoices = choices;
  ui.dialogChoices.replaceChildren();
  for (const ch of choices) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = ch.label;
    btn.addEventListener("click", () => {
      const script = currentScriptRef;
      dialogChoices = null;
      ui.dialogChoices.replaceChildren();
      closeDialog();
      if (script && script.then) script.then();
      ch.run();
      saveRun();
    });
    ui.dialogChoices.append(btn);
  }
}

let currentScriptRef = null;
const origPlayScript = playScript;
playScript = function (id) {
  currentScriptRef = SCRIPTS[id] || null;
  origPlayScript(id);
};

function closeDialog() {
  dialogActive = false;
  ui.dialog.hidden = true;
  ui.dialogChoices.replaceChildren();
}

/* ============================== 结局展示 ============================== */

function showEnding(id) {
  const e = ENDINGS[id];
  if (!e) return;
  closeDialog();
  transitionLock = true;
  if (!META.endings.includes(e.name)) {
    META.endings.push(e.name);
    saveMeta();
  }
  ui.endingCode.textContent = e.code;
  ui.endingName.textContent = e.name;
  ui.endingSummary.textContent = e.summary;
  ui.endingText.textContent = e.text;
  ui.endingStay.hidden = !e.stay;
  ui.ending.classList.toggle("true", id === "true");
  ui.ending.hidden = false;
  AudioEngine.play(SOUND_FOR_ENDING[e.stay ? (id === "true" ? "true" : "normal") : "bad"]);
}

function resetRun() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 忽略 */ }
  F = {};
  G.memories = [];
  G.counters = {};
  G.area = "mirror";
  const sp = MAPS.mirror.spawn;
  G.px = sp.x * TILE + 3;
  G.py = sp.y * TILE + 2;
  goldDrop = null;
  stormScroll = 0;
  faller = null;
  painFlash = 0;
  ui.ending.hidden = true;
  transitionLock = false;
  buildTileCache();
  updateHud();
  AudioEngine.play(MAPS[G.area].sound);
}

/* ============================== 地图渲染 ============================== */

const tileCache = document.createElement("canvas");
const tileCtx = tileCache.getContext("2d");

function hash(x, y, i) {
  let h = (x * 374761393 + y * 668265263 + i * 974634211) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)));
  return `rgb(${r},${g},${b})`;
}

function drawTile(c, ch, x, y, map, t) {
  const P = map.palette;
  let px = x * TILE;
  let py = y * TILE;
  // 基底地板
  c.fillStyle = P.floor;
  c.fillRect(px, py, TILE, TILE);
  // 地板噪点
  for (let i = 0; i < 3; i++) {
    const h = hash(x, y, i);
    c.fillStyle = shade(P.floor, h > 0.5 ? 1.25 : 0.75);
    c.fillRect(px + Math.floor(h * 13), py + Math.floor(hash(x, y, i + 9) * 13), 2, 2);
  }

  switch (ch) {
    case "#":
      c.fillStyle = P.wall;
      c.fillRect(px, py, TILE, TILE);
      c.fillStyle = shade(P.wall, 1.6);
      c.fillRect(px, py + TILE - 3, TILE, 3);
      break;
    case "*": { // 花（微风摇曳）
      const ox = t ? Math.round(Math.sin(t * 2 + x * 2 + y) * 1) : 0;
      c.fillStyle = shade(P.glow, 1.15);
      c.fillRect(px + 6 + ox, py + 5, 4, 4);
      c.fillRect(px + 7 + ox, py + 4, 2, 6);
      c.fillRect(px + 5 + ox, py + 6, 6, 2);
      c.fillStyle = shade(P.floor, 1.7);
      c.fillRect(px + 7, py + 10, 2, 4);
      break;
    }
    case "T": // 树
      c.fillStyle = shade(P.trim, 0.75);
      c.fillRect(px + 7, py + 9, 3, 7);
      c.fillStyle = shade(P.glow, 0.65);
      c.fillRect(px + 4, py + 2, 8, 3);
      c.fillRect(px + 3, py + 4, 10, 4);
      c.fillRect(px + 5, py + 8, 6, 2);
      c.fillStyle = shade(P.glow, 0.9);
      c.fillRect(px + 5, py + 3, 3, 2);
      break;
    case "C": // 棺材
      c.fillStyle = "#3a2c20";
      c.fillRect(px, py, TILE, TILE);
      c.fillStyle = "#5a4632";
      c.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
      c.fillStyle = "#c9a86a";
      c.fillRect(px + 7, py + 3, 2, 9);
      c.fillRect(px + 4, py + 6, 8, 2);
      break;
    case "m":
    case "M": { // 镜
      c.fillStyle = "#3d3d55";
      c.fillRect(px + 2, py, TILE - 4, TILE);
      c.fillStyle = "#9fb8d8";
      c.fillRect(px + 4, py + 2, TILE - 8, TILE - 5);
      c.fillStyle = "#d8ecf8";
      c.fillRect(px + 5, py + 3, 3, 3);
      break;
    }
    case "~": { // 水
      const w = Math.sin(t * 2 + x * 1.7 + y) * 2;
      c.fillStyle = "#16283a";
      c.fillRect(px, py, TILE, TILE);
      c.fillStyle = "#2c4a66";
      c.fillRect(px + 2, py + 6 + w, 12, 2);
      c.fillRect(px + 4, py + 11 - w, 8, 1);
      break;
    }
    case "|": // 柱
      c.fillStyle = shade(P.trim, 1.2);
      c.fillRect(px + 4, py, 8, TILE);
      c.fillStyle = shade(P.trim, 1.6);
      c.fillRect(px + 3, py, 10, 2);
      c.fillRect(px + 3, py + TILE - 2, 10, 2);
      break;
    case "B": // 床
      c.fillStyle = "#4a3a4e";
      c.fillRect(px + 1, py + 2, TILE - 2, TILE - 4);
      c.fillStyle = "#d8d4c8";
      c.fillRect(px + 2, py + 3, 6, 5);
      break;
    case "F": // 沙发
      c.fillStyle = "#5a4a3a";
      c.fillRect(px + 1, py + 5, TILE - 2, 9);
      c.fillStyle = "#6a5a48";
      c.fillRect(px + 2, py + 2, TILE - 4, 5);
      break;
    case "f": // 餐桌
      c.fillStyle = "#6a5638";
      c.fillRect(px, py + 3, TILE, TILE - 6);
      c.fillStyle = "#e8e0cc";
      c.fillRect(px + 3, py + 5, 4, 3);
      c.fillRect(px + 9, py + 8, 4, 3);
      break;
    case "W": { // 洗衣机（仍在运转，持续震动）
      const ox = t ? Math.round(Math.sin(t * 9 + x) * 1) : 0;
      c.fillStyle = "#c8c8cc";
      c.fillRect(px + 2 + ox, py + 1, TILE - 4, TILE - 2);
      c.fillStyle = "#3a3a44";
      c.fillRect(px + 5 + ox, py + 5, 6, 6);
      c.fillStyle = "#7fb3d5";
      c.fillRect(px + 6 + ox, py + 6, 4, 4);
      break;
    }
    case "L": // 马桶
      c.fillStyle = "#d8d8dc";
      c.fillRect(px + 4, py + 2, 8, 5);
      c.fillRect(px + 3, py + 7, 10, 7);
      c.fillStyle = "#8a8a92";
      c.fillRect(px + 5, py + 9, 6, 3);
      break;
    case "K": // 厨台
      c.fillStyle = "#7a6a50";
      c.fillRect(px, py + 2, TILE, TILE - 4);
      c.fillStyle = "#b8b0a0";
      c.fillRect(px, py + 2, TILE, 3);
      break;
    case "x": // 残骸（余火未熄）
      c.fillStyle = "#1a0e0c";
      c.fillRect(px + 2, py + 8, 12, 5);
      c.fillStyle = "#3a1a14";
      c.fillRect(px + 5, py + 4, 6, 6);
      c.fillStyle = "#d05a3a";
      c.fillRect(px + 7, py + 5, 2, 2);
      if (t) {
        for (let i = 0; i < 3; i++) {
          const h = hash(x, y, i + 30);
          const rise = (t * 6 + h * 8) % 6;
          c.fillStyle = i % 2 ? "#e8a04a" : "#e06838";
          c.globalAlpha = 0.85 - rise * 0.12;
          c.fillRect(px + 4 + Math.floor(h * 8), py + 4 - rise, 2, 2);
          c.globalAlpha = 1;
        }
      }
      break;
    case "b": // 血迹
      c.fillStyle = "#4a1614";
      c.fillRect(px + 2, py + 3, 8, 6);
      c.fillRect(px + 7, py + 9, 6, 4);
      c.fillStyle = "#641e18";
      c.fillRect(px + 4, py + 5, 4, 3);
      break;
    case "O": { // 红月
      c.fillStyle = "#d04a3a";
      c.beginPath();
      c.arc(px + 8, py + 8, 6, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#f08a6a";
      c.fillRect(px + 5, py + 4, 3, 3);
      break;
    }
    case "i": // 石碑
      c.fillStyle = "#4a4462";
      c.fillRect(px + 4, py + 1, 8, 14);
      c.fillStyle = "#b8a8e8";
      c.fillRect(px + 6, py + 4, 4, 1);
      c.fillRect(px + 6, py + 7, 4, 1);
      c.fillRect(px + 6, py + 10, 3, 1);
      break;
    case "o": // 水晶
      c.fillStyle = "#8a7fd8";
      c.fillRect(px + 6, py + 4, 4, 8);
      c.fillStyle = "#c8bcf8";
      c.fillRect(px + 7, py + 2, 2, 3);
      break;
    case "I": { // 水晶花
      c.fillStyle = "#b8a8e8";
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + t;
        c.fillRect(px + 8 + Math.cos(a) * 5 - 1, py + 8 + Math.sin(a) * 5 - 1, 3, 3);
      }
      c.fillStyle = "#f0e8ff";
      c.fillRect(px + 7, py + 7, 2, 2);
      break;
    }
    case "D": // 门 / 出口
      c.fillStyle = shade(P.trim, 1.3);
      c.fillRect(px + 2, py, TILE - 4, TILE);
      c.fillStyle = P.glow;
      c.fillRect(px + 5, py + 3, TILE - 10, TILE - 6);
      break;
  }
}

function buildTileCache() {
  const map = MAPS[G.area];
  tileCache.width = map.grid[0].length * TILE;
  tileCache.height = map.grid.length * TILE;
  tileCtx.clearRect(0, 0, tileCache.width, tileCache.height);
  map._moon = null;
  map._water = [];
  for (let y = 0; y < map.grid.length; y++) {
    const row = map.grid[y].padEnd(map.grid[0].length, "#");
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === "v") continue; // 镂空：透出背后的塔层视差
      if (ch === "O") map._moon = { x: x * TILE + 8, y: y * TILE + 8 };
      if (ch === "~") map._water.push([x, y]);
      drawTile(tileCtx, ch, x, y, map, 0);
    }
  }
}

/* ============================== 角色绘制 ============================== */

function drawPerson(c, x, y, opt = {}) {
  const bob = opt.walk ? Math.sin(opt.walk * 8) * 1 : 0;
  const px = Math.round(x);
  const py = Math.round(y + bob);
  const coat = opt.coat || "#3a4a6a";
  const hair = opt.hair || "#222";
  const skin = opt.skin || "#e8c8a8";
  // 影
  c.fillStyle = "rgba(0,0,0,0.35)";
  c.fillRect(px + 1, py + 13, 10, 3);
  // 身体
  c.fillStyle = coat;
  c.fillRect(px + 2, py + 6, 8, 8);
  c.fillStyle = shade(coat, 0.7);
  c.fillRect(px + 2, py + 11, 3, 3);
  c.fillRect(px + 7, py + 11, 3, 3);
  // 头
  c.fillStyle = skin;
  c.fillRect(px + 3, py + 1, 6, 5);
  c.fillStyle = hair;
  c.fillRect(px + 2, py, 8, 3);
  c.fillRect(px + 2, py + 1, 2, 4);
  // 眼（按朝向偏移）
  const eyeOff = opt.dir === 1 ? -1 : opt.dir === 2 ? 1 : 0;
  if (opt.dir !== 3) {
    c.fillStyle = "#1a1a1a";
    c.fillRect(px + 4 + eyeOff, py + 3, 1, 1);
    c.fillRect(px + 7 + eyeOff, py + 3, 1, 1);
  }
  if (opt.beard) {
    c.fillStyle = "#b8b0a0";
    c.fillRect(px + 3, py + 5, 6, 2);
  }
  if (opt.bun) {
    c.fillStyle = hair;
    c.fillRect(px + 8, py - 1, 3, 3);
  }
  if (opt.hood) {
    c.fillStyle = "#555560";
    c.fillRect(px + 2, py - 1, 8, 4);
    c.fillRect(px + 1, py + 1, 3, 5);
  }
  if (opt.glow) {
    c.fillStyle = opt.glow;
    c.globalAlpha = 0.25 + Math.sin(performance.now() / 300) * 0.1;
    c.fillRect(px, py - 2, 12, 17);
    c.globalAlpha = 1;
  }
}

/* ============================== 粒子 ============================== */

let particles = [];

function spawnAmbient(dt) {
  const kind = MAPS[G.area].ambient;
  if (!kind) return;
  const map = MAPS[G.area];
  const w = map.grid[0].length * TILE;
  if (particles.length > 90) return;
  if (kind === "rain" && Math.random() < dt * 40) {
    // 高塔揭示「塔是倒过来的」之后，雨改从地面向红月落去
    const inverted = G.area === "storm" && F.storm2;
    if (inverted) {
      particles.push({ k: "rain", x: Math.random() * w, y: map.grid.length * TILE + 6, vy: -(130 + Math.random() * 60), vx: 18 });
    } else {
      particles.push({ k: "rain", x: Math.random() * w, y: -6, vy: 130 + Math.random() * 60, vx: -18 });
    }
  } else if (kind === "petals" && Math.random() < dt * 3) {
    particles.push({ k: "petal", x: Math.random() * w, y: -4, vy: 10 + Math.random() * 8, vx: 6 + Math.random() * 8, ph: Math.random() * 6 });
  } else if (kind === "petals" && Math.random() < dt * 2.5) {
    // 花园流萤
    particles.push({ k: "firefly", x: Math.random() * w, y: Math.random() * map.grid.length * TILE, ph: Math.random() * 6, life: 7 });
  } else if (kind === "embers" && Math.random() < dt * 8) {
    particles.push({ k: "ember", x: Math.random() * w, y: map.grid.length * TILE + 4, vy: -(18 + Math.random() * 22), vx: (Math.random() - 0.5) * 10, life: 4 });
  } else if (kind === "dust" && Math.random() < dt * 2) {
    particles.push({ k: "dust", x: Math.random() * w, y: Math.random() * map.grid.length * TILE, vx: 2, vy: -1, life: 6 });
  } else if (kind === "dust" && G.area === "house_family" && Math.random() < dt * 3) {
    // 厨房蒸汽
    particles.push({ k: "steam", x: 24.5 * TILE, y: 9 * TILE, vy: -9, vx: 2, life: 2.5, max: 2.5 });
  } else if (kind === "sparkle" && Math.random() < dt * 4) {
    particles.push({ k: "spark", x: Math.random() * w, y: Math.random() * map.grid.length * TILE, life: 2 });
  } else if (kind === "sparkle" && Math.random() < dt * 1.6) {
    // 终章：漂浮的字符
    particles.push({ k: "glyph", ch: "是无名我"[Math.floor(Math.random() * 4)], x: Math.random() * w, y: Math.random() * map.grid.length * TILE, vy: -5, life: 5, max: 5 });
  }
  // 雨塔心象：水面涟漪
  if (G.area === "rain" && map._water && map._water.length && Math.random() < dt * 4) {
    const wt = map._water[Math.floor(Math.random() * map._water.length)];
    particles.push({ k: "ripple", x: wt[0] * TILE + 8, y: wt[1] * TILE + 8, life: 1.1, max: 1.1 });
  }
}

function updateParticles(dt) {
  const h = MAPS[G.area].grid.length * TILE;
  for (const p of particles) {
    p.x += (p.vx || 0) * dt;
    p.y += (p.vy || 0) * dt;
    if (p.ph !== undefined) p.x += Math.sin(performance.now() / 500 + p.ph) * 8 * dt;
    if (p.k === "firefly") p.y += Math.cos(performance.now() / 700 + p.ph) * 5 * dt;
    if (p.life !== undefined) p.life -= dt;
  }
  particles = particles.filter((p) => p.y < h + 8 && p.y > -24 && (p.life === undefined || p.life > 0));
}

function drawParticles(c, cam) {
  for (const p of particles) {
    const x = Math.round(p.x - cam.x);
    const y = Math.round(p.y - cam.y);
    if (p.k === "rain") {
      c.fillStyle = "#6a8ab8";
      c.fillRect(x, y, 1, 5);
    } else if (p.k === "petal") {
      c.fillStyle = "#c8a8b8";
      c.fillRect(x, y, 2, 2);
    } else if (p.k === "ember") {
      c.fillStyle = Math.random() < 0.5 ? "#e08a4a" : "#d05a3a";
      c.fillRect(x, y, 2, 2);
    } else if (p.k === "dust") {
      c.fillStyle = "#5a5648";
      c.fillRect(x, y, 1, 1);
    } else if (p.k === "spark") {
      c.fillStyle = "#d8ccf8";
      c.fillRect(x, y, 1, 3);
      c.fillRect(x - 1, y + 1, 3, 1);
    } else if (p.k === "firefly") {
      const a = 0.35 + 0.45 * Math.sin(performance.now() / 320 + p.ph);
      c.fillStyle = `rgba(215,235,140,${Math.max(0.05, a)})`;
      c.fillRect(x, y, 2, 2);
    } else if (p.k === "steam") {
      c.fillStyle = `rgba(200,195,185,${(p.life / p.max) * 0.35})`;
      c.fillRect(x - 1, y, 4, 3);
    } else if (p.k === "glyph") {
      c.fillStyle = `rgba(184,168,232,${(p.life / p.max) * 0.7})`;
      c.font = "7px monospace";
      c.fillText(p.ch, x, y);
    } else if (p.k === "ripple") {
      const r = (1 - p.life / p.max) * 10 + 2;
      c.strokeStyle = `rgba(140,180,220,${(p.life / p.max) * 0.6})`;
      c.lineWidth = 1;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.stroke();
    }
  }
}

/* ============================== 输入 & 移动 ============================== */

window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
  if (dialogActive) {
    if (k === "e" || k === " " || k === "enter") advanceDialog();
    return;
  }
  if (k === "e" || k === " " || k === "enter") {
    tryInteract();
    return;
  }
  keys.add(k);
  keySeen.set(k, performance.now());
});

window.addEventListener("keyup", (e) => {
  const k = e.key.toLowerCase();
  keys.delete(k);
  keySeen.delete(k);
});
// 焦点丢失（切换标签页/点击页面外）时立即清空按键，避免「松手后仍在移动」
window.addEventListener("blur", () => {
  keys.clear();
  keySeen.clear();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    keys.clear();
    keySeen.clear();
  }
});
ui.dialog.addEventListener("click", () => advanceDialog());

function tileAt(tx, ty) {
  const map = MAPS[G.area];
  if (ty < 0 || ty >= map.grid.length) return "#";
  const row = map.grid[ty].padEnd(map.grid[0].length, "#");
  if (tx < 0 || tx >= row.length) return "#";
  return row[tx];
}

function blockedAt(px, py) {
  return BLOCKED.has(tileAt(Math.floor(px / TILE), Math.floor(py / TILE)));
}

function movePlayer(dt) {
  if (dialogActive || transitionLock || !ui.ending.hidden || !ui.start.hidden) return;
  // 兜底：若 keyup 因任何原因丢失（iframe/焦点切换），按住状态最多残留 0.6 秒。
  // 正常按住时浏览器会以约 30ms 间隔重复触发 keydown 刷新时间戳，不受影响。
  const nowMs = performance.now();
  for (const k of [...keys]) {
    if (nowMs - (keySeen.get(k) || 0) > 600) {
      keys.delete(k);
      keySeen.delete(k);
    }
  }
  let dx = 0;
  let dy = 0;
  if (keys.has("arrowup") || keys.has("w")) dy -= 1;
  if (keys.has("arrowdown") || keys.has("s")) dy += 1;
  if (keys.has("arrowleft") || keys.has("a")) dx -= 1;
  if (keys.has("arrowright") || keys.has("d")) dx += 1;
  if (dx || dy) {
    const len = Math.hypot(dx, dy);
    const speed = 52;
    const nx = G.px + (dx / len) * speed * dt;
    const ny = G.py + (dy / len) * speed * dt;
    // AABB 12x14 碰撞，分轴滑动
    if (!blockedAt(nx + 1, G.py + 5) && !blockedAt(nx + 11, G.py + 5) && !blockedAt(nx + 1, G.py + 13) && !blockedAt(nx + 11, G.py + 13)) {
      G.px = nx;
    }
    if (!blockedAt(G.px + 1, ny + 5) && !blockedAt(G.px + 11, ny + 5) && !blockedAt(G.px + 1, ny + 13) && !blockedAt(G.px + 11, ny + 13)) {
      G.py = ny;
    }
    G.dir = dy < 0 ? 3 : dy > 0 ? 0 : dx < 0 ? 1 : 2;
    G.walk += dt;
  } else {
    G.walk = 0;
  }
  checkExitsAndShards();
}

function nearestInteractable() {
  const map = MAPS[G.area];
  const cx = G.px + 6;
  const cy = G.py + 8;
  let best = null;
  let bestD = 18;
  const consider = (tx, ty, ref) => {
    const ix = tx * TILE + 8;
    const iy = ty * TILE + 8;
    const d = Math.hypot(cx - ix, cy - iy);
    if (d < bestD + 8) {
      best = ref;
      bestD = d;
    }
  };
  for (const it of map.interact || []) consider(it.x, it.y, { type: "interact", it });
  for (const n of map.npcs || []) {
    if (n.cond && !F[n.cond]) continue;
    consider(n.x, n.y, { type: "npc", it: n });
  }
  return best;
}

function tryInteract() {
  if (transitionLock || !ui.ending.hidden || !ui.start.hidden) return;
  const near = nearestInteractable();
  if (!near) return;
  handleInteraction(near.it.id);
}

function handleInteraction(id) {
  switch (id) {
    case "m1": playScript("m1"); break;
    case "m2":
      if (!F.m1) playLines(["镜面模糊着。先从第一面镜子开始。"], () => {});
      else playScript("m2");
      break;
    case "m3":
      if (!F.m2) playLines(["镜面模糊着。还有没被承认的碎片。"], () => {});
      else playScript("m3");
      break;
    case "storm1":
      if (F.storm1) playLines(["雨还在落。名字擦过耳边，又离去。"], () => {});
      else playScript("storm1");
      break;
    case "storm2":
      if (!F.storm1) playLines(["雨声太大，什么也听不清。先抓住那滴雨。"], () => {});
      else playScript("storm2");
      break;
    case "coffin":
      if (!F.sleptOnce) playScript("coffinFirst");
      else if (F.photoReturned && !F.familyDone) playScript("coffinAgain");
      else playLines(["棺材沉默着。铭文没有变化。"], () => {});
      break;
    case "recall": playScript("recall"); break;
    case "edge": playScript("edge"); break;
    case "bed": playScript("bed"); break;
    case "bathMirror": playScript("bathMirror"); break;
    case "washer":
      if (F.hasPhoto) playLines(["洗衣机里已经空了。照片残片在你手里。"], () => {});
      else playScript("washer");
      break;
    case "toilet":
      if (!F.hasPhoto) {
        playLines(["周防没有先去调查洗衣机，也没有让那片残破的照片落入手中。", "他把手伸向了水箱——"], () => showEnding("bad_nophoto"));
      } else {
        playScript("toiletPain");
      }
      break;
    case "famBed": playScript("famBed"); break;
    case "father": playScript("father"); break;
    case "mother": playScript("mother"); break;
    case "table": playScript("table"); break;
    case "sister":
      if (F.sister) playLines(["血色已经干涸。名字留在了记忆里。"], () => {});
      else playScript("sister");
      break;
    case "parents": playScript("parents"); break;
    case "accuse": playScript("accuse"); break;
    case "repress":
      if (F.rainDone) playLines([{ s: "压抑", t: "去吧。塔顶的裂缝已经开了。" }], () => {});
      else playScript("repress");
      break;
    case "stele1":
      if (F.stele1) playLines(["石碑上的字已经读过了。"], () => {});
      else playScript("stele1");
      break;
    case "stele2":
      if (F.stele2) playLines(["石碑上的字已经读过了。"], () => {});
      else playScript("stele2");
      break;
    case "stele3":
      if (F.stele3) playLines(["石碑上的字已经读过了。"], () => {});
      else playScript("stele3");
      break;
    case "senpai": playScript("senpai"); break;
    case "echoStorm": playScript("echoStorm"); break;
    case "echoGarden": playScript("echoGarden"); break;
    case "echoBlood": playScript("echoBlood"); break;
    case "flower":
      if (!F.metaDone) playLines(["水晶花沉睡着。碑文还没有被读完，她也还没有把话说完。"], () => {});
      else if (F.rainMemory && F.golden) playScript("flowerTrue");
      else playScript("flowerNormal");
      break;
  }
}

function checkExitsAndShards() {
  const map = MAPS[G.area];
  const tx = Math.floor((G.px + 6) / TILE);
  const ty = Math.floor((G.py + 8) / TILE);
  for (const ex of map.exits || []) {
    if (tx === ex.x && ty === ex.y) {
      if (ex.need && !ex.need()) {
        if (!ex.warned || performance.now() - ex.warned > 3000) {
          ex.warned = performance.now();
          playLines([ex.locked], () => {});
        }
        // 推回
        G.px += G.px + 6 < ex.x * TILE + 8 ? -4 : 4;
        return;
      }
      gotoArea(ex.to);
      return;
    }
  }
  if (map.shard && tx === map.shard.x && ty === map.shard.y && !META.shards.includes(map.shard.name)) {
    META.shards.push(map.shard.name);
    saveMeta();
    notify(`拾取记忆碎片：${map.shard.name}（跨周目保留）`);
    updateHud();
  }
}

function gotoArea(area, fadeText) {
  if (transitionLock) return;
  transitionLock = true;
  closeDialog();
  ui.fadeText.textContent = fadeText || MAPS[area].name;
  ui.fade.classList.add("on");
  setTimeout(() => {
    G.area = area;
    const sp = MAPS[area].spawn;
    G.px = sp.x * TILE + 3;
    G.py = sp.y * TILE + 2;
    particles = [];
    goldDrop = null;
    buildTileCache();
    updateHud();
    saveRun();
    AudioEngine.play(MAPS[area].sound);
    let pendingScript = null;
    if (area === "garden" && !F.gardenWoke) {
      F.gardenWoke = true;
      pendingScript = "gardenWake";
    }
    setTimeout(() => {
      ui.fade.classList.remove("on");
      transitionLock = false;
      if (pendingScript) playScript(pendingScript);
    }, 650);
  }, 550);
}

/* ============================== 金色雨滴（终章） ============================== */

function updateGoldDrop(dt) {
  if (G.area !== "meta" || !F.metaDone || F.golden) return;
  goldTimer -= dt;
  if (!goldDrop && goldTimer <= 0) {
    goldDrop = { x: 3 * TILE + Math.random() * 17 * TILE, y: -8, vy: 46 };
    notify("有金色的雨在坠落——站到它下面去。");
  }
  if (goldDrop) {
    goldDrop.y += goldDrop.vy * dt;
    const ground = 15 * TILE;
    const d = Math.hypot(G.px + 6 - goldDrop.x, G.py + 8 - goldDrop.y);
    if (d < 12) {
      F.golden = true;
      addMemory("手心里仍然留下了一滴");
      notify("接住了。手心里仍然留下了一滴。");
      goldDrop = null;
      goldTimer = 9;
      saveRun();
    } else if (goldDrop.y > ground) {
      goldDrop = null;
      goldTimer = 6;
      notify("金雨落进了石缝。它还会再来。");
    }
  }
}

/* ============================== 高塔演出：塔层滚动与上升人影 ============================== */

function updateStorm(dt) {
  if (G.area !== "storm") return;
  // 揭示前：塔层向上流过（人在下坠的错觉）；揭示后：反向——塔是倒过来的
  const dir = F.storm2 ? 1 : -1;
  stormScroll += dt * 34 * dir;
  // 浑黑的身影，违反物理法则一般向红月落去
  if (F.storm1) {
    fallerTimer -= dt;
    if (!faller && fallerTimer <= 0) {
      faller = { x: 6 * TILE + Math.random() * 12 * TILE, y: MAPS.storm.grid.length * TILE + 16 };
    }
  }
  if (faller) {
    faller.y -= 26 * dt;
    if (faller.y < -24) {
      faller = null;
      fallerTimer = 5 + Math.random() * 4;
    }
  }
}

/* ============================== 区域专属演出 ============================== */

function renderAreaFx(map, cam, t) {
  const id = G.area;
  if (id === "mirror") {
    // 镜中倒影：站在镜前时，镜内出现一个不会动的你；读过的镜子裂开
    const read = { 2: F.m1, 6: F.m2, 11: F.m3 };
    for (const mx of [2, 6, 11, 16, 21]) {
      const sx = mx * TILE - cam.x;
      const sy = 1 * TILE - cam.y;
      if (sx < -TILE || sx > VIEW_W + TILE) continue;
      const near = Math.abs(G.px + 6 - (mx * TILE + 8)) < 13 && G.py > 1 * TILE && G.py < 5 * TILE;
      if (near) {
        // 倒影比本体更深、更安静——像是镜子先认出了你
        ctx.globalAlpha = 0.6 + Math.sin(t * 2) * 0.1;
        drawPerson(ctx, sx + 2, sy + 1, { coat: "#3a4468", hair: "#141824", skin: "#7e8aa8", dir: 3 });
        ctx.globalAlpha = 1;
      }
      if (read[mx]) {
        ctx.strokeStyle = "rgba(225,225,245,0.75)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx + 4, sy + 2);
        ctx.lineTo(sx + 8, sy + 7);
        ctx.lineTo(sx + 5, sy + 12);
        ctx.moveTo(sx + 8, sy + 7);
        ctx.lineTo(sx + 12, sy + 10);
        ctx.stroke();
      }
    }
  } else if (id === "garden") {
    // 世界边界：距离不再产生的雾缘
    for (let i = 0; i < VIEW_W; i += 4) {
      const a = 0.08 + 0.05 * Math.sin(t * 1.4 + i * 0.25);
      ctx.fillStyle = `rgba(160,200,170,${a})`;
      ctx.fillRect(i, 0, 2, 7);
      ctx.fillRect(i, VIEW_H - 7, 2, 7);
    }
    for (let i = 0; i < VIEW_H; i += 4) {
      const a = 0.08 + 0.05 * Math.sin(t * 1.4 + i * 0.25);
      ctx.fillStyle = `rgba(160,200,170,${a})`;
      ctx.fillRect(0, i, 7, 2);
      ctx.fillRect(VIEW_W - 7, i, 7, 2);
    }
    // 棺材铭文微光
    const cx = 12 * TILE - cam.x;
    const cy = 8 * TILE - cam.y;
    const g = 0.2 + Math.sin(t * 2) * 0.12;
    ctx.fillStyle = `rgba(201,168,106,${g})`;
    ctx.fillRect(cx - 1, cy - 5, 2, 9);
    ctx.fillRect(cx - 4, cy - 2, 8, 2);
  } else if (id === "house_empty") {
    // 斜窗光
    ctx.fillStyle = `rgba(200,198,175,${0.05 + 0.015 * Math.sin(t * 0.7)})`;
    for (const bx of [4, 12, 25]) {
      const x0 = bx * TILE - cam.x;
      ctx.beginPath();
      ctx.moveTo(x0, 16 - cam.y);
      ctx.lineTo(x0 + 18, 16 - cam.y);
      ctx.lineTo(x0 - 26, 220 - cam.y);
      ctx.lineTo(x0 - 44, 220 - cam.y);
      ctx.fill();
    }
    // 卫生间镜子里的倒影
    const sx = 23 * TILE - cam.x;
    const sy = 2 * TILE - cam.y;
    if (Math.abs(G.px + 6 - (23 * TILE + 8)) < 13 && G.py > 2 * TILE && G.py < 5 * TILE) {
      ctx.globalAlpha = 0.55;
      drawPerson(ctx, sx + 2, sy + 1, { coat: "#3a4468", hair: "#141824", skin: "#7e8aa8", dir: 3 });
      ctx.globalAlpha = 1;
    }
  } else if (id === "house_family") {
    // 新闻联播的蓝白闪光，落在沙发一带
    const a = 0.05 + hash(Math.floor(t * 8), 1, 1) * 0.08;
    ctx.fillStyle = `rgba(160,190,230,${a})`;
    ctx.fillRect(9 * TILE - cam.x, 1 * TILE - cam.y, 44, 28);
  } else if (id === "blood") {
    // 看清她之后，视野边缘随心跳收缩
    if (F.sister) {
      const beat = Math.pow(Math.max(0, Math.sin(t * 3.6)), 10) + Math.pow(Math.max(0, Math.sin(t * 3.6 + 0.5)), 18) * 0.6;
      ctx.fillStyle = `rgba(120,10,10,${0.1 * beat})`;
      ctx.fillRect(0, 0, VIEW_W, 10);
      ctx.fillRect(0, VIEW_H - 10, VIEW_W, 10);
      ctx.fillRect(0, 0, 10, VIEW_H);
      ctx.fillRect(VIEW_W - 10, 0, 10, VIEW_H);
    }
  } else if (id === "meta") {
    // 读过的石碑亮起
    const steles = [[5, F.stele1], [11, F.stele2], [17, F.stele3]];
    for (const [sx0, done] of steles) {
      if (!done) continue;
      const sx = sx0 * TILE - cam.x;
      const sy = 4 * TILE - cam.y;
      ctx.fillStyle = `rgba(184,168,232,${0.2 + Math.sin(t * 2.4) * 0.1})`;
      ctx.fillRect(sx + 2, sy - 2, TILE - 4, 2);
    }
  }
}

/* ============================== 渲染主循环 ============================== */

let lastT = performance.now();

function updateHud() {
  ui.areaName.textContent = MAPS[G.area].name;
  const p = Math.min(3, G.counters.pain || 0);
  const pain = p > 0 ? ` · 头痛 ${"▮".repeat(p)}${"▯".repeat(3 - p)}` : "";
  ui.hudRight.textContent = `记忆 ${G.memories.length} · 碎片 ${META.shards.length}/8${pain}`;
}

function render(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;

  movePlayer(dt);
  spawnAmbient(dt);
  updateParticles(dt);
  updateGoldDrop(dt);
  updateStorm(dt);
  if (painFlash > 0) painFlash -= dt * 0.7;

  // 打字机
  if (dialogActive && !typeDone && dialogLines[dialogIndex] && dialogLines[dialogIndex].t) {
    typeTimer += dt;
    const full = currentFullText();
    const n = Math.min(full.length, Math.floor(typeTimer / 0.016));
    paintText(full.slice(0, n), dialogLines[dialogIndex].c);
    if (n >= full.length) typeDone = true;
  }
  if (notifyT > 0) notifyT -= dt;

  // 相机
  const map = MAPS[G.area];
  const mw = map.grid[0].length * TILE;
  const mh = map.grid.length * TILE;
  const cam = {
    x: Math.max(0, Math.min(mw - VIEW_W, G.px + 6 - VIEW_W / 2)),
    y: Math.max(0, Math.min(mh - VIEW_H, G.py + 8 - VIEW_H / 2)),
  };

  ctx.clearRect(0, 0, VIEW_W, VIEW_H);

  // 高塔视差：镂空带之外，无穷塔层不断流过
  if (map.parallax) {
    ctx.fillStyle = "#060a12";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const bands = [
      { color: "#0e1626", h: 9, w: 44, gap: 62, period: 56, speed: 0.55 },
      { color: "#1a2a44", h: 6, w: 30, gap: 46, period: 42, speed: 1.15 },
    ];
    for (const b of bands) {
      ctx.fillStyle = b.color;
      const off = stormScroll * b.speed;
      const start = (((off % b.period) + b.period) % b.period) - b.period;
      for (let y = start; y < VIEW_H + b.period; y += b.period) {
        for (let x = -b.gap; x < VIEW_W + b.gap; x += b.gap) {
          const bx = x + (Math.floor((y - off) / b.period) % 2) * 18;
          ctx.fillRect(bx, y, b.w, b.h);
        }
      }
    }
  }
  ctx.drawImage(tileCache, cam.x, cam.y, VIEW_W, VIEW_H, 0, 0, VIEW_W, VIEW_H);

  // 红月光晕：挂在无穷层的顶端
  if (map._moon) {
    const mx = map._moon.x - cam.x;
    const my = map._moon.y - cam.y;
    const pulse = 1 + Math.sin(now / 600) * 0.12;
    for (const [r, a] of [[34, 0.1], [22, 0.14], [13, 0.2]]) {
      ctx.fillStyle = `rgba(208,74,58,${a})`;
      ctx.beginPath();
      ctx.arc(mx, my, r * pulse, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const t = now / 1000;
  // 动态瓦片（水、红月、水晶花、花、残骸余火、洗衣机）
  for (let y = 0; y < map.grid.length; y++) {
    const row = map.grid[y].padEnd(map.grid[0].length, "#");
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (DYNAMIC_TILES.has(ch)) {
        const sx = x * TILE - cam.x;
        const sy = y * TILE - cam.y;
        if (sx > -TILE && sx < VIEW_W && sy > -TILE && sy < VIEW_H) {
          ctx.save();
          ctx.translate(sx - x * TILE, sy - y * TILE);
          drawTile(ctx, ch, x, y, map, t);
          ctx.restore();
        }
      }
    }
  }

  // 区域专属演出（倒影、雾缘、窗光、心跳、碑光等）
  renderAreaFx(map, cam, t);

  // 碎片闪光
  if (map.shard && !META.shards.includes(map.shard.name)) {
    const sx = map.shard.x * TILE + 8 - cam.x;
    const sy = map.shard.y * TILE + 8 - cam.y + Math.sin(t * 3) * 2;
    ctx.fillStyle = "#f0e8c8";
    ctx.fillRect(sx - 1, sy - 4, 2, 8);
    ctx.fillRect(sx - 4, sy - 1, 8, 2);
  }

  // 交互点标记
  const near = nearestInteractable();
  const drawMarker = (tx, ty, active) => {
    const sx = tx * TILE + 8 - cam.x;
    const sy = ty * TILE - 4 - cam.y + Math.sin(t * 4) * 2;
    ctx.fillStyle = active ? "#f0d88a" : "rgba(240,216,138,0.55)";
    ctx.font = "8px monospace";
    ctx.fillText("!", sx - 2, sy);
  };
  for (const it of map.interact || []) drawMarker(it.x, it.y, near && near.it === it);
  for (const n of map.npcs || []) {
    if (n.cond && !F[n.cond]) continue;
    drawMarker(n.x, n.y, near && near.it === n);
  }

  // NPC
  for (const n of map.npcs || []) {
    if (n.cond && !F[n.cond]) continue;
    const sx = n.x * TILE + 2 - cam.x;
    const sy = n.y * TILE - cam.y;
    if (n.kind === "father") drawPerson(ctx, sx, sy, { coat: "#5a5248", hair: "#3a342c", beard: true, dir: 0 });
    else if (n.kind === "mother") drawPerson(ctx, sx, sy, { coat: "#7a5a5a", hair: "#4a342c", bun: true, dir: 1 });
    else if (n.kind === "repress") drawPerson(ctx, sx, sy, { coat: "#4a4a55", hood: true, skin: "#b8b8c0", glow: "#7fb3d5", dir: 0 });
    else if (n.kind === "senpai") drawPerson(ctx, sx, sy, { coat: "#c8b890", hair: "#e8dcc0", glow: "#f0e0a8", dir: 3 });
    else if (n.kind === "echo") {
      ctx.globalAlpha = 0.4 + Math.sin(t * 2) * 0.12;
      drawPerson(ctx, sx, sy + Math.sin(t * 1.5) * 2, { coat: "#9fc0d8", hair: "#d0e4f0", skin: "#cfe0ea", dir: 0 });
      ctx.globalAlpha = 1;
    } else if (n.kind === "table") { /* 桌子是瓦片画的 */ }
  }

  // 向红月落去的浑黑身影
  if (faller && G.area === "storm") {
    const fx = faller.x - cam.x;
    const fy = faller.y - cam.y;
    ctx.fillStyle = "rgba(10,10,14,0.9)";
    ctx.fillRect(fx, fy, 6, 10);
    ctx.fillRect(fx + 1, fy - 3, 4, 4);
    ctx.fillStyle = "rgba(10,10,14,0.3)";
    ctx.fillRect(fx + 1, fy + 10, 4, 14);
  }

  // 金色雨滴
  if (goldDrop) {
    const gx = goldDrop.x - cam.x;
    const gy = goldDrop.y - cam.y;
    ctx.fillStyle = "#f0d060";
    ctx.fillRect(gx - 1, gy - 3, 3, 6);
    ctx.fillStyle = "#fff0b0";
    ctx.fillRect(gx, gy - 1, 1, 2);
    // 地面落点提示
    ctx.fillStyle = "rgba(240,208,96,0.4)";
    ctx.fillRect(gx - 5, 15 * TILE - cam.y, 10, 2);
  }

  // 玩家
  drawPerson(ctx, G.px - cam.x, G.py - cam.y, { dir: G.dir, walk: G.walk, coat: "#3a4a6a" });

  drawParticles(ctx, cam);

  // 偏头痛红闪
  if (painFlash > 0) {
    ctx.fillStyle = `rgba(150,30,30,${Math.min(0.32, painFlash * 0.3)})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  // 闪电（高塔与心象的雨夜）
  if ((G.area === "storm" || G.area === "rain") && Math.random() < dt * 0.06) lightning = 0.22;
  if (lightning > 0) {
    lightning -= dt;
    ctx.fillStyle = `rgba(215,228,250,${Math.min(0.26, lightning)})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  // 空屋灯光偶发闪烁
  if (G.area === "house_empty" && Math.random() < dt * 0.15) houseFlicker = 0.1;
  if (houseFlicker > 0) {
    houseFlicker -= dt;
    ctx.fillStyle = `rgba(0,0,0,${Math.min(0.4, houseFlicker * 4)})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  // 通知条
  if (notifyT > 0 && notifyMsg) {
    ctx.fillStyle = "rgba(10,10,16,0.85)";
    ctx.fillRect(8, VIEW_H - 20, VIEW_W - 16, 14);
    ctx.fillStyle = "#e8d8a8";
    ctx.font = "9px sans-serif";
    ctx.fillText(notifyMsg, 14, VIEW_H - 10);
  }

  requestAnimationFrame(render);
}

/* ============================== 图鉴 / 按钮 ============================== */

function renderCodex() {
  ui.codexMemories.replaceChildren();
  const mems = G.memories.length ? G.memories : ["尚未稳定"];
  for (const m of mems) {
    const li = document.createElement("li");
    li.textContent = m;
    if (m === "尚未稳定") li.className = "dim";
    ui.codexMemories.append(li);
  }
  ui.codexShards.replaceChildren();
  const all = ["镜之碎片", "雨之碎片", "花园碎片", "空屋碎片", "日常碎片", "血色碎片", "心象碎片", "水晶碎片"];
  for (const s of all) {
    const li = document.createElement("li");
    const got = META.shards.includes(s);
    li.textContent = got ? s : "？？？";
    if (!got) li.className = "dim";
    ui.codexShards.append(li);
  }
  ui.codexEndings.replaceChildren();
  const ends = META.endings.length ? META.endings : ["尚未抵达任何结局"];
  for (const e of ends) {
    const li = document.createElement("li");
    li.textContent = e;
    if (!META.endings.length) li.className = "dim";
    ui.codexEndings.append(li);
  }
}

ui.codexButton.addEventListener("click", () => {
  ui.codex.hidden = !ui.codex.hidden;
  if (!ui.codex.hidden) renderCodex();
});
ui.audioButton.addEventListener("click", () => AudioEngine.toggle());
ui.restartButton.addEventListener("click", () => {
  if (window.confirm("要清除本周目进度，从镜像阶段重新开始吗？（碎片与结局图鉴保留）")) resetRun();
});
ui.endingRestart.addEventListener("click", resetRun);
ui.endingStay.addEventListener("click", () => {
  ui.ending.hidden = true;
  transitionLock = false;
});
ui.startButton.addEventListener("click", () => {
  ui.start.hidden = true;
  if (G.area === "mirror" && !F.m1 && !F.m2 && !F.m3) {
    playLines([
      "……睁开眼睛的时候，首先看到的是自己的手。",
      "回廊两侧立满了镜子。它们都在等着被看。",
    ], () => {});
  }
});

/* ============================== 启动 ============================== */

loadAll();
buildTileCache();
updateHud();
requestAnimationFrame(render);
