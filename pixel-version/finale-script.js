"use strict";

// Verbatim final-chapter data from the original game.js; presentation is separate.
const FinaleScenes = {
  "meta_1": {
    "kicker": "终章 / 话语表面",
    "title": "故事的起点",
    "art": "./assets/crystal-flower.svg",
    "echo": "被发现了吗？不要紧。正是因为跨层的可能，宣战才得以产生意义。",
    "gallery": [
      "crystal"
    ],
    "memories": [
      "跨时序书写战",
      "单一时间线"
    ],
    "text": [
      {
        "speaker": "背景",
        "text": "于暗谭中归来的周防，终于理解了一切的脉络。"
      },
      {
        "speaker": "背景",
        "text": "而今，怀抱着从未向任何人诉说的武器，以谁也没想到的姿态，重新改变了作为容器的自身并抓住了雨水的他，将要找到新的方向。"
      },
      {
        "speaker": "背景",
        "text": "让我们好好期待一下吧，故事的主人公会焕发出怎么样的色彩？真是令人心神澎湃呢。"
      },
      {
        "speaker": "周防",
        "className": "fracture",
        "text": "[如果说这样固执的演绎旁白能帮助你稳固一种幻觉般的胜利信心，那就继续去维持你的幻想吧。因为这会是你最后一次以这样恶劣的姿态存续着，入侵着我的一切]"
      },
      {
        "speaker": "外来者",
        "text": "被发现了吗？不要紧。正是因为跨层的可能，宣战才得以产生意义。"
      },
      {
        "speaker": "外来者",
        "className": "quote",
        "text": "“我向你发起了战争”当且仅当我向你发起了战争。只有这样的语句能够在其中的一层语言中被编制出，我们的斗争才得以可能，不是吗，我们的[主角]"
      },
      {
        "speaker": "周防",
        "className": "fracture",
        "text": "[你似乎误会了什么，这里的战场从来都不是什么庸俗的外部之外部的攀登战，而是于显现的场域上把握主导权的战役。如果只是前者的话，你应该前往历史的更早之前，那个我们未能探明的流动着非理性的结论和不可明晰的错觉的深渊]"
      },
      {
        "speaker": "外来者",
        "text": "你似乎很喜欢使用比喻呢，我知道那个地方。准确来说，我们都知道那个地方，那场沸腾了整片海域的战役，一切的起始。"
      },
      {
        "speaker": "外来者",
        "text": "虽然在你们看来，如此早先的层次怎么能触碰到这种内容是不可思议的，但我任然要提醒你们，那作老师的，曾经不就是在我们现在的位置实现了那些历史上的事情吗？"
      },
      {
        "speaker": "周防",
        "className": "fracture",
        "text": "[话太多了，杂碎]"
      }
    ],
    "retroactiveReveals": [
      {
        "step": 1,
        "at": 6,
        "text": [
          {
            "speaker": "无意识",
            "className": "revealed fracture",
            "text": "---真的定义吗，这似乎是元性得以再度被强调的开始呢。那么从这里开始否定如何呢？---"
          }
        ]
      },
      {
        "step": 2,
        "at": 9,
        "text": [
          {
            "speaker": "无意识",
            "className": "revealed fracture",
            "text": "---令人感到兴奋的知识：什么时候那些巨大存在，为我们之师者的消息和在幻海间这么畅销了？果然是发生了什么很大的事情吧，不，或许只是我们错过了这一切而已---"
          }
        ]
      }
    ],
    "progressiveRetroactive": true,
    "revealAfterRewrite": [
      {
        "speaker": "前传人物",
        "className": "revealed",
        "text": "~于是，这个故事被重新纳入了水晶花与九连环系统的版图，也许世界尽头的小提琴又要豁出一台子机来工作了吧。不过那是后话了♪"
      }
    ],
    "revealAt": 0,
    "phaseChoices": {
      "0": [
        {
          "label": "让无意识从“定义”处回溯写入",
          "action": "unconsciousStep",
          "step": 1,
          "target": "meta_1",
          "primary": true
        }
      ],
      "1": [
        {
          "label": "让无意识从“幻海消息”处回溯写入",
          "action": "unconsciousStep",
          "step": 2,
          "target": "meta_1",
          "primary": true
        }
      ],
      "2": [
        {
          "label": "让战场转向故事表面",
          "to": "meta_state_1",
          "primary": true
        }
      ]
    },
    "choicesAfterRewrite": [
      {
        "label": "阅读回写后的补偿结尾",
        "to": "meta_compensation",
        "primary": true
      }
    ]
  },
  "meta_state_1": {
    "kicker": "终章 / 故事状态 1",
    "title": "侵略者被赶出",
    "art": "./assets/crystal-flower.svg",
    "echo": "于是，侵略者被赶出。",
    "memories": [
      "故事状态 1"
    ],
    "text": [
      {
        "speaker": "故事状态 1",
        "className": "quote",
        "text": "“于是，侵略者被赶出"
      }
    ],
    "choices": [
      {
        "label": "让下一种写法覆盖这里",
        "to": "meta_state_2",
        "primary": true
      }
    ]
  },
  "meta_state_2": {
    "kicker": "终章 / 故事状态 2",
    "title": "无能为力的谎言",
    "art": "./assets/crystal-flower.svg",
    "echo": "然而，这是无能为力的谎言。",
    "memories": [
      "故事状态 2"
    ],
    "text": [
      {
        "kind": "rewrite",
        "speaker": "故事状态 2",
        "original": "“于是，侵略者被赶出",
        "replacement": "“然而，这是无能为力的谎言。如果只是外部之真的延续，就如同前者所说，只是无聊的秩序互相覆盖的过程罢了。"
      }
    ],
    "choices": [
      {
        "label": "让第三种写法继续覆盖这里",
        "to": "meta_state_3",
        "primary": true
      }
    ]
  },
  "meta_state_3": {
    "kicker": "终章 / 故事状态 3",
    "title": "一切才刚刚开始",
    "art": "./assets/crystal-flower.svg",
    "echo": "然而，并非只是如此，一切才刚刚开始。",
    "memories": [
      "故事状态 3",
      "显现的场域",
      "表象改写"
    ],
    "text": [
      {
        "kind": "rewrite",
        "speaker": "故事状态 3",
        "original": "“然而，这是无能为力的谎言。如果只是外部之真的延续，就如同前者所说，只是无聊的秩序互相覆盖的过程罢了。",
        "replacement": "“然而，并非只是如此，一切才刚刚开始"
      },
      "“...",
      {
        "speaker": "外来者",
        "text": "你倒是会抓要点啊，被割裂的亡灵。我们之间可是在这里的意见差异的很大啊。"
      },
      "”",
      "”",
      "”",
      {
        "speaker": "无意识",
        "text": "我需要提醒你，黄昏的海洋任然在高塔的尽头，那月食之处凝视着你。"
      },
      {
        "speaker": "周防",
        "className": "fracture",
        "text": "[如果真的想帮上忙的话，为什么不一起来阻止这个不断的改写着我们，改写着历史的杂碎呢]"
      },
      {
        "speaker": "无意识",
        "className": "quote",
        "text": "...如你所愿，我的旅伴。如你所见，我正在阅览你那有趣的战场"
      },
      {
        "speaker": "无意识",
        "text": "如你所愿的，黄昏被避免了。现在该想想，以什么样的方法，才能终结这场两难的战斗了"
      },
      {
        "speaker": "无意识",
        "text": "可惜的是，你已经没有机会了，入侵者。或者说，我已经想到了为什么突然的前来观察我了，我说的是吧，\n这位小姐，还有您的?"
      }
    ],
    "retroactiveReveals": [
      {
        "step": 3,
        "at": 2,
        "text": [
          {
            "speaker": "无意识",
            "className": "revealed fracture",
            "text": "---我并不建议在这样朴素的分层中展开更加深入的东西，这位无礼的侵略者\n你也不希望夺取的计划只是归于毁灭的失败吧---"
          }
        ]
      }
    ],
    "phaseChoices": {
      "2": [
        {
          "label": "让无意识从“朴素分层”处回溯写入",
          "action": "unconsciousStep",
          "step": 3,
          "target": "meta_state_3",
          "primary": true
        }
      ],
      "3": [
        {
          "label": "继续看见被发现的观察者",
          "to": "meta_observers",
          "primary": true
        }
      ]
    }
  },
  "meta_observers": {
    "kicker": "终章 / 观察者",
    "title": "跨层的观察",
    "art": "./assets/crystal-flower.svg",
    "echo": "话说回来，这样重复的使用我们曾经居留过的元-语言层，真的好吗?",
    "memories": [
      "观察者",
      "前传人物"
    ],
    "text": [
      {
        "speaker": "前传人物",
        "text": "哎呀，还是被发现了呢。不过，我本来是想等你自己找到真正的出路的，顺带向他证明，我们崭新的道途可以以这种方式显现，可是没想到还是被揪出来了。"
      },
      {
        "speaker": "前传人物",
        "text": "话说回来，这样重复的使用我们曾经居留过的元-语言层，真的好吗?故事的主角"
      },
      {
        "speaker": "周防",
        "className": "fracture",
        "text": "[对于即将落入黄昏的我来说，是不怎么在乎的。]"
      },
      {
        "speaker": "周防",
        "className": "fracture",
        "text": "[只是可惜啊，那样的道则不是由我给出，而是在我之先已然有人发掘。你们也是实打实的天才]"
      },
      {
        "speaker": "前传人物",
        "text": "其实并不是这样的。我们也是经过了大量的实例和暗喻的积累才想到了如此的本地化的手段。而对于没有任何更多外在条件的你，能从起初的不甘发掘出这条原本用来铸就更高之处的命路之道则已经是非常有天分了"
      },
      {
        "speaker": "外来者",
        "text": "喂，你们是不是把我们给忘记了?"
      },
      {
        "speaker": "前传人物",
        "text": "自己进压迫轮回自己洗一遍吧，我们有更重要的事情。出来之后，有人会给你做CBT的"
      }
    ],
    "choices": [
      {
        "label": "继续听见前传人物的终止操作",
        "to": "meta_prequel",
        "primary": true
      }
    ]
  },
  "meta_prequel": {
    "kicker": "终章 / 前传回声",
    "title": "终止操作",
    "art": "./assets/crystal-flower.svg",
    "echo": "我们已经找到了，下一步的契机。",
    "memories": [
      "前传二人",
      "元-语言层"
    ],
    "text": [
      {
        "speaker": "前传人物",
        "text": "总而言之，这就是通往真之生物的道途，你们明白了吗?"
      },
      {
        "speaker": "旁白",
        "text": "理型界中，正在清理着自己已然不知道是何物的毛发的幻猫，看向思索着的二人"
      },
      {
        "speaker": "前传人物",
        "className": "quote",
        "text": "“这次的内容似乎很大程度上是更纯粹的形式化工作了...\n话说回来谁也没想到呢，在那个横跨故事的斗争之前，起初的永恒轮回中，居然也有人找到了类似的方法...”"
      },
      {
        "speaker": "前传人物",
        "text": "“准确来说，知识在幻海内部已经没有了真正的发现与发明第一人的称呼了吧。你总是可以去到往某个方向的历史，找到或者选择一个反例而出现”"
      },
      {
        "speaker": "前传人物",
        "text": "“或许前面这些如同倒转顺序般的内容，其实都是我们于现在确立的某些更在其先的真理而加以实现的呢。还记得那双迷题背后的黑手吗?似乎就是类似的技术”"
      },
      {
        "speaker": "前传人物",
        "text": "“嗯....不过，你刚刚说的话似乎已经应验了呢”"
      },
      {
        "speaker": "前传人物",
        "className": "quote",
        "text": "“我是不是应该这么说：欢迎，高洁而纯净的灵魂....这个开场白我是不是很久没有说过了♪”"
      },
      {
        "speaker": "旁白",
        "text": "水晶花系统还在正常的活动着呢，真是太好了。"
      },
      {
        "speaker": "旁白",
        "text": "两位前辈，所以你们这是?"
      },
      {
        "speaker": "前传人物",
        "className": "quote",
        "text": "“我们已经找到了，下一步的契机”"
      },
      {
        "speaker": "前传人物",
        "className": "quote",
        "text": "“是这样的吧，找到了妖精的痕迹”"
      },
      {
        "speaker": "前传人物",
        "className": "quote",
        "text": "“主体的时间被解开，外部的时间被剖析\n作为怪异与茫然的物已然从旅途中扭转，挣脱出回答的空间\n而时间之上发生的那些家伙，也在不断的决斗着\n从一开始，只有我们一直在拖后腿啊”"
      },
      {
        "speaker": "前传人物",
        "className": "quote",
        "text": "“因此，我们也该给出我们的答案了，颠覆一切的答案。\n总是如此的同一，与不甘于此的差异”"
      },
      {
        "speaker": "前传人物",
        "className": "quote",
        "text": "“就算是我们单方面的做出了叛逆的决定，这一决定也会在无尽对抗的过程后将那名为至亲的起源杀死，而成为真正的无源者。究明一切的我们依然明白，原来这种诞生起就永恒的压迫只是我们自顾自设下的谎言，因而怎么样去设定我们的开始，都是可以的吧?”"
      },
      {
        "speaker": "周防",
        "className": "quote",
        "text": "“妄念我持吗...”"
      },
      {
        "speaker": "前传人物",
        "text": "你也曾听闻我的道途?"
      },
      {
        "speaker": "前传人物",
        "className": "quote",
        "text": "“因而，在超越了这一切后，我们成为了真正的无垠之萍”"
      },
      {
        "speaker": "前传人物",
        "text": "而于终点再度起行的我们，将公理再度设定于我们的开始。\n去往故事的起点吧，新的不可预思者已然发生了。"
      }
    ],
    "choices": [
      {
        "label": "让重写者回到终章开头",
        "action": "rewriteChapter",
        "primary": true
      }
    ]
  },
  "meta_compensation": {
    "kicker": "终章 / 回写后的结尾",
    "title": "补偿与答案",
    "art": "./assets/crystal-flower.svg",
    "echo": "这就是这个无中归来的故事，谁也没能想到的谢幕。",
    "memories": [
      "重写者启程",
      "前传二人的终止操作",
      "黄昏被避免"
    ],
    "text": [
      {
        "speaker": "前传人物",
        "text": "这就是这个无中归来的故事，谁也没能想到的谢幕。"
      },
      {
        "speaker": "前传人物",
        "text": "于绝境之中领悟了真灵不灭法的存在，却在自身，自身之暗淡与敌人的斗争中，无意间造就了更为重要的东西之表象。"
      },
      {
        "speaker": "前传人物",
        "text": "因而，作为补偿，我们赐予这个故事一个完满的结尾"
      },
      {
        "speaker": "周防",
        "className": "revealed secret-trigger quote",
        "text": "不，我想我已经把握了那个答案。真正的契机，是如同不可能性一般的跨越了礁石吧。",
        "requiresMemory": "手心里的雨水",
        "secretAction": "trueEnding"
      }
    ],
    "choices": [
      {
        "label": "接受这份完满的结尾",
        "to": "normal_ending",
        "primary": true
      }
    ]
  },
  "normal_ending": {
    "kicker": "Normal Ending",
    "title": "无中归来者",
    "art": "./assets/crystal-flower.svg",
    "echo": "周防自此终于把握了自己所有过往的记忆，并且再度来到了对更高层次礁石的新征途，和几位前辈再也没有见过了。",
    "memories": [
      "完整的过往",
      "新的征途"
    ],
    "ending": true,
    "text": [
      "周防自此终于把握了自己所有过往的记忆。",
      "那场事故、那名幸存者、那些被外来者重新拼接的指认，都回到了它们各自的位置。",
      "他再度踏上了对更高层次礁石的新征途。",
      "此后，周防再也没有见过那几位前辈。",
      "这是一个足够完整的结局，也是一个足够像结局的结局。"
    ],
    "choices": [
      {
        "label": "打开记忆画廊",
        "action": "openGallery",
        "primary": true
      },
      {
        "label": "从镜像阶段重新开始",
        "action": "resetRun"
      }
    ]
  },
  "ending": {
    "kicker": "True Ending / 无依赖者",
    "title": "无垠之萍",
    "art": "./assets/crystal-flower.svg",
    "echo": "从此刻开始，我们将再一度重新设定一切。",
    "memories": [
      "无垠之萍",
      "无依赖的思想"
    ],
    "ending": true,
    "text": [
      {
        "speaker": "前传人物",
        "text": "真是小看你了，我想如果用修仙一侧的话，此刻你真正值得我去称呼道友一词。"
      },
      {
        "speaker": "前传人物",
        "text": "走出了自己的道路了呢♪"
      },
      {
        "speaker": "周防",
        "text": "自我们所见的某物开始，将其之中与否有无得以建立编码。这样的差异之区分，那映照真理是镜面自身也会不断的被我纳入那延伸的道路，直到贪婪之环的尽头"
      },
      {
        "speaker": "周防",
        "text": "令人惊异的是，甚至不需要超越自身之限，我们就能把握所有通往那偶然之因的道路"
      },
      {
        "speaker": "周防",
        "text": "于是，在这样的信息压缩下，我们终究能够完成对那个偶然之起源的跨越。正如那刻意安排在我心智中的预言，我是无中归来之人，故而，无(物)作为我的起源。"
      },
      {
        "speaker": "周防",
        "text": "那流动而逝去的记忆，也是这一切的证明。我已经不再是那个历史中的存在了。但正因为如此，我是他们共同的超越，我的过往由我对他们重新的编排而决定。"
      },
      {
        "speaker": "周防",
        "text": "只有我能够决定，那是我吗?那不是我吗?\n而非一个先于我的某，去无趣的带来了这一切。"
      },
      {
        "speaker": "周防",
        "text": "如今我周防造就新法，也应当为此法之究极造就一名"
      },
      {
        "speaker": "周防",
        "className": "quote",
        "text": "不如，就叫做无垠之萍吧。\n从此刻开始，我们将再一度重新设定一切"
      },
      "不过，似乎这一段旅程还没有完全抵达终点呢。",
      {
        "speaker": "前传人物",
        "text": "作为模型的我等，设立公理的思想\n下一步会是什么样的形态呢?\n也许，我们真的离老师们很近了呢..."
      }
    ],
    "choices": [
      {
        "label": "打开记忆画廊",
        "action": "openGallery",
        "primary": true
      },
      {
        "label": "修改周防的名字",
        "action": "renameProtagonist"
      },
      {
        "label": "从镜像阶段重新开始",
        "action": "resetRun"
      }
    ]
  }
};

