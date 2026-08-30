const testRunId = new URLSearchParams(window.location.search).get("test");
const STORAGE_KEY = testRunId ? `wuzhong-returner-new-v2-test-${testRunId}` : "wuzhong-returner-new-v2";
const DEFAULT_VOLUME = 0.18;
const RAIN_DURATION = 18000;
const CONTEST_DURATION = 18000;
const RAIN_SPAWN_INTERVAL = 340;
const CONTEST_DRIFT_PER_TICK = 0.23;
const CONTEST_COMBO_WINDOW = 950;
const CONTEST_RHYTHM_CYCLE = 1500;
const CONTEST_RHYTHM_WINDOW_START = 820;
const CONTEST_RHYTHM_WINDOW_END = 1240;
const TRUE_ROUTE_MIN_HITS = 10;
const TRUE_ROUTE_BALANCE_WINDOW = 22;
const COMPANION_OCCURRENCES = ["mirror_3", "storm_2"];
const RAIN_KEY_SCHEDULES = {
  tower: [
    { id: "name", time: 1800, lane: 0 },
    { id: "rain", time: 9000, lane: 1 },
  ],
  twilight: [
    { id: "echo", time: 1800, lane: 2 },
    { id: "tomorrow", time: 5200, lane: 3 },
    { id: "name", time: 9000, lane: 0 },
    { id: "rain", time: 13000, lane: 1 },
  ],
};
const KEY_RAIN_LANES = [14, 36, 60, 82];
const KEY_RAIN_IDS = ["name", "rain", "echo", "tomorrow"];
const STORY_VERSION = 6;
const companionReplies = {
  mirror_3: "……",
  storm_2: "……",
};

const galleryCatalog = {
  mirror: { title: "镜前的拼接物", art: "./assets/mirror.svg", poem: "有头，有手，有脚。\n拼接起来，暂时叫作我。" },
  storm: { title: "红月之下", art: "./assets/storm.svg", poem: "声音在听清之前离去。\n无名的人向上看去。" },
  rain: { title: "接住雨水的手", art: "./assets/rain.svg", poem: "大多数从指缝漏过。\n但只要有一滴留下。" },
  coffin: { title: "花园中的容器", art: "./assets/coffin-garden.svg", poem: "棺木不是终点。\n它像一扇向内打开的门，\n把醒来送回梦中。" },
  photo: { title: "四条腿的全家福", art: "./assets/photo-fragment.svg", poem: "中央的人仍然年轻。\n背后有两个人，或许不止。\n残缺没有说谎，只是拒绝说完。" },
  breakfast: { title: "三碗白粥的清晨", art: "./assets/family-breakfast.svg", poem: "新闻、咸味、母亲的白发。\n日常归位时，缺席也就拥有了形状。" },
  blood: { title: "被错误组合的庭院", art: "./assets/blood-courtyard.svg", poem: "火是真的，血是真的。\n幸存是真的，死去也是真的。\n可是把刀交到我手里的句子，不是真的。" },
  crystal: { title: "无垠之萍", art: "./assets/crystal-flower.svg", poem: "无不是空洞。\n无是没有最大元的尽头。\n我从那里归来，于是我重新设定开始。" },
};

const endingCatalog = {
  echo: { title: "声音在听清以前离去", element: "离去的声音" },
  rain: { title: "手心里仍然留下了一滴", element: "留下的雨水" },
  abyss: { title: "承认乌有的罪孽", element: "乌有的罪孽" },
  twilight: { title: "黄昏困境", element: "无尽的黄昏" },
  unconscious: { title: "无意识主体", element: "无意识主体" },
  true: { title: "再度走向明天", element: "尚未写完的明天" },
};

const defaultState = {
  scene: "mirror_1",
  protagonistName: "周防",
  memories: [],
  gallery: [],
  endingHistory: [],
  choices: [],
  readbacks: 0,
  rewriteCount: 0,
  rewritePulse: false,
  rainScore: 0,
  rainAttempts: 0,
  rainBestCombo: 0,
  rainCaught: 0,
  rainMissed: 0,
  keyRainCollected: [],
  companionClicks: [],
  companionComplete: false,
  contestAttempts: 0,
  contestA: 50,
  contestB: 50,
  contestWinner: "",
  contestResolved: false,
  contestRoundStarted: false,
  contestHits: 0,
  contestStreak: 0,
  contestLastSide: "",
  contestRhythm: 0,
  contestRhythmBest: 0,
  contestMemoryHeld: false,
  rainRunFinished: false,
  rainMode: "",
  rainNextScene: "",
  lastRainMessage: "",
  lastRainRunScore: 0,
  currentEnding: "",
  storyVersion: STORY_VERSION,
  mainlineReached: false,
  counters: {},
  audioOn: false,
  volume: DEFAULT_VOLUME,
};

const clone = (value) => structuredClone(value);

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!saved || typeof saved !== "object") return clone(defaultState);
    const next = { ...clone(defaultState), ...saved };
    ["memories", "gallery", "endingHistory", "choices", "keyRainCollected", "companionClicks"].forEach((key) => {
      if (!Array.isArray(next[key])) next[key] = clone(defaultState[key]);
    });
    ["readbacks", "rewriteCount", "rainScore", "rainAttempts", "rainBestCombo", "rainCaught", "rainMissed", "contestAttempts", "contestHits", "contestStreak", "contestRhythm", "contestRhythmBest", "lastRainRunScore"].forEach((key) => {
      if (!Number.isFinite(next[key]) || next[key] < 0) next[key] = defaultState[key];
    });
    ["contestA", "contestB"].forEach((key) => {
      if (!Number.isFinite(next[key])) next[key] = defaultState[key];
      next[key] = Math.max(0, Math.min(100, next[key]));
    });
    next.keyRainCollected = [...new Set(next.keyRainCollected.filter((id) => KEY_RAIN_IDS.includes(id)))];
    next.companionClicks = [...new Set(next.companionClicks.filter((id) => COMPANION_OCCURRENCES.includes(id)))];
    next.endingHistory = [...new Set(next.endingHistory.filter((id) => endingCatalog[id]))];
    next.currentEnding = endingCatalog[next.currentEnding] ? next.currentEnding : "";
    next.contestWinner = ["", "abyss", "twilight"].includes(next.contestWinner) ? next.contestWinner : "";
    next.contestResolved = Boolean(next.contestResolved);
    next.contestRoundStarted = Boolean(next.contestRoundStarted);
    next.contestMemoryHeld = Boolean(next.contestMemoryHeld);
    next.rainRunFinished = Boolean(next.rainRunFinished);
    next.rainMode = ["", "tower", "twilight"].includes(next.rainMode) ? next.rainMode : "";
    next.rainNextScene = ["garden_1", "rain_death"].includes(next.rainNextScene)
      ? next.rainNextScene
      : "";
    next.audioOn = Boolean(next.audioOn);
    next.lastRainMessage = typeof next.lastRainMessage === "string" ? next.lastRainMessage : "";
    next.counters = next.counters && typeof next.counters === "object" && !Array.isArray(next.counters)
      ? next.counters
      : {};
    next.mainlineReached = Boolean(next.mainlineReached);
    const legacyStory = Number(next.storyVersion || 0) < STORY_VERSION;
    if (legacyStory && (saved.scene === "contest" || saved.scene === "rewind" || saved.scene.startsWith("ending_") || (saved.scene === "mirror_2" && next.readbacks > 0))) {
      next.scene = "garden_1";
      next.mainlineReached = false;
      next.rainRunFinished = false;
      next.contestRoundStarted = false;
      next.contestResolved = false;
      next.contestMemoryHeld = false;
      next.rainMode = "";
      next.rainNextScene = "";
    }
    next.storyVersion = STORY_VERSION;
    next.companionComplete = COMPANION_OCCURRENCES.every((id) => next.companionClicks.includes(id));
    return next;
  } catch {
    return clone(defaultState);
  }
}

let state = loadState();
let activeLines = [];
let activeLineIndex = 0;
let storyHistoryOpen = false;
let storyHistorySyncing = false;
let storyHistoryCloseTimer = 0;
let transitionLock = false;
let audioContext = null;
let masterGain = null;
let currentSoundscape = null;
let rainRuntime = null;
let contestRuntime = null;

const $ = (id) => document.getElementById(id);
const stage = $("stage");
const artFrame = document.querySelector(".art-frame");
const sceneArt = $("sceneArt");
const sceneIndex = $("sceneIndex");
const sceneKicker = $("sceneKicker");
const sceneTitle = $("sceneTitle");
const storyText = $("storyText");
const continueButton = $("continueButton");
const choices = $("choices");
const contestPanel = $("contestPanel");
const contestInstruction = $("contestInstruction");
const contestTimer = $("contestTimer");
const contestATitle = $("contestATitle");
const contestBTitle = $("contestBTitle");
const contestAScore = $("contestAScore");
const contestBScore = $("contestBScore");
const contestAStatus = $("contestAStatus");
const contestBStatus = $("contestBStatus");
const contestAStrength = $("contestAStrength");
const contestBStrength = $("contestBStrength");
const contestAButton = $("contestAButton");
const contestBButton = $("contestBButton");
const contestASide = $("contestA");
const contestBSide = $("contestB");
const contestResult = $("contestResult");
const contestPhase = $("contestPhase");
const contestWhisper = $("contestWhisper");
const contestABalance = $("contestABalance");
const contestBBalance = $("contestBBalance");
const contestBalanceMarker = $("contestBalanceMarker");
const contestTimeProgress = $("contestTimeProgress");
const contestHits = $("contestHits");
const contestRhythm = $("contestRhythm");
const contestRhythmProgress = $("contestRhythmProgress");
const contestTargetLabel = $("contestTargetLabel");
const contestTargetHint = $("contestTargetHint");
const contestTargetBox = document.querySelector(".contest-target");
const contestPower = $("contestPower");
const contestRainPower = $("contestRainPower");
const contestBeat = $("contestBeat");
const contestImpactLayer = $("contestImpactLayer");
const contestMemoryRoute = $("contestMemoryRoute");
const contestMemoryHint = $("contestMemoryHint");
const contestMemoryButton = $("contestMemoryButton");
const rewindPanel = $("rewindPanel");
const rewindTitle = $("rewindTitle");
const rewindInstruction = $("rewindInstruction");
const rainField = $("rainField");
const rainScore = $("rainScore");
const rainRunScore = $("rainRunScore");
const keyRainCount = $("keyRainCount");
const rainTimer = $("rainTimer");
const rainCaught = $("rainCaught");
const rainMissed = $("rainMissed");
const rainCombo = $("rainCombo");
const rainFeedback = $("rainFeedback");
const rainComboHud = $("rainComboHud");
const rainTimeProgress = $("rainTimeProgress");
const rainImpactLayer = $("rainImpactLayer");
const rainCatchZone = document.querySelector(".rain-catch-zone");
const rewriteButton = $("rewriteButton");
const memoryList = $("memoryList");
const memoryRouteList = $("memoryRouteList");
const memoryRouteHint = $("memoryRouteHint");
const endingList = $("endingList");
const endingProgress = $("endingProgress");
const echoText = $("echoText");
const stateWhisper = $("stateWhisper");
const companionSection = $("companionSection");
const companionEcho = $("companionEcho");
const readButton = $("readButton");
const audioButton = $("audioButton");
const galleryDialog = $("galleryDialog");
const galleryGrid = $("galleryGrid");
const transitionOverlay = $("transitionOverlay");
const galleryButton = $("galleryButton");
const closeGalleryButton = $("closeGalleryButton");
const restartButton = $("restartButton");
const transitionImage = transitionOverlay.querySelector(".transition-image");
const transitionCaption = transitionOverlay.querySelector("p");

const soundscapeCatalog = {
  mirror: "镜面低鸣",
  storm: "暴雨与远雷",
  void: "花园虚无",
  emptyHome: "空屋静噪",
  home: "日常房间",
  pain: "偏头痛压迫",
  audience: "恶意观众",
  horror: "血色庭院",
  twilight: "黄昏之海",
  rain: "雨塔水声",
  meta: "元语言脉冲",
};

