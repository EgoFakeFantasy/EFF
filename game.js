const STORAGE_KEY = "wuzhong-returner-save-v1";
const DEFAULT_VOLUME = 0.58;
const VOLUME_PROFILE_VERSION = 3;
const SCENE_MIGRATIONS = {
  meta_2: "meta_state_1",
  meta_3: "meta_state_3",
  meta_4: "meta_observers",
  meta_5: "meta_prequel",
};

const galleryCatalog = {
  mirror: {
    title: "镜前的拼接物",
    art: "./assets/mirror.svg",
    poem: "被确认的头、手与脚。\n被承认的脸、眼与耳。\n那些[是的]拼接起来，暂时叫作我。",
  },
  storm: {
    title: "逆时而落的雨",
    art: "./assets/storm-tower.svg",
    poem: "声音在听清之前离去。\n红月之下，有人逆序而落。\n下一个奇点再见吧，无名的旅伴。",
  },
  coffin: {
    title: "花园中的容器",
    art: "./assets/coffin-garden.svg",
    poem: "棺木不是终点。\n它像一扇向内打开的门，\n把醒来送回梦中。",
  },
  photo: {
    title: "四条腿的全家福",
    art: "./assets/photo-fragment.svg",
    poem: "中央的人仍然年轻。\n背后有两个人，或许不止。\n残缺没有说谎，只是拒绝说完。",
  },
  breakfast: {
    title: "三碗白粥的清晨",
    art: "./assets/family-breakfast.svg",
    poem: "新闻、咸味、母亲的白发。\n日常归位时，缺席也就拥有了形状。",
  },
  blood: {
    title: "被错误组合的庭院",
    art: "./assets/blood-courtyard.svg",
    poem: "火是真的，血是真的。\n幸存是真的，死去也是真的。\n可是把刀交到我手里的句子，不是真的。",
  },
  rain: {
    title: "接住雨水的手",
    art: "./assets/rain-tower.svg",
    poem: "大多数从指缝漏过。\n但只要有一滴留下，\n我就能再一次回到自己。",
  },
  crystal: {
    title: "无垠之萍",
    art: "./assets/crystal-flower.svg",
    poem: "无不是空洞。\n无是没有最大元的尽头。\n我从那里归来，于是我重新设定开始。",
  },
};

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

