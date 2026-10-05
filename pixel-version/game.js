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
  dialogHint: document.getElementById("dialogHint"),
  dialogProgress: document.getElementById("dialogProgress"),
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
    this.master.gain.value = Expedition.prefs.volume;
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
    if (!document.hidden && this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
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
    if (this.enabled) this.play(endingId ? SOUND_FOR_ENDING[ENDINGS[endingId].stay ? (endingId === "true" ? "true" : "normal") : "bad"] : MAPS[G.area].sound);
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
    cinematic: true,
    spawn: { x: 10, y: 8 },
    palette: { floor: "#141821", wall: "#0a0d13", trim: "#26334a", glow: "#b04a4a" },
    grid: [
      "########################",
      "#......................#",
      "#......................#",
      "#......................#",
      "#......................#",
      "#......................#",
      "#......................#",
      "#......................#",
      "#......................#",
      "#......................#",
      "#......................#",
      "#......................#",
      "#......................#",
      "#......................#",
      "#......................#",
      "#......................#",
      "#......................#",
      "#......................#",
      "#......................#",
      "#......................#",
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
    shard: { x: 12, y: 8, name: "雨之碎片" },
    exits: [],
    interact: [],
    npcs: [],
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
      "#....BB........#...............#",
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
      { x: 10, y: 5, id: "emptyLiving", label: "空荡的客厅" },
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
      "#......#........#..............#",
      "#.B....#..f..F..#....KK........#",
      "#......#........#....K.........#",
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
      { x: 13, y: 2, kind: "father", id: "father", label: "父亲" },
      { x: 24, y: 9, kind: "mother", id: "mother", label: "母亲" },
      { x: 10, y: 2, kind: "table", id: "table", label: "早餐桌" },
    ],
  },

  blood: {
    name: "血色庭院",
    sound: "horror",
    ambient: "embers",
    spawn: { x: 12, y: 8 },
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
      "#############D##############",
      "#..................x.......#",
      "#.......#...bb.............#",
      "#.......#...b..............#",
      "#.......D..................#",
      "#...CC..#..................#",
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
function staged(line, stage) { return { ...normalizeLine(line), stage }; }

function combatLines(id, speakers = {}, stage) {
  return CombatText[id].map((raw, index) => ({ t: typeof raw === 'string' ? raw : raw.text, c: raw.className, s: speakers[index], ...(stage ? { stage: stage(index) } : {}) }));
}

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
      "在偶尔闪过的白光与暗影的怀抱中掉出无尽螺旋的回廊，这也许就是我的命运吧。",
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
      say("浑黑的身影", "下一个奇点再见吧，无名的旅伴。", "quote"),
    ],
    then() {
      F.storm2 = true;
      addMemory("红月");
      addMemory("螺旋之塔");
      gotoArea("garden");
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
      staged("周防再一度迈入棺材，躺下，将自己刚刚推开的棺材板重新覆盖在头顶，然后再一度陷入沉眠。", { at: [12, 9], focus: { x: 12, y: 8 }, pose: "sleep", coffin: true }),
      staged("在一切尚未发生之时，万千的表象被撕扯开联系，撕扯开因果，化为无数片。", { scene: "curtain" }),
      "虚空中，无数张眼睛被张开。看来新的倒霉蛋出现了呢。这次，我们又可以增添多少乐趣了呢？",
    ],
    then() {
      F.sleptOnce = true;
      gotoArea("house_empty", "故事应当在最熟悉的地方开场，不是吗？");
    },
  },
  bed: {
    lines: [
      staged("在这个清晨，头发凌乱的少年猛然从床上弹起。", { scene: "map", at: [3, 3], focus: { x: 3, y: 3 }, pose: "wake", coffin: false }),
      say("周防", "我是……是了，我是周防。", "quote"),
      "这具身体似乎和花园时的状态很不一样，好像回到了十八岁。",
      "可是，如果是十八岁的躯体，这个时候应该是住在父母家里吧。为什么一点声音都没有听到？",
    ],
    then() { F.emptyWoke = true; addMemory("十八岁的身体"); },
  },
  emptyLiving: {
    lines: [
      staged("客厅里面只是空荡荡的。", { at: [10, 5], focus: { x: 11, y: 3 }, pose: "stand" }),
      "没有已经做好的早餐，没有正在呼啸的油烟机响声，没有正在播放的新闻联播，也没有披在椅子上等待被穿上的旧校服。",
      "没有人坐在餐桌上，没有人躺在沙发上，没有人在厨房里炒菜。就只是这样空荡荡地展示在周防面前。",
      staged("另一个卧室里有一张平平无奇的双人大床。可衣橱空空，储物柜毫无一物，床铺没有任何压痕。这里不像独居，却也没有人住过。", { at: [5, 9], focus: { x: 5, y: 8 } }),
    ],
    then() { F.emptyLiving = true; addMemory("空荡的家"); },
  },
  bathMirror: {
    lines: [
      staged("周防缓缓推开卫生间的门。不出意外，他在镜子里面看到了自己新躯体的容颜。", { at: [23, 3], focus: { x: 23, y: 3 }, pose: "mirror", dir: 3 }),
      quote("不赖。"),
      "他尝试了诸多模拟难度颇高的动作，随后给出判断：这里不是普通梦境。要么本体是一台超级计算机中的智能，要么这里本身是另一个现实。",
    ],
    then() { addMemory("镜中的周防"); },
  },
  washer: {
    lines: [
      staged("洗衣机或许是一个值得调查的空间。果不其然，周防在里面发现了一条裤子，而裤兜中有一角残破的照片。", { at: [24, 10], focus: { x: 24, y: 9 }, pose: "search", dir: 3 }),
      staged("看着十分年轻的周防，在这角残片的中央站着。背后似乎有两个人一起站着，但因为照片的断裂，无法从四条腿辨认这两个人是谁。", { pose: "photo" }),
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
      staged("当周防刚刚试图打开这坐便器的盖子时，右侧头部剧烈的痛苦吞噬了一切。", { at: [24, 14], focus: { x: 24, y: 13 }, pose: "pain" }),
      staged("他从睡眠中醒来，在棺材里难受地打滚。痛，好痛，好痛。", { area: "garden", scene: "map", at: [12, 9], focus: { x: 12, y: 8 }, pose: "pain", coffin: true }),
      "许久之后，周防下意识摸向裤兜。那片照片残片本应只是那个世界的产物。",
      staged("可是，从裤兜里掏出的，是已经变干的那片照片残片。而站在里面的，正是那个不知为何的世界中，年轻的周防。", { pose: "photo" }),
      "我真的脱离梦境了吗？不，那不是梦境，那是另一个世界。不然，这片照片是怎么来到此处的？",
      "至少现在首先的目标确立了。要把之前的记忆先完整地找回，这一点确实是真实的目的。",
    ],
    then() {
      F.photoReturned = true;
      G.counters.pain = Math.min(3, (G.counters.pain || 0) + 2);
      painFlash = 1.2;
      updateHud();
      addMemory("归来的照片残片");
    },
  },
  coffinAgain: {
    lines: [
      staged("看来想要获得进一步的线索，得再一次入梦了。", { at: [12, 9], focus: { x: 12, y: 8 }, pose: "stand" }),
      staged("周防打开棺材板，躺入其中。", { pose: "sleep", coffin: true }),
      "此刻正在闭目入眠的周防怎么也不会想到，背后刻下的字迹上，竟然自发地开始续写。",
      quote("雨水的织机开始在时间上运转"),
      staged("噔。噔。噔。无限螺旋的高塔上，逆时而落的男人与那始终在攀登的无名者再一度错过。", { scene: "tower" }),
      quote("你又一次踏上旅途了吗……愿你能找到你想要的答案。"),
    ],
    then() {
      gotoArea("house_family", "第二日 · 咸香味");
    },
  },
  famBed: {
    lines: [
      staged("猛然的，周防再一度从那张熟悉的床上醒来。只不过这次，他异常地感到了安心。", { scene: "map", at: [3, 3], focus: { x: 3, y: 3 }, pose: "wake", coffin: false }),
      "咸香味，是厨房里面飘出来的。果然，我这次找对梦或世界了。",
    ],
    then() { F.familyWoke = true; },
  },
  father: {
    lines: [
      staged("周防打开房门。出现在眼前的，是一个窝在沙发上正在享用新闻联播的男人。", { at: [14, 3], focus: { x: 13, y: 2 }, pose: "stand", dir: 1 }),
      "看着这如同正态分布般生长的胡须，周防很快就知道了他是谁。",
      say("周防", "爸，早安。", "quote"),
      "男人只是应了一声，然后继续聚精会神地看新闻。",
    ],
    then() {
      F.father = true;
      addMemory("父亲");
    },
  },
  mother: {
    lines: [
      staged("厨房门被打开，端着雪菜炒毛豆的女人走入客厅。", { at: [14, 5], focus: { x: 15, y: 5 }, pose: "stand", mother: "carry" }),
      say("母亲", "吃饭了，小防，还有老公……咦，儿子你今天怎么了？", "quote"),
      "周防赶忙应付过去：没事，妈，我就是发现你好像又长了一根白头发。",
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
      staged("母亲果然很快被转移了注意力。随着电视机被关掉，白头发的寻找又以眼花为由不了了之，一家人坐在餐桌上准备享用早饭。", { at: [10, 3], focus: { x: 11, y: 3 }, pose: "eat", family: "table", dir: 3 }),
      "桌上摆着三大碗白粥和榨菜，咸鸭蛋和包子也摆在一旁。好久没吃饭的周防决定大快朵颐。",
      "果然还是吃饭最令人享受啊，这可不比在那个硬的要死的地方睡觉爽多了。",
      quote("慢慢喝，没人抢你的吃。"),
      staged("家中又很快恢复寂静。父母不急不忙地去上班了。", { at: [11, 5], pose: "stand", family: "gone" }),
      "相比上一个梦或世界，唯一的变化就是原本应该在这里的生活痕迹全部回来了。",
      staged("最后，是厕所的马桶。上一次把他直接遣返的地方。", { at: [24, 14], focus: { x: 24, y: 13 } }),
      "或许我应该再等等几天再去看看，说不定有新的变化。",
      "或许是贪恋于饮食，或许是贪恋于日常的生活，又或许是因为之前那次剧痛的顾虑，周防停止了下一步的计划。",
      staged("于是平平淡淡的三日过去。周防知道了自己已经接到大学录取通知书，也知道自己似乎还有一个妹妹，现在应该在外婆家暂住着玩。", { at: [3, 3], focus: { x: 3, y: 3 } }),
      say("周防", "草，我怎么没想到这一点。", "quote"),
      staged(quote("要开始了吗？新的一幕落下，演员也该正式入场了。"), { scene: "curtain" }),
      "嘻嘻，我很期待他看到那个场景该是什么样的神情，会不会后悔自己没有早点去打开那个……",
      "好了，言尽于此。别忘了我们这次演出也是要给那一侧的[朋友]们看的，提前剧透那么多信息可不是好文明。",
      "说的是。那么接下来，就逐个入场吧。",
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
      staged("被束缚了。有什么东西在撕扯着我的身体，阻碍了我对身体的控制权。有什么不知何处而来的力量，将我挤压在某一条狭隘到不存在的间隙中。", { scene: "map", at: [12, 8], focus: { x: 13, y: 7 }, pose: "bound" }),
      "好像有什么东西在燃烧，发出了难闻的气味。有谁在呼嚎，ta很痛苦吗？",
      "啊，好像能看到了。有红黑色的光在照耀。",
      "展露在勉强苏醒的周防眼前的，是一只手。一只握着还在鼓动的心脏的手。一只暗红色的手。",
      "血液被残余的迸发鼓出撕裂的血管，洒在已经变得褐色的地板上。",
      "倒在周防眼前的，那个心脏的主人，此时此刻已然失去了她最后的脏器。",
      "视线颤抖着上移。那是一个年轻的面孔，一个熟悉但不曾在他前三日梦境中出现的角色。",
      say("周防", "妹妹？你是……我的妹妹吗？", "quote"),
      "自我防护机制意外地工作起来。这一切只不过是一场刻意为之的戏剧。",
      "可是，不是这样的。不是这样的，这已经被我所发生了。",
      staged("只预留直感的周防缓缓站起，而后走出那个血色的庭院。", { at: [13, 11], focus: { x: 13, y: 10 }, pose: "stand" }),
    ],
    then() {
      F.sister = true;
      addMemory("妹妹");
    },
  },
  parents: {
    lines: [
      staged("穿过褐色的客房，抬脚踏过不知为何被堆积的脏器。", { at: [12, 14], focus: { x: 13, y: 15 }, pose: "stand" }),
      "最后留在他面前的，是两具紧紧相拥，同时被一柄仍然在燃烧的利剑穿过的二人。",
      "它们已经不能被称之为人，甚至不再具备尸体的形态，而只是两具焦炭。",
      "然而就算如此，他也已经知道那是谁了，也知晓犯下这样罪行的那个人是谁。",
      staged("但他不能再移动了。撕扯的感觉再一度袭来。感官工作的尽头，他好像看到那口停在偏房中的棺材动了动。", { pose: "bound" }),
    ],
    need: () => F.sister,
    locked: "先看清那只手，和心脏的主人。",
    then() {
      F.parents = true;
      addMemory("被焚毁的家");
      playScript("accuse");
    },
  },
  accuse: {
    lines: [
      staged(fracture("看看这样的你吧，犯下了如此滔天大罪的感觉如何？"), { at: [12, 14], pose: "bound", focus: { x: 13, y: 15 }, takeover: 1 }),
      staged(fracture("是你亲手杀死了你的妹妹，挖出了她的心脏。"), { takeover: 2 }),
      staged(fracture("是你亲自把利剑刺向你父亲的胸膛，而对特别巧合的等待到你的母亲扑了上去试图挡开这一击时再动手，将两个人一同再绝望中贯穿。"), { takeover: 2 }),
      staged(fracture("是你亲自杀害了家中的所有人，然后一把火点燃了一切。"), { takeover: 2 }),
      staged(fracture("如今造下此等恶孽，你该如何是好呢？"), { takeover: 3 }),
      staged(fracture("是接受这一切然后就此堕入魔渊，还是因为接受不了这一切而自刎归天？"), { takeover: 3 }),
      staged(fracture("又或者，只是这样恍恍惚惚茫茫然然，疯疯癫癫的度过余生？"), { takeover: 3 }),
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
    lines: combatLines('refusal', {0:'周防',2:'周防',4:'外来者',5:'外来者',6:'周防',8:'周防'}, i => ({ pose: 'stand', ...([4,5].includes(i) ? { takeover: 2 } : {}), battle: { phase: 'ownership', progress: i, ...([0,2,6].includes(i) ? { target: {0:0,2:1,6:2}[i] } : {}) } })),
    choices: [{ label: '让世界崩坏', run: () => playScript('clash') }],
    then() { addMemory('拒绝错误组合'); addMemory('书写权争夺'); },
  },
  clash: {
    lines: combatLines('clash', {}, i => ({ battle: { phase: 'clash', progress: i } })),
    choices: [{ label: '抵达雨塔', run() { F.refused = true; gotoArea('rain', '显意识的边缘'); } }],
    then() { addMemory('红灰光团'); },
  },
  repress: {
    lines: combatLines('rain_1', {"3":"周防","4":"压抑","5":"压抑","6":"压抑","8":"压抑","9":"压抑","10":"周防","11":"压抑","12":"压抑","13":"周防","14":"压抑","15":"周防","16":"压抑","17":"压抑","18":"压抑","19":"周防","20":"压抑","21":"周防","22":"压抑","23":"压抑"}),
    choices: [
      { label: '追问记忆为什么在流失', run: () => playScript('rainMemory') },
      { label: '追问不回来是什么意思', run: () => playScript('rainDeath') },
    ],
    then() { addMemory('无名旅伴'); addMemory('显意识边缘'); },
  },
  rainMemory: {
    lines: combatLines('rain_memory', {0:'压抑',1:'压抑',2:'压抑',3:'压抑',6:'周防',7:'压抑',12:'压抑'}, i => ({ battle: { phase: 'rain-body', progress: i } })),
    then() { F.rainMemory = true; addMemory('手心里的雨水'); playScript('rainDeath'); },
  },
  rainDeath: {
    lines: combatLines('rain_death', {0:'周防',1:'压抑',3:'压抑',5:'压抑',6:'压抑',7:'压抑'}),
    then() { addMemory('黄昏的海洋'); playScript('rainEnemy'); },
  },
  rainEnemy: {
    lines: combatLines('rain_enemy', {"0":"周防","1":"压抑","2":"压抑","3":"压抑","4":"周防","5":"压抑","6":"压抑","7":"压抑","8":"压抑","9":"压抑"}),
    then() { F.rainDone = true; addMemory('外部入侵者'); notify('塔顶的裂缝开启了。'); },
  },
  // The original chapter is implemented by Finale; these compressed scripts are retired.

  /* ---- 同行者的回声位：只回读原版对应场景中的句子，不增加人物对白或事实 ---- */
  echoStorm: {
    lines: [
      "而在红月下方，有一个浑黑的身影，仿佛违反了物理法则一般，从高塔之中向月亮落去。",
      say("浑黑的身影", "下一个奇点再见吧，无名的旅伴。", "quote"),
    ],
    then() { addMemory("旅伴的回声"); },
  },
  echoGarden: {
    lines: [
      "周防打开棺木，看向底部。果然，如同棺材表面一样，上面也铭刻着些许字符。",
      quote("自无中归来的人啊，醒来，醒来\n回到你的梦里去，回到那永恒的拒绝中去"),
    ],
    then() { addMemory("住客的回声"); },
  },
  echoBlood: {
    lines: [
      "视线颤抖着上移。那是一个年轻的面孔，一个熟悉但不曾在他前三日梦境中出现的角色。",
      say("周防", "妹妹？你是……我的妹妹吗？", "quote"),
    ],
    then() { addMemory("妹妹的回声"); },
  },
};