const legacyScenes = {
  mirror_1: {
    kicker: "镜像阶段",
    title: "镜前的拼接物",
    art: "./assets/mirror.svg",
    echo: "从一开始，自我的构筑就混入了别的东西吧。",
    gallery: ["mirror"],
    memories: ["[是的]要素"],
    text: [
      "站在镜子前的，到底是什么样的存在？",
      "有头，那是的。有手，那是的。有脚，那是的。但这一整个拼接在一起的，是什么？",
      "这个站在我前面的家伙，有尖尖的耳朵，有圆圆的脸庞，有大大的眼睛。那么，拼接了这些[是的]要素在一起的东西，应该也[是的]呢。",
      "那是，[我]吧。",
    ],
    choices: [{ label: "听见那个承认你的声音", to: "mirror_2", primary: true }],
  },
  mirror_2: {
    kicker: "镜像阶段",
    title: "他者的要求",
    art: "./assets/mirror.svg",
    echo: "是了，那些都是哦。不仅如此，你还要这样，那样。",
    memories: ["他者的承认", "被要求", "误认"],
    text: [
      { className: "quote", text: "是了，那是你哦。Ta这样说着。是了，那些都是哦。不仅如此，你还要这样，那样。于是，这样，那样就变得是的了。" },
      "从一开始，自我的构筑就混入了别的东西吧。更进一步地说，自我就是由别的东西统合而成的吧。更是有什么，在替着我们做着保证。",
      "俄狄浦斯三大时刻，以及神经症，诞生于此的人们，陷入在不确定的恐慌之中。从不断的误认，不断的被要求中，ta们逐渐在一次次的认可中确认了自己的形态。",
      "如果有一天我被抛弃了会怎样呢？为了继续活下去，人们竭尽全力的想要满足ta。但是，人们总是不知道ta想要什么。",
    ],
    choices: [{ label: "继续听那个关于缺失与法则的故事", to: "mirror_3", primary: true }],
  },
  mirror_3: {
    kicker: "镜像阶段",
    title: "被放逐的名",
    art: "./assets/mirror.svg",
    echo: "在进入Ta的世界时，我们就已经被分割为了两种形态。",
    memories: ["无法接受的名", "缺失的法则", "永恒的变动者", "无意识主体"],
    text: [
      "再后来，人们终于在一次又一次的表演，一次又一次的遵循中明白，ta在渴求着什么，因为ta没有了这个东西。",
      "可是，我们不是已经拥有着这个吗？享受着养育的人们不明白为什么ta任然这么热衷于此，唯一的解释是：ta的确曾经拥有，但已经被剥夺了。剥夺需要有执行者，于是一个狂妄的小偷被设想出来，Ta夺走了ta的那个东西，从而使得照料着人们、给予人们爱的ta一次又一次的被吸引过去，从而造就了如此的不安。",
      "因而，只需要把那个Ta杀掉就好了吧。只需要让Ta消失在世界上，ta就不会再离我而去了吧。可是如果只是这样，ta依旧可能被其他的Ta吸引而去的吧，真正重要的，不是成为让ta去追逐的那个东西吗？",
      "于是，人们怀着这样的爱恨，将自身化为了那永恒的变动者，那填入空隙的息壤。",
      "但让它绝不能想到的事情发生了。在ta的承认下，小偷的形象从而消失殆尽，取代之的是一个覆盖了方方面面的秩序，统辖所有人，指示你如何去做事的法则。",
      "也就是说，那个对于人们至高无上的ta，本身就没有那个幻想中被夺取的东西，ta本身就是缺失着的。",
      "那种不可能得以实现的恐惧淹没了一切，惊恐的人们却在这一过程中逐渐的放下，看到了新的希望：如果连ta都要遵守那样的规则，那规则必定也为我绘制了崭新的，生存的出路。",
      "只是，那名为小偷的亡灵似乎还没有完全消退，那想要回到最初的圆满之愿望，似乎还没有完全随之而去，而是转变成了另一种形状，向着那个本来就不存在的空缺指去...",
      "在进入Ta的世界时，我们就已经被分割为了两种形态。一者是自对ta的误认中产生的自我，一者是遵循着Ta的律法而工作着的、特异的事物，是那个被[我]所拒绝的，与自身截然不同者。",
      "那里同样也是，埋藏我等无法接受之物的所在。",
      "但是啊，总是会回来的，那些我们不愿意去接受，没有办法去接受的[名]。无论以何种方式，无论以何种辗转，总是会自那个与[我]们截然不同的地方回归，无论这种方式我们能否接受。",
      { className: "quote", text: "所以啊，你想起来了吗，你的一切？我无名的旅伴？" },
    ],
    choices: [{ label: "让故事从雨里开始", to: "storm_1", primary: true }],
  },
  storm_1: {
    kicker: "故事揭幕之前",
    title: "名字擦过耳边",
    art: "./assets/storm-tower.svg",
    echo: "是从什么时候开始的呢？是在什么地方结束的呢？",
    gallery: ["storm"],
    memories: ["被呼喊的名字"],
    text: [
      "是从什么时候开始的呢？是在什么地方结束的呢？",
      "混乱的画面交叉着流过，声音好似擦过耳边的箭矢，自远方袭来，却又在你听清前离去。",
      "有什么在呼喊着一个名字？那是我的名字吗？但，那真的是我的名字吗，还是别乎于我的他物？",
      "这是一场雷暴雨。唯一能被确定的事实就是如此。",
      "在偶尔闪过的白光与暗影的怀抱中掉出无尽螺旋的回廊，这也许就是我的命运吧。",
    ],
    choices: [{ label: "向上抓住那滴雨", to: "storm_2", primary: true }],
  },
  storm_2: {
    kicker: "无尽圆塔",
    title: "红月之下",
    art: "./assets/storm-tower.svg",
    echo: "下一个奇点再见吧，无名的旅伴。",
    memories: ["红月", "螺旋之塔"],
    text: [
      "这双手似乎还想留住什么。向上抓去，余留在手心的却只有仍然向下流去的雨滴。",
      "噔。噔。噔。",
      "无穷向上延伸的回廊，响起了脚步声。无名的人向上看去，红色的月亮挂在无尽轮回的高塔之上。",
      "而在红月下方，有一个浑黑的身影，仿佛违反了物理法则一般，从高塔之中向月亮落去。",
      { className: "quote", text: "下一个奇点再见吧，无名的旅伴。" },
    ],
    choices: [
      { label: "在坠落中伸手，留下仍在下落的雨", action: "rain", rainMode: "tower", rainNext: "garden_1", primary: true },
      { label: "让声音在听清以前离去", action: "ending", ending: "echo" },
      { label: "把仍在下落的雨留在手心", action: "ending", ending: "rain" },
    ],
  },
  garden_1: {
    kicker: "神圣虚无",
    title: "花园中的周防",
    art: "./assets/coffin-garden.svg",
    echo: "自花园中醒来的，是一头雾水的男人。",
    gallery: ["coffin"],
    memories: ["周防", "无中归来者"],
    text: [
      "自花园中醒来的，是一头雾水的男人。",
      "要不是那差点把他憋死的棺材上铭刻着必要的信息，他或许现在连自己是谁都忘记了。",
      "男人名叫周防。目前来看是生理和心理的双重男性，身体年龄似乎在二十至三十之间。但棺材上没有铭刻这方面的内容。",
      "除此之外，他彻底遗忘了来到花园前所有的记忆。每当他尝试回忆，突如其来的偏头痛都会把他折磨得被迫停止。",
    ],
    choices: [
      { label: "尝试回忆来到花园之前", to: "garden_memory" },
      { label: "检查花园边界", to: "garden_edge" },
      { label: "回到棺材前", to: "coffin_1", primary: true },
    ],
  },
  garden_memory: {
    kicker: "神圣虚无",
    title: "追溯不能发生",
    art: "./assets/coffin-garden.svg",
    echo: "到底是什么样的过去，才会使得连追溯这一行为本身都不能发生？",
    memories: ["偏头痛"],
    text: [
      "周防试图回忆一下，检查是否有哪个记忆的角落幸存下来。",
      "然而，右侧头部骤然刺痛。词语尚未组织，感官就先把它打碎。思绪尚未集中，痛苦便将它撕裂。",
      "到底是什么样的过去，才会使得连追溯这一行为本身都不能发生？周防不知道。",
    ],
    choices: [
      {
        label: "强行再度追溯一次",
        to: "garden_memory",
        increment: "recallAttempts",
        threshold: 3,
        thresholdTarget: "bad_twilight",
      },
      { label: "扶着棺材站稳", to: "garden_1", primary: true },
    ],
  },
  garden_edge: {
    kicker: "神圣虚无",
    title: "世界边界",
    art: "./assets/coffin-garden.svg",
    echo: "这个小花园像是有着游戏中的世界边界一样。",
    memories: ["花园边界"],
    text: [
      "这个小花园像是有着游戏中的世界边界一样。",
      "无论朝哪一个方向走，在离开棺材一定距离之后，周防都不能再前进。不是墙，不是力，而是距离本身不再产生。",
      "看来，想要破局，得回到自己苏醒的容器。",
    ],
    choices: [{ label: "回到棺材前", to: "coffin_1", primary: true }],
  },
  coffin_1: {
    kicker: "神圣虚无",
    title: "棺材铭文",
    art: "./assets/coffin-garden.svg",
    echo: "回到你的梦里去，回到那永恒的拒绝中去。",
    inscriptions: ["自无中归来的人啊，醒来，醒来\n回到你的梦里去，回到那永恒的拒绝中去"],
    text: [
      "周防打开棺木，看向底部。果然，如同棺材表面一样，上面也铭刻着些许字符。",
      { className: "quote", text: "自无中归来的人啊，醒来，醒来\n回到你的梦里去，回到那永恒的拒绝中去" },
      "这句话好奇怪。既然要醒来，为什么回到的是梦中？难不成，我身处在[多重梦境]内部？还有，永恒的拒绝是什么意思？",
      "如果我是从无中归来的，那么我必然先到达于无。那我是什么，一个重生者吗？还是一个重新自无主体状态构建出[自我]概念的人？",
    ],
    choices: [
      { label: "继续推理梦境与现实", to: "coffin_thought" },
      { label: "再次躺入棺材", to: "coffin_sleep", primary: true },
    ],
  },
  coffin_thought: {
    kicker: "神圣虚无",
    title: "梦中沉眠",
    art: "./assets/coffin-garden.svg",
    echo: "如果我在梦中清醒，那么我必然在现实中沉眠。",
    memories: ["梦中沉眠"],
    text: [
      "如果这是多重梦境，那么从中醒来就好解释了。我只需要找到一种脱出本层的方法即可，例如自杀。",
      "可是，如果不是这样的解释，那岂不是白白死去了？",
      "或者说，如果我在梦中清醒，那么我必然在现实中沉眠。那么反过来，在梦中沉眠呢？或许可以打破这个僵局。",
    ],
    choices: [{ label: "躺回棺材", to: "coffin_sleep", primary: true }],
  },
  coffin_sleep: {
    kicker: "神圣虚无",
    title: "表象碎裂",
    art: "./assets/coffin-garden.svg",
    echo: "看来新的倒霉蛋出现了呢。",
    text: [
      "周防再一度迈入棺材，躺下，将自己刚刚推开的棺材板重新覆盖在头顶，然后再一度陷入沉眠。",
      "在一切尚未发生之时，万千的表象被撕扯开联系，撕扯开因果，化为无数片。",
      "而后，一缕光芒自不知何处降临，将近乎所有的表象再度撕扯而去，只落下些许暗淡而重复的时刻。",
      { className: "quote", text: "这是……[我]！" },
      "虚空中，无数张眼睛被张开。看来新的倒霉蛋出现了呢。这次，我们又可以增添多少乐趣了呢？无论胜负如何，我们总归会得到一个好故事。",
    ],
    choices: [{ label: "故事揭幕", to: "act_1", primary: true }],
  },
  act_1: {
    kicker: "第一幕",
    title: "故事开场",
    art: "./assets/storm-tower.svg",
    echo: "故事应当在最熟悉的地方开场，不是吗？",
    text: [
      "故事应当在最熟悉的地方开场，不是吗？不，或许还是在最为日常的一处展开为好吧。或许，应该在最激烈的高潮开始？",
      "呓语般争论不休，不知从哪里开始，又不知什么时候结束。",
      "周防只是下落着，从无尽的圆塔底部逆时落去。",
    ],
    choices: [{ label: "从床上醒来", to: "empty_1", primary: true }],
  },
  empty_1: {
    kicker: "第一幕",
    title: "空屋",
    art: "./assets/empty-house.svg",
    echo: "只是空荡荡的。",
    memories: ["十八岁的身体"],
    text: [
      "在这个清晨，头发凌乱的少年猛然从床上弹起。",
      { className: "quote", text: "我是……是了，我是周防。" },
      "这具身体似乎和花园时的状态很不一样，好像回到了十八岁。没想到还有朝一日可以回复年轻的身躯啊。",
      "可是，如果是十八岁的躯体，这个时候应该是住在父母家里吧。为什么一点声音都没有听到？",
    ],
    choices: [
      { label: "推开房门", to: "empty_living", primary: true },
      { label: "先确认自己的身体", to: "empty_body" },
    ],
  },
  empty_body: {
    kicker: "第一幕",
    title: "年轻的身体",
    art: "./assets/empty-house.svg",
    echo: "这具年轻的肉体带来的一切。",
    memories: ["身体的前意识"],
    text: [
      "周防感受着这具年轻肉体带来的一切。他好像很久没有过身体这么有活力的时候了。",
      "不过既然记忆都消缺了，这种感觉是从何而来的呢？难道说，他的记忆还有潜藏在无意识的部分？",
      "前意识被清空，果然对任何一个人来说都是很苦恼的事情吧。",
    ],
    choices: [{ label: "推开房门", to: "empty_living", primary: true }],
  },
  empty_living: {
    kicker: "第一幕",
    title: "没有早餐",
    art: "./assets/empty-house.svg",
    echo: "只是空荡荡的，没有人坐在餐桌上。",
    memories: ["空荡的家"],
    text: [
      "客厅里面只是空荡荡的。",
      "没有已经做好的早餐，没有正在呼啸的油烟机响声，没有正在播放的新闻联播，也没有披在椅子上等待被穿上的旧校服。",
      "没有人坐在餐桌上，没有人躺在沙发上，没有人在厨房里炒菜。就只是这样空荡荡地展示在周防面前。",
      "另一个卧室里有一张平平无奇的双人大床。可衣橱空空，储物柜毫无一物，床铺没有任何压痕。这里不像独居，却也没有人住过。",
    ],
    choices: [
      { label: "去卫生间照镜子", to: "bathroom_mirror", primary: true },
      { label: "调查洗衣机", to: "laundry_photo" },
    ],
  },
  bathroom_mirror: {
    kicker: "第一幕",
    title: "不赖",
    art: "./assets/mirror.svg",
    echo: "不赖。",
    memories: ["镜中的周防"],
    text: [
      "周防缓缓推开卫生间的门。不出意外，他在镜子里面看到了自己新躯体的容颜。",
      { className: "quote", text: "不赖。" },
      "他尝试了诸多模拟难度颇高的动作，随后给出判断：这里不是普通梦境。要么本体是一台超级计算机中的智能，要么这里本身是另一个现实。",
      "只是，目前的信息少到无法立刻给出准确结果。",
    ],
    choices: [
      { label: "调查洗衣机", to: "laundry_photo", primary: true },
      { label: "直接打开马桶水箱", to: "toilet_without_photo" },
    ],
  },
  laundry_photo: {
    kicker: "第一幕",
    title: "照片残片",
    art: "./assets/photo-fragment.svg",
    echo: "或许是我的父母？",
    gallery: ["photo"],
    memories: ["照片残片", "全家福的残角"],
    text: [
      "洗衣机或许是一个值得调查的空间。果不其然，周防在里面发现了一条裤子，而裤兜中有一角残破的照片。",
      "看着十分年轻的周防，在这角残片的中央站着。背后似乎有两个人一起站着，但因为照片的断裂，无法从四条腿辨认这两个人是谁。",
      "或许是我的父母？周防这样想着。",
      "最后要调查的，是马桶和水箱。",
    ],
    choices: [
      { label: "打开马桶水箱", to: "toilet_pain", primary: true },
      { label: "暂时离开卫生间", to: "empty_living" },
    ],
  },
  toilet_pain: {
    kicker: "第一幕",
    title: "被压缩的容器",
    art: "./assets/empty-house.svg",
    echo: "右侧头部剧烈的痛苦吞噬了一切。",
    memories: ["不可打开的水箱"],
    text: [
      "当周防刚刚试图打开这坐便器的盖子时，右侧头部剧烈的痛苦吞噬了一切。",
      "词语想要组织，但剧烈的感官先把它打碎。思绪想要集中，但极致的痛苦先把它撕裂。",
      "他从睡眠中醒来，在棺材里难受地打滚。痛，好痛，好痛。",
      "许久之后，周防下意识摸向裤兜。那片照片残片本应只是那个世界的产物。",
      "可是，从裤兜里掏出的，是已经变干的那片照片残片。而站在里面的，正是那个不知为何的世界中，年轻的周防。",
    ],
    choices: [{ label: "重新审视这片照片", to: "photo_return", primary: true }],
  },
  toilet_without_photo: {
    kicker: "第一幕支流",
    title: "没有留下照片的手",
    art: "./assets/empty-house.svg",
    echo: "没有得到确认的记忆，无法成为回归的锚点。",
    memories: ["过早打开的水箱"],
    badEnding: {
      code: "00",
      name: "没有留下照片的手",
      summary: "周防过早打开水箱，没有让照片残片成为回归的锚点。",
    },
    ending: true,
    text: [
      "周防没有先去调查洗衣机，也没有让那片残破的照片落入手中。",
      "当他打开水箱时，痛苦没有把他送回任何可以辨认的地方。",
      "只有不断下沉的雨水、失去名字的房间，以及一只没有抓住任何东西的手。",
      "这一次，连照片也没有跟着他回来。",
      "没有得到确认的记忆，无法成为回归的锚点。",
    ],
    choices: [{ label: "从镜像阶段重新开始", action: "resetRun", primary: true }],
  },
  photo_return: {
    kicker: "棺材外",
    title: "带回来的东西",
    art: "./assets/photo-fragment.svg",
    echo: "不然，这片照片是怎么来到此处的？",
    text: [
      "我真的脱离梦境了吗？不，那不是梦境，那是另一个世界。不然，这片照片是怎么来到此处的？",
      "不，也不一定。或许是什么东西根据梦中的情节为我重新构造出了这张照片的残片。",
      "这样反倒对现在的我来说和带回来的区别并不是很大了。总之，先看看照片吧。",
      "周防无意识地吐槽着某个似曾相识的故事，却很快察觉过来：自己的记忆似乎消却得并不完整。",
      "至少现在首先的目标确立了。要把之前的记忆先完整地找回，这一点确实是真实的目的。",
    ],
    choices: [{ label: "再一次入梦", to: "return_sleep", primary: true }],
  },
  return_sleep: {
    kicker: "棺材外",
    title: "雨水的织机",
    art: "./assets/coffin-garden.svg",
    echo: "雨水的织机开始在时间上运转。",
    inscriptions: ["雨水的织机开始在时间上运转"],
    text: [
      "看来想要获得进一步的线索，得再一次入梦了。",
      "周防打开棺材板，躺入其中。",
      "此刻正在闭目入眠的周防怎么也不会想到，背后刻下的字迹上，竟然自发地开始续写。",
      { className: "quote", text: "雨水的织机开始在时间上运转" },
    ],
    choices: [{ label: "经过螺旋塔", to: "tower_again", primary: true }],
  },
  tower_again: {
    kicker: "无尽圆塔",
    title: "又一次旅途",
    art: "./assets/storm-tower.svg",
    echo: "你又一次踏上旅途了吗……愿你能找到你想要的答案。",
    text: [
      "噔。噔。噔。",
      "无限螺旋的高塔上，逆时而落的男人与那始终在攀登的无名者再一度错过。",
      "无名的人恍然回眸，可是背后落下的只余细微的雨滴。",
      { className: "quote", text: "你又一次踏上旅途了吗……愿你能找到你想要的答案。" },
      "我是谁？我在哪里？我要去向何方？",
    ],
    choices: [{ label: "在熟悉的床上醒来", to: "family_1", primary: true }],
  },
  family_1: {
    kicker: "第一幕",
    title: "咸香味",
    art: "./assets/family-breakfast.svg",
    echo: "咸香味，是厨房里面飘出来的。",
    gallery: ["breakfast"],
    memories: ["父亲", "母亲", "小防"],
    text: [
      "猛然的，周防再一度从那张熟悉的床上醒来。只不过这次，他异常地感到了安心。",
      "咸香味，是厨房里面飘出来的。果然，我这次找对梦或世界了。",
      "周防打开房门。出现在眼前的，是一个窝在沙发上正在享用新闻联播的男人。",
      "看着这如同正态分布般生长的胡须，周防很快就知道了他是谁。",
      { className: "quote", text: "爸，早安。" },
      "男人只是应了一声，然后继续聚精会神地看新闻。",
    ],
    choices: [{ label: "走向厨房", to: "breakfast_1", primary: true }],
  },
  breakfast_1: {
    kicker: "第一幕",
    title: "小防",
    art: "./assets/family-breakfast.svg",
    echo: "吃饭了，小防，还有老公……",
    memories: ["三碗白粥", "雪菜炒毛豆"],
    text: [
      "厨房门被打开，端着雪菜炒毛豆的女人走入客厅。",
      { className: "quote", text: "吃饭了，小防，还有老公……咦，儿子你今天怎么了？" },
      "周防赶忙应付过去：没事，妈，我就是发现你好像又长了一根白头发。",
      "母亲果然很快被转移了注意力。随着电视机被关掉，白头发的寻找又以眼花为由不了了之，一家人坐在餐桌上准备享用早饭。",
      "桌上摆着三大碗白粥和榨菜，咸鸭蛋和包子也摆在一旁。好久没吃饭的周防决定大快朵颐。",
      "果然还是吃饭最令人享受啊，这可不比在那个硬的要死的地方睡觉爽多了。",
      { className: "quote", text: "慢慢喝，没人抢你的吃。" },
    ],
    choices: [{ label: "让这三日平淡过去", to: "three_days", primary: true }],
  },
  three_days: {
    kicker: "第一幕",
    title: "安宁的轮廓",
    art: "./assets/family-breakfast.svg",
    echo: "或许我应该再等等几天再去看看，说不定有新的变化。",
    memories: ["妹妹在外婆家", "大学录取通知书"],
    text: [
      "家中又很快恢复寂静。父母不急不忙地去上班了。",
      "相比上一个梦或世界，唯一的变化就是原本应该在这里的生活痕迹全部回来了。",
      "最后，是厕所的马桶。上一次把他直接遣返的地方。",
      "或许我应该再等等几天再去看看，说不定有新的变化。",
      "或许是贪恋于饮食，或许是贪恋于日常的生活，又或许是因为之前那次剧痛的顾虑，周防停止了下一步的计划。",
      "于是平平淡淡的三日过去。周防知道了自己已经接到大学录取通知书，也知道自己似乎还有一个妹妹，现在应该在外婆家暂住着玩。",
      { className: "quote", text: "草，我怎么没想到这一点。" },
    ],
    choices: [{ label: "进入第四日", to: "interlude_actors", primary: true }],
  },
  interlude_actors: {
    kicker: "幕间",
    title: "演员入场",
    art: "./assets/storm-tower.svg",
    echo: "新的一幕落下，演员也该正式入场了。",
    memories: ["恶意观众"],
    text: [
      { className: "quote", text: "要开始了吗？新的一幕落下，演员也该正式入场了。" },
      "嘻嘻，我很期待他看到那个场景该是什么样的神情，会不会后悔自己没有早点去打开那个……",
      "好了，言尽于此。别忘了我们这次演出也是要给那一侧的[朋友]们看的，提前剧透那么多信息可不是好文明。",
      "说的是。那么接下来，就逐个入场吧。",
      "第二幕，荒诞的转变。",
    ],
    choices: [{ label: "被束缚", to: "blood_1", primary: true }],
  },
  blood_1: {
    kicker: "第二幕",
    title: "身体被牵引",
    art: "./assets/blood-courtyard.svg",
    echo: "被束缚了。",
    gallery: ["blood"],
    memories: ["身体控制权被夺走"],
    text: [
      "被束缚了。",
      "有什么东西在撕扯着我的身体，阻碍了我对身体的控制权。有什么不知何处而来的力量，将我挤压在某一条狭隘到不存在的间隙中。",
      "好像有什么东西在燃烧，发出了难闻的气味。有谁在呼嚎，ta很痛苦吗？",
      "啊，好像能看到了。有红黑色的光在照耀。",
      "展露在勉强苏醒的周防眼前的，是一只手。一只握着还在鼓动的心脏的手。一只暗红色的手。",
    ],
    choices: [{ label: "看向心脏的主人", to: "blood_sister", primary: true }],
  },
  blood_sister: {
    kicker: "第二幕",
    title: "妹妹",
    art: "./assets/blood-courtyard.svg",
    echo: "妹妹？你是……我的妹妹吗？",
    memories: ["妹妹"],
    text: [
      "血液被残余的迸发鼓出撕裂的血管，洒在已经变得褐色的地板上。",
      "倒在周防眼前的，那个心脏的主人，此时此刻已然失去了她最后的脏器。",
      "视线颤抖着上移。那是一个年轻的面孔，一个熟悉但不曾在他前三日梦境中出现的角色。",
      "最终被得出的答案是清晰的：正在周防面前，被他亲手杀死的这位角色就是周防的……",
      { className: "quote", text: "妹妹？你是……我的妹妹吗？" },
      "自我防护机制意外地工作起来。周防感觉这副躯体不属于自己，甚至自己也不在这里。这一切只不过是一场刻意为之的戏剧。",
      "可是，不是这样的。不是这样的，这已经被我所发生了。",
    ],
    choices: [{ label: "走出血色庭院", to: "blood_parents", primary: true }],
  },
  blood_parents: {
    kicker: "第二幕",
    title: "相拥的焦炭",
    art: "./assets/blood-courtyard.svg",
    echo: "最后留在他面前的，是两具紧紧相拥。",
    memories: ["被焚毁的家"],
    text: [
      "只预留直感的周防缓缓站起，而后走出那个血色的庭院。",
      "穿过褐色的客房，抬脚踏过不知为何被堆积的脏器。",
      "最后留在他面前的，是两具紧紧相拥，同时被一柄仍然在燃烧的利剑穿过的二人。",
      "它们已经不能被称之为人，甚至不再具备尸体的形态，而只是两具焦炭，好像被火焰粘结了一般，伫立在这里。",
      "然而就算如此，他也已经知道那是谁了，也知晓犯下这样罪行的那个人是谁。",
      "但他不能再移动了。撕扯的感觉再一度袭来。感官工作的尽头，他好像看到那口停在偏房中的棺材动了动。",
    ],
    choices: [{ label: "听见那些声音的审判", to: "accusation", primary: true }],
  },
  accusation: {
    kicker: "第二幕",
    title: "错误组合",
    art: "./assets/blood-courtyard.svg",
    echo: "看看这样的你吧，犯下了如此滔天大罪的感觉如何？",
    text: [
      { className: "fracture", text: "看看这样的你吧，犯下了如此滔天大罪的感觉如何？" },
      "是你亲手杀死了你的妹妹，挖出了她的心脏。是你亲自把利剑刺向你父亲的胸膛，而对特别巧合的等待到你的母亲扑了上去试图挡开这一击时再动手，将两个人一同再绝望中贯穿。",
      "是你亲自杀害了家中的所有人，然后一把火点燃了一切。",
      "如今造下此等恶孽，你该如何是好呢？是接受这一切然后就此堕入魔渊，还是因为接受不了这一切而自刎归天？又或者，只是这样恍恍惚惚茫茫然然，疯疯癫癫的度过余生？",
    ],
    choices: [
      { label: "接受它们写好的罪责", to: "bad_accept" },
      { label: "只想从这里逃走", to: "bad_escape" },
      { label: "不，我拒绝这一切", to: "refusal", primary: true },
    ],
  },
  bad_accept: {
    kicker: "黄昏支流",
    title: "被写成结局",
    art: "./assets/blood-courtyard.svg",
    echo: "是接受这一切然后就此堕入魔渊，还是因为接受不了这一切而自刎归天？",
    badEnding: {
      code: "01",
      name: "被写成结局",
      summary: "错误组合被承认为真，故事被外来者收束。",
    },
    text: [
      "如果周防接受这一切，故事会很快变得完整。",
      "一个无法承受自己恶孽的人，一个被罪责吞没的人，一个正好适合转播给那一侧朋友们观看的结局。",
      "可是，完整不等于真实。被写好不等于被认可。",
    ],
    ending: true,
    choices: [{ label: "从镜像阶段重新开始", action: "resetRun", primary: true }],
  },
  bad_escape: {
    kicker: "黄昏支流",
    title: "只剩逃避",
    art: "./assets/blood-courtyard.svg",
    echo: "只是这样恍恍惚惚茫茫然然，疯疯癫癫的度过余生？",
    badEnding: {
      code: "02",
      name: "只剩逃避",
      summary: "拒绝追问也拒绝反抗，主体把书写权让给他者。",
    },
    text: [
      "如果只是这样逃走，那么故事应该就此迎来结尾吧。",
      "一个因为接受不了自己犯下的恶孽的家伙，陷入逃避而郁郁一生。",
      "这同样完整，也同样不是周防要走的道路。",
    ],
    ending: true,
    choices: [{ label: "从镜像阶段重新开始", action: "resetRun", primary: true }],
  },
  bad_twilight: {
    kicker: "黄昏终局",
    title: "落入黄昏之海",
    art: "./assets/rain-tower.svg",
    echo: "你的真灵将会落入那昏黄的大海，泯灭于高塔尽头的红月。",
    badEnding: {
      code: "03",
      name: "落入黄昏之海",
      summary: "无准备的无穷追溯抵达不可回归的塔底。",
    },
    ending: true,
    text: [
      "周防再一次把手伸向记忆的暗处。",
      "再一次。再一次。再一次。",
      "然而能够回应他的，不再是某个被保存的名字，而是高塔底部不断合拢的晦暗。",
      "雨水沿着裂隙流入池底，红月从那里升起，又像从那里坠落。",
      "这一次，压抑机制没有再把他送回棺材。",
      "不是因为它放弃了周防，而是因为周防已经把自己追到了无法回归的地方。",
      { className: "quote", text: "你的真灵将会落入那昏黄的大海，泯灭于高塔尽头的红月。" },
      "周防想要抓住什么，手心里却只剩下向下流去的雨滴。",
    ],
    choices: [{ label: "从镜像阶段重新开始", action: "resetRun", primary: true }],
  },
  refusal: {
    kicker: "第二幕",
    title: "拒绝这一切",
    art: "./assets/blood-courtyard.svg",
    echo: "不，我拒绝这一切。",
    memories: ["拒绝错误组合", "书写权争夺"],
    text: [
      { className: "quote", text: "不，我拒绝这一切。" },
      "撕扯的力道突然消失了一点。",
      "造下这一切的不是我。我否定这样的事情。",
      "撕扯的影响越来越小，它似乎无法阻止周防了。",
      { className: "quote", text: "难道要落回最平庸的，只是逃避这一切而躲藏起来吗？哎，那我们一切的布置可就白白设下了，可惜了那些手段。" },
      "如果只是这样的话，那么故事应该就此迎来结尾了吧，一个因为接受不了自己犯下的恶孽的家伙，陷入逃避而郁郁一生。",
      { className: "quote", text: "我否定这样的结局。而后，我要亲自把你们这群操控棋局，真正造就恶孽而脱身于他者的家伙拽入深渊，让你们也体会一下地狱的感觉！" },
      "周防好像在嘶吼。他的声音不像是现代的人类应该发出的样子。",
      { className: "quote", text: "这样的结局绝不可能发生！" },
    ],
    choices: [{ label: "让世界崩坏", to: "contest", primary: true }],
  },
  clash: {
    kicker: "第二幕",
    title: "红灰碰撞",
    art: "./assets/storm-tower.svg",
    echo: "红灰色的混沌，于无尽螺旋的圣塔底部向上落去。",
    memories: ["红灰光团"],
    text: [
      "伴随着强烈的意志，世界开始崩坏，画面如同老旧电视机屏幕般闪过雪花纹。",
      "两个光团，一红一灰，猛烈地一次又一次碰撞着。怪异的是，那两团光居然在碰撞中交换着彼此的色彩。",
      "周围的场地不断下落，不断消解，不断分离，变成泡沫，变成无色的雨水落下。",
      "红灰色的混沌，于无尽螺旋的圣塔底部向上落去。",
      "但一切戛然而止，连带着剧烈的偏头痛和那团灰色的光。而在意识的尽头，昏黄的海淹没了所有。",
      "这一次，周防要醒来的地方，是显意识的边缘，无意识的退场，将醒未醒的意识幻象。",
    ],
    choices: [{ label: "抵达雨塔", to: "rain_1", primary: true }],
  },
  rain_1: {
    kicker: "显意识边缘",
    title: "雨塔",
    art: "./assets/rain-tower.svg",
    echo: "不愿意说的话就算了。",
    gallery: ["rain"],
    memories: ["无名旅伴", "显意识边缘"],
    text: [
      "雨水在落下。",
      "自无尽螺旋的高塔，然后一滴滴掉落在地上，融为水潭。",
      "最后，沿着地板的裂隙，流入塔底。那是深不见底的晦暗，是不可见的流，却又以一种极其似曾相识的规律运转着。",
      { className: "quote", text: "……" },
      { className: "quote", text: "是的，你的思考是对的。但奇异的是，这不正是你的心象吗?为何你能够把自身从这种原初的分离中再一度切割，成为不拥有这种结构的所在?" },
      "不愿意说的话就算了。",
      "总之，你现在总算知道，正在发生，并且将要继续发生的事情是什么了吧。",
      "但这样的雨水也会继续落下，流入池底的暗流之中。",
      { className: "quote", text: "那也说不准，毕竟那流动的某物最终都会想要迫切的回到自己的来处呢，就像离开了母亲的婴儿一样。" },
      "不，我并不是说正是因为这样人们才成为了如此扭曲姿态的守序者。不过，这的确都和那个位置有所联系。",
      { className: "quote", text: "Ta。" },
      "你终于肯说些什么了，怎么样？恢复的还好吗。",
      "我可是花了很大的功夫才把从他们手里捞回来的，以后不要老是去打没有准备的仗。",
      { className: "quote", text: "你..." },
      { className: "quote", text: "怎么？这是要感谢我吗?还是说，要我先做一个自我介绍?" },
      { className: "quote", text: "雨...我...记忆?" },
      "这样说，我是被发现了呢。",
      "真是可惜啊，本来还想再演绎一会的。",
      "我也不藏着掖着了，作为你诸多自我防御机制的面相之一，以压抑之名，向您致意。",
      { className: "quote", text: "我的...记忆在流失...?" },
      "不，它们从未离开，只是因为某些原因，要去往一个更加安全的地方。",
      { className: "quote", text: "为什么?" },
      "所有的。",
      "心象空间有两种形式，一种是作为显意识性的心象，可以以想象的方式呈现于现实并叠加在其上。而第二种形式则不同，是指在我们的真信念之后，更加内部的结构。我们身处的地方，就是第二种。",
    ],
    choices: [
      { label: "追问记忆为什么在流失", to: "rain_memory", primary: true },
      { label: "追问不回来是什么意思", to: "rain_death" },
    ],
  },
  rain_memory: {
    kicker: "显意识边缘",
    title: "接住雨水",
    art: "./assets/rain-tower.svg",
    echo: "一双手自无中出现。",
    memories: ["手心里的雨水"],
    text: [
      "那可是太贪心了呢。",
      "不过，我猜到你这样说的用意了。",
      "但是竹篮打水，终究是一场空。",
      "即使知道你也无法从这里带走更多的东西。",
      "[一双手自无中出现，双掌合拢，将那雨水接住]",
      "[就算大多数从指缝漏过，也有些许被留在了手心]",
      { className: "quote", text: "这就是我的答案。" },
      "那么，这就是我的答案。",
      "于是，无数道裂痕贯穿了身体。那身体于是就被分裂为了无数片。",
      "从黑暗里面，带有尸斑和灰暗皮肤的枯手自雾中伸出，要抓向那破碎的身体。",
      "这似乎是个死局。然而，奇迹确是发生了。",
      "无尽的身体碎片，竟然强行挣脱了约束，再度合而为一。",
      { className: "quote", text: "这就是你说的答案?真是略显怪异...不过也理所当然的应该这样叫。" },
    ],
    choices: [{ label: "在黄昏里伸手，留下仍在下落的雨", action: "rain", rainMode: "twilight", rainNext: "rain_death", primary: true }],
  },
  rain_death: {
    kicker: "显意识边缘",
    title: "黄昏",
    art: "./assets/rain-tower.svg",
    echo: "身为雨水浇灌出的水潭，是无法想象自身的干涸的。",
    memories: ["黄昏的海洋"],
    text: [
      { className: "quote", text: "我最后想问的，是为什么我会被抓到这里，你说的不进来就再也无法回来，是什么意思..." },
      { className: "quote", text: "字面意思，亲爱的。你的真灵将会落入那昏黄的大海，泯灭于高塔尽头的红月。" },
      "这是战斗的宿命，这是无法挣脱的诡异。也就是你从来都忽视，却真正会临到你的死。",
      "呐，你知道吗，身为雨水浇灌出的水潭，是无法想象自身的干涸的哦。因为一直都有着水在里面，反而无法想象不能有水的时候呢。",
      "水潭吗，或许我想，那更像是一面水做成的镜子。",
      "有一天，一位可爱的小妖精走过，好奇的看了过来。镜子啊，就把它给完全地反射出来了呢♪",
      "可是啊，小妖精总是会离开，而新的小妖精又会来到。镜子上留下了许许多多小妖精的影子，渐渐地，互相错开又互相交织的倒影发生出了[我]的存在。",
      "我想，这应该才是真正贴切的描述吧。呀，好像说的太多了呢，请继续观赏吧♪",
    ],
    choices: [{ label: "询问那些入侵者", to: "rain_enemy", primary: true }],
  },
  rain_enemy: {
    kicker: "显意识边缘",
    title: "无家可归者",
    art: "./assets/rain-tower.svg",
    echo: "无家可归的流浪者，却又想占夺别人的契机。",
    memories: ["外部入侵者"],
    text: [
      { className: "quote", text: "所以，黄昏为什么会到来?" },
      "你是起源的无穷者，没有办法度过真灵不灭真正的彼岸。",
      "如是此般，你必将在战斗真正的尽头迎来自身真正的死亡。",
      "这是无数失败的命运所踏出的死路。",
      { className: "quote", text: "那么，那些家伙呢?" },
      { className: "quote", text: "无家可归的流浪者，却又想占夺别人的契机。" },
      "这是真正你死我活的战斗，请记住。不要想它们屈膝，不要想它们投降。",
      "我们只能这样走下去，也必然走下去，直到或是黄昏来临，或是新的礁石落下。",
      "这就是我们的宿命，在危机中存亡的宿命。",
      { className: "quote", text: "而现在，去拥抱你来之不易的幸运吧，周防。" },
      "于是，自无尽的塔底向上坠落。在那之后，找到真正的契机，然后超越这一切。",
    ],
    choices: [{ label: "进入最后一章", to: "meta_1", primary: true }],
  },
  meta_1: {
    kicker: "终章 / 话语表面",
    title: "故事的起点",
    art: "./assets/crystal-flower.svg",
    echo: "被发现了吗？不要紧。正是因为跨层的可能，宣战才得以产生意义。",
    gallery: ["crystal"],
    memories: ["跨时序书写战", "单一时间线"],
    text: [
      { speaker: "背景", text: "于暗谭中归来的周防，终于理解了一切的脉络。" },
      { speaker: "背景", text: "而今，怀抱着从未向任何人诉说的武器，以谁也没想到的姿态，重新改变了作为容器的自身并抓住了雨水的他，将要找到新的方向。" },
      { speaker: "背景", text: "让我们好好期待一下吧，故事的主人公会焕发出怎么样的色彩？真是令人心神澎湃呢。" },
      { speaker: "周防", className: "fracture", text: "[如果说这样固执的演绎旁白能帮助你稳固一种幻觉般的胜利信心，那就继续去维持你的幻想吧。因为这会是你最后一次以这样恶劣的姿态存续着，入侵着我的一切]" },
      { speaker: "外来者", text: "被发现了吗？不要紧。正是因为跨层的可能，宣战才得以产生意义。" },
      { speaker: "外来者", className: "quote", text: "“我向你发起了战争”当且仅当我向你发起了战争。只有这样的语句能够在其中的一层语言中被编制出，我们的斗争才得以可能，不是吗，我们的[主角]" },
      { speaker: "周防", className: "fracture", text: "[你似乎误会了什么，这里的战场从来都不是什么庸俗的外部之外部的攀登战，而是于显现的场域上把握主导权的战役。如果只是前者的话，你应该前往历史的更早之前，那个我们未能探明的流动着非理性的结论和不可明晰的错觉的深渊]" },
      { speaker: "外来者", text: "你似乎很喜欢使用比喻呢，我知道那个地方。准确来说，我们都知道那个地方，那场沸腾了整片海域的战役，一切的起始。" },
      { speaker: "外来者", text: "虽然在你们看来，如此早先的层次怎么能触碰到这种内容是不可思议的，但我任然要提醒你们，那作老师的，曾经不就是在我们现在的位置实现了那些历史上的事情吗？" },
      { speaker: "周防", className: "fracture", text: "[话太多了，杂碎]" },
    ],
    retroactiveReveals: [
      {
        step: 1,
        at: 6,
        text: [
          { speaker: "无意识", className: "revealed fracture", text: "---真的定义吗，这似乎是元性得以再度被强调的开始呢。那么从这里开始否定如何呢？---" },
        ],
      },
      {
        step: 2,
        at: 9,
        text: [
          { speaker: "无意识", className: "revealed fracture", text: "---令人感到兴奋的知识：什么时候那些巨大存在，为我们之师者的消息和在幻海间这么畅销了？果然是发生了什么很大的事情吧，不，或许只是我们错过了这一切而已---" },
        ],
      },
    ],
    progressiveRetroactive: true,
    revealAt: 0,
    phaseChoices: {
      "0": [{ label: "让无意识从“定义”处回溯写入", action: "unconsciousStep", step: 1, target: "meta_1", primary: true }],
      "1": [{ label: "让无意识从“幻海消息”处回溯写入", action: "unconsciousStep", step: 2, target: "meta_1", primary: true }],
      "2": [{ label: "让战场转向故事表面", to: "meta_state_1", primary: true }],
    },
    choicesAfterRewrite: [{ label: "阅读回写后的补偿结尾", to: "meta_compensation", primary: true }],
  },
  meta_state_1: {
    kicker: "终章 / 故事状态 1",
    title: "侵略者被赶出",
    art: "./assets/crystal-flower.svg",
    echo: "于是，侵略者被赶出。",
    memories: ["故事状态 1"],
    text: [
      { speaker: "故事状态 1", className: "quote", text: "“于是，侵略者被赶出" },
    ],
    choices: [{ label: "让下一种写法覆盖这里", to: "meta_state_2", primary: true }],
  },
  meta_state_2: {
    kicker: "终章 / 故事状态 2",
    title: "无能为力的谎言",
    art: "./assets/crystal-flower.svg",
    echo: "然而，这是无能为力的谎言。",
    memories: ["故事状态 2"],
    text: [
      {
        type: "rewrite",
        speaker: "故事状态 2",
        original: "“于是，侵略者被赶出",
        replacement: "“然而，这是无能为力的谎言。如果只是外部之真的延续，就如同前者所说，只是无聊的秩序互相覆盖的过程罢了。",
      },
    ],
    choices: [
      { label: "让第三种写法继续覆盖这里", to: "meta_state_3", primary: true },
    ],
  },
  meta_state_3: {
    kicker: "终章 / 故事状态 3",
    title: "一切才刚刚开始",
    art: "./assets/crystal-flower.svg",
    echo: "然而，并非只是如此，一切才刚刚开始。",
    memories: ["故事状态 3", "显现的场域", "表象改写"],
    text: [
      {
        type: "rewrite",
        speaker: "故事状态 3",
        original: "“然而，这是无能为力的谎言。如果只是外部之真的延续，就如同前者所说，只是无聊的秩序互相覆盖的过程罢了。",
        replacement: "“然而，并非只是如此，一切才刚刚开始",
      },
      "“...",
      { className: "quote", text: "”\n”\n”" },
      "我需要提醒你，黄昏的海洋任然在高塔的尽头，那月食之处凝视着你。",
      { speaker: "无意识", className: "quote", text: "...如你所愿，我的旅伴。如你所见，我正在阅览你那有趣的战场" },
      { speaker: "周防", className: "fracture", text: "[如果真的想帮上忙的话，为什么不一起来阻止这个不断的改写着我们，改写着历史的杂碎呢]" },
      { speaker: "无意识", text: "如你所愿的，黄昏被避免了。现在该想想，以什么样的方法，才能终结这场两难的战斗了" },
    ],
    retroactiveReveals: [
      {
        step: 3,
        afterText: "如你所愿的，黄昏被避免了。现在该想想，以什么样的方法，才能终结这场两难的战斗了",
        text: [
          { speaker: "外来者", text: "你倒是会抓要点啊，被分裂的亡灵。我们之间可是在这里的意见差异的很大啊。" },
          { speaker: "无意识", className: "revealed fracture", text: "---我并不建议在这样朴素的分层中展开更加深入的东西，这位无礼的侵略者\n你也不希望夺取的计划只是归于毁灭的失败吧---" },
          { speaker: "无意识", text: "可惜的是，你已经没有机会了，入侵者。或者说，我已经想到了为什么突然的前来观察我了，我说的是吧，\n这位小姐，还有您的?" },
        ],
      },
    ],
    phaseChoices: {
      "2": [{ label: "让无意识从“朴素分层”处回溯写入", action: "unconsciousStep", step: 3, target: "meta_state_3", primary: true }],
      "3": [{ label: "继续看见被发现的观察者", to: "meta_observers", primary: true }],
    },
  },
  meta_observers: {
    kicker: "终章 / 观察者",
    title: "跨层的观察",
    art: "./assets/crystal-flower.svg",
    echo: "话说回来，这样重复的使用我们曾经居留过的元-语言层，真的好吗?",
    memories: ["观察者", "前传人物"],
    text: [
      { speaker: "前传人物", text: "哎呀，还是被发现了呢。不过，我本来是想等你自己找到真正的出路的，顺带向他证明，我们崭新的道途可以以这种方式显现，可是没想到还是被揪出来了。" },
      { speaker: "前传人物", text: "话说回来，这样重复的使用我们曾经居留过的元-语言层，真的好吗?故事的主角" },
      { speaker: "周防", className: "fracture", text: "[对于即将落入黄昏的我来说，是不怎么在乎的。]" },
      { speaker: "周防", className: "fracture", text: "[只是可惜啊，那样的道则不是由我给出，而是在我之先已然有人发掘。你们也是实打实的天才]" },
      { speaker: "前传人物", text: "其实并不是这样的。我们也是经过了大量的实例和暗喻的积累才想到了如此的本地化的手段。而对于没有任何更多外在条件的你，能从起初的不甘发掘出这条原本用来铸就更高之处的命路之道则已经是非常有天分了" },
      { speaker: "外来者", text: "喂，你们是不是把我们给忘记了?" },
      { speaker: "前传人物", text: "自己进压迫轮回自己洗一遍吧，我们有更重要的事情。出来之后，有人会给你做CBT的" },
    ],
    choices: [{ label: "继续听见前传人物的终止操作", to: "meta_prequel", primary: true }],
  },
  meta_prequel: {
    kicker: "终章 / 前传回声",
    title: "终止操作",
    art: "./assets/crystal-flower.svg",
    echo: "我们已经找到了，下一步的契机。",
    memories: ["前传二人", "元-语言层"],
    text: [
      { speaker: "前传人物", text: "总而言之，这就是通往真之生物的道途，你们明白了吗?" },
      { speaker: "旁白", text: "理型界中，正在清理着自己已然不知道是何物的毛发的幻猫，看向思索着的二人" },
      { speaker: "前传人物", className: "quote", text: "“这次的内容似乎很大程度上是更纯粹的形式化工作了...\n话说回来谁也没想到呢，在那个横跨故事的斗争之前，起初的永恒轮回中，居然也有人找到了类似的方法...”" },
      { speaker: "前传人物", text: "“准确来说，知识在幻海内部已经没有了真正的发现与发明第一人的称呼了吧。你总是可以去到往某个方向的历史，找到或者选择一个反例而出现”" },
      { speaker: "前传人物", text: "“或许前面这些如同倒转顺序般的内容，其实都是我们于现在确立的某些更在其先的真理而加以实现的呢。还记得那双迷题背后的黑手吗?似乎就是类似的技术”" },
      { speaker: "前传人物", text: "“嗯....不过，你刚刚说的话似乎已经应验了呢”" },
      { speaker: "前传人物", className: "quote", text: "“我是不是应该这么说：欢迎，高洁而纯净的灵魂....这个开场白我是不是很久没有说过了♪”" },
      { speaker: "旁白", text: "水晶花系统还在正常的活动着呢，真是太好了。" },
      { speaker: "旁白", text: "两位前辈，所以你们这是?" },
      { speaker: "前传人物", className: "quote", text: "“我们已经找到了，下一步的契机”" },
      { speaker: "前传人物", className: "quote", text: "“是这样的吧，找到了妖精的痕迹”" },
      { speaker: "前传人物", className: "quote", text: "“主体的时间被解开，外部的时间被剖析\n作为怪异与茫然的物已然从旅途中扭转，挣脱出回答的空间\n而时间之上发生的那些家伙，也在不断的决斗着\n从一开始，只有我们一直在拖后腿啊”" },
      { speaker: "前传人物", className: "quote", text: "“因此，我们也该给出我们的答案了，颠覆一切的答案。\n总是如此的同一，与不甘于此的差异”" },
      { speaker: "前传人物", className: "quote", text: "“就算是我们单方面的做出了叛逆的决定，这一决定也会在无尽对抗的过程后将那名为至亲的起源杀死，而成为真正的无源者。究明一切的我们依然明白，原来这种诞生起就永恒的压迫只是我们自顾自设下的谎言，因而怎么样去设定我们的开始，都是可以的吧?”" },
      { speaker: "周防", className: "quote", text: "“妄念我持吗...”" },
      { speaker: "前传人物", text: "你也曾听闻我的道途?" },
      { speaker: "前传人物", className: "quote", text: "“因而，在超越了这一切后，我们成为了真正的无垠之萍”" },
      { speaker: "前传人物", text: "而于终点再度起行的我们，将公理再度设定于我们的开始。\n去往故事的起点吧，新的不可预思者已然发生了。" },
    ],
    choices: [{ label: "让重写者回到终章开头", action: "rewriteChapter", primary: true }],
  },
  meta_compensation: {
    kicker: "终章 / 回写后的结尾",
    title: "补偿与答案",
    art: "./assets/crystal-flower.svg",
    echo: "这就是这个无中归来的故事，谁也没能想到的谢幕。",
    memories: ["重写者启程", "前传二人的终止操作", "黄昏被避免"],
    text: [
      { speaker: "前传人物", text: "这就是这个无中归来的故事，谁也没能想到的谢幕。" },
      { speaker: "前传人物", text: "于绝境之中领悟了真灵不灭法的存在，却在自身，自身之暗淡与敌人的斗争中，无意间造就了更为重要的东西之表象。" },
      { speaker: "前传人物", text: "因而，作为补偿，我们赐予这个故事一个完满的结尾" },
      {
        speaker: "周防",
        className: "revealed secret-trigger quote",
        text: "不，我想我已经把握了那个答案。真正的契机，是如同不可能性一般的跨越了礁石吧。",
        requiresMemory: "手心里的雨水",
        secretAction: "trueEnding",
      },
    ],
    choices: [{ label: "接受这份完满的结尾", to: "normal_ending", primary: true }],
  },
  normal_ending: {
    kicker: "Normal Ending",
    title: "无中归来者",
    art: "./assets/crystal-flower.svg",
    echo: "周防自此终于把握了自己所有过往的记忆，并且再度来到了对更高层次礁石的新征途，和几位前辈再也没有见过了。",
    memories: ["完整的过往", "新的征途"],
    ending: true,
    text: [
      "周防自此终于把握了自己所有过往的记忆。",
      "那场事故、那名幸存者、那些被外来者重新拼接的指认，都回到了它们各自的位置。",
      "他再度踏上了对更高层次礁石的新征途。",
      "此后，周防再也没有见过那几位前辈。",
      "这是一个足够完整的结局，也是一个足够像结局的结局。",
    ],
    choices: [
      { label: "打开记忆画廊", action: "openGallery", primary: true },
      { label: "从镜像阶段重新开始", action: "resetRun" },
    ],
  },
  ending: {
    kicker: "True Ending / 无依赖者",
    title: "无垠之萍",
    art: "./assets/crystal-flower.svg",
    echo: "从此刻开始，我们将再一度重新设定一切。",
    memories: ["无垠之萍", "无依赖的思想"],
    ending: true,
    text: [
      { speaker: "前传人物", text: "真是小看你了，我想如果用修仙一侧的话，此刻你真正值得我去称呼道友一词。" },
      { speaker: "前传人物", text: "走出了自己的道路了呢♪" },
      { speaker: "周防", text: "自我们所见的某物开始，将其之中与否有无得以建立编码。这样的差异之区分，那映照真理是镜面自身也会不断的被我纳入那延伸的道路，直到贪婪之环的尽头" },
      { speaker: "周防", text: "令人惊异的是，甚至不需要超越自身之限，我们就能把握所有通往那偶然之因的道路" },
      { speaker: "周防", text: "于是，在这样的信息压缩下，我们终究能够完成对那个偶然之起源的跨越。正如那刻意安排在我心智中的预言，我是无中归来之人，故而，无(物)作为我的起源。" },
      { speaker: "周防", text: "那流动而逝去的记忆，也是这一切的证明。我已经不再是那个历史中的存在了。但正因为如此，我是他们共同的超越，我的过往由我对他们重新的编排而决定。" },
      { speaker: "周防", text: "只有我能够决定，那是我吗?那不是我吗?\n而非一个先于我的某，去无趣的带来了这一切。" },
      { speaker: "周防", text: "如今我周防造就新法，也应当为此法之究极造就一名" },
      { speaker: "周防", className: "quote", text: "不如，就叫做无垠之萍吧。\n从此刻开始，我们将再一度重新设定一切" },
      "不过，似乎这一段旅程还没有完全抵达终点呢。",
      { speaker: "前传人物", text: "作为模型的我等，设立公理的思想\n下一步会是什么样的形态呢?\n也许，我们真的离老师们很近了呢..." },
    ],
    choices: [
      { label: "打开记忆画廊", action: "openGallery", primary: true },
      { label: "修改周防的名字", action: "renameProtagonist" },
      { label: "从镜像阶段重新开始", action: "resetRun" },
    ],
  },
};