const scenes = {
  mirror_1: {
    kicker: "镜像阶段",
    title: "镜前的拼接物",
    art: "./assets/mirror.svg",
    echo: "故事开始之前，自我已经被他者的承认与误认缝合过一次。",
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
    echo: "这里的 ta / Ta / TA 不是主线人物，而是自我结构的前奏。",
    memories: ["他者的承认"],
    text: [
      { className: "quote", text: "是了，那是你哦。Ta这样说着。是了，那些都是哦。不仅如此，你还要这样，那样。" },
      "于是，这样，那样就变得是的了。从一开始，自我的构筑就混入了别的东西。更进一步地说，自我就是由别的东西统合而成的，更是有什么在替我们做着保证。",
      "诞生于此的人们，陷入在不确定的恐慌之中。从不断的误认，不断的被要求中，ta们逐渐在一次次的认可中确认了自己的形态。",
      "如果有一天我被抛弃了会怎样呢？为了继续活下去，人们竭尽全力想要满足ta。但是，人们总是不知道ta想要什么。",
    ],
    choices: [{ label: "继续听那个关于缺失与法则的故事", to: "mirror_3", primary: true }],
  },
  mirror_3: {
    kicker: "镜像阶段",
    title: "被放逐的名",
    art: "./assets/mirror.svg",
    echo: "被拒绝的东西不会死去，它们会换一种形式回来。",
    memories: ["无法接受的名"],
    text: [
      "人们终于在一次又一次的表演与遵循中明白，ta在渴求着什么，因为ta没有了这个东西。于是一个狂妄的小偷被设想出来：Ta夺走了ta的那个东西。",
      "可是，在ta的承认下，小偷的形象消失殆尽，取代之的是一个覆盖方方面面的秩序，统辖所有人，指示你如何去做事的法则。",
      "那个对于人们至高无上的ta，本身就没有那个幻想中被夺取的东西。ta本身就是缺失着的。",
      "进入Ta的世界时，我们就已经被分割为两种形态：一者是自对ta的误认中产生的自我，一者是遵循着Ta的律法而工作着的、被[我]所拒绝的特异之物。",
      "但是啊，总是会回来的，那些我们不愿接受、没有办法接受的[名]。无论以何种方式，无论以何种辗转，总是会自那个与[我]们截然不同的地方回归。",
      { className: "quote", text: "所以啊，你想起来了吗，你的一切？我无名的旅伴？" },
    ],
    choices: [{ label: "让故事从雨里开始", to: "storm_1", primary: true }],
  },
  storm_1: {
    kicker: "故事揭幕之前",
    title: "名字擦过耳边",
    art: "./assets/storm-tower.svg",
    echo: "被呼喊的名字未必是你的名字，名字本身也可能是一段争夺。",
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
    echo: "螺旋塔第一次出现，之后它会成为每次重新塑造自身的通道。",
    memories: ["红月", "螺旋之塔"],
    text: [
      "这双手似乎还想留住什么。向上抓去，余留在手心的却只有仍然向下流去的雨滴。",
      "噔。噔。噔。",
      "无穷向上延伸的回廊，响起了脚步声。无名的人向上看去，红色的月亮挂在无尽轮回的高塔之上。",
      "而在红月下方，有一个浑黑的身影，仿佛违反了物理法则一般，从高塔之中向月亮落去。",
      { className: "quote", text: "下一个奇点再见吧，无名的旅伴。" },
    ],
    choices: [{ label: "在花园中醒来", to: "garden_1", primary: true }],
  },
  garden_1: {
    kicker: "神圣虚无",
    title: "花园中的周防",
    art: "./assets/coffin-garden.svg",
    echo: "周防在这里只拥有必要信息，追溯过去这一行为本身会带来痛苦。",
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
    echo: "痛苦不是信息，而是信息被挡住时留下的形状。",
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
    echo: "这里像游戏中的边界，但边界本身也是一条叙事事实。",
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
    echo: "棺材只给出原文里的句子；它不是解释者，只是通道与记录物。",
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
    echo: "周防选择的不是死亡，而是用睡眠反向打开下一层。",
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
    echo: "故事揭幕是外部入侵者对开始挖掘记忆的戏称。",
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
    echo: "七日梦境从空屋开始。最熟悉之处，先以空白的形式出现。",
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
    echo: "家作为结构存在，生活作为痕迹被抹去。",
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
    echo: "身体活力像记忆一样涌现，却没有显意识能说明来源。",
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
    echo: "空并非没有结构，而是结构中不该缺席的东西被抽走。",
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
    echo: "镜子让周防误以为这里更接近现实，但这仍然只是他的推论。",
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
    echo: "照片不是物证式线索，而是周防重新认可某段记忆归属后的象征。",
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
    echo: "水箱中的血水与残肢对应第四日血流成河的场面，此刻只以痛苦封锁出现。",
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
    echo: "有些门不是不能打开，而是不能在没有留下某种东西之前打开。",
    memories: ["过早打开的水箱"],
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
    echo: "梦境和异界的区别已经不重要，重要的是它能否组织起记忆。",
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
    echo: "这句新增铭文来自原文；之后不会额外扩写棺材文字。",
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
    echo: "无名者与逆时而落的男人再度错过。",
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
    echo: "生活痕迹归位后，周防开始认可这段家庭关系。",
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
    echo: "称呼不是设定说明，而是家庭承认主角的方式。",
    memories: ["三碗白粥", "雪菜炒毛豆"],
    text: [
      "厨房门被打开，端着雪菜炒毛豆的女人走入客厅。",
      { className: "quote", text: "吃饭了，小防，还有老公……咦，儿子你今天怎么了？" },
      "周防赶忙应付过去：没事，妈，我就是发现你好像又长了一根白头发。",
      "母亲果然很快被转移了注意力。随着电视机被关掉，白头发的寻找又以眼花为由不了了之，一家人坐在餐桌上准备享用早饭。",
      "桌上摆着三大碗白粥和榨菜，咸鸭蛋和包子也摆在一旁。好久没吃饭的周防决定大快朵颐。",
      { className: "quote", text: "慢慢喝，没人抢你的吃。" },
    ],
    choices: [{ label: "让这三日平淡过去", to: "three_days", primary: true }],
  },
  three_days: {
    kicker: "第一幕",
    title: "安宁的轮廓",
    art: "./assets/family-breakfast.svg",
    echo: "选择不打开水箱，是周防主动参与的拒绝与保护。",
    memories: ["妹妹在外婆家", "大学录取通知书"],
    text: [
      "家中又很快恢复寂静。父母不急不忙地去上班了。",
      "相比上一个梦或世界，唯一的变化就是原本应该在这里的生活痕迹全部回来了。",
      "最后，是厕所的马桶。上一次把他直接遣返的地方。",
      "或许我应该再等等几天再去看看，说不定有新的变化。",
      "或许是贪恋于饮食，或许是贪恋于日常的生活，又或许是因为之前那次剧痛的顾虑，周防停止了下一步的计划。",
      "于是平平淡淡的三日过去。周防知道了自己已经接到大学录取通知书，也知道自己似乎还有一个妹妹，现在应该在外婆家暂住着玩。",
    ],
    choices: [{ label: "进入第四日", to: "interlude_actors", primary: true }],
  },
  interlude_actors: {
    kicker: "幕间",
    title: "演员入场",
    art: "./assets/storm-tower.svg",
    echo: "恶意观众把周防的痛苦当作演出，并向同类转播。",
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
    echo: "反方不是制造虚假元素，而是争夺它们如何组合成故事。",
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
    echo: "妹妹从缺席位置回归，但以无法接受的形式回归。",
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
    echo: "血色庭院是舞台化的记忆组合，并非案发现场原貌。",
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
    echo: "这里的胜负不关乎真实元素，而关乎组合出的叙事是否被认可。",
    text: [
      { className: "fracture", text: "看看这样的你吧，犯下了如此滔天大罪的感觉如何？" },
      "是你亲手杀死了你的妹妹，挖出了她的心脏。是你亲自把利剑刺向你父亲的胸膛，并等待到你的母亲扑上去试图挡开这一击时，将两个人一同在绝望中贯穿。",
      "是你亲自杀害了家中的所有人，然后一把火点燃了一切。",
      "如今造下此等恶孽，你该如何是好呢？是接受这一切然后就此堕入魔渊，还是因为接受不了这一切而自刎归天？又或者只是疯疯癫癫地度过余生？",
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
    echo: "这不是正史，只是外部入侵者期待周防承认的支流。",
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
    echo: "逃避可以暂时止痛，却会把主导权留给他者。",
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
    echo: "追溯本身变成了无穷循环，真灵先于答案抵达高塔尽头。",
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
    echo: "周防否定的是恶意拼接出的记忆命题，而不是否定家人之死。",
    memories: ["拒绝错误组合", "书写权争夺"],
    text: [
      { className: "quote", text: "不，我拒绝这一切。" },
      "撕扯的力道突然消失了一点。",
      "造下这一切的不是我。我否定这样的事情。",
      "撕扯的影响越来越小，它似乎无法阻止周防了。",
      { className: "quote", text: "我否定这样的结局。而后，我要亲自把你们这群操控棋局、真正造就恶孽而脱身于他者的家伙拽入深渊，让你们也体会一下地狱的感觉！" },
      "周防好像在嘶吼。他的声音不像是现代人类应该发出的样子。好似狮子在咆哮，好似雷霆突然从黑暗中出现。",
      { className: "quote", text: "这样的结局绝不可能发生！" },
    ],
    choices: [{ label: "让世界崩坏", to: "clash", primary: true }],
  },
  clash: {
    kicker: "第二幕",
    title: "红灰碰撞",
    art: "./assets/storm-tower.svg",
    echo: "红光与灰光是周防和外来入侵者的真值显现，但游戏不会把它们做成公式面板。",
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
    echo: "无名旅伴是无意识主体-压抑机制，不是外部入侵者。",
    gallery: ["rain"],
    memories: ["无名旅伴", "显意识边缘"],
    text: [
      "雨水在落下。自无尽螺旋的高塔，然后一滴滴掉落在地上，融为水潭。",
      "最后，沿着地板的裂隙，流入塔底。那是深不见底的晦暗，是不可见的流，却又以一种极其似曾相识的规律运转着。",
      { className: "quote", text: "是的，你的思考是对的。但奇异的是，这不正是你的心象吗？" },
      "那个声音说，它花了很大的功夫才把周防从他们手里捞回来。以后不要老是去打没有准备的仗。",
      { className: "quote", text: "作为你诸多自我防御机制的面相之一，以压抑之名，向您致意。" },
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
    echo: "记忆从未离开，只是去往更安全的地方。能接住多少，取决于周防如何重新承认自身。",
    memories: ["手心里的雨水"],
    text: [
      { className: "quote", text: "我的记忆在流失？" },
      "不，它们从未离开。只是因为某些原因，要去往一个更加安全的地方。",
      "周防沉默片刻。一双手自无中出现，双掌合拢，将那雨水接住。",
      "就算大多数从指缝漏过，也有些许被留在了手心。",
      { className: "quote", text: "这就是我的答案。" },
      "于是，无数道裂痕贯穿身体。那身体被分裂为无数片。从黑暗里，带有尸斑和灰暗皮肤的枯手自雾中伸出，要抓向那破碎的身体。",
      "这似乎是个死局。然而，奇迹发生了。无尽的身体碎片竟然强行挣脱了约束，再度合而为一。",
    ],
    choices: [{ label: "继续追问黄昏", to: "rain_death", primary: true }],
  },
  rain_death: {
    kicker: "显意识边缘",
    title: "黄昏",
    art: "./assets/rain-tower.svg",
    echo: "黄昏、昏黄大海、红月，都是落入神圣虚无的同一个终局。",
    memories: ["黄昏的海洋"],
    text: [
      "周防问，为什么他会被抓到这里，不进来就再也无法回来是什么意思。",
      { className: "quote", text: "字面意思，亲爱的。你的真灵将会落入那昏黄的大海，泯灭于高塔尽头的红月。" },
      "这是战斗的宿命，这是无法挣脱的诡异。也就是你从来都忽视，却真正会临到你的死。",
      "身为雨水浇灌出的水潭，是无法想象自身的干涸的。因为一直都有着水在里面，反而无法想象不能有水的时候。",
      "它又说，那更像是一面水做成的镜子。许许多多小妖精的倒影互相错开又互相交织，发生出了[我]的存在。",
    ],
    choices: [{ label: "询问那些入侵者", to: "rain_enemy", primary: true }],
  },
  rain_enemy: {
    kicker: "显意识边缘",
    title: "无家可归者",
    art: "./assets/rain-tower.svg",
    echo: "入侵者是恶意观众与夺取者，不是周防无意识的一部分。",
    memories: ["外部入侵者"],
    text: [
      "那么，那些家伙呢？",
      { className: "quote", text: "无家可归的流浪者，却又想占夺别人的契机。" },
      "这是真正你死我活的战斗。不要想它们屈膝，不要想它们投降。我们只能这样走下去，直到或是黄昏来临，或是新的礁石落下。",
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
    echo: "回溯写入尚未发生时，故事表面只保留当下能被读到的句子。",
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
    revealAfterRewrite: [
      {
        speaker: "前传人物",
        className: "revealed",
        text: "~于是，这个故事被重新纳入了水晶花与九连环系统的版图，也许世界尽头的小提琴又要豁出一台子机来工作了吧。不过那是后话了♪",
      },
    ],
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
    echo: "第一种写法先被写在显现的场域上。它还没有被否定。",
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
    echo: "下一次流程才发生划除：状态1被保留为痕迹，状态2在它上面写出。",
    memories: ["故事状态 2"],
    text: [
      {
        kind: "rewrite",
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
    echo: "状态2也被划掉。下一句没有抹平前两种状态，而是把它们作为失败的书写继续留在表面上。",
    memories: ["故事状态 3", "显现的场域", "表象改写"],
    text: [
      {
        kind: "rewrite",
        speaker: "故事状态 3",
        original: "“然而，这是无能为力的谎言。如果只是外部之真的延续，就如同前者所说，只是无聊的秩序互相覆盖的过程罢了。",
        replacement: "“然而，并非只是如此，一切才刚刚开始",
      },
      "“...",
      { speaker: "外来者", text: "你倒是会抓要点啊，被割裂的亡灵。我们之间可是在这里的意见差异的很大啊。" },
      "”",
      "”",
      "”",
      { speaker: "无意识", text: "我需要提醒你，黄昏的海洋任然在高塔的尽头，那月食之处凝视着你。" },
      { speaker: "周防", className: "fracture", text: "[如果真的想帮上忙的话，为什么不一起来阻止这个不断的改写着我们，改写着历史的杂碎呢]" },
      { speaker: "无意识", className: "quote", text: "...如你所愿，我的旅伴。如你所见，我正在阅览你那有趣的战场" },
      { speaker: "无意识", text: "如你所愿的，黄昏被避免了。现在该想想，以什么样的方法，才能终结这场两难的战斗了" },
      { speaker: "无意识", text: "可惜的是，你已经没有机会了，入侵者。或者说，我已经想到了为什么突然的前来观察我了，我说的是吧，\n这位小姐，还有您的?" },
    ],
    retroactiveReveals: [
      {
        step: 3,
        at: 2,
        text: [
          { speaker: "无意识", className: "revealed fracture", text: "---我并不建议在这样朴素的分层中展开更加深入的东西，这位无礼的侵略者\n你也不希望夺取的计划只是归于毁灭的失败吧---" },
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
    echo: "外来者、无意识与前传人物在同一时间线上交错发言，回溯并不等于另起一条时间线。",
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
    echo: "前传人物在这里继续书写自己的回溯，不展开他们来自何处。",
    memories: ["前传二人", "元-语言层"],
    text: [
      { speaker: "前传人物", text: "总而言之，这就是通往真之生物的道途，你们明白了吗?" },
      { speaker: "旁白", text: "理型界中，正在清理着自己已然不知道是何物的毛发的幻猫，看向思索着的二人" },
      { speaker: "前传人物", className: "quote", text: "“这次的内容似乎很大程度上是更纯粹的形式化工作了...\n话说回来谁也没想到呢，在那个横跨故事的斗争之前，起初的永恒轮回中，居然也有人找到了类似的方法...”" },
      { speaker: "前传人物", text: "“准确来说，知识在幻海内部已经没有了真正的发现而发明第一人的称呼了吧。你总是可以去到往某个方向的历史，找到或者选择一个反例而出现”" },
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
    echo: "前传人物从终点回到终章开头，隐藏文本因此回到它原本的位置。",
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
    echo: "这是一个足够完整的结局，也是一个足够像结局的结局。",
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
    echo: "周防不再依赖任何被设定在自身之前的东西，并获得了为自身设定公理的能力。",
    memories: ["无垠之萍", "无依赖的思想"],
    ending: true,
    text: [
      { speaker: "前传人物", text: "真是小看你了，我想如果用修仙一侧的话，此刻你真正值得我去称呼道友一词。" },
      { speaker: "前传人物", text: "走出了自己的道路了呢♪" },
      { speaker: "周防", className: "quote", text: "不，我想我已经把握了那个答案。真正的契机，是如同不可能性一般的跨越了礁石吧。" },
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

const defaultState = {
  scene: "mirror_1",
  protagonistName: "周防",
  titleName: "无中归来者",
  memories: [],
  inscriptions: [],
  gallery: [],
  visited: [],
  counters: {},
  audioEnabled: false,
  volume: DEFAULT_VOLUME,
  volumeProfileVersion: VOLUME_PROFILE_VERSION,
};

let state = loadState();
let activeScene = null;
let activeLines = [];
let activeTextIndex = 0;
let transitionLock = false;

const sceneArt = document.querySelector("#sceneArt");
const sceneKicker = document.querySelector("#sceneKicker");
const sceneTitle = document.querySelector("#sceneTitle");
const gameTitle = document.querySelector("#gameTitle");
const protagonistName = document.querySelector("#protagonistName");
const storyText = document.querySelector("#storyText");
const continueButton = document.querySelector("#continueButton");
const choices = document.querySelector("#choices");
const memoryList = document.querySelector("#memoryList");
const inscriptionList = document.querySelector("#inscriptionList");
const echoText = document.querySelector("#echoText");
const galleryButton = document.querySelector("#galleryButton");
const restartButton = document.querySelector("#restartButton");
const galleryDialog = document.querySelector("#galleryDialog");
const closeGalleryButton = document.querySelector("#closeGalleryButton");
const galleryGrid = document.querySelector("#galleryGrid");
const audioButton = document.querySelector("#audioButton");
const volumeControl = document.querySelector("#volumeControl");
const transitionOverlay = document.querySelector("#transitionOverlay");

let audioContext = null;
let masterGain = null;
let currentSoundscape = null;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultState);
    const parsed = JSON.parse(raw);
    const savedScene =
      typeof parsed.scene === "string" && scenes[parsed.scene]
        ? parsed.scene
        : SCENE_MIGRATIONS[parsed.scene] || defaultState.scene;
    const savedVolume = Number(parsed.volume);
    const clampedVolume = Number.isFinite(savedVolume)
      ? Math.min(1, Math.max(0, savedVolume))
      : DEFAULT_VOLUME;
    const migratedVolume =
      parsed.volumeProfileVersion === VOLUME_PROFILE_VERSION
        ? clampedVolume
        : Math.min(clampedVolume, DEFAULT_VOLUME);
    const savedCounters =
      parsed.counters && typeof parsed.counters === "object" && !Array.isArray(parsed.counters)
        ? parsed.counters
        : {};

    return {
      ...structuredClone(defaultState),
      ...parsed,
      scene: savedScene,
      protagonistName: typeof parsed.protagonistName === "string" && parsed.protagonistName.trim()
        ? parsed.protagonistName
        : defaultState.protagonistName,
      titleName: typeof parsed.titleName === "string" && parsed.titleName.trim()
        ? parsed.titleName
        : defaultState.titleName,
      memories: Array.isArray(parsed.memories) ? parsed.memories : [],
      inscriptions: Array.isArray(parsed.inscriptions) ? parsed.inscriptions : [],
      gallery: Array.isArray(parsed.gallery) ? parsed.gallery : [],
      visited: Array.isArray(parsed.visited) ? parsed.visited : [],
      counters: savedCounters,
      audioEnabled: parsed.audioEnabled === true,
      volume: migratedVolume,
      volumeProfileVersion: VOLUME_PROFILE_VERSION,
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Some browsers restrict localStorage on file:// pages; the game can still run.
  }
}

function addUnique(collection, items = []) {
  for (const item of items) {
    if (item && !collection.includes(item)) collection.push(item);
  }
}

function isRewrittenChapter() {
  return Boolean(state.counters.metaRewritten);
}

function filterAvailableLines(lines) {
  return lines.filter((line) => {
    if (typeof line !== "object" || !line.requiresMemory) return true;
    return state.memories.includes(line.requiresMemory);
  });
}

function getSceneText(scene) {
  let baseText = filterAvailableLines(Array.isArray(scene.text) ? [...scene.text] : []);
  const retroactiveStep = Number(state.counters.metaUnconsciousStep || 0);

  if (scene.progressiveRetroactive && scene.retroactiveReveals?.length >= 2) {
    const [firstReveal, secondReveal] = scene.retroactiveReveals;
    const firstBoundary = Math.min(firstReveal.at, baseText.length);
    const secondBoundary = Math.min(secondReveal.at, baseText.length);
    const firstText = filterAvailableLines(firstReveal.text || []);
    const secondText = filterAvailableLines(secondReveal.text || []);

    if (retroactiveStep <= 0) {
      baseText = baseText.slice(0, firstBoundary);
    } else if (retroactiveStep === 1) {
      baseText = [
        ...baseText.slice(0, firstBoundary),
        ...firstText,
        ...baseText.slice(firstBoundary, secondBoundary),
      ];
    } else {
      baseText = [
        ...baseText.slice(0, firstBoundary),
        ...firstText,
        ...baseText.slice(firstBoundary, secondBoundary),
        ...secondText,
        ...baseText.slice(secondBoundary),
      ];
    }
  } else {
    for (const reveal of scene.retroactiveReveals || []) {
      if (retroactiveStep < reveal.step) continue;
      const insertAt = Math.min(reveal.at, baseText.length);
      baseText.splice(insertAt, 0, ...filterAvailableLines(reveal.text || []));
    }
  }

  if (scene.badEnding) {
    baseText.unshift({
      kind: "badEndTitle",
      code: scene.badEnding.code,
      name: scene.badEnding.name,
      summary: scene.badEnding.summary,
    });
  }
  if (!isRewrittenChapter() || !Array.isArray(scene.revealAfterRewrite) || !scene.revealAfterRewrite.length) {
    return baseText;
  }

  const insertAt = Math.min(
    typeof scene.revealAt === "number" ? scene.revealAt : baseText.length,
    baseText.length,
  );
  baseText.splice(insertAt, 0, ...filterAvailableLines(scene.revealAfterRewrite));
  return baseText;
}

function applySceneRewards(scene) {
  addUnique(state.memories, scene.memories || []);
  addUnique(state.inscriptions, scene.inscriptions || []);
  addUnique(state.gallery, scene.gallery || []);
  addUnique(state.visited, [state.scene]);
}

function renderCurrentText() {
  storyText.replaceChildren();
  const finished = activeTextIndex >= activeLines.length;
  const line = finished && activeLines.length
    ? activeLines[activeLines.length - 1]
    : activeLines[activeTextIndex];

  if (line !== undefined) {
    const paragraph = document.createElement("p");
    if (typeof line === "string") {
      paragraph.textContent = line;
    } else if (line.kind === "badEndTitle") {
      paragraph.className = "bad-end-title";

      const label = document.createElement("span");
      label.className = "bad-end-label";
      label.textContent = `BAD END ${line.code}`;

      const name = document.createElement("strong");
      name.textContent = line.name;

      const summary = document.createElement("small");
      summary.textContent = line.summary;

      paragraph.append(label, name, summary);
    } else if (line.kind === "rewrite") {
      paragraph.className = "revision-block";

      if (line.speaker) {
        const speaker = document.createElement("span");
        speaker.className = "speaker-tag";
        speaker.textContent = line.speaker;
        paragraph.append(speaker);
      }

      const deleted = document.createElement("del");
      deleted.textContent = line.original;

      const replacement = document.createElement("ins");
      replacement.textContent = line.replacement;

      paragraph.append(deleted, replacement);
    } else {
      if (line.className) paragraph.className = line.className;
      if (line.speaker) {
        const speaker = document.createElement("span");
        speaker.className = "speaker-tag";
        speaker.textContent = line.speaker;
        paragraph.append(speaker);
      }
      const content = document.createElement("span");
      content.textContent = line.text;
      paragraph.append(content);
    }

    if (typeof line === "object" && line.secretAction === "trueEnding") {
      paragraph.classList.add("secret-trigger");
      paragraph.title = "有些东西仍然留在手心";
      paragraph.tabIndex = 0;
      paragraph.addEventListener("click", triggerTrueEnding);
      paragraph.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          triggerTrueEnding();
        }
      });
    }

    storyText.append(paragraph);
  }

  continueButton.hidden = finished;
  choices.hidden = !finished;
  if (finished && activeScene) renderChoices(activeScene);
}

function renderChoices(scene) {
  choices.replaceChildren();
  const phaseOptions =
    !isRewrittenChapter() && scene.phaseChoices
      ? scene.phaseChoices[String(Number(state.counters.metaUnconsciousStep || 0))]
      : null;
  const options = phaseOptions ||
    (isRewrittenChapter() && Array.isArray(scene.choicesAfterRewrite)
    ? scene.choicesAfterRewrite
    : Array.isArray(scene.choicesBeforeRewrite)
      ? scene.choicesBeforeRewrite
      : scene.choices || []);

  for (const option of options) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = isRewrittenChapter() && option.labelAfterRewrite
      ? option.labelAfterRewrite
      : option.label;
    if (option.primary) button.classList.add("primary");
    button.addEventListener("click", () => choose(option));
    choices.append(button);
  }
}

function prepareText(scene) {
  activeScene = scene;
  activeLines = getSceneText(scene);
  activeTextIndex = 0;
  choices.hidden = true;
  renderCurrentText();
}

function renderSidebar() {
  protagonistName.textContent = state.protagonistName;

  memoryList.replaceChildren();
  const memories = state.memories.length ? state.memories : ["尚未稳定"];
  for (const memory of memories) {
    const item = document.createElement("li");
    item.textContent = memory;
    memoryList.append(item);
  }

  inscriptionList.replaceChildren();
  const inscriptions = state.inscriptions.length
    ? state.inscriptions
    : ["木纹沉默，没有新的字。"];
  for (const inscription of inscriptions) {
    const block = document.createElement("div");
    block.className = "inscription";
    block.textContent = inscription;
    inscriptionList.append(block);
  }
}

function soundscapeForScene(sceneId) {
  if (sceneId.startsWith("mirror")) return "mirror";
  if (sceneId.startsWith("storm") || sceneId === "act_1" || sceneId === "tower_again") {
    return "storm";
  }
  if (sceneId.startsWith("garden") || sceneId.startsWith("coffin") || sceneId === "return_sleep") {
    return "void";
  }
  if (
    sceneId.startsWith("toilet") ||
    sceneId === "bad_accept" ||
    sceneId === "bad_escape"
  ) {
    return "pain";
  }
  if (
    sceneId.startsWith("empty") ||
    sceneId.startsWith("bathroom") ||
    sceneId.startsWith("laundry") ||
    sceneId.startsWith("photo")
  ) {
    return "emptyHome";
  }
  if (sceneId.startsWith("family") || sceneId.startsWith("breakfast") || sceneId === "three_days") {
    return "home";
  }
  if (sceneId === "interlude_actors") return "audience";
  if (sceneId === "bad_twilight") return "twilight";
  if (
    sceneId.startsWith("blood") ||
    sceneId.startsWith("accusation") ||
    sceneId === "refusal" ||
    sceneId === "clash"
  ) {
    return "horror";
  }
  if (sceneId.startsWith("rain")) return "rain";
  if (sceneId.startsWith("meta") || sceneId.endsWith("ending")) return "meta";
  return "mirror";
}

function updateAudioButton() {
  audioButton.textContent = state.audioEnabled ? "声音：开" : "声音：关";
  audioButton.title = currentSoundscape
    ? `当前音景：${soundscapeCatalog[currentSoundscape.kind]}`
    : "开启场景环境音";
  audioButton.setAttribute("aria-pressed", String(state.audioEnabled));
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
    const delay = minDelay + Math.random() * (maxDelay - minDelay);
    timeoutId = window.setTimeout(() => {
      if (!active) return;
      callback();
      schedule();
    }, delay);
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
      try {
        if (typeof node.stop === "function") node.stop();
      } catch {
        // Already stopped.
      }
      try {
        node.disconnect();
      } catch {
        // Already disconnected.
      }
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

  const nextSoundscape = {
    kind,
    output,
    nodes: [],
    cleanups: [],
  };
  currentSoundscape = nextSoundscape;
  buildSoundscape(kind, nextSoundscape);
  output.gain.exponentialRampToValueAtTime(1, context.currentTime + 0.35);
  updateAudioButton();
}

function updateAudioForScene(sceneId) {
  if (!state.audioEnabled) {
    stopSoundscape();
    updateAudioButton();
    return;
  }
  startSoundscape(soundscapeForScene(sceneId));
}

function toggleAudio() {
  state.audioEnabled = !state.audioEnabled;
  if (state.audioEnabled) {
    updateAudioForScene(state.scene);
  } else {
    stopSoundscape();
  }
  updateAudioButton();
  saveState();
}

function renderScene() {
  const scene = scenes[state.scene] || scenes.mirror_1;
  const stage = document.querySelector(".stage");
  applySceneRewards(scene);

  sceneArt.src = scene.art;
  sceneArt.alt = scene.title;
  sceneKicker.textContent = scene.kicker;
  sceneTitle.textContent = scene.title;
  updateGameTitle();
  echoText.textContent = scene.echo || "";

  prepareText(scene);
  renderSidebar();
  volumeControl.value = String(state.volume);
  setMasterVolume();
  updateAudioButton();
  updateAudioForScene(state.scene);
  saveState();

  stage.classList.toggle("is-bad-ending", Boolean(scene.badEnding));
  stage.classList.remove("flash");
  requestAnimationFrame(() => {
    stage.classList.add("flash");
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateGameTitle() {
  const visibleTitle = state.titleName || "无中归来者";
  if (gameTitle) gameTitle.textContent = visibleTitle;
  document.title = visibleTitle;
}

function transitionToScene(nextScene) {
  if (transitionLock) return;
  transitionLock = true;
  transitionOverlay.classList.remove("is-active");
  void transitionOverlay.offsetWidth;
  transitionOverlay.classList.add("is-active");
  state.scene = nextScene;
  saveState();

  window.setTimeout(() => {
    renderScene();
  }, 240);

  window.setTimeout(() => {
    transitionOverlay.classList.remove("is-active");
    transitionLock = false;
  }, 1080);
}

function choose(option) {
  if (transitionLock) return;
  if (option.action === "openGallery") {
    openGallery();
    return;
  }
  if (option.action === "resetRun") {
    resetRun();
    return;
  }
  if (option.action === "rewriteChapter") {
    state.counters.metaRewritten = true;
    state.counters.rewriteSeen = true;
    saveState();
    transitionToScene("meta_1");
    return;
  }
  if (option.action === "unconsciousStep") {
    const step = Number(option.step);
    if (Number.isFinite(step) && step > Number(state.counters.metaUnconsciousStep || 0)) {
      state.counters.metaUnconsciousStep = step;
      saveState();
    }
    transitionToScene(option.target || "meta_1");
    return;
  }
  if (option.action === "trueEnding") {
    triggerTrueEnding();
    return;
  }
  if (option.action === "renameProtagonist") {
    renameProtagonist();
    return;
  }
  if (!option.to || !scenes[option.to]) return;
  if (option.increment) {
    const current = Number(state.counters[option.increment] || 0) + 1;
    state.counters[option.increment] = current;
    if (option.threshold && current >= option.threshold && option.thresholdTarget) {
      transitionToScene(option.thresholdTarget);
      return;
    }
  }
  transitionToScene(option.to);
}

function triggerTrueEnding() {
  if (
    transitionLock ||
    state.scene !== "meta_compensation" ||
    !isRewrittenChapter() ||
    !state.memories.includes("手心里的雨水")
  ) {
    return;
  }

  state.counters.trueEnding = true;
  state.titleName = "无垠之萍";
  saveState();
  transitionToScene("ending");
}

function renameProtagonist() {
  const value = window.prompt("为周防重新命名。留空则保留当前名字。", state.protagonistName);
  if (value === null) return;
  const nextName = value.trim();
  if (!nextName) return;
  state.protagonistName = nextName;
  saveState();
  updateGameTitle();
  renderSidebar();
}

function openGallery() {
  galleryGrid.replaceChildren();
  if (!state.gallery.length) {
    const empty = document.createElement("p");
    empty.className = "empty-gallery";
    empty.textContent = "画廊里暂时只有空白。";
    galleryGrid.append(empty);
  } else {
    for (const id of state.gallery) {
      const item = galleryCatalog[id];
      if (!item) continue;
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
    }
  }
  if (!galleryDialog.open) galleryDialog.showModal();
}

function advanceText() {
  if (transitionLock || activeTextIndex >= activeLines.length) return;
  activeTextIndex += 1;
  renderCurrentText();
}

function resetRun() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage restrictions and reset the in-memory run.
  }
  transitionOverlay.classList.remove("is-active");
  transitionLock = false;
  state = structuredClone(defaultState);
  renderScene();
}

function restart() {
  const confirmed = window.confirm("要清除当前进度，从镜像阶段重新开始吗？");
  if (!confirmed) return;
  resetRun();
}

galleryButton.addEventListener("click", openGallery);
closeGalleryButton.addEventListener("click", () => galleryDialog.close());
restartButton.addEventListener("click", restart);
audioButton.addEventListener("click", toggleAudio);
continueButton.addEventListener("click", advanceText);
storyText.addEventListener("click", advanceText);
volumeControl.addEventListener("input", (event) => {
  state.volume = Number(event.target.value);
  state.volumeProfileVersion = VOLUME_PROFILE_VERSION;
  setMasterVolume();
  saveState();
});

renderScene();