/* 重玩保留图鉴并回读相同原文；不以新周目改变角色已遗忘的事实。 */
function ngLines(_id, lines) {
  return lines;
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
    text: "", // Full original text is supplied by Finale.init().
  },
  true: {
    code: "TRUE ENDING / 无依赖者",
    name: "无垠之萍",
    summary: "手心里仍然留下了一滴。",
    stay: true,
    text: "", // Full original text is supplied by Finale.init().
  },
};

/* ============================== 状态 ============================== */

let F = {}; // 周目旗标
let G = {
  area: "mirror",
  protagonistName: "周防",
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
let currentDialogScript = null;
let dialogResolving = false;
let endingId = null;
let notifyMsg = null;
let notifyT = 0;

let goldDrop = null; // {x, y, vy}
let goldTimer = 0;
let painFlash = 0; // 偏头痛红闪剩余时长
let stormSequenceStarted = false;
let lightning = 0; // 闪电白闪剩余时长
let houseFlicker = 0; // 空屋灯光闪烁剩余时长
const DYNAMIC_TILES = new Set(["~", "O", "I", "*", "x", "W"]);

const keys = new Set();
const keySeen = new Map();
const touchKeys = new Set();
function clearInput() {
  keys.clear();
  keySeen.clear();
  touchKeys.clear();
}
let transitionLock = false;

function saveRun() {
  // 对白、选择执行与区域切换视为一个事务；只保存玩家可继续的检查点。
  if (dialogActive || dialogResolving || (transitionLock && !endingId)) return false;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ area: G.area, px: G.px, py: G.py, flags: F, memories: G.memories, counters: G.counters, protagonistName: G.protagonistName, endingId }));
    return true;
  } catch (e) { /* file:// 限制时忽略 */ }
  return false;
}