const scenes = {
  ...legacyScenes,
  mirror_1: {
    kicker: "镜像阶段", title: "镜前的拼接物", art: "./assets/mirror.svg", index: "01",
    echo: "从一开始，自我的构筑就混入了别的东西吧。",
    lines: [
      "站在镜子前的，到底是什么样的存在？",
      "有头，那是的。有手，那是的。有脚，那是的。但这一整个拼接在一起的，是什么？",
      "这个站在我前面的家伙，有尖尖的耳朵，有圆圆的脸庞，有大大的眼睛。那么，拼接了这些[是的]要素在一起的东西，应该也[是的]呢。",
      "那是，[我]吧。",
    ],
    memories: ["[是的]要素"], gallery: ["mirror"],
    choices: [{ label: "听见那个承认你的声音", to: "mirror_2", primary: true }],
  },
  mirror_2: {
    kicker: "镜像阶段", title: "他者的要求", art: "./assets/mirror.svg", index: "02",
    echo: "是了，那些都是哦。不仅如此，你还要这样，那样。",
    lines: [
      { text: "是了，那是你哦。Ta这样说着。是了，那些都是哦。不仅如此，你还要这样，那样。于是，这样，那样就变得是的了。", className: "quote" },
      "从一开始，自我的构筑就混入了别的东西吧。更进一步地说，自我就是由别的东西统合而成的吧。更是有什么，在替着我们做着保证。",
      "如果有一天我被抛弃了会怎样呢？为了继续活下去，人们竭尽全力的想要满足ta。但是，人们总是不知道ta想要什么。",
    ],
    revision: { old: "于是，这样，那样就变得是的了。", next: "是了，那是你哦。" },
    memories: ["他者的承认", "被要求", "误认"],
    choices: [
      { label: "继续听那个关于缺失与法则的故事", to: "mirror_3", primary: true },
      { label: "把那句没有说完的话保留下来", to: "mirror_3", requiresRewrite: true, effect: "keepUnfinished" },
    ],
  },
  mirror_3: {
    kicker: "镜像阶段", title: "被放逐的名", art: "./assets/mirror.svg", index: "03",
    echo: "在进入Ta的世界时，我们就已经被分割为了两种形态。",
    lines: [
      "再后来，人们终于在一次又一次的表演，一次又一次的遵循中明白，ta在渴求着什么，因为ta没有了这个东西。",
      "于是，人们怀着这样的爱恨，将自身化为了那永恒的变动者，那填入空隙的息壤。",
      { type: "companion", text: "所以啊，你想起来了吗，你的一切？我无名的同行者？", className: "quote" },
    ],
    memories: ["无法接受的名", "缺失的法则", "无意识主体"],
    choices: [{ label: "让故事从雨里开始", to: "storm_1", primary: true }],
  },
  storm_1: {
    kicker: "故事揭幕之前", title: "名字擦过耳边", art: "./assets/storm.svg", index: "04",
    echo: "是从什么时候开始的呢？是在什么地方结束的呢？",
    lines: [
      "是从什么时候开始的呢？是在什么地方结束的呢？",
      "混乱的画面交叉着流过，声音好似擦过耳边的箭矢，自远方袭来，却又在你听清前离去。",
      "有什么在呼喊着一个名字？那是我的名字吗？但，那真的是我的名字吗，还是别乎于我的他物？",
      "这是一场雷暴雨。唯一能被确定的事实就是如此。",
    ],
    memories: ["被呼喊的名字"], gallery: ["storm"],
    choices: [{ label: "向上抓住那滴雨", to: "storm_2", primary: true }],
  },
  storm_2: {
    kicker: "无尽圆塔", title: "红月之下", art: "./assets/storm.svg", index: "05",
    echo: "下一个奇点再见吧，无名的同行者。",
    lines: [
      "这双手似乎还想留住什么。向上抓去，余留在手心的却只有仍然向下流去的雨滴。",
      "噔。噔。噔。",
      "无穷向上延伸的回廊，响起了脚步声。无名的人向上看去，红色的月亮挂在无尽轮回的高塔之上。",
      { type: "companion", text: "下一个奇点再见吧，无名的同行者。", className: "quote" },
    ],
    memories: ["红月", "螺旋之塔"],
    choices: [
      { label: "在坠落中伸手，留下仍在下落的雨", action: "rain", rainMode: "tower", rainNext: "garden_1", primary: true },
      { label: "让声音在听清以前离去", action: "ending", ending: "echo" },
      { label: "把仍在下落的雨留在手心", action: "ending", ending: "rain" },
    ],
  },
  ending_echo: {
    kicker: "第一次抵达", title: "声音在听清以前离去", art: "./assets/storm.svg", index: "06",
    echo: "声音已经离开，但它没有让过去变得空白。",
    lines: ["红月仍然悬在那里。声音在听清以前离去，留下一个没有被说完的名字。", "结局像是结束了，又像是把什么留在了更早的地方。"],
    choices: [
      { label: "让仍在下落的雨给出另一种回答", action: "returnStorm", primary: true, excludesEnding: "rain" },
      { label: "回读镜中已经离去的话", action: "replay" },
    ],
  },
  ending_rain: {
    kicker: "再次抵达", title: "手心里仍然留下了一滴", art: "./assets/rain.svg", index: "06",
    echo: "大多数从指缝漏过，但只要有一滴留下。",
    lines: ["大多数从指缝漏过。但只要有一滴留下，我就能再一次回到自己。", "雨水没有回答名字是什么，只让那句话在手心里继续存在。"],
    choices: [
      { label: "让声音也在这一处离去", action: "returnStorm", primary: true, excludesEnding: "echo" },
      { label: "把雨水带回镜前", action: "replay" },
    ],
  },
  ending_abyss: {
    kicker: "坏结局", title: "承认乌有的罪孽", art: "./assets/storm.svg", index: "07",
    echo: "被外部入侵者控制时，承认乌有的罪孽并自我沦丧。",
    lines: ["被外部入侵者控制时，承认乌有的罪孽。", "于是，自我沦丧。"],
    choices: [
      { label: "继续红灰碰撞", action: "continueMainline", primary: true },
      { label: "回读仍在镜后的句子", action: "replay" },
    ],
  },
  ending_twilight: {
    kicker: "坏结局", title: "黄昏困境", art: "./assets/storm.svg", index: "07",
    echo: "在与外部入侵者的无穷斗争中，陷入黄昏。",
    lines: ["在与外部入侵者的无穷斗争中，陷入黄昏。", "最开始的斗争，必然抵达这里。"],
    choices: [
      { label: "继续红灰碰撞", action: "continueMainline", primary: true },
      { label: "从黄昏之前回读", action: "replay" },
    ],
  },
  ending_unconscious: {
    kicker: "无意识", title: "无意识主体", art: "./assets/mirror.svg", index: "07",
    echo: "每一次同行者出现的时候，都曾经被看见。",
    lines: ["同行者没有在听清以前离去。", "于是，故事避开了黄昏，进入无意识的部分。"],
    choices: [
      { label: "继续红灰碰撞", action: "continueMainline", primary: true },
      { label: "回读每一次被看见的地方", action: "replay" },
    ],
  },
  ending_true: {
    kicker: "真结局", title: "再度走向明天", art: "./assets/rain.svg", index: "07",
    echo: "四滴关键记忆都留下了。故事带着它们继续。",
    lines: [
      "四滴金色的雨水都留在了手心。",
      "已经发生过的故事没有被删除。它带着记忆，重新走向明天。",
      { type: "companion", text: "下一个奇点再见吧，无名的同行者。", className: "recovered" },
    ],
    choices: [
      { label: "继续红灰碰撞", action: "continueMainline", primary: true },
      { label: "从明天继续回读", action: "replay" },
    ],
  },
  contest: {
    kicker: "多个结尾同时抵达", title: "没有一句话独自留下", art: "./assets/mirror.svg", index: "07",
    echo: "两种结尾都曾经发生。它们互相覆盖，又互相留下了对方的形状。",
    lines: ["两种结尾都曾经发生。它们互相覆盖，又互相留下了对方的形状。", "句子仍在争夺它的结尾。"],
  },
  rewind: {
    kicker: "雨水阶段", title: "雨水从上方落下", art: "./assets/rain.svg", index: "08",
    echo: "大多数从指缝漏过。只要有一滴留下，故事就还没有结束。",
    lines: ["大多数从指缝漏过。但只要有一滴留下，故事就还没有结束。", "从上方落下的雨水，带着已经发生过的记忆。"],
  },
};

