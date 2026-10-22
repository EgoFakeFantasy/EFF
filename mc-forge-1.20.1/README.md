# EFF · Minecraft 1.20.1 Forge 版

运行层研究场 **0.5.2**，适配 **Minecraft Java 1.20.1 / Forge 47.4.20 及后续 47.x / Java 17**。这是独立的 Forge 模组，不依赖 Fabric API；与 [Fabric 1.20.1 版](../mc-1.20.1/README.md) 共用剧情、研究场、桥接、递代引擎和外层守护实现。

保留原文之旅、庭院练习、运行层研究场、本地双代理，以及真实的实体、控制、事件、磁盘检查点、实例迁移和出口判定。时间冻结和画面撕裂继续作用于实际 MC 世界和游戏帧。Forge 入口改用 Forge 事件与带方向校验的 `SimpleChannel`，原文内容与终章介入时点由同一套脚本决定。

## 普通安装

1. 在启动器中新建 **Minecraft 1.20.1 + Forge 47.4.20 或更新的 47.x** 独立实例，使用 **64 位 Java 17**。本版不适用于其他 Minecraft 版本。
2. 将 `build/libs/eff-minecraft-forge-1.20.1-0.5.2+mc1.20.1-forge.jar` 放入该实例的 `mods`。安装经过 `reobfJar` 处理的正式 JAR，不安装 `-sources.jar`；同一实例只安装一个 EFF 模组。
3. 安装 **Node.js 22+**。启动器找不到 Node 时，添加 JVM 参数 `-Deff.node=C:/实际路径/node.exe`。
4. 进入单人世界，按 **R** 打开 EFF；也可使用 `/eff play`、`/eff duel`、`/eff research`。用 `/eff leave` 返回原位置并恢复原有模式和能力。
5. 本地 AI 使用玩家已有的 Ollama 服务 `127.0.0.1:11434`。在“本地模型”页检测、选择并启用已安装的模型；不自动下载权重。关闭模型时使用规则策略。

普通安装提供单个 MC JVM 内的研究场。要实际替换判定、执行和 MC 宿主 JVM，并恢复控制器，使用下面的独立受保护入口。

Forge 版与 Fabric / NeoForge 的二进制包不能混装。兼容范围声明为 Forge `[47.4.20,48)`、MC `1.20.1`；第三方整合包、渲染器和秒杀模组仍需分别验证。EFF 的冻结会暂停 MC 世界模拟，不能保证任意其他模组的自有回调都停止。

## 操作与攻防

- **R** 打开界面，**V** 调查或推进对白，界面内 **P** 暂停；程序编辑器获得焦点时保留文本输入。
- “运行层”页提交受限组合程序。服务端实际执行后重新观测，外来者根据实际结果反制；面向的建议须经玩家确认。
- 身体、牵引控制、附身事件和恢复来源是不同对象。移除身体后若保留持续来源，外来者仍可能恢复投影。

例如先观察，再撤销持续来源：

```text
inspect entity.avatar;
inspect checkpoint.origin;
disable control.tether;
disable event.possess;
disable authority.recovery;
```

根据实际回执继续处理身体与强制结局：

```text
erase entity.avatar;
refuse ending.owned;
```

原生 MC 行为也参与观测，例如有命令权限时 `/kill @e[tag=eff_research_avatar]`。这只删除实体，不自动撤销事件或磁盘恢复来源。完整语法、预算、检查点与扩展接口见 [研究场说明](../mc-1.20.1/RESEARCH.md)；该文档中的 Fabric 注册接口只适用于 Fabric 扩展，Forge 扩展应在 Forge 服务端事件中调用同一 `EffResearchAPI`。

## 多 JVM 与受保护启动

递代引擎、判定 / 执行 / 宿主替换、Windows 代码封存及控制器整树恢复共用现有实现：

- [多 JVM 架构与语法](../mc-1.20.1/MULTI_JVM.md)
- [Windows 保护、威胁边界与验收](../mc-1.20.1/PROTECTED_RUNTIME.md)
- [有限代际引擎生成与交接](../mc-1.20.1/RECURSIVE_ENGINES.md)

在本目录中执行本版脚本；需要 Windows、JDK 17 与 Node.js 22+：

```powershell
# 首次封存，必须指定全新的目录
.\start-protected.ps1 -Prepare -Jdk C:\路径\jdk-17 -Directory C:\路径\EFF-Forge-Play
# 启动已封存的独立实例
.\start-protected.ps1 -Directory C:\路径\EFF-Forge-Play
# 完整原生验收：默认要求实际本地模型反制
.\start-protected.ps1 -Verify -Jdk C:\路径\jdk-17 -Directory C:\路径\EFF-Forge-QA
# 明确允许规则策略，结果会区分模型推理和规则回退
.\start-protected.ps1 -Verify -AllowRuleFallback -Jdk C:\路径\jdk-17 -Directory C:\路径\EFF-Forge-QA-Rule
```

封存仅在新部署时建立信任基线；开始游玩不会自动重封存或重置战果。增加或更新模组必须准备新实例，不可把可写的 Gradle 缓存当作保护后的执行来源。完整性保护不提供对同账户或管理员的绝对防御。

低内存受保护入口保留 MC 768 MiB 堆、工作 JVM 各 64 MiB 堆、控制器及剧情桥各 96 MiB V8 堆预算，使用平坦的专用引导世界。原生内存、Forge 及其他模组和本地模型仍另占内存；这些数值不是整机占用上限。实际战斗在 `eff:phenomenon` 维度中进行。

## 开发与验证

从完整仓库构建；剧情和工作 JVM 源码位于相邻目录，无需 npm 安装：

```powershell
.\gradlew.bat --no-daemon build
.\start-dev.ps1 -Research -Jdk C:\路径\jdk-17
# 指定另一受支持的 Forge 47.x 构建
.\gradlew.bat --no-daemon build "-Pforge_version=47.4.28"
# 检查正式产物中的 Forge 元数据、SRG refmap、剧情包与加载器依赖
node tests/distribution.test.cjs build/libs/eff-minecraft-forge-1.20.1-0.5.2+mc1.20.1-forge.jar
```

正式产物经过 Forge 的重混淆步骤，Mixin refmap 也必须具有 SRG 映射；只在开发环境启动成功不能代替正式安装包验证。构建 / 脚本测试与实际 MC 原生验收分别记录，缺少新的原生回执时不能视为游戏内验证通过。CI 只执行构建与可自动化检查，不声称覆盖真实游戏窗口、模型推理或任意整合包。

原著归属见 [仓库说明](../README.md)，依赖许可见 [THIRD_PARTY.md](THIRD_PARTY.md)。