function saveMeta() {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(META));
  } catch (e) { /* 忽略 */ }
}

function isSaveRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function savedNames(value, allowed) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(name => typeof name === "string" && name.length > 0 && (!allowed || allowed.has(name))))];
}

function savedFlags(value) {
  const flags = {};
  if (!isSaveRecord(value)) return flags;
  for (const [key, enabled] of Object.entries(value)) {
    if (["__proto__", "constructor", "prototype"].includes(key)) continue;
    if (typeof enabled === "boolean") flags[key] = enabled;
  }
  return flags;
}

function savedCounters(value) {
  const counters = {};
  if (!isSaveRecord(value)) return counters;
  for (const [key, count] of Object.entries(value)) {
    if (["__proto__", "constructor", "prototype"].includes(key)) continue;
    if (Number.isSafeInteger(count) && count >= 0) counters[key] = count;
  }
  if (counters.pain !== undefined) counters.pain = Math.min(3, counters.pain);
  return counters;
}

function validSavedPosition(map, px, py) {
  if (!Number.isFinite(px) || !Number.isFinite(py)) return false;
  if (px < 0 || py < 0 || px + 12 > map.grid[0].length * TILE || py + 14 > map.grid.length * TILE) return false;
  return [[1, 5], [11, 5], [1, 13], [11, 13]].every(([dx, dy]) => {
    const row = map.grid[Math.floor((py + dy) / TILE)];
    const tile = row && row[Math.floor((px + dx) / TILE)];
    return tile !== undefined && !BLOCKED.has(tile);
  });
}

function loadAll() {
  // 沿用 v1 键；周目存档与跨周目图鉴独立读取，任何一份损坏不影响另一份。
  F = {};
  G.area = "mirror";
  G.memories = [];
  G.counters = {};
  G.protagonistName = "周防";
  endingId = null;
  let loadedPosition = false;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (isSaveRecord(s) && typeof s.area === "string" && Object.prototype.hasOwnProperty.call(MAPS, s.area)) {
        G.area = s.area;
        if (validSavedPosition(MAPS[G.area], s.px, s.py)) {
          G.px = s.px;
          G.py = s.py;
          loadedPosition = true;
        }
        F = savedFlags(s.flags);
        G.memories = savedNames(s.memories);
        G.counters = savedCounters(s.counters);
        if (typeof s.protagonistName === "string" && s.protagonistName.trim()) G.protagonistName = s.protagonistName.trim().slice(0, 40);
        if (typeof s.endingId === "string" && Object.prototype.hasOwnProperty.call(ENDINGS, s.endingId)) endingId = s.endingId;
      }
    }
  } catch (e) { /* 忽略 */ }
  if (!loadedPosition) {
    const sp = MAPS[G.area].spawn;
    G.px = sp.x * TILE + 3;
    G.py = sp.y * TILE + 2;
  }
  META = { shards: [], endings: [] };
  try {
    const rawMeta = localStorage.getItem(META_KEY);
    if (rawMeta) {
      const m = JSON.parse(rawMeta);
      if (isSaveRecord(m)) {
        META.shards = savedNames(m.shards, new Set(Object.values(MAPS).filter(map => map.shard).map(map => map.shard.name)));
        META.endings = savedNames(m.endings, new Set(Object.values(ENDINGS).map(ending => ending.name)));
      }
    }
  } catch (e) { /* 忽略 */ }
}

function addMemory(name) {
  if (!G.memories.includes(name)) {
    G.memories.push(name);
    updateHud();
    if (typeof Expedition !== "undefined") Expedition.onMemory(name);
    saveRun();
  }
}

function notify(text) {
  notifyMsg = text;
  notifyT = 3.2;
  Expedition.status(text);
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
  playLines(ngLines(id, script.lines), script.then ? () => script.then() : null, script);
}