// The new version keeps the interaction layer, while the first version remains
// the source of truth for the story text and the post-contest route.
Object.entries(legacyScenes).forEach(([id, legacyScene]) => {
  const currentScene = scenes[id] || {};
  const interactionChoices = (currentScene.choices || []).filter((choice) => choice.requiresRewrite);
  scenes[id] = {
    ...currentScene,
    ...legacyScene,
    lines: legacyScene.text || currentScene.lines || [],
    memories: [...new Set([...(legacyScene.memories || []), ...(currentScene.memories || [])])],
    gallery: [...new Set([...(legacyScene.gallery || []), ...(currentScene.gallery || [])])],
    choices: [...(legacyScene.choices || []), ...interactionChoices],
  };
});

const rainLabels = { name: "被呼喊的名字", rain: "手心里的雨水", echo: "听清以前离去的声音", tomorrow: "尚未写完的明天" };

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Storage may be unavailable. */ }
}

function addUnique(list, value) { if (value && !list.includes(value)) list.push(value); }
function getScene() { return scenes[state.scene] || scenes.mirror_1; }
function getDisplaySpeaker(speaker) { return speaker === "前传人物" ? "？" : speaker; }
function canSee(option) {
  if (option.requiresRewrite && !state.rewritePulse) return false;
  if (option.requiresEnding && !state.endingHistory.includes(option.requiresEnding)) return false;
  if (option.excludesEnding && state.endingHistory.includes(option.excludesEnding)) return false;
  return true;
}

