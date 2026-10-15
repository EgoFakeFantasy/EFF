# EFF · Minecraft 1.20.1 特供版

运行层研究场 0.3，适配 **Minecraft Java 1.20.1 / Fabric Loader 0.19.5 / Fabric API 0.92.12+1.20.1 / Java 17**。这是独立的 Fabric 构建，与 [26.3 版本](../mc-version/README.md) 共用原文脚本和本地 AI 桥接。

保留原文之旅、血色庭院争夺练习、运行层研究场、本地双代理、真实实体/控制/事件/磁盘检查点/实例迁移/出口判定，以及真实游戏帧撕裂与重新构成演出。原文、说话者和终章过去介入节点仍由同一套脚本决定。

## 安装

1. 在启动器中建立 **1.20.1 + Fabric** 独立实例，安装 Fabric Loader **0.19.5**；游戏运行 Java 使用 **17**。
2. 将本版 `eff-minecraft-runtime-1.20.1-0.3.0+mc1.20.1.jar` 与 **Fabric API 0.92.12+1.20.1** 放进该实例的 `mods`。
3. 安装 **Node.js 22+**；若启动器找不到 Node，增加 JVM 参数 `-Deff.node=C:/实际路径/node.exe`。
4. 进入单人世界，按 **R**。研究场入口为 `/eff research`，原文之旅为 `/eff play`，独立练习为 `/eff duel`。
5. 本地 AI 使用已有的 **Ollama** 服务 `127.0.0.1:11434`。在“本地模型”页检测并启用已安装的模型；不会自动下载权重。推荐先用本机已有的 `qwen3.5:4b`。

若在旧存档中安装后提示维度缺失，退出并重新打开世界。随时 `/eff leave` 返回，恢复原位置、游戏模式、飞行能力和 EFF 冻结状态。

**只在同一实例安装一个 EFF 版本。** 此包是 Fabric 模组；Forge / NeoForge 整合包和第三方秒杀模组的二进制兼容尚未提供。已有的 Fabric 扩展需要针对本版 MC API 编译。

## 玩法

- **R** 展开界面，**V** 靠近调查或继续对白，**P** 暂停 / 继续；编辑器获得焦点时保留正常键盘输入。
- “运行层”页可以直接编写组合程序。服务端实际执行并重新观测结果；本地外来者读取已发生的变化后组合反制。面向的建议需要玩家确认执行。
- 分号与换行分隔语句；每次最多 4096 字符、16 条语句、3 次修改。`inspect`、`assert` 不计修改次数。

例如先观察和切断持续来源：

```text
inspect entity.avatar;
inspect checkpoint.origin;
disable control.tether;
disable event.possess;
disable authority.recovery;
```

外来者反制后，以界面真实回执为准，再处理投影和结局：

```text
erase entity.avatar;
refuse ending.owned;
```

也能用原生 MC 实体移除行为触发反制，例如有命令权限时 `/kill @e[tag=eff_research_avatar]`。只移除实体不会自动删除控制回调或磁盘恢复来源。

全部语法、条件触发器、检查点与 Fabric 扩展 API 见 [运行层说明](./RESEARCH.md)。研究场与原文之旅独立，研究场权限不会提前开放原文终章的过去介入。

## 1.20.1 专用实现

| 部分 | 本版适配 |
| --- | --- |
| 世界冻结 | 1.20.1 没有新版 tick manager。服务端 Mixin 实际暂停世界模拟，保留区块加载、实体生命周期与追踪网络；EFF 服务端和模型回执继续处理。解除控制和退出后恢复模拟。 |
| 网络 | 1.20.1 原生自定义通道；长度校验后复制消息，再切换服务器/客户端线程。客户端不提供权威战况。 |
| 角色与传送 | 旧版跨维度传送 API、能力 NBT 保存恢复、旧版方块/装备常量。 |
| 画面演出 | 复制 MC 实际 OpenGL framebuffer，用整数条带撕裂，再显示真实提交状态与新场地。减少动效仍可启用。 |
| 维度 | 1.20.1 数据包格式；场地独立于主世界。 |
| 执行器 | Java 17 字节码；受限程序、真实实体观测、原子检查点与本地 AI 均保留。 |

普通模组入口中的 `rebuild instance.world` 仍在同一 MC JVM 内重建实例。0.3 的 [托管入口](./MULTI_JVM.md) 另提供三个独立 JVM 的实际替换，包括 MC 整体重启。其他模组自己的服务器事件仍可能运行，EFF 冻结不承诺冻结任意第三方代码。Sodium、Iris 和大型整合包须分别验证。

## 开发与检查

需要 JDK 17、Node.js 22+。在仓库完整目录中构建，桥接和剧情源码由相邻目录打包，不必安装 npm 依赖：

```powershell
cd mc-1.20.1
.\start-dev.ps1
# 独立试玩世界
.\start-dev.ps1 -Research
# 真实本地模型、实体与跨层干预验证，自动退出
.\start-dev.ps1 -VerifyResearch
# 原文入口、旧练习、演出、超时与返回恢复验证
.\start-dev.ps1 -Verify
```

Gradle Wrapper 固定 8.14.3 并校验 SHA-256；Fabric Loom 固定 1.10.5。构建产物在 `build/libs/`，安装使用 remap 后的不带 `-dev` / `-sources` 的 JAR。开发世界、模型证据与日志仅留本地。

原生验收使用独立测试世界，检查真实实体删除与本地模型反制、冻结和恢复、检查点与实例替换、结局出口、退出恢复。原生验收命令会读取本轮结果；缺少新回执或验收失败时返回失败，不把游戏正常退出当作通过。代码编译及脚本检查不能代替实际 MC 通关或整合包兼容验收。

原著说明见 [仓库 README](../README.md)，依赖许可见 [THIRD_PARTY.md](./THIRD_PARTY.md)。

## 0.3 多 JVM 托管研究场

新增判定 JVM、执行 JVM、MC JVM 的独立替换和进程外战果提交。通过 `start-managed.ps1` 启动；普通模组入口仍为单 JVM 研究场。启动、指令、恢复边界和验收方法见 [MULTI_JVM.md](MULTI_JVM.md)。