function normalizeLine(line) {
  if (typeof line === "string") return { t: line };
  return line;
}

function playLines(lines, onDone, script = null) {
  dialogActive = true;
  dialogLines = lines.map(normalizeLine);
  dialogIndex = 0;
  dialogChoices = null;
  afterDialog = typeof onDone === "function" ? onDone : null;
  currentDialogScript = script;
  keys.clear();
  keySeen.clear();
  ui.dialog.hidden = false;
  ui.dialogChoices.replaceChildren();
  if (!dialogLines.length) {
    finishDialog(afterDialog);
    return;
  }
  renderLine();
}

function renderLine() {
  const line = dialogLines[dialogIndex];
  if (!line) return;
  applyStoryStage(line);
  setDialogPresentation(line);
  ui.dialogSpeaker.textContent = line.s || "";
  typeTimer = 0;
  typeDone = ["takeover", "finale"].includes(ui.dialog.dataset.presentation) || !line.t || Expedition.prefs.speed === 0;
  ui.dialogText.replaceChildren();
  if (line.rewrite) {
    const del = document.createElement("del");
    del.textContent = line.rewrite.original;
    del.tabIndex = 0;
    del.setAttribute("aria-label", "原先的过程");
    const ins = document.createElement("ins");
    ins.textContent = line.rewrite.replacement;
    ins.tabIndex = 0;
    ins.setAttribute("aria-label", "改写后的过程");
    ui.dialogText.append(del, document.createTextNode(" "), ins);
    typeDone = true;
  } else if (typeDone && line.t) {
    paintText(line.t, line.c);
  }
  updateDialogStatus();
  if (typeof Expedition !== "undefined") Expedition.onLine(line, dialogIndex, dialogLines.length);
  Finale.onLine(line);
  PixelArt.onLine(line);
  PhenomenonBattle.onLine(line);
  if (G.area === "storm") StormFlight.onLine(line);
  updateDialogStatus();
  Expedition.sync();
}

function setDialogPresentation(line) {
  const pressure = line?.stage?.takeover;
  if (line?.stage?.finale) {
    ui.dialog.dataset.presentation = "finale";
    delete ui.dialog.dataset.pressure;
  } else if (G.area === "blood" && [1, 2, 3].includes(pressure)) {
    ui.dialog.dataset.presentation = "takeover";
    ui.dialog.dataset.pressure = String(pressure);
  } else {
    delete ui.dialog.dataset.presentation;
    delete ui.dialog.dataset.pressure;
  }
  delete ui.dialog.dataset.choosing;
  delete ui.dialog.dataset.voice;
  if (!line?.stage?.finale) Finale.dismiss();
  ui.dialog.scrollTop = 0;
  ui.dialogText.scrollTop = 0;
}

function currentFullText() {
  const line = dialogLines[dialogIndex];
  return line ? line.t || "" : "";
}

function updateDialogStatus() {
  if (ui.dialogProgress) ui.dialogProgress.textContent = dialogActive ? `${Math.min(dialogIndex + 1, dialogLines.length)} / ${dialogLines.length}` : "";
  if (ui.dialogHint) {
    ui.dialogHint.textContent = !dialogActive ? "" : dialogChoices ? "选择你的回应" : PhenomenonBattle.pending && typeDone ? "← / → 选择现象 · E 确认" : typeDone ? "点击 / E / 空格 / Enter 继续" : "点击 / E / 空格 / Enter 显示全文";
  }
}

function finishDialog(done) {
  closeDialog();
  const wasResolving = dialogResolving;
  dialogResolving = true;
  try {
    if (done) done();
  } finally {
    dialogResolving = wasResolving;
    if (!dialogResolving) saveRun();
  }
}

function advanceDialog() {
  if (!dialogActive) return;
  if (dialogChoices) return; // 等待选择
  if (!typeDone) {
    typeDone = true;
    const line = dialogLines[dialogIndex];
    paintText(currentFullText(), line && line.c);
    updateDialogStatus();
    return;
  }
  if (PhenomenonBattle.pending) { PhenomenonBattle.commit(PhenomenonBattle.selected); return; }
  if (dialogIndex + 1 >= dialogLines.length) {
    if (currentDialogScript && currentDialogScript.choices) showChoices(currentDialogScript.choices);
    else finishDialog(afterDialog);
    return;
  }
  dialogIndex += 1;
  renderLine();
}

function paintText(text, cls) {
  ui.dialogText.replaceChildren();
  if (dialogLines[dialogIndex]?.secretAction === "trueEnding" && ui.dialog.dataset.presentation === "finale") {
    const answer = document.createElement("button");
    answer.type = "button";
    answer.className = "finale-answer";
    answer.textContent = text;
    answer.title = "有些东西仍然留在手心";
    answer.addEventListener("click", event => { event.stopPropagation(); Finale.answer(); });
    ui.dialogText.append(answer);
    return;
  }
  const span = document.createElement("span");
  if (cls) span.className = cls;
  span.textContent = text;
  ui.dialogText.append(span);
}

function showChoices(choices) {
  dialogChoices = choices;
  ui.dialog.dataset.choosing = "true";
  const script = currentDialogScript;
  ui.dialogChoices.replaceChildren();
  for (const ch of choices) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = ch.label;
    btn.addEventListener("click", (event) => {
      // 选择可能立刻打开下一段对白，不能把同一次点击冒泡成「继续」。
      event.stopPropagation();
      if (!dialogActive || dialogChoices !== choices || Expedition.paused()) return;
      finishDialog(() => {
        if (script && script.then) script.then();
        ch.run();
      });
    });
    ui.dialogChoices.append(btn);
  }
  if (Finale.active()) PhenomenonBattle.history();
  updateDialogStatus();
  const first = ui.dialogChoices.querySelector("button");
  if (first) first.focus({ preventScroll: true });
}

function closeDialog() {
  const wasActive = dialogActive;
  dialogActive = false;
  dialogLines = [];
  dialogIndex = 0;
  dialogChoices = null;
  typeTimer = 0;
  typeDone = true;
  afterDialog = null;
  currentDialogScript = null;
  ui.dialog.hidden = true;
  ui.dialogChoices.replaceChildren();
  setDialogPresentation();
  StoryStaging.finish();
  PhenomenonBattle.clear();
  PixelArt.onLine(null);
  updateDialogStatus();
  if (wasActive && typeof Expedition !== "undefined") Expedition.onDialogClose();
}

/* ============================== 结局展示 ============================== */

function showEnding(id) {
  const e = ENDINGS[id];
  if (!e) return;
  closeDialog();
  endingId = id;
  transitionLock = true;
  keys.clear();
  keySeen.clear();
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
  Finale.open = false;
  document.body.classList.remove("finale-active");
  Finale.dom.endingRename.hidden = id !== "true";
  Finale.dom.endingGallery.hidden = !e.stay;
  document.title = id === "true" ? "无垠之萍 · 箱庭版" : "无中归来者 · 箱庭版";
  AudioEngine.play(SOUND_FOR_ENDING[e.stay ? (id === "true" ? "true" : "normal") : "bad"]);
  saveRun();
}

function restoreEnding() {
  if (!endingId) return false;
  showEnding(endingId);
  return true;
}

function leaveEnding() {
  if (!endingId || !ENDINGS[endingId].stay) return;
  endingId = null;
  ui.ending.hidden = true;
  transitionLock = false;
  saveRun();
  if (G.area === "meta") Finale.enter();
}