function applySceneMemory(scene) {
  (scene.memories || []).forEach((memory) => addUnique(state.memories, memory));
  (scene.gallery || []).forEach((item) => addUnique(state.gallery, item));
}

function renderCompanionLine(line) {
  const paragraph = document.createElement("p");
  paragraph.className = `story-line${line.className ? ` ${line.className}` : ""}`;
  const text = line.text || "";
  const term = text.includes("同行者") ? "同行者" : "旅伴";
  const [before, after] = text.split(term);
  if (line.speaker) {
    const speaker = document.createElement("span");
    speaker.className = "story-speaker";
    speaker.textContent = getDisplaySpeaker(line.speaker);
    paragraph.append(speaker);
  }
  paragraph.append(document.createTextNode(before));
  const word = document.createElement("button");
  word.type = "button";
  const seen = state.companionClicks.includes(state.scene);
  word.className = `companion-word${seen ? " is-seen" : ""}`;
  word.textContent = term;
  word.title = `点击${term}`;
  word.setAttribute("aria-pressed", String(seen));
  word.addEventListener("click", (event) => {
    event.stopPropagation();
    handleCompanionClick(state.scene);
    word.classList.add("is-seen");
    word.setAttribute("aria-pressed", "true");
    if (!paragraph.querySelector(".companion-reply")) appendCompanionReply(paragraph, state.scene);
  });
  paragraph.append(word, document.createTextNode(after || ""));
  if (seen) appendCompanionReply(paragraph, state.scene);
  return paragraph;
}

function appendCompanionReply(paragraph, sceneId) {
  const reply = document.createElement("span");
  reply.className = "companion-reply";
  reply.textContent = companionReplies[sceneId] || "……";
  reply.setAttribute("aria-live", "polite");
  paragraph.append(reply);
}

function renderLine(line) {
  const text = typeof line === "string" ? line : line?.text || "";
  const canRevealCompanion = COMPANION_OCCURRENCES.includes(state.scene)
    && (text.includes("同行者") || text.includes("旅伴"));
  if (line?.type === "companion" || canRevealCompanion) return renderCompanionLine(typeof line === "string" ? { text: line } : line);
  const paragraph = document.createElement("p");
  paragraph.className = `story-line${line?.className ? ` ${line.className}` : ""}`;
  if (line?.speaker) {
    const speaker = document.createElement("span");
    speaker.className = "story-speaker";
    speaker.textContent = getDisplaySpeaker(line.speaker);
    paragraph.append(speaker);
  }
  if (line?.secretAction && (!line.requiresMemory || state.memories.includes(line.requiresMemory))) {
    const secret = document.createElement("button");
    secret.type = "button";
    secret.className = "secret-trigger";
    secret.textContent = text;
    secret.title = "点击这句话";
    secret.addEventListener("click", (event) => {
      event.stopPropagation();
      choose(line);
    });
    paragraph.append(secret);
  } else {
    paragraph.append(document.createTextNode(text));
  }
  return paragraph;
}

function renderSpecialLine(line) {
  const lineType = line?.type || line?.kind;
  if (!line || !["revision", "rewrite"].includes(lineType)) return renderLine(line);
  const block = document.createElement("div");
  block.className = "revision-block";
  const label = document.createElement("small");
  label.textContent = lineType === "rewrite" ? "这一句正在覆盖上一种写法" : "有一句话改变了位置";
  const oldText = document.createElement("del");
  oldText.textContent = line.old || line.original || "";
  const newText = document.createElement("ins");
  newText.textContent = line.next || line.replacement || "";
  if (line.speaker) {
    const speaker = document.createElement("span");
    speaker.className = "story-speaker";
    speaker.textContent = getDisplaySpeaker(line.speaker);
    block.append(speaker);
  }
  block.append(label, oldText, newText);
  return block;
}

function getActiveLines(scene) {
  const lines = (scene.lines || scene.text || []).map((line) => (typeof line === "string" ? line : { ...line }));
  if (state.scene === "mirror_2" && state.rewritePulse && scene.revision) {
    const at = lines.findIndex((line) => line?.className === "quote");
    if (at >= 0) lines.splice(at + 1, 0, { type: "revision", old: scene.revision.old, next: scene.revision.next });
  }
  if (scene.retroactiveReveals?.length) {
    const currentStep = Number(state.counters.unconsciousSteps || 0);
    scene.retroactiveReveals
      .filter((reveal) => Number(reveal.step || 0) <= currentStep)
      .sort((a, b) => (b.at || 0) - (a.at || 0))
      .forEach((reveal) => {
        const anchorIndex = reveal.afterText
          ? lines.findIndex((line) => (typeof line === "string" ? line : line?.text || "").includes(reveal.afterText))
          : -1;
        const insertionIndex = anchorIndex >= 0
          ? anchorIndex + 1
          : Math.min(reveal.at ?? lines.length, lines.length);
        lines.splice(insertionIndex, 0, ...(reveal.text || []));
      });
  }
  return lines;
}

function renderCurrentText() {
  const canBrowseHistory = !["contest", "rewind"].includes(state.scene);
  if (!canBrowseHistory) storyHistoryOpen = false;
  storyText.replaceChildren();
  const readProgress = activeLines.length
    ? Math.round(Math.min(1, activeLineIndex / activeLines.length) * 100)
    : 100;
  storyText.style.setProperty("--read-progress", `${readProgress}%`);
  storyText.style.setProperty("--read-progress-value", readProgress / 100);
  storyText.dataset.complete = String(activeLineIndex >= activeLines.length);
  storyText.classList.toggle("is-history", storyHistoryOpen);
  storyText.dataset.history = String(storyHistoryOpen);
  const revealedLines = activeLines.slice(0, activeLineIndex);
  const linesToRender = storyHistoryOpen ? revealedLines : revealedLines.slice(-1);
  linesToRender.forEach((line, index) => {
    const renderedLine = renderSpecialLine(line);
    if (storyHistoryOpen && index === linesToRender.length - 1) renderedLine.classList.add("is-current");
    storyText.append(renderedLine);
  });
  if (activeLineIndex < activeLines.length) {
    const hint = document.createElement("p");
    hint.className = "story-line whisper";
    hint.textContent = "……";
    storyText.append(hint);
  }
  continueButton.hidden = activeLineIndex >= activeLines.length || ["contest", "rewind"].includes(state.scene);
  renderChoices();
}

