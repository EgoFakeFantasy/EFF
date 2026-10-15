# 运行层研究场 · 0.2

入口：`/eff research`，或 R → 运行层 → 进入运行层研究场。开发启动：`.\start-dev.ps1 -Research`（JDK 25、Node 22+）。

这是独立研究战，使用独立目录，保留正文及练习入口。研究场按真实干预与反制推进，不套用旧练习的 24 秒 / 六轮规则。P 暂停；返回原世界仍可随时使用。

## 操作方式

在“运行层”页的多行编辑器中写程序，点“执行程序”。分号和换行均可分隔语句。提交绑定当前版本；过期程序不执行。每个程序最多 16 条语句、3 次修改，4096 字符。`inspect` / `assert` 不消耗修改次数。

“面向分析”只产生建议，“载入建议”只填入编辑器，需要玩家再次执行。外来者在真实干预发生后自动读取现场和回执，组合反制程序并尝试执行。模型输出带类型的指令对象，再编译为同一种干预语言；可组合操作和条件触发器。执行失败时最多再基于新回执重试一次。两侧使用本地模型的独立消息，外来者不接收未提交草稿和面向私有目标。界面标记 local-model / rule-template 与原因。

可以直接使用原生 MC 行为移除投影，例如在本单人世界使用：

```mcfunction
/kill @e[tag=eff_research_avatar]
```

观测器检查真实实体是否被移除，随后发起 AI 反制。不会先替玩家写入“已夺回身体”。投影也可受到原生伤害；原生扩展可以直接调用实体移除 API。

命令行也接受程序：

```mcfunction
/eff code inspect entity.avatar; inspect checkpoint.origin
```

## 可编写的操作

| 语句 | 执行对象与条件 |
| --- | --- |
| `inspect HANDLE` | 读取当前对象；结果进入记录 |
| `assert FIELD == true` | 检查真实字段，失败停止后续语句；也支持 false |
| `erase entity.avatar` | 对真实 ArmorStand 调用 discard；不会同时解除控制或删除检查点 |
| `disable control.tether` | 关闭服务器实际使用的身体牵引执行器 |
| `disable event.possess` | 从当前执行实例移除占据回调 |
| `disable authority.recovery` | 牵引与占据回调已切断后，撤销外来者恢复授权；旧检查点不能恢复这个外层授权 |
| `save checkpoint.NAME` | 将当前实际状态原子写入磁盘检查点 |
| `restore checkpoint.NAME` | 校验磁盘数据与所有权，再实际恢复实体、控制与事件；外来者还需恢复授权 |
| `seal checkpoint.NAME` | 控制与占据回调已切断后，删除恢复文件和注册项 |
| `rebuild instance.world` | 从己方合法检查点创建新的执行实例与原生场地；清除旧控制回调与实体 |
| `watch NAME when FIELD == false -> COMMAND` | 安装一次条件触发器；程序提交或原生观测后，现场满足条件时执行命令。支持 true，最多 4 个，禁止嵌套及触发器内重建 |
| `unwatch NAME` | 中断已显露的触发器 |
| `refuse ending.owned` | 玩家提交：身体、处理器、投影与有效外来者恢复来源全部处理后，才实际打开出口 |
| `emit event.possess` | 外来者调用仍注册且拥有实体来源的回调，尝试重新绑定身体 |
| `spawn entity.avatar` | 从己方合法实体检查点恢复投影 |
| `commit ending.owned` | 外来者至少完成 3 次有效反制后，且实体、控制、处理器、恢复来源仍有效，才能提交占据结局 |

常用字段：

```text
entity.avatar.alive
control.tether.active
event.possess.active
authority.recovery.active
checkpoint.origin.active
ending.owned.refused
world.frozen
world.exitOpen
```

检查点可自行命名，例如 `checkpoint.player`。`checkpoint.origin` 是初始外来者恢复来源。最多 6 个检查点、最多 4 次实例替换；已撤销的外层恢复授权跨实例保留。

## 从表象追查到来源

先观察实体清除之后发生什么：投影可能从仍有效的检查点回来，UUID 会变，但你没有因此自动失败。读取 AI 的程序、来源、实际结果与对象状态，判断它依赖的是控制回调还是恢复授权。

针对持续执行来源的组合：

```text
assert control.tether.active == true;
disable control.tether;
disable event.possess;
disable authority.recovery;
```

三个修改依次执行。先切断实际执行和回调，再撤销恢复授权。下一次反制若尝试使用旧检查点，将被实际执行器拒绝。

随后研究自己的状态接续：

```text
save checkpoint.player;
seal checkpoint.origin;
rebuild instance.world;
```

建立新的执行实例与 MC 场地，被撤销的外层授权不会回来。

条件触发器示例：

```text
watch shield when entity.avatar.alive == false -> disable event.possess;
erase entity.avatar;
```

触发器最多触发一次，执行单独记入回执。它不保证胜利；有效恢复来源仍在时，外来者仍可能恢复相关状态。

处理完有效来源之后：

```text
erase entity.avatar;
refuse ending.owned;
```

只有真实出口方块打开才接受结局拒绝，关闭界面即可走出出口。运行前提失败时，前面已成功的效果保留并逐项记录；语法、长度、预算或版本检查失败则在执行前拒绝整段程序。

## 原生扩展入口

针对本版 Fabric / MC 编写扩展，在**服务器线程**调用：

```java
JsonObject observation = EffResearchAPI.observe(player);
EffResearchAPI.submit(player,
    "disable control.tether; disable event.possess",
    Jsons.i(observation, "revision"));
```

也可从 observation 的 `avatarUUID` 获取本维度实际实体并调用原生 API。回执由服务端重新观测，客户端不能提交成功快照。扩展须在本版 API 上编译；不声明直接兼容其他 MC 版本或 Forge 秒杀模组。原生 Java 模组与受限干预语言是不同执行入口。

## 运行层的实际含义

- 实体层：真实原生实体与 UUID。
- 控制层：服务端位置约束与 tick 冻结。
- 事件层：注册、移除、触发的占据回调及条件触发器。
- 检查点层：研究目录中的原子磁盘文件、所有者与恢复授权。
- 实例层：新的控制/回调执行对象、独立实例 ID 和 MC 场地；从检查点接续。
- 结局层：验证持续来源与真实出口方块。

每次进入研究场建立一场新对战；旧日志与检查点留在原研究目录供复查，不自动恢复上一场技术战。正文存档独立保存。

Minecraft JVM 持续运行；本版不动态编译整套 Java 引擎。模型组合受限程序，实际效果由对应执行层产生。正文终章的过去回写仍由原文授权，不由研究场权限提前开放。

## 检查入口

```powershell
.\gradlew.bat build
.\gradlew.bat runClient -PeffResearchtest -PeffRunDir=C:/自己的独立测试目录
```

build 包含桥接与代理检查，以及干预语言的组合、断言、预算、越界检查。原生验收显式运行独立世界，使用真实本地模型、实体删除、扩展 SDK、检查点、实例迁移和方块出口。结果在测试目录的 `eff-research-qa/result.json`。建议、执行回执与画面是不同证据。