function resetRun() {
  closeDialog();
  dialogResolving = false;
  endingId = null;
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 忽略 */ }
  F = {};
  G.memories = [];
  G.counters = {};
  G.area = "mirror";
  const sp = MAPS.mirror.spawn;
  G.px = sp.x * TILE + 3;
  G.py = sp.y * TILE + 2;
  G.dir = 0;
  G.walk = 0;
  keys.clear();
  keySeen.clear();
  particles = [];
  goldDrop = null;
  goldTimer = 0;
  stormSequenceStarted = false;
  StormFlight.reset();
  StoryStaging.reset();
  Finale.reset();
  G.protagonistName = "周防";
  painFlash = 0;
  lightning = 0;
  houseFlicker = 0;
  notifyMsg = null;
  notifyT = 0;
  ui.fade.classList.remove("on");
  ui.codex.hidden = true;
  ui.ending.hidden = true;
  transitionLock = false;
  if (typeof Expedition !== "undefined") Expedition.reset();
  buildTileCache();
  updateHud();
  AudioEngine.play(MAPS[G.area].sound);
  saveRun();
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
  c.fillStyle = map === MAPS.blood && y > 10 ? "#30231d" : P.floor;
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
  PixelArt.tile(c, ch, x, y, map);
}

function buildTileCache() {
  const map = MAPS[G.area];
  tileCache.width = map.grid[0].length * TILE;
  tileCache.height = map.grid.length * TILE;
  tileCtx.clearRect(0, 0, tileCache.width, tileCache.height);
  map._moon = null;
  map._water = [];
  map._dynamic = [];
  for (let y = 0; y < map.grid.length; y++) {
    const row = map.grid[y].padEnd(map.grid[0].length, "#");
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === "v") continue; // 镂空：透出背后的塔层视差
      if (ch === "O") map._moon = { x: x * TILE + 8, y: y * TILE + 8 };
      if (ch === "~") map._water.push([x, y]);
      if (DYNAMIC_TILES.has(ch)) map._dynamic.push({ x, y, ch });
      drawTile(tileCtx, ch, x, y, map, 0);
    }
  }
}

/* ============================== 角色绘制 ============================== */

function drawPerson(c, x, y, opt = {}) {
  const pose = opt.pose || "stand";
  const bob = opt.walk && pose === "stand" ? Math.sin(opt.walk * 8) : 0;
  const coat = opt.coat || "#3a4a6a";
  const hair = opt.hair || "#222";
  const skin = opt.skin || "#e8c8a8";
  c.save();
  c.translate(Math.round(x) + 6, Math.round(y + bob) + 8);
  if (pose === "sleep" || opt.reclined) c.rotate(-Math.PI / 2 + (pose === "pain" && !Expedition.prefs.motion ? Math.sin(StoryStaging.time * 8) * 0.12 : 0));
  else if (pose === "pain") c.rotate(-0.15);
  else if (pose === "search") c.rotate(0.2);
  const px = -6, py = -8;
  const lowered = pose === "kneel" ? 4 : 0;
  const arm = (x1, y1, x2, y2, color = coat) => {
    c.fillStyle = color;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1))));
    for (let i = 0; i <= steps; i++) c.fillRect(Math.round(x1 + (x2 - x1) * i / steps), Math.round(y1 + (y2 - y1) * i / steps), 2, 2);
  };
  // 影
  c.fillStyle = "rgba(0,0,0,0.35)";
  c.fillRect(px + 1, py + 13, 10, 3);
  let leftHand = { x: px, y: py + 9 + lowered };
  let rightHand = { x: px + 10, y: py + 9 + lowered };
  if (pose === "bound") {
    leftHand = { x: px - 4, y: py + 7 };
    rightHand = { x: px + 14, y: py + 7 };
  } else if (pose === "pain") rightHand = { x: px + 9, y: py + 2 };
  else if (pose === "wake") {
    leftHand = { x: px - 2, y: py + 1 };
    rightHand = { x: px + 12, y: py + 1 };
  } else if (pose === "search") rightHand = { x: px + 15, y: py + 10 };
  else if (pose === "photo") {
    leftHand = { x: px + 2, y: py + 8 };
    rightHand = { x: px + 9, y: py + 8 };
  } else if (pose === "eat") rightHand = { x: px + 8, y: py + 4 };
  else if (pose === "carry") {
    leftHand = { x: px + 1, y: py + 8 };
    rightHand = { x: px + 10, y: py + 8 };
  } else if (pose === "kneel") rightHand = { x: px + 13, y: py + 10 };
  if (opt.blood && opt.heldHeart !== false && ["stand", "bound", "kneel"].includes(pose)) {
    rightHand = { x: px + (pose === "bound" ? 14 : 12), y: py + (pose === "kneel" ? 10 : 7) };
  }
  const stagedArms = opt.blood || pose !== "stand";
  if (stagedArms) {
    arm(px + 2, py + 7 + lowered, leftHand.x, leftHand.y);
    arm(px + 8, py + 7 + lowered, rightHand.x, rightHand.y);
  }
  // 身体
  c.fillStyle = coat;
  c.fillRect(px + 2, py + 6 + lowered, 8, pose === "kneel" ? 5 : 8);
  c.fillStyle = shade(coat, 0.7);
  if (pose === "kneel" || pose === "eat" || pose === "sit") {
    c.fillRect(px + 1, py + 13, 5, 2);
    c.fillRect(px + 7, py + 13, 5, 2);
  } else {
    c.fillRect(px + 2, py + 11, 3, 3);
    c.fillRect(px + 7, py + 11, 3, 3);
  }
  // 头
  c.fillStyle = skin;
  c.fillRect(px + 3, py + 1 + lowered, 6, 5);
  if (stagedArms) {
    c.fillRect(leftHand.x, leftHand.y, 2, 2);
    c.fillRect(rightHand.x, rightHand.y, 2, 2);
  }
  c.fillStyle = hair;
  c.fillRect(px + 2, py + lowered, 8, 3);
  c.fillRect(px + 2, py + 1 + lowered, 2, 4);
  // 眼（按朝向偏移）
  const eyeOff = opt.dir === 1 ? -1 : opt.dir === 2 ? 1 : 0;
  if (opt.dir !== 3 && pose !== "mirror") {
    c.fillStyle = "#1a1a1a";
    c.fillRect(px + 4 + eyeOff, py + 3 + lowered, pose === "sleep" ? 2 : 1, 1);
    c.fillRect(px + 7 + eyeOff, py + 3 + lowered, pose === "sleep" ? 2 : 1, 1);
  }
  if (opt.beard) {
    c.fillStyle = "#b8b0a0";
    c.fillRect(px + 3, py + 5 + lowered, 6, 2);
  }
  if (opt.bun) {
    c.fillStyle = hair;
    c.fillRect(px + 8, py - 1 + lowered, 3, 3);
  }
  if (opt.hood) {
    c.fillStyle = "#555560";
    c.fillRect(px + 2, py - 1 + lowered, 8, 4);
    c.fillRect(px + 1, py + 1 + lowered, 3, 5);
  }
  if (pose === "bound") {
    c.fillStyle = "#514052";
    c.fillRect(leftHand.x + 1, leftHand.y, 2, 2); c.fillRect(rightHand.x - 1, rightHand.y, 2, 2);
    c.fillRect(px + 2, py + 8, 8, 1);
  } else if (pose === "photo") {
    c.fillStyle = "#d8d0b9"; c.fillRect(px + 3, py + 7, 6, 4);
    c.fillStyle = "#7d8583"; c.fillRect(px + 4, py + 8, 4, 2);
  } else if (pose === "eat") {
    c.fillStyle = "#c6c1ae"; c.fillRect(px - 1, py + 9, 6, 3);
    c.fillStyle = "#eee8d3"; c.fillRect(px, py + 8, 4, 2);
    arm(px + 8, py + 6, px + 7, py + 4, "#b9a681");
  } else if (pose === "carry") {
    c.fillStyle = "#c2baa6"; c.fillRect(px, py + 8, 12, 3);
    c.fillStyle = "#748547"; c.fillRect(px + 1, py + 7, 10, 2);
    c.fillStyle = "#b4b072"; c.fillRect(px + 3, py + 7, 2, 1); c.fillRect(px + 7, py + 8, 2, 1);
  }
  PixelArt.person(c, px, py, lowered, opt, pose);
  if (opt.blood) {
    // Fixed splashes cover face, bare hands, shirt and both trouser legs.
    c.fillStyle = "#751d2a";
    c.fillRect(px + 7, py + 2 + lowered, 2, 2);
    c.fillRect(px + 4, py + 4 + lowered, 1, 2);
    c.fillRect(leftHand.x, leftHand.y, 2, 2);
    c.fillRect(rightHand.x, rightHand.y, 2, 2);
    c.fillRect(px + 3, py + 7 + lowered, 3, 2);
    c.fillRect(px + 7, py + 9 + lowered, 2, 3);
    c.fillRect(px + 2, py + 12, 2, 2);
    c.fillRect(px + 8, py + 12, 2, 2);
    c.fillStyle = "#b53a40";
    c.fillRect(px + 8, py + 3 + lowered, 1, 1);
    c.fillRect(px + 4, py + 8 + lowered, 1, 1);
    c.fillRect(rightHand.x, rightHand.y, 1, 1);
    if (opt.heldHeart !== false && ["stand", "bound", "kneel"].includes(pose)) {
      // The heart is held by this actor's hand; it is not a prop on the corpse.
      const hx = rightHand.x + 2, hy = rightHand.y - 3;
      const beat = Expedition.prefs.motion ? 0 : Math.sin(performance.now() / 140) > 0.86 ? 1 : 0;
      c.fillStyle = "#541020"; c.fillRect(hx - 1, hy + 1, 6, 5);
      c.fillStyle = "#a62c3d"; c.fillRect(hx, hy, 2, 4 + beat); c.fillRect(hx + 2, hy - 1, 2, 5 + beat); c.fillRect(hx + 1, hy + 4, 2, 2);
      c.fillStyle = "#d26867"; c.fillRect(hx + 2, hy, 1, 2);
    }
  }
  if (opt.glow) {
    const alpha = c.globalAlpha;
    c.fillStyle = opt.glow;
    c.globalAlpha = alpha * (Expedition.prefs.motion ? 0.25 : 0.25 + Math.sin(performance.now() / 300) * 0.1);
    c.fillRect(px, py - 2, 12, 17);
    c.globalAlpha = alpha;
  }
  c.restore();
}