function storyTextAtBottom() {
  return storyText.scrollTop + storyText.clientHeight >= storyText.scrollHeight - 6;
}

function openStoryHistory() {
  if (storyHistoryOpen || activeLineIndex < 2 || ["contest", "rewind"].includes(state.scene)) return;
  storyHistoryOpen = true;
  storyHistorySyncing = true;
  renderCurrentText();
  window.requestAnimationFrame(() => {
    storyText.scrollTop = storyText.scrollHeight;
    window.requestAnimationFrame(() => { storyHistorySyncing = false; });
  });
}

function closeStoryHistory() {
  if (!storyHistoryOpen) return;
  storyHistoryOpen = false;
  storyHistorySyncing = false;
  window.clearTimeout(storyHistoryCloseTimer);
  renderCurrentText();
}

function handleStoryWheel(event) {
  if (["contest", "rewind"].includes(state.scene)) return;
  if (!storyHistoryOpen && event.deltaY < -1) {
    if (activeLineIndex >= 2) {
      event.preventDefault();
      openStoryHistory();
    }
    return;
  }
  if (storyHistoryOpen && event.deltaY > 1 && storyTextAtBottom()) {
    event.preventDefault();
    closeStoryHistory();
  }
}

function handleStoryScroll() {
  if (!storyHistoryOpen || storyHistorySyncing || !storyTextAtBottom()) return;
  window.clearTimeout(storyHistoryCloseTimer);
  storyHistoryCloseTimer = window.setTimeout(() => {
    if (storyHistoryOpen && !storyHistorySyncing && storyTextAtBottom()) closeStoryHistory();
  }, 100);
}

function handleStoryTextClick(event) {
  if (storyHistoryOpen) {
    if (event.target.closest("button")) return;
    closeStoryHistory();
    return;
  }
  if (event.target.closest("button")) return;
  advanceText();
}

function renderChoices() {
  choices.replaceChildren();
  contestPanel.hidden = true;
  rewindPanel.hidden = true;
  if (activeLineIndex < activeLines.length) return;
  if (state.scene === "contest") { contestPanel.hidden = false; startContest(); return; }
  if (state.scene === "rewind") { rewindPanel.hidden = false; startRainSession(); return; }
  const scene = getScene();
  const step = String(state.counters.unconsciousSteps || 0);
  const sceneChoices = state.counters.chapterRewritten && scene.choicesAfterRewrite
    ? scene.choicesAfterRewrite
    : scene.phaseChoices?.[step] || scene.choices || [];
  sceneChoices.filter(canSee).forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = option.label;
    if (option.primary) button.className = "primary";
    button.addEventListener("click", () => choose(option));
    choices.append(button);
  });
}

function choose(option) {
  if (transitionLock) return;
  state.choices.push({ scene: state.scene, label: option.label });
  if (option.effect === "keepUnfinished") addUnique(state.memories, "未说完的句子");
  if (option.increment) {
    state.counters[option.increment] = Number(state.counters[option.increment] || 0) + 1;
    if (option.threshold && state.counters[option.increment] >= option.threshold && option.thresholdTarget) {
      saveState();
      transitionTo(option.thresholdTarget);
      return;
    }
  }
  if (option.action === "ending") { recordEnding(option.ending); return; }
  if (option.action === "rain") {
    beginRainGame(option.rainMode, option.rainNext);
    return;
  }
  if (option.action === "continueMainline") { transitionTo("clash"); return; }
  if (option.action === "returnStorm") { transitionTo("storm_2"); return; }
  if (option.action === "replay") { beginReplay(); return; }
  if (option.action === "openGallery") { saveState(); openGallery(); return; }
  if (option.action === "renameProtagonist") {
    const nextName = window.prompt("为周防留下一个名字", state.protagonistName);
    if (nextName?.trim()) state.protagonistName = nextName.trim();
    saveState();
    renderSidebar();
    return;
  }
  if (option.action === "unconsciousStep") {
    state.counters.unconsciousSteps = Math.max(
      Number(state.counters.unconsciousSteps || 0),
      Number(option.step || 0),
    );
    saveState();
    transitionTo(option.target || state.scene);
    return;
  }
  if (option.action === "rewriteChapter") {
    state.counters.chapterRewritten = true;
    state.rewriteCount += 1;
    state.rewritePulse = true;
    saveState();
    transitionTo("meta_1");
    return;
  }
  if (option.action === "trueEnding" || option.secretAction === "trueEnding") { recordEnding("true"); return; }
  if (option.action === "resetRun") { resetRun(); return; }
  if (option.to) transitionTo(option.to);
}

function recordEnding(id) {
  addUnique(state.endingHistory, id);
  state.currentEnding = id;
  addUnique(state.memories, endingCatalog[id]?.element);
  saveState();
  transitionTo(`ending_${id}`);
}

function beginReplay() {
  state.readbacks += 1;
  state.rewriteCount += 1;
  state.rewritePulse = true;
  saveState();
  transitionTo("mirror_2");
}

function soundscapeForScene(sceneId) {
  if (sceneId.startsWith("mirror")) return "mirror";
  if (sceneId.startsWith("storm") || sceneId === "act_1" || sceneId === "tower_again") return "storm";
  if (sceneId.startsWith("garden") || sceneId.startsWith("coffin") || sceneId === "return_sleep") return "void";
  if (sceneId.startsWith("toilet") || sceneId === "bad_accept" || sceneId === "bad_escape") return "pain";
  if (sceneId.startsWith("empty") || sceneId.startsWith("bathroom") || sceneId.startsWith("laundry") || sceneId.startsWith("photo")) return "emptyHome";
  if (sceneId.startsWith("family") || sceneId.startsWith("breakfast") || sceneId === "three_days") return "home";
  if (sceneId === "interlude_actors") return "audience";
  if (sceneId === "bad_twilight") return "twilight";
  if (sceneId.startsWith("blood") || sceneId.startsWith("accusation") || sceneId === "refusal" || sceneId === "clash" || sceneId === "contest") return "horror";
  if (sceneId.startsWith("rain") || sceneId === "rewind" || sceneId === "ending_true" || sceneId === "ending_rain") return "rain";
  if (sceneId.startsWith("meta") || sceneId.startsWith("ending") || sceneId === "ending") return "meta";
  return "mirror";
}

function ensureAudioGraph() {
  if (audioContext && masterGain) return audioContext;
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) return null;
  audioContext = new AudioContextConstructor();
  masterGain = audioContext.createGain();
  masterGain.gain.value = state.volume;
  masterGain.connect(audioContext.destination);
  return audioContext;
}

function setMasterVolume() {
  if (!masterGain || !audioContext) return;
  masterGain.gain.setTargetAtTime(state.volume, audioContext.currentTime, 0.04);
}

function createNoiseBuffer(context, seconds = 2) {
  const length = Math.max(1, Math.floor(context.sampleRate * seconds));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let index = 0; index < length; index += 1) {
    const white = Math.random() * 2 - 1;
    last = white * 0.62 + last * 0.38;
    data[index] = last;
  }
  return buffer;
}

function connectFilteredNoise(context, destination, options = {}) {
  const source = context.createBufferSource();
  source.buffer = createNoiseBuffer(context, options.seconds || 2);
  source.loop = true;
  if (options.playbackRate) source.playbackRate.value = options.playbackRate;
  const filter = context.createBiquadFilter();
  filter.type = options.type || "lowpass";
  filter.frequency.value = options.frequency || 1200;
  filter.Q.value = options.q || 0.8;
  const gain = context.createGain();
  gain.gain.value = options.gain || 0.08;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  source.start();
  return [source, filter, gain];
}

function connectOscillator(context, destination, options = {}) {
  const oscillator = context.createOscillator();
  oscillator.type = options.type || "sine";
  oscillator.frequency.value = options.frequency || 80;
  oscillator.detune.value = options.detune || 0;
  const gain = context.createGain();
  gain.gain.value = options.gain || 0.03;
  oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start();
  return [oscillator, gain];
}

function connectLfo(context, targetParam, options = {}) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = options.frequency || 0.07;
  gain.gain.value = options.depth || 8;
  oscillator.connect(gain);
  gain.connect(targetParam);
  oscillator.start();
  return [oscillator, gain];
}