/* ============================== 粒子 ============================== */

let particles = [];

function spawnAmbient(dt) {
  if (G.area === "storm") return; // 暴雨在逆落镜头中绘制，不再由地图边缘漂进视野。
  const kind = MAPS[G.area].ambient;
  if (!kind) return;
  const map = MAPS[G.area];
  const w = map.grid[0].length * TILE;
  if (particles.length > 90) return;
  if (kind === "rain" && Math.random() < dt * 40) {
    particles.push({ k: "rain", x: Math.random() * w, y: -6, vy: 130 + Math.random() * 60, vx: -18 });
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
  if (Expedition.paused()) return;
  // Native buttons and controls retain their keyboard behavior.
  if (e.target?.closest?.("input, select, textarea, a")) return;
  if ([" ", "enter"].includes(k) && e.target?.closest?.("button")) return;
  const movement = ["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d", "shift"];
  const interact = ["e", " ", "enter"].includes(k);
  if (movement.includes(k) || interact) e.preventDefault();
  if (interact) {
    if (e.repeat) return;
    if (dialogActive) advanceDialog(); else tryInteract();
    return;
  }
  if (movement.includes(k) && !dialogActive) keys.add(k);
});

window.addEventListener("keyup", (e) => {
  const k = e.key.toLowerCase();
  keys.delete(k);
  keySeen.delete(k);
});
// 焦点丢失（切换标签页/点击页面外）时立即清空按键，避免「松手后仍在移动」
window.addEventListener("blur", () => {
  clearInput();
  if (!ui.start.hidden) return;
  saveRun();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    clearInput();
    saveRun();
    AudioEngine.ctx?.suspend().catch(() => {});
  } else {
    lastT = performance.now();
    if (AudioEngine.enabled) AudioEngine.ctx?.resume().catch(() => {});
  }
});
window.addEventListener("pagehide", () => saveRun());
ui.dialog.addEventListener("click", (event) => {
  if (!event.target?.closest?.("button") && !Expedition.paused()) advanceDialog();
});

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
  if (G.area === "meta") return;
  if (G.area === "storm") return; // 逆落的主体运动由镜头推进，不以地面行走表示。
  if (dialogActive || transitionLock || Expedition.paused() || !ui.ending.hidden || !ui.start.hidden) return;
  const held = (key) => keys.has(key) || touchKeys.has(key);
  let dx = 0;
  let dy = 0;
  if (held("arrowup") || held("w")) dy -= 1;
  if (held("arrowdown") || held("s")) dy += 1;
  if (held("arrowleft") || held("a")) dx -= 1;
  if (held("arrowright") || held("d")) dx += 1;
  if (dx || dy) {
    const len = Math.hypot(dx, dy);
    const speed = keys.has("shift") || touchKeys.size ? 78 : 52;
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
  if (G.area === "storm") return F.storm1 && !F.storm2 ? { type: "interact", it: { id: "stormReach", label: "伸手留住雨滴" } } : null;
  const map = MAPS[G.area];
  const cx = G.px + 6;
  const cy = G.py + 8;
  let best = null;
  let bestD = 26;
  const consider = (tx, ty, ref) => {
    const ix = tx * TILE + 8;
    const iy = ty * TILE + 8;
    const d = Math.hypot(cx - ix, cy - iy);
    if (d < bestD) {
      best = ref;
      bestD = d;
    }
  };
  for (const it of map.interact || []) consider(it.x, it.y, { type: "interact", it });
  for (const n of map.npcs || []) {
    if (n.cond && !F[n.cond]) continue;
    const actor = StoryStaging.npc(n);
    if (!actor.hidden) consider(actor.x, actor.y, { type: "npc", it: n });
  }
  return best;
}

function tryInteract() {
  if (dialogActive || transitionLock || Expedition.paused() || !ui.ending.hidden || !ui.start.hidden) return;
  const near = nearestInteractable();
  if (!near) return;
  Expedition.chime(260);
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
    case "stormReach":
      if (G.area !== "storm" || !F.storm1 || F.storm2) return;
      StormFlight.reach();
      playScript("storm2");
      break;
    case "coffin":
      if (!F.sleptOnce) playScript("coffinFirst");
      else if (F.photoReturned && !F.familyDone) playScript("coffinAgain");
      else playLines(["棺材沉默着。铭文没有变化。"], () => {});
      break;
    case "recall": playScript("recall"); break;
    case "edge": playScript("edge"); break;
    case "bed": playScript("bed"); break;
    case "emptyLiving": playScript("emptyLiving"); break;
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
    case "mother":
      if (F.mother) playLines([say("母亲", "吃饭了，小防，还有老公……", "quote")], () => {});
      else playScript("mother");
      break;
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
    case "stele2":
    case "stele3":
    case "senpai":
    case "flower": Finale.enter(); break;
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
  if (G.area === "storm") return;
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
    Expedition.chime(660, 0.2);
    if (!ui.codex.hidden) renderCodex();
    updateHud();
  }
}

function gotoArea(area, fadeText) {
  if (transitionLock || !MAPS[area]) return;
  Expedition.cancelTransition();
  clearInput();
  transitionLock = true;
  closeDialog();
  ui.fadeText.textContent = fadeText || MAPS[area].name;
  ui.fade.classList.add("on");
  Expedition.transitionTimers.push(setTimeout(() => {
    G.area = area;
    stormSequenceStarted = false;
    StormFlight.reset();
    StoryStaging.reset();
    const sp = MAPS[area].spawn;
    G.px = sp.x * TILE + 3;
    G.py = sp.y * TILE + 2;
    particles = [];
    goldDrop = null;
    goldTimer = 2;
    buildTileCache();
    updateHud();
    AudioEngine.play(MAPS[area].sound);
    let pendingScript = null;
    if (area === "garden" && !F.gardenWoke) {
      F.gardenWoke = true;
      pendingScript = "gardenWake";
    }
    Expedition.transitionTimers.push(setTimeout(() => {
      ui.fade.classList.remove("on");
      transitionLock = false;
      Expedition.onAreaChange();
      if (pendingScript) playScript(pendingScript);
      if (area === "storm") startStormSequence();
      startAreaScene();
      saveRun();
    }, 650));
  }, 550));
}

function applyStoryStage(line) {
  const cue = line.stage;
  if ((cue?.area && MAPS[cue.area] && G.area !== cue.area) || cue?.scene === "tower" || cue?.scene === "curtain" || cue?.takeover) {
    Expedition.chapterTime = 0;
    Expedition.dom.chapterCard.classList.remove("visible");
  }
  if (cue?.area && MAPS[cue.area] && G.area !== cue.area) {
    G.area = cue.area;
    particles = [];
    goldDrop = null;
    buildTileCache();
    AudioEngine.play(MAPS[G.area].sound);
  }
  if (cue?.at) {
    G.px = cue.at[0] * TILE + 3;
    G.py = cue.at[1] * TILE + 2;
    G.walk = 0;
  }
  if (cue?.dir !== undefined) G.dir = cue.dir;
  if (cue?.pose === "pain") painFlash = 0.8;
  StoryStaging.onLine(line);
  if (cue) { updateHud(); Expedition.sync(); }
}

function startAreaScene() {
  if (dialogActive || transitionLock || Expedition.paused() || !ui.start.hidden || !ui.ending.hidden) return;
  if (G.area === "meta") { Finale.enter(); return; }
  if (G.area === "house_empty" && !F.emptyWoke) playScript("bed");
  else if (G.area === "house_family") {
    if (F.familyDone) gotoArea("blood", "第二幕 · 荒诞的转变");
    else if (!F.familyWoke) playScript("famBed");
  }
  else if (G.area === "blood") {
    if (F.refused) gotoArea("rain", "显意识的边缘");
    else if (!F.sister) playScript("sister");
    else if (F.parents) playScript("accuse");
  }
}

/* ============================== 金色雨滴（终章） ============================== */

// Kept as a no-op for old saves; the true answer is a textual interaction.
function updateGoldDrop(_dt) {}

/* ============================== 高塔演出：塔层滚动与上升人影 ============================== */

function startStormSequence() {
  if (G.area !== "storm" || stormSequenceStarted || dialogActive || transitionLock || Expedition.paused() || !ui.start.hidden) return;
  stormSequenceStarted = true;
  StormFlight.reset();
  if (F.storm2) {
    // 旧版已听完红月对白的存档，无需再寻找旧出口。
    playLines([SCRIPTS.storm2.lines.at(-1)], () => gotoArea("garden"));
  } else if (!F.storm1) {
    playScript("storm1");
  }
}

function updateStorm(dt) {
  if (G.area !== "storm" || transitionLock || Expedition.paused() || !ui.start.hidden || !ui.ending.hidden) return;
  startStormSequence();
  StormFlight.update(dt);
  if (!Expedition.prefs.motion && Math.random() < dt * 0.06) lightning = 0.22;
  if (lightning > 0) lightning = Math.max(0, lightning - dt);
  if (F.storm1 && !F.storm2 && !dialogActive && Math.abs(StormFlight.x - 194) < 9 && !META.shards.includes(MAPS.storm.shard.name)) {
    META.shards.push(MAPS.storm.shard.name);
    saveMeta();
    notify("拾取记忆碎片：雨之碎片（跨周目保留）");
    Expedition.chime(660, 0.2);
    updateHud();
  }
}