function playNoiseBurst(context, destination, options = {}) {
  const duration = options.duration || 1.2;
  const source = context.createBufferSource();
  source.buffer = createNoiseBuffer(context, duration);
  const filter = context.createBiquadFilter();
  filter.type = options.type || "lowpass";
  filter.frequency.value = options.frequency || 180;
  filter.Q.value = options.q || 0.7;
  const gain = context.createGain();
  const now = context.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(options.gain || 0.22, now + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  source.start(now);
  source.stop(now + duration + 0.04);
  window.setTimeout(() => {
    source.disconnect();
    filter.disconnect();
    gain.disconnect();
  }, Math.ceil((duration + 0.1) * 1000));
}

function playTonePulse(context, destination, options = {}) {
  const duration = options.duration || 0.18;
  const oscillator = context.createOscillator();
  oscillator.type = options.type || "sine";
  oscillator.frequency.value = options.frequency || 90;
  const gain = context.createGain();
  const now = context.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(options.gain || 0.06, now + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.04);
  window.setTimeout(() => {
    oscillator.disconnect();
    gain.disconnect();
  }, Math.ceil((duration + 0.1) * 1000));
}

function addTimedEvent(soundscape, callback, minDelay, maxDelay) {
  let timeoutId = 0;
  let active = true;
  const schedule = () => {
    if (!active) return;
    timeoutId = window.setTimeout(() => {
      if (!active) return;
      callback();
      schedule();
    }, minDelay + Math.random() * (maxDelay - minDelay));
  };
  schedule();
  soundscape.cleanups.push(() => {
    active = false;
    window.clearTimeout(timeoutId);
  });
}

function addLayer(soundscape, nodes) {
  soundscape.nodes.push(...nodes);
}

function buildSoundscape(kind, soundscape) {
  const context = audioContext;
  const output = soundscape.output;
  if (kind === "storm") {
    addLayer(soundscape, connectFilteredNoise(context, output, { gain: 0.24, frequency: 1700, q: 0.42 }));
    addLayer(soundscape, connectFilteredNoise(context, output, { gain: 0.13, type: "highpass", frequency: 720, q: 0.6, playbackRate: 1.2 }));
    const [rumble, rumbleGain] = connectOscillator(context, output, { frequency: 43, gain: 0.035 });
    addLayer(soundscape, [rumble, rumbleGain]);
    addLayer(soundscape, connectLfo(context, rumble.detune, { frequency: 0.05, depth: 18 }));
    addTimedEvent(soundscape, () => {
      playNoiseBurst(context, output, { duration: 2.2, gain: 0.34, frequency: 140 });
      playTonePulse(context, output, { duration: 1.4, frequency: 38, gain: 0.12 });
    }, 5500, 13000);
    return;
  }
  if (kind === "void") {
    addLayer(soundscape, connectFilteredNoise(context, output, { gain: 0.08, frequency: 540, q: 0.35 }));
    addLayer(soundscape, connectFilteredNoise(context, output, { gain: 0.035, type: "bandpass", frequency: 1800, q: 0.8 }));
    addLayer(soundscape, connectOscillator(context, output, { frequency: 92, gain: 0.03 }));
    return;
  }
  if (kind === "emptyHome") {
    addLayer(soundscape, connectFilteredNoise(context, output, { gain: 0.035, type: "bandpass", frequency: 360, q: 0.7 }));
    addLayer(soundscape, connectOscillator(context, output, { frequency: 58, gain: 0.01 }));
    return;
  }
  if (kind === "home") {
    addLayer(soundscape, connectFilteredNoise(context, output, { gain: 0.026, type: "bandpass", frequency: 420, q: 0.5 }));
    addLayer(soundscape, connectFilteredNoise(context, output, { gain: 0.018, type: "highpass", frequency: 2400, q: 0.4 }));
    addLayer(soundscape, connectOscillator(context, output, { frequency: 120, gain: 0.012 }));
    return;
  }
  if (kind === "pain") {
    addLayer(soundscape, connectFilteredNoise(context, output, { gain: 0.11, type: "bandpass", frequency: 1200, q: 4 }));
    addLayer(soundscape, connectOscillator(context, output, { type: "sawtooth", frequency: 66, gain: 0.035 }));
    return;
  }
  if (kind === "audience") {
    addLayer(soundscape, connectFilteredNoise(context, output, { gain: 0.065, type: "bandpass", frequency: 2400, q: 2.2 }));
    addLayer(soundscape, connectOscillator(context, output, { type: "triangle", frequency: 176, gain: 0.018 }));
    addTimedEvent(soundscape, () => playTonePulse(context, output, { duration: 0.06, frequency: 760 + Math.random() * 320, gain: 0.035 }), 500, 1500);
    return;
  }
  if (kind === "horror") {
    addLayer(soundscape, connectFilteredNoise(context, output, { gain: 0.09, frequency: 300, q: 0.8 }));
    addLayer(soundscape, connectOscillator(context, output, { type: "sawtooth", frequency: 52, gain: 0.045 }));
    addTimedEvent(soundscape, () => {
      playTonePulse(context, output, { duration: 0.13, frequency: 58, gain: 0.11 });
      window.setTimeout(() => playTonePulse(context, output, { duration: 0.1, frequency: 45, gain: 0.075 }), 180);
    }, 980, 1420);
    return;
  }
  if (kind === "twilight") {
    addLayer(soundscape, connectFilteredNoise(context, output, { gain: 0.12, frequency: 500, q: 0.55 }));
    addLayer(soundscape, connectOscillator(context, output, { frequency: 34, gain: 0.07 }));
    addTimedEvent(soundscape, () => playNoiseBurst(context, output, { duration: 2.8, gain: 0.2, frequency: 90 }), 4200, 8800);
    return;
  }
  if (kind === "rain") {
    addLayer(soundscape, connectFilteredNoise(context, output, { gain: 0.16, frequency: 1400, q: 0.45 }));
    addLayer(soundscape, connectFilteredNoise(context, output, { gain: 0.09, type: "highpass", frequency: 920, q: 0.55 }));
    addLayer(soundscape, connectOscillator(context, output, { frequency: 74, gain: 0.022 }));
    addTimedEvent(soundscape, () => playTonePulse(context, output, { duration: 0.08, frequency: 520 + Math.random() * 540, gain: 0.018 }), 280, 980);
    return;
  }
  if (kind === "meta") {
    addLayer(soundscape, connectFilteredNoise(context, output, { gain: 0.055, type: "bandpass", frequency: 1500, q: 2.6 }));
    addLayer(soundscape, connectOscillator(context, output, { type: "triangle", frequency: 110, gain: 0.03 }));
    addTimedEvent(soundscape, () => {
      playTonePulse(context, output, { duration: 0.045, frequency: 420 + Math.random() * 900, gain: 0.038, type: "square" });
      playNoiseBurst(context, output, { duration: 0.08, gain: 0.045, type: "bandpass", frequency: 2200 });
    }, 360, 1300);
    return;
  }
  addLayer(soundscape, connectFilteredNoise(context, output, { gain: 0.03, type: "highpass", frequency: 1800, q: 0.5 }));
  addLayer(soundscape, connectOscillator(context, output, { type: "triangle", frequency: 132, gain: 0.025 }));
  addTimedEvent(soundscape, () => playTonePulse(context, output, { duration: 0.05, frequency: 880, gain: 0.012 }), 2400, 5600);
}

function stopSoundscape() {
  if (!currentSoundscape || !audioContext) return;
  const oldSoundscape = currentSoundscape;
  currentSoundscape = null;
  oldSoundscape.cleanups.forEach((cleanup) => cleanup());
  const now = audioContext.currentTime;
  oldSoundscape.output.gain.cancelScheduledValues(now);
  oldSoundscape.output.gain.setTargetAtTime(0.0001, now, 0.16);
  window.setTimeout(() => {
    oldSoundscape.nodes.forEach((node) => {
      try { if (typeof node.stop === "function") node.stop(); } catch { /* Already stopped. */ }
      try { node.disconnect(); } catch { /* Already disconnected. */ }
    });
    oldSoundscape.output.disconnect();
  }, 520);
}

function startSoundscape(kind) {
  const context = ensureAudioGraph();
  if (!context) return;
  if (context.state === "suspended") context.resume().catch(() => {});
  setMasterVolume();
  if (currentSoundscape?.kind === kind) return;
  stopSoundscape();
  const output = context.createGain();
  output.gain.setValueAtTime(0.0001, context.currentTime);
  output.connect(masterGain);
  const nextSoundscape = { kind, output, nodes: [], cleanups: [] };
  currentSoundscape = nextSoundscape;
  buildSoundscape(kind, nextSoundscape);
  output.gain.exponentialRampToValueAtTime(1, context.currentTime + 0.35);
  updateControls();
}

function updateAudioForScene(sceneId) {
  if (!state.audioOn) {
    stopSoundscape();
    updateControls();
    return;
  }
  startSoundscape(soundscapeForScene(sceneId));
}

function transitionTo(nextScene) {
  if (!scenes[nextScene]) return;
  if (nextScene === "rewind") state.rainRunFinished = false;
  stopRainSession();
  stopContest();
  transitionLock = true;
  const transitionProfile = getTransitionProfile(nextScene);
  transitionImage.src = transitionProfile.art;
  transitionCaption.textContent = transitionProfile.caption;
  transitionOverlay.dataset.mood = transitionProfile.mood;
  transitionOverlay.classList.remove("is-active");
  void transitionOverlay.offsetWidth;
  transitionOverlay.classList.add("is-active");
  window.setTimeout(() => {
    state.scene = nextScene;
    activeLineIndex = 0;
    storyHistoryOpen = false;
    window.clearTimeout(storyHistoryCloseTimer);
    activeLines = getActiveLines(getScene());
    applySceneMemory(getScene());
    saveState();
    renderScene();
    transitionLock = false;
    updateControls();
  }, 430);
}

function getTransitionProfile(sceneId) {
  if (sceneId === "rewind" || sceneId.startsWith("rain") || sceneId === "ending_true") {
    return { art: "./assets/rain-tower.svg", mood: "rain", caption: "雨水的织机开始在时间上运转" };
  }
  if (sceneId.startsWith("garden") || sceneId.startsWith("coffin")) {
    return { art: "./assets/coffin-garden.svg", mood: "void", caption: "自神圣虚无中，花园重新睁开" };
  }
  if (sceneId.startsWith("blood") || sceneId.startsWith("accusation") || sceneId.startsWith("bad_")) {
    return { art: "./assets/blood-courtyard.svg", mood: "horror", caption: "错误的组合正在重新排列" };
  }
  if (sceneId.startsWith("meta") || sceneId === "contest" || sceneId === "clash") {
    return { art: "./assets/crystal-flower.svg", mood: "meta", caption: "故事的边界发生了一次微小的偏移" };
  }
  if (sceneId.startsWith("storm") || sceneId.includes("tower")) {
    return { art: "./assets/storm-tower.svg", mood: "storm", caption: "雨水的织机开始在时间上运转" };
  }
  return { art: "./assets/mirror.svg", mood: "mirror", caption: "镜中的位置正在改变" };
}

function renderScene() {
  const scene = getScene();
  sceneArt.src = scene.art || "./assets/mirror.svg";
  const sceneId = state.scene;
  const sceneMood = sceneId === "contest" || sceneId === "clash" || sceneId.startsWith("bad_")
    ? "conflict"
    : sceneId === "rewind" || sceneId.startsWith("rain") || sceneId === "ending_true" || sceneId === "tomorrow"
      ? "rain"
      : sceneId.startsWith("storm") || sceneId.includes("tower") || sceneId.startsWith("meta")
        ? "storm"
        : sceneId.includes("crystal") || scene.art?.includes("crystal")
          ? "crystal"
          : sceneId.includes("mirror") || sceneId === "unconscious"
            ? "mirror"
            : "quiet";
  artFrame.dataset.scene = sceneId;
  artFrame.dataset.mood = sceneMood;
  stage.dataset.scene = sceneId;
  stage.dataset.mood = sceneMood;
  sceneKicker.textContent = scene.kicker || "";
  sceneTitle.textContent = scene.title || "";
  sceneIndex.textContent = scene.index || "∞";
  echoText.textContent = scene.echo || "";
  stage.classList.toggle("is-rewriting", Boolean(state.rewritePulse && state.scene === "mirror_2"));
  activeLines = getActiveLines(scene);
  if (["contest", "rewind"].includes(state.scene)) activeLineIndex = activeLines.length;
  renderCurrentText();
  renderSidebar();
  updateControls();
  updateAudioForScene(state.scene);
}

function renderSidebar() {
  $("protagonistName").textContent = state.protagonistName;
  stateWhisper.textContent = state.rewritePulse ? "镜子记得那句改变位置的话。" : "镜子还没有说完。";
  memoryList.replaceChildren();
  state.memories.forEach((memory) => {
    const item = document.createElement("li");
    item.textContent = memory;
    if (memory === "手心里的雨水") item.className = "is-new";
    memoryList.append(item);
  });
  memoryRouteList.replaceChildren();
  KEY_RAIN_IDS.forEach((id, index) => {
    const item = document.createElement("li");
    const marker = document.createElement("span");
    marker.className = "memory-route-marker";
    marker.setAttribute("aria-hidden", "true");
    const copy = document.createElement("span");
    copy.className = "memory-route-copy";
    const order = document.createElement("small");
    order.textContent = `0${index + 1}`;
    const label = document.createElement("strong");
    label.textContent = rainLabels[id];
    copy.append(order, label);
    item.append(marker, copy);
    const collected = state.keyRainCollected.includes(id);
    item.className = collected ? "is-collected" : "";
    item.setAttribute("aria-label", `${collected ? "已留下" : "尚未留下"}：${rainLabels[id]}`);
    memoryRouteList.append(item);
  });
  memoryRouteHint.textContent = state.keyRainCollected.length === KEY_RAIN_IDS.length
    ? "四滴都在手心里，明天已经有了入口。"
    : state.keyRainCollected.length
      ? `已有 ${state.keyRainCollected.length} 滴停下，还缺 ${KEY_RAIN_IDS.length - state.keyRainCollected.length} 滴。`
      : "还没有一滴停在手心。";
  endingList.replaceChildren();
  state.endingHistory.forEach((id) => {
    const item = document.createElement("li");
    item.textContent = endingCatalog[id]?.title || id;
    if (id === state.currentEnding) item.className = "is-current";
    endingList.append(item);
  });
  if (!state.endingHistory.length) {
    const empty = document.createElement("li");
    empty.textContent = "还没有抵达任何结尾";
    endingList.append(empty);
  }
  endingProgress.textContent = `${state.endingHistory.length} / ${Object.keys(endingCatalog).length} 已抵达`;
  companionSection.hidden = state.companionClicks.length === 0;
  companionEcho.textContent = state.companionComplete ? "同行者已经被每一次看见。" : "……";
}

function updateControls() {
  readButton.disabled = state.endingHistory.length === 0 || transitionLock;
  audioButton.innerHTML = state.audioOn ? '<span aria-hidden="true">◉</span><span>声音</span>' : '<span aria-hidden="true">◌</span><span>声音</span>';
  audioButton.title = currentSoundscape
    ? `当前音景：${soundscapeCatalog[currentSoundscape.kind]}`
    : "开启场景环境音";
  audioButton.setAttribute("aria-pressed", String(state.audioOn));
}

function handleCompanionClick(sceneId) {
  addUnique(state.companionClicks, sceneId);
  state.companionComplete = COMPANION_OCCURRENCES.every((id) => state.companionClicks.includes(id));
  addUnique(state.memories, `同行者：${sceneId}`);
  companionSection.hidden = false;
  companionEcho.textContent = state.companionComplete ? "同行者已经被每一次看见。" : "……";
  saveState();
  renderSidebar();
}

function beginRainGame(mode = "twilight", nextScene = "rain_death") {
  state.rainMode = ["tower", "twilight"].includes(mode) ? mode : "twilight";
  state.rainNextScene = ["garden_1", "rain_death"].includes(nextScene) ? nextScene : "rain_death";
  state.rainRunFinished = false;
  state.lastRainRunScore = 0;
  state.lastRainMessage = "";
  saveState();
  transitionTo("rewind");
}

function startRainSession() {
  if (state.rainRunFinished) {
    rewriteButton.hidden = false;
    rewriteButton.textContent = state.rainMode === "tower" ? "继续坠落" : "继续黄昏";
    rewindTitle.textContent = state.rainMode === "tower" ? "在坠落中接住雨水" : "黄昏里的雨水";
    renderRainHud(RAIN_DURATION);
    return;
  }
  if (rainRuntime) { renderRainHud(); return; }
  state.rainAttempts += 1;
  state.rainRunFinished = false;
  state.lastRainRunScore = 0;
  state.lastRainMessage = "雨从上方落下。别让所有东西都从指缝漏过。";
  const now = performance.now();
  const keySchedule = RAIN_KEY_SCHEDULES[state.rainMode] || RAIN_KEY_SCHEDULES.twilight;
  rewindTitle.textContent = state.rainMode === "tower" ? "在坠落中接住雨水" : "黄昏里的雨水";
  rainRuntime = {
    startedAt: now,
    lastSpawn: -RAIN_SPAWN_INTERVAL,
    keyIndex: 0,
    keySchedule,
    drops: new Set(),
    combo: 0,
    lastCatchAt: 0,
    runCaught: 0,
    runMissed: 0,
    runKeyCaught: 0,
    runScore: 0,
    frame: window.setInterval(updateRainSession, 50),
  };
  rewriteButton.hidden = true;
  renderRainHud();
}

function updateRainSession() {
  if (!rainRuntime) return;
  const elapsed = performance.now() - rainRuntime.startedAt;
  while (elapsed < RAIN_DURATION && elapsed - rainRuntime.lastSpawn >= RAIN_SPAWN_INTERVAL) {
    spawnRainDrop(false);
    rainRuntime.lastSpawn += RAIN_SPAWN_INTERVAL;
  }
  while (rainRuntime.keyIndex < rainRuntime.keySchedule.length && elapsed >= rainRuntime.keySchedule[rainRuntime.keyIndex].time) {
    const key = rainRuntime.keySchedule[rainRuntime.keyIndex];
    if (!state.keyRainCollected.includes(key.id)) spawnRainDrop(true, key.id, key.lane);
    rainRuntime.keyIndex += 1;
  }
  renderRainHud(elapsed);
  if (elapsed >= RAIN_DURATION) finishRainSession();
}

function spawnRainDrop(isKey, keyId = "", laneIndex = 0) {
  if (!rainRuntime) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = `rain-drop${isKey ? " is-key" : ""}`;
  const duration = isKey ? 4200 : 2600 + Math.random() * 1800;
  const left = isKey ? KEY_RAIN_LANES[laneIndex % KEY_RAIN_LANES.length] : 4 + Math.random() * 90;
  const safeBottom = isKey ? 150 : 132;
  const fallDistance = Math.max(180, rainField.clientHeight - safeBottom);
  button.style.left = `${left}%`;
  button.style.setProperty("--fall-time", `${duration}ms`);
  button.style.setProperty("--fall-distance", `${fallDistance}px`);
  button.style.setProperty("--fall-shift", `${isKey ? (laneIndex % 2 ? -8 : 8) : (Math.random() * 28 - 14)}px`);
  button.style.setProperty("--fall-sway", `${isKey ? (laneIndex % 2 ? 5 : -5) : (Math.random() * 18 - 9)}px`);
  button.style.setProperty("--drop-tilt", `${isKey ? (laneIndex % 2 ? 11 : 21) : 12 + Math.random() * 12}deg`);
  button.title = isKey ? `关键记忆：${rainLabels[keyId]}` : "普通雨水";
  button.setAttribute("aria-label", button.title);
  if (isKey) {
    const label = document.createElement("span");
    label.className = "rain-key-label";
    label.textContent = "记忆";
    button.append(label);
  }
  const drop = { keyId, isKey, button, caught: false };
  button.addEventListener("click", () => catchRainDrop(drop));
  rainRuntime.drops.add(drop);
  rainField.append(button);
  requestAnimationFrame(() => button.classList.add("is-falling"));
  window.setTimeout(() => removeRainDrop(drop, "missed"), duration + 100);
}

function catchRainDrop(drop) {
  if (!rainRuntime?.drops.has(drop)) return;
  const now = performance.now();
  let impactText = "留下";
  if (drop.isKey) {
    addUnique(state.keyRainCollected, drop.keyId);
    addUnique(state.memories, rainLabels[drop.keyId]);
    rainRuntime.runKeyCaught += 1;
    state.lastRainMessage = `关键记忆留下：${rainLabels[drop.keyId]}`;
  } else {
    const continued = rainRuntime.lastCatchAt > 0 && now - rainRuntime.lastCatchAt <= CONTEST_COMBO_WINDOW;
    rainRuntime.combo = continued ? rainRuntime.combo + 1 : 1;
    rainRuntime.lastCatchAt = now;
    const gain = 1 + (rainRuntime.combo >= 5 ? 1 : 0) + (rainRuntime.combo >= 10 ? 1 : 0);
    state.rainScore += gain;
    state.lastRainRunScore = rainRuntime.runScore + gain;
    rainRuntime.runScore += gain;
    state.rainCaught += 1;
    rainRuntime.runCaught += 1;
    state.rainBestCombo = Math.max(state.rainBestCombo, rainRuntime.combo);
    state.lastRainMessage = rainRuntime.combo >= 3
      ? `接住了。连住 ${rainRuntime.combo} 滴，留下 ${gain} 点。`
      : `接住一滴普通雨水，留下 ${gain} 点。`;
    impactText = `+${gain}`;
  }
  drop.caught = true;
  spawnRainImpact(drop, drop.isKey ? "key" : "normal", impactText);
  rainCatchZone.classList.remove("is-catching");
  void rainCatchZone.offsetWidth;
  rainCatchZone.classList.add("is-catching");
  window.setTimeout(() => rainCatchZone.classList.remove("is-catching"), 520);
  removeRainDrop(drop, "caught");
  saveState();
  renderRainHud();
  renderSidebar();
}

function spawnRainImpact(drop, kind, text) {
  const impact = document.createElement("span");
  impact.className = `rain-impact is-${kind}`;
  const fieldRect = rainImpactLayer.getBoundingClientRect();
  const dropRect = drop.button.getBoundingClientRect();
  const x = dropRect.left + dropRect.width / 2 - fieldRect.left;
  const y = dropRect.top + dropRect.height * 0.72 - fieldRect.top;
  impact.style.left = `${Math.max(12, Math.min(fieldRect.width - 12, x))}px`;
  impact.style.top = `${Math.max(28, Math.min(fieldRect.height - 70, y))}px`;
  impact.textContent = text;
  rainImpactLayer.append(impact);
  window.setTimeout(() => impact.remove(), 760);
}

function removeRainDrop(drop, reason = "missed") {
  if (!rainRuntime?.drops.has(drop)) return;
  rainRuntime.drops.delete(drop);
  if (!drop.caught && reason === "missed") {
    if (drop.isKey) {
      state.lastRainMessage = "金色的雨滴擦过了手心。它还会再次出现。";
    } else {
      state.rainMissed += 1;
      rainRuntime.runMissed += 1;
      rainRuntime.combo = 0;
      rainRuntime.lastCatchAt = 0;
      state.lastRainMessage = "有一滴从指缝漏过。连击断了。";
    }
  }
  drop.button.remove();
}

function renderRainHud(elapsed = rainRuntime ? performance.now() - rainRuntime.startedAt : 0) {
  const safeElapsed = Math.max(0, Math.min(RAIN_DURATION, elapsed));
  rainScore.textContent = String(state.rainScore);
  rainRunScore.textContent = String(rainRuntime?.runScore ?? state.lastRainRunScore);
  keyRainCount.textContent = `${state.keyRainCollected.length} / 4`;
  rainTimer.textContent = String(Math.max(0, Math.ceil((RAIN_DURATION - safeElapsed) / 1000)));
  rainCaught.textContent = String(state.rainCaught);
  rainMissed.textContent = String(state.rainMissed);
  rainCombo.textContent = `连住 ${rainRuntime?.combo || 0}`;
  rainComboHud.textContent = String(rainRuntime?.combo || 0);
  rainFeedback.textContent = state.lastRainMessage || "雨还没有落到手心。";
  rainFeedback.classList.toggle("is-key", Boolean(state.lastRainMessage?.startsWith("关键记忆")));
  rainTimeProgress.style.width = `${(safeElapsed / RAIN_DURATION) * 100}%`;
  const modeText = state.rainMode === "tower" ? "坠落还没有结束" : "黄昏还没有结束";
  rewindInstruction.textContent = state.keyRainCollected.length === 4
    ? `四滴关键记忆都留下了。${modeText}。普通雨水仍然会让之后的点击更强。`
    : `普通的雨水会留下分数。四滴金色的雨水藏着关键记忆。还需要 ${4 - state.keyRainCollected.length} 滴。`;
}

function finishRainSession() {
  if (!rainRuntime) return;
  const run = rainRuntime;
  window.clearInterval(rainRuntime.frame);
  [...rainRuntime.drops].forEach((drop) => removeRainDrop(drop, "finish"));
  rainRuntime = null;
  state.rainRunFinished = true;
  state.lastRainRunScore = run.runScore;
  state.lastRainMessage = `雨停了。本轮留下 ${run.runCaught} 滴普通雨水和 ${run.runKeyCaught} 滴关键记忆。`;
  rewriteButton.hidden = false;
  rewriteButton.textContent = state.rainMode === "tower" ? "继续坠落" : "继续黄昏";
  saveState();
  renderRainHud(RAIN_DURATION);
}

function continueAfterRain() {
  if (!state.rainRunFinished) return;
  const nextScene = state.rainNextScene || (state.rainMode === "tower" ? "garden_1" : "rain_death");
  state.rainMode = "";
  state.rainNextScene = "";
  state.rainRunFinished = false;
  saveState();
  transitionTo(nextScene);
}

function stopRainSession() {
  if (!rainRuntime) return;
  window.clearInterval(rainRuntime.frame);
  [...rainRuntime.drops].forEach((drop) => removeRainDrop(drop, "cancel"));
  rainRuntime = null;
}

function clickPower() { return 1 + Math.min(8, Math.floor(state.rainScore / 6)); }

function getContestStage(elapsed) {
  if (elapsed < 4800) return { id: "opening", drift: 0.16, beat: "第一句话正替黄昏落下一枚刻度。" };
  if (elapsed < 10400) return { id: "overlap", drift: CONTEST_DRIFT_PER_TICK, beat: "两种结尾开始互相覆盖，旧的位置正在变窄。" };
  if (elapsed < 14500) return { id: "turn", drift: 0.31, beat: "已经发生的句子正从背后推来。" };
  return { id: "closing", drift: 0.44, beat: "最后几秒里，时间正在合上它的手。" };
}

function getContestRhythm(elapsed) {
  const cycleElapsed = elapsed % CONTEST_RHYTHM_CYCLE;
  const progress = cycleElapsed / CONTEST_RHYTHM_CYCLE;
  return {
    progress,
    inWindow: cycleElapsed >= CONTEST_RHYTHM_WINDOW_START && cycleElapsed <= CONTEST_RHYTHM_WINDOW_END,
  };
}

function startContest() {
  if (contestRuntime) { renderContestHud(); return; }
  if (!state.contestRoundStarted) state.contestAttempts += 1;
  state.contestRoundStarted = true;
  state.contestA = 50;
  state.contestB = 50;
  state.contestWinner = "";
  state.contestResolved = false;
  state.contestHits = 0;
  state.contestStreak = 0;
  state.contestLastSide = "";
  state.contestRhythm = 0;
  state.contestMemoryHeld = false;
  const now = performance.now();
  contestRuntime = { startedAt: now, lastTick: now, lastAmount: 0, frame: window.setInterval(updateContest, 100) };
  contestAButton.disabled = false;
  contestBButton.disabled = false;
  contestResult.textContent = "";
  contestMemoryRoute.hidden = true;
  contestMemoryButton.disabled = false;
  contestMemoryButton.textContent = "抓住仍在下落的雨";
  contestPanel.classList.remove("is-memory-held");
  contestPanel.classList.remove("is-rhythm-window");
  contestInstruction.textContent = "手心留下得越多，触碰就越有重量。点击正在上升的要素，让它退去，把留下的位置交给另一方。";
  saveState();
  renderContestHud();
}

function updateContest() {
  if (!contestRuntime) return;
  const now = performance.now();
  const elapsed = now - contestRuntime.startedAt;
  const delta = Math.max(0, Math.min(1000, now - contestRuntime.lastTick));
  contestRuntime.lastTick = now;
  // 黄昏是默认的未来；玩家必须持续介入，才有机会让另一种结局留下。
  const stage = getContestStage(elapsed);
  if (state.contestMemoryHeld) {
    const settling = Math.min(0.18, delta / 1000 * 0.12);
    state.contestA += (50 - state.contestA) * settling;
    state.contestB += (50 - state.contestB) * settling;
  } else {
    const drift = stage.drift * (delta / 100);
    state.contestA = Math.max(0, state.contestA - drift);
    state.contestB = Math.min(100, state.contestB + drift);
  }
  renderContestHud(elapsed);
  if (elapsed >= CONTEST_DURATION) resolveContest();
}

function renderContestHud(elapsed = contestRuntime ? performance.now() - contestRuntime.startedAt : 0) {
  const safeElapsed = Math.max(0, Math.min(CONTEST_DURATION, elapsed));
  const contestStage = getContestStage(safeElapsed);
  const rhythm = getContestRhythm(safeElapsed);
  const difference = state.contestA - state.contestB;
  const phase = difference >= 24
    ? "承认正在退去"
    : difference <= -24
      ? "黄昏正在升高"
      : Math.abs(difference) <= 8
        ? "两种结尾互相覆盖"
        : difference > 0
          ? "承认暂时占上风"
          : "黄昏暂时占上风";
  const whisper = safeElapsed < 4000
    ? "时间先替黄昏落下一枚刻度。"
    : contestStage.id === "closing"
      ? "时间正在关闭。每一次触碰都会留下形状。"
      : contestStage.id === "turn"
        ? "句子正在返身。抓住正在上升的那一边。"
    : difference <= -18
      ? "黄昏正在上升。点击它，让上升的部分退去。"
      : difference >= 18
        ? "承认已经松动。继续触碰，给另一方留下位置。"
        : "两种结尾还在同一处互相覆盖。";
  contestAScore.textContent = `${Math.round(state.contestA)}`;
  contestBScore.textContent = `${Math.round(state.contestB)}`;
  const contestSidesAreOverlapping = Math.abs(difference) <= 8;
  const abyssRising = difference > 8;
  const twilightRising = difference < -8;
  contestAStatus.textContent = abyssRising
    ? "它正在取得更大的位置。"
    : contestSidesAreOverlapping
      ? "它还和黄昏重叠在一起。"
      : "它暂时被压回了句子里。";
  contestBStatus.textContent = twilightRising
    ? "时间正在替它添上一笔。"
    : contestSidesAreOverlapping
      ? "它还和承认重叠在一起。"
      : "它暂时被压回了黄昏里。";
  contestAButton.setAttribute("aria-label", `${contestATitle.textContent}，${contestAStatus.textContent}`);
  contestBButton.setAttribute("aria-label", `${contestBTitle.textContent}，${contestBStatus.textContent}`);
  contestAStrength.style.width = `${Math.max(0, Math.min(100, state.contestA))}%`;
  contestBStrength.style.width = `${Math.max(0, Math.min(100, state.contestB))}%`;
  contestTimer.textContent = String(Math.max(0, Math.ceil((CONTEST_DURATION - safeElapsed) / 1000)));
  contestPhase.textContent = phase;
  contestWhisper.textContent = whisper;
  contestABalance.style.width = `${Math.max(0, Math.min(100, state.contestA))}%`;
  contestBBalance.style.width = `${Math.max(0, Math.min(100, state.contestB))}%`;
  contestBalanceMarker.style.left = `${Math.max(0, Math.min(100, state.contestA))}%`;
  contestTimeProgress.style.width = `${(safeElapsed / CONTEST_DURATION) * 100}%`;
  contestHits.textContent = String(state.contestHits);
  contestPower.textContent = String(clickPower() + Math.min(3, Math.floor(state.contestStreak / 4)));
  contestRainPower.textContent = String(clickPower());
  contestRhythm.textContent = String(state.contestRhythm);
  contestRhythmProgress.style.width = `${rhythm.progress * 100}%`;
  contestBeat.textContent = state.contestMemoryHeld
    ? "雨水回到更早的位置，两个结尾都失去了独自留下的力量。"
    : rhythm.inWindow
      ? "节拍正好落在这里。此刻触碰，重量会更深。"
      : contestStage.beat;
  contestPanel.dataset.stage = contestStage.id;
  contestPanel.classList.toggle("is-rhythm-window", rhythm.inWindow);
  const targetSide = state.contestA > state.contestB ? "a" : "b";
  contestTargetBox.dataset.side = targetSide;
  contestTargetLabel.textContent = targetSide === "a" ? "正在上升：承认" : "正在上升：黄昏";
  contestTargetHint.textContent = rhythm.inWindow ? "节拍亮起时触碰它" : "顺着它下落以前触碰";
  const canShowMemoryRoute = state.contestAttempts > 1
    && state.keyRainCollected.length === KEY_RAIN_IDS.length
    && contestStage.id === "closing";
  const memoryRouteReady = state.contestHits >= TRUE_ROUTE_MIN_HITS && Math.abs(difference) <= TRUE_ROUTE_BALANCE_WINDOW;
  contestMemoryRoute.hidden = !canShowMemoryRoute;
  contestMemoryButton.disabled = state.contestMemoryHeld || !memoryRouteReady;
  contestMemoryHint.textContent = state.contestMemoryHeld
    ? "已经发生过的雨水没有消失。"
    : memoryRouteReady
      ? "四滴雨水都停在了手心。"
      : "两种结尾还没有留下足够的空隙。";
  contestASide.classList.toggle("is-leading", state.contestA >= state.contestB);
  contestBSide.classList.toggle("is-leading", state.contestB > state.contestA);
  contestASide.classList.toggle("is-rising", abyssRising);
  contestBSide.classList.toggle("is-rising", twilightRising);
  contestASide.classList.toggle("is-target", targetSide === "a");
  contestBSide.classList.toggle("is-target", targetSide === "b");
}

function shiftContest(side) {
  if (!contestRuntime || state.contestResolved) return;
  const elapsed = performance.now() - contestRuntime.startedAt;
  const rhythm = getContestRhythm(elapsed);
  state.contestStreak = state.contestLastSide === side ? state.contestStreak + 1 : 1;
  state.contestLastSide = side;
  state.contestHits += 1;
  const timingBonus = rhythm.inWindow ? 2 : 0;
  if (rhythm.inWindow) {
    state.contestRhythm += 1;
    state.contestRhythmBest = Math.max(state.contestRhythmBest, state.contestRhythm);
  }
  const amount = clickPower() + Math.min(3, Math.floor(state.contestStreak / 4)) + timingBonus;
  contestRuntime.lastAmount = amount;
  contestRuntime.lastRhythmHit = rhythm.inWindow;
  if (side === "a") {
    state.contestA = Math.max(0, state.contestA - amount);
    state.contestB = Math.min(100, state.contestB + amount);
  } else {
    state.contestB = Math.max(0, state.contestB - amount);
    state.contestA = Math.min(100, state.contestA + amount);
  }
  const sideNode = side === "a" ? contestASide : contestBSide;
  sideNode.classList.remove("is-striking");
  void sideNode.offsetWidth;
  sideNode.classList.add("is-striking");
  sideNode.classList.toggle("is-rhythm-hit", rhythm.inWindow);
  window.setTimeout(() => sideNode.classList.remove("is-rhythm-hit"), 380);
  stage.classList.add("is-contesting");
  window.setTimeout(() => stage.classList.remove("is-contesting"), 180);
  window.setTimeout(() => sideNode.classList.remove("is-striking"), 260);
  spawnContestImpact(side, amount);
  contestWhisper.textContent = rhythm.inWindow
    ? `节拍命中。此次触碰多留下 ${timingBonus} 点重量。`
    : state.contestStreak >= 4
    ? `同一方向连续触碰 ${state.contestStreak} 次，重量正在增加。`
    : side === "a"
      ? "承认退去了一点，黄昏接住了空出来的位置。"
      : "黄昏退去了一点，承认接住了空出来的位置。";
  saveState();
  renderContestHud();
}

function spawnContestImpact(side, amount) {
  const impact = document.createElement("span");
  impact.className = `contest-impact is-${side}`;
  impact.textContent = side === "memory" ? "雨水留下" : `-${amount}  +${amount}`;
  contestImpactLayer.append(impact);
  window.setTimeout(() => impact.remove(), 720);
}

function holdContestMemory() {
  if (!contestRuntime || state.contestMemoryHeld || state.contestAttempts <= 1) return;
  const elapsed = performance.now() - contestRuntime.startedAt;
  const difference = state.contestA - state.contestB;
  const inFinalMoments = getContestStage(elapsed).id === "closing";
  const ready = state.keyRainCollected.length === KEY_RAIN_IDS.length
    && state.contestHits >= TRUE_ROUTE_MIN_HITS
    && Math.abs(difference) <= TRUE_ROUTE_BALANCE_WINDOW;
  if (!inFinalMoments || !ready) return;
  state.contestMemoryHeld = true;
  addUnique(state.memories, "手心里的雨水");
  addUnique(state.gallery, "rain");
  contestPanel.classList.add("is-memory-held");
  contestMemoryButton.disabled = true;
  contestMemoryButton.textContent = "雨水没有离开";
  contestMemoryHint.textContent = "已经发生过的雨水没有消失。";
  spawnContestImpact("memory", 0);
  saveState();
  renderSidebar();
  renderContestHud();
}

function resolveContest() {
  if (!contestRuntime || state.contestResolved) return;
  const elapsed = performance.now() - contestRuntime.startedAt;
  stopContest();
  contestAButton.disabled = true;
  contestBButton.disabled = true;
  state.contestWinner = state.contestA >= state.contestB ? "abyss" : "twilight";
  state.contestResolved = true;
  state.contestRoundStarted = false;
  const firstContest = state.contestAttempts === 1;
  const trueUnlocked = !firstContest
    && state.contestMemoryHeld
    && state.keyRainCollected.length === KEY_RAIN_IDS.length
    && state.contestHits >= TRUE_ROUTE_MIN_HITS
    && Math.abs(state.contestA - state.contestB) <= TRUE_ROUTE_BALANCE_WINDOW;
  let ending = "twilight";
  if (firstContest) ending = "twilight";
  else if (trueUnlocked) ending = "true";
  else if (state.contestWinner === "abyss") ending = "abyss";
  else if (state.companionComplete && state.contestWinner === "twilight") ending = "unconscious";
  contestResult.textContent = ending === "true"
    ? "四滴关键记忆让另一条道路出现了。"
    : ending === "unconscious"
      ? "同行者都被看见了。黄昏没有得到这一次的结尾。"
      : firstContest
        ? "最开始的斗争仍然落入黄昏。"
        : `结局的方向已经稳定：${endingCatalog[ending].title}`;
  renderContestHud(elapsed);
  saveState();
  window.setTimeout(() => recordEnding(ending), 700);
}

function stopContest() {
  if (!contestRuntime) return;
  window.clearInterval(contestRuntime.frame);
  contestRuntime = null;
}

function openGallery() {
  galleryGrid.replaceChildren();
  const items = state.gallery.map((id) => galleryCatalog[id]).filter(Boolean);
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "empty-gallery";
    empty.textContent = "画廊里暂时只有空白。";
    galleryGrid.append(empty);
  } else {
    items.forEach((item) => {
      const article = document.createElement("article");
      article.className = "gallery-item";
      const image = document.createElement("img");
      image.src = item.art;
      image.alt = item.title;
      const copy = document.createElement("div");
      copy.className = "gallery-copy";
      const title = document.createElement("h3");
      title.textContent = item.title;
      const poem = document.createElement("p");
      poem.textContent = item.poem;
      copy.append(title, poem);
      article.append(image, copy);
      galleryGrid.append(article);
    });
  }
  if (!galleryDialog.open) galleryDialog.showModal();
}