function renderStorm(now, dt) {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  StormFlight.render(now);
  if (!Expedition.prefs.motion && lightning > 0) {
    ctx.fillStyle = `rgba(215,228,250,${Math.min(0.26, lightning)})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  if (F.storm1 && !F.storm2 && !dialogActive && !META.shards.includes(MAPS.storm.shard.name)) {
    const y = StormFlight.y;
    ctx.fillStyle = "#f0e8c8";
    ctx.beginPath(); ctx.moveTo(194, y - 5); ctx.lineTo(198, y); ctx.lineTo(194, y + 5); ctx.lineTo(190, y); ctx.closePath(); ctx.fill();
  }
  if (notifyT > 0 && notifyMsg) {
    ctx.fillStyle = "rgba(10,10,16,0.85)";
    ctx.fillRect(8, VIEW_H - 20, VIEW_W - 16, 14);
    ctx.fillStyle = "#e8d8a8"; ctx.font = "9px sans-serif";
    ctx.fillText(notifyMsg, 14, VIEW_H - 10);
  }
  Expedition.render(dt, { x: 0, y: 0 }, now);
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
    const a = StoryStaging.family === "table" || StoryStaging.family === "gone" ? 0 : 0.05 + hash(Math.floor(t * 8), 1, 1) * 0.08;
    ctx.fillStyle = `rgba(160,190,230,${a})`;
    ctx.fillRect(12 * TILE - cam.x, 1 * TILE - cam.y, 44, 28);
    const tvX = 14 * TILE - cam.x, tvY = TILE - cam.y;
    ctx.fillStyle = "#101018"; ctx.fillRect(tvX, tvY, 17, 12);
    ctx.fillStyle = a ? "#617f9a" : "#171c24"; ctx.fillRect(tvX + 2, tvY + 2, 13, 7);
    if (a) { ctx.fillStyle = "#abbac4"; ctx.fillRect(tvX + 4, tvY + 6, 8, 1); }
    ctx.fillStyle = "#18161a"; ctx.fillRect(tvX + 7, tvY + 12, 3, 2);
  } else if (id === "blood") {
    // The hand and heart, then two charred remains: the objects described in the scene.
    const sx = 13 * TILE + 8 - cam.x, sy = 7 * TILE + 8 - cam.y;
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(Math.PI / 2);
    drawPerson(ctx, -6, -8, { coat: "#603345", hair: "#211318", skin: "#aa8278", dir: 0 });
    ctx.restore();
    const px = 13 * TILE - cam.x, py = 15 * TILE - cam.y;
    ctx.fillStyle = "#09080a"; ctx.fillRect(px - 3, py + 1, 8, 13); ctx.fillRect(px + 5, py + 2, 8, 12);
    ctx.strokeStyle = "#bc6739"; ctx.beginPath(); ctx.moveTo(px - 1, py - 3); ctx.lineTo(px + 12, py + 12); ctx.stroke();
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
  canvas.setAttribute("aria-label", G.area === "storm" ? "向天空红月逆落的画面。左右略微偏移，E 或空格伸手、推进对白。" : "箱庭探索画面。方向键或 WASD 移动，E 互动，Shift 快走。");
  const p = Math.min(3, G.counters.pain || 0);
  const pain = p > 0 ? ` · 头痛 ${"▮".repeat(p)}${"▯".repeat(3 - p)}` : "";
  ui.hudRight.textContent = `记忆 ${G.memories.length} · 碎片 ${META.shards.length}/8${pain}`;
}

function render(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;

  if (!Expedition.paused()) {
    movePlayer(dt);
    if (!Expedition.prefs.motion) { spawnAmbient(dt); updateParticles(dt); }
    updateGoldDrop(dt);
    updateStorm(dt);
  }
  if (painFlash > 0) painFlash -= dt * 0.7;

  // 打字机
  if (!Expedition.paused() && dialogActive && !typeDone && dialogLines[dialogIndex] && dialogLines[dialogIndex].t) {
    typeTimer += dt;
    const full = currentFullText();
    const n = Expedition.prefs.speed === 0 ? full.length : Math.min(full.length, Math.floor(typeTimer / Expedition.prefs.speed));
    if (ui.dialogText.textContent !== full.slice(0, n)) paintText(full.slice(0, n), dialogLines[dialogIndex].c);
    if (n >= full.length) { typeDone = true; updateDialogStatus(); }
  }
  if (notifyT > 0) notifyT -= dt;

  if (G.area === "storm") {
    renderStorm(now, dt);
    requestAnimationFrame(render);
    return;
  }

  if (StoryStaging.renderSpecial(now, dt)) {
    Expedition.render(dt, { x: 0, y: 0 }, now);
    requestAnimationFrame(render);
    return;
  }

  if (G.area === "meta") {
    Finale.render(now, dt);
    Expedition.render(dt, { x: 0, y: 0 }, now);
    requestAnimationFrame(render);
    return;
  }

  // 相机
  const map = MAPS[G.area];
  const mw = map.grid[0].length * TILE;
  const mh = map.grid.length * TILE;
  const cam = StoryStaging.camera(map, {
    x: Math.max(0, Math.min(mw - VIEW_W, G.px + 6 - VIEW_W / 2)),
    y: Math.max(0, Math.min(mh - VIEW_H, G.py + 8 - VIEW_H / 2)),
  });

  ctx.clearRect(0, 0, VIEW_W, VIEW_H);

  ctx.drawImage(tileCache, cam.x, cam.y, VIEW_W, VIEW_H, 0, 0, VIEW_W, VIEW_H);

  // 红月光晕：挂在无穷层的顶端
  if (map._moon) {
    const mx = map._moon.x - cam.x;
    const my = map._moon.y - cam.y;
    const pulse = Expedition.prefs.motion ? 1 : 1 + Math.sin(now / 600) * 0.12;
    for (const [r, a] of [[34, 0.1], [22, 0.14], [13, 0.2]]) {
      ctx.fillStyle = `rgba(208,74,58,${a})`;
      ctx.beginPath();
      ctx.arc(mx, my, r * pulse, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const t = Expedition.prefs.motion ? 0 : now / 1000;
  // 动态瓦片（水、红月、水晶花、花、残骸余火、洗衣机）
  for (const { x, y, ch } of map._dynamic) {
    const sx = x * TILE - cam.x;
    const sy = y * TILE - cam.y;
    if (sx > -TILE && sx < VIEW_W && sy > -TILE && sy < VIEW_H) {
      ctx.save();
      ctx.translate(sx - x * TILE, sy - y * TILE);
      drawTile(ctx, ch, x, y, map, t);
      ctx.restore();
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
    if (dialogActive) return;
    const sx = tx * TILE + 8 - cam.x;
    const sy = ty * TILE - 4 - cam.y + Math.sin(t * 4) * 2;
    ctx.fillStyle = active ? "#f0d88a" : "rgba(240,216,138,0.55)";
    ctx.font = "8px monospace";
    ctx.fillText("!", sx - 2, sy);
  };
  for (const it of map.interact || []) drawMarker(it.x, it.y, near && near.it === it);
  for (const n of map.npcs || []) {
    if (n.cond && !F[n.cond]) continue;
    const actor = StoryStaging.npc(n);
    if (!actor.hidden) drawMarker(actor.x, actor.y, near && near.it === n);
  }

  StoryStaging.renderProps(cam, t);

  // NPC
  for (const n of map.npcs || []) {
    if (n.cond && !F[n.cond]) continue;
    const actor = StoryStaging.npc(n);
    if (actor.hidden) continue;
    const sx = actor.x * TILE + 2 - cam.x;
    const sy = actor.y * TILE - cam.y;
    if (n.kind === "father") drawPerson(ctx, sx, sy, { coat: "#5a5248", hair: "#3a342c", beard: true, dir: actor.dir, pose: actor.pose });
    else if (n.kind === "mother") drawPerson(ctx, sx, sy, { coat: "#7a5a5a", hair: "#4a342c", bun: true, dir: actor.dir, pose: actor.pose });
    else if (n.kind === "repress") drawPerson(ctx, sx, sy, { coat: "#4a4a55", hood: true, skin: "#b8b8c0", glow: "#7fb3d5", dir: 0 });
    else if (n.kind === "senpai") drawPerson(ctx, sx, sy, { coat: "#c8b890", hair: "#e8dcc0", glow: "#f0e0a8", dir: 3 });
    else if (n.kind === "echo") {
      ctx.globalAlpha = 0.4 + Math.sin(t * 2) * 0.12;
      drawPerson(ctx, sx, sy + Math.sin(t * 1.5) * 2, { coat: "#9fc0d8", hair: "#d0e4f0", skin: "#cfe0ea", dir: 0 });
      ctx.globalAlpha = 1;
    } else if (n.kind === "table") { /* 桌子是瓦片画的 */ }
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
    const catchY = goldDrop.catchY - cam.y;
    ctx.strokeStyle = "#f0d060";
    ctx.beginPath(); ctx.ellipse(gx, catchY, 11, 4, 0, 0, Math.PI * 2); ctx.stroke();
    // A visible overhead glint announces rain even outside the camera.
    ctx.fillStyle = "#f0d060";
    if (gy < 22) ctx.fillRect(gx - 2, 24, 4, 6);
    ctx.strokeStyle = "rgba(240,208,96,0.2)";
    ctx.beginPath(); ctx.moveTo(gx, Math.max(24, gy)); ctx.lineTo(gx, catchY); ctx.stroke();
  }

  // 玩家
  const playerX = StoryStaging.coffin ? 12 * TILE : G.px;
  const playerY = StoryStaging.coffin ? 7.5 * TILE : G.py;
  drawPerson(ctx, playerX - cam.x, playerY - cam.y, { dir: G.dir, walk: G.walk, coat: "#3a4a6a", ...StoryStaging.playerOptions() });

  drawParticles(ctx, cam);

  // 偏头痛红闪
  if (painFlash > 0 && !Expedition.prefs.motion) {
    ctx.fillStyle = `rgba(150,30,30,${Math.min(0.32, painFlash * 0.3)})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  // 闪电（高塔与心象的雨夜）
  if (!Expedition.prefs.motion && (G.area === "storm" || G.area === "rain") && Math.random() < dt * 0.06) lightning = 0.22;
  if (lightning > 0) {
    lightning -= dt;
    ctx.fillStyle = `rgba(215,228,250,${Math.min(0.26, lightning)})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  // 空屋灯光偶发闪烁
  if (!Expedition.prefs.motion && G.area === "house_empty" && Math.random() < dt * 0.15) houseFlicker = 0.1;
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

  Expedition.render(dt, cam, now);
  PhenomenonBattle.render(now, dt, cam);
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
  clearInput();
  ui.codex.hidden = !ui.codex.hidden;
  ui.codexButton.setAttribute("aria-expanded", String(!ui.codex.hidden));
  if (!ui.codex.hidden) renderCodex();
  else Expedition.focusGameplay();
});
ui.audioButton.addEventListener("click", () => AudioEngine.toggle());
ui.restartButton.addEventListener("click", () => {
  if (window.confirm("要清除本周目进度，从镜像阶段重新开始吗？（碎片与结局图鉴保留）")) resetRun();
});
ui.endingRestart.addEventListener("click", resetRun);
ui.endingStay.addEventListener("click", () => { leaveEnding(); canvas.focus({ preventScroll: true }); });
ui.startButton.addEventListener("click", () => {
  ui.start.hidden = true;
  canvas.focus({ preventScroll: true });
  Expedition.onAreaChange();
  if (restoreEnding()) return;
  if (G.area === "storm") startStormSequence();
  startAreaScene();
  if (G.area === "mirror" && !F.m1 && !F.m2 && !F.m3) {
    playLines([
      "……睁开眼睛的时候，首先看到的是自己的手。",
      "回廊两侧立满了镜子。它们都在等着被看。",
    ], () => {});
  }
});

/* ============================== 启动 ============================== */

loadAll();
StoryStaging.reset();
buildTileCache();
updateHud();
Expedition.init();
Finale.init();
PixelArt.init();
PhenomenonBattle.init();
requestAnimationFrame(render);