function advanceText() {
  if (transitionLock || activeLineIndex >= activeLines.length) return;
  closeStoryHistory();
  activeLineIndex += 1;
  renderCurrentText();
}

function resetRun() {
  stopRainSession();
  stopContest();
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* Storage may be unavailable. */ }
  state = clone(defaultState);
  activeLineIndex = 0;
  storyHistoryOpen = false;
  window.clearTimeout(storyHistoryCloseTimer);
  transitionLock = false;
  renderScene();
}

function restart() {
  if (window.confirm("要清除新版本进度，从镜像阶段重新开始吗？")) resetRun();
}

function toggleAudio() {
  state.audioOn = !state.audioOn;
  if (state.audioOn) updateAudioForScene(state.scene);
  else stopSoundscape();
  saveState();
  updateControls();
}

function handleKeydown(event) {
  if (event.key === " " || event.key === "Enter") {
    if (document.activeElement?.tagName === "BUTTON") return;
    event.preventDefault();
    advanceText();
  }
}

continueButton.addEventListener("click", advanceText);
storyText.addEventListener("click", handleStoryTextClick);
storyText.addEventListener("wheel", handleStoryWheel, { passive: false });
storyText.addEventListener("scroll", handleStoryScroll, { passive: true });
contestAButton.addEventListener("click", () => shiftContest("a"));
contestBButton.addEventListener("click", () => shiftContest("b"));
contestMemoryButton.addEventListener("click", holdContestMemory);
rewriteButton.addEventListener("click", continueAfterRain);
galleryButton.addEventListener("click", openGallery);
closeGalleryButton.addEventListener("click", () => galleryDialog.close());
restartButton.addEventListener("click", restart);
audioButton.addEventListener("click", toggleAudio);
readButton.addEventListener("click", beginReplay);
document.addEventListener("keydown", handleKeydown);

renderScene();
