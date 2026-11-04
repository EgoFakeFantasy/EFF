# 0.6.1 权限边界验收

> 本报告绑定指南整合前的 `637a20d` 基线；后续独立控制、投影分离与实验 MIC 改动见 [AGENT_ADAPTATION.md](AGENT_ADAPTATION.md)，不得将这里的旧回执当作新路径已验收。

日期：2026-11-04。Windows 11 / Java 17.0.20.1+1 / Forge 47.4.20。实现及攻击面分析见 [边界审查](./RUNTIME_BOUNDARY_AUDIT.md)。

## 构建与自动检查

Forge 完整 `build exportManagedLaunch` 通过；随后初始化调度与专用验收修正经 Forge / Fabric `assemble` 和发行检查，正式重混淆 JAR 检查通过。Forge 日志中合计 **165 个 Node 测试通过**，另有 **17 项 ResearchProgram Java 检查通过**。未运行远程 CI。

包括真实两个 Java 工作器的控制器回归、G1 污染与初值重置拒绝、合法检查点 / watch / 撤销 / 终局保留；锁存故障取消绕过、无投影初始化与过早提交拒绝；观察宿主的三种角色写入拒绝；启动参数 / 环境准入与只读 JAR 扫描；原有外层锁文件、战果与祖先链单调保护。

隔离测试使用无第三方代码的受管 Node 宿主和真实两个 Java 工作器。首次控制器退出后，旧 Job 清空；第二控制器在启动宿主或工作 JVM 前读取旧部署并隔离，可信停止消息由外层处理。最终仅出现两个控制器、一次工作器启动，不再重播实验宿主。等待外层消费停止消息期间保留管道，避免过早退出导致的重启循环。这个测试不是永爱实战。

## 真实 Minecraft

| 故障 | 实际 MC PID | 执行引擎 | 恢复后终局 |
| --- | --- | --- | --- |
| dying | 28268 → 10528 | G0 → G1 | won / recovery=false |
| player | 41672 → 38896 | G0 → G1 | won / recovery=false |

两例均使用无第三方模组的独立受保护 Forge 开发启动世界。经过有效投影初始化之后，分别注入“生命值20、未移除但deathTime=2”与“先撤销外来者恢复，再把玩家生命值设为0”。验证真实后继的字节码摘要及父身份、同一权威实例保留、旧 MC / 两工作 JVM 消失、整棵 Job 活动数为0，之后合法删除和胜利出口不会误触发第三次恢复。

恢复会话中的自动反制与外部观察写入先等待初始化回执；专用验收保留有界启动诊断，避免初始化尚未完成就写入。早期未完成的用例记录保留，最终结果取上述两个明确通过的独立目录。

本轮没有在官方生产启动配置中再次运行 0.6.1 JAR；正式 JAR 的证据是构建与发行检查。Fabric 仅构建，没有游戏内验收。模型推理和权重训练均未验证。

## 原样模组与能力扫描

FLS 1.8.1、1.7weakened 和 pig2 2.8.3 仅进行只读分析，均被默认静态能力策略拒绝。没有执行第三方 JAR / DLL / 脚本，没有对抗胜利结论。输入身份和静态限制在审查报告列明；未发现标记不等于安全。

公开样本的完整静态证据位于本机 `output/eff-init-defense-20261104/research/`，保留下载摘要、ZIP / javap 与扫描结果。`bootstrap-audit-baseline.json` 保存修复前可复现结果及源摘要，未覆盖。

## 原生补丁与部署范围

C# 额外 schema / 单次实验补丁候选被系统安全软件阻止，已撤回；当前 C# 源与 `85389a0` 完全一致，并重新构建通过本轮外层测试。新增校验在受封存 Node / Java 内，不宣称新增 C# 第三语义实现。未设置排除项、恢复被阻止的候选或关闭安全软件。

Forge JAR SHA256：`22b0b7a0c8f057baf5bc9cd296a8e40e76b21bc6c497b56d3360d604a9d97a6f`。当前支持外层 SHA256：`7d4b7ec4fd25e638abe548042b2c45ca93a65ad8e6f8faef892eef7740771286`。本机 `legacy-guardian-baseline.json` 另保存旧已验收二进制与候选被阻止摘要。

此更新需要新封存目录；旧部署不会自动重封存。只读实验仍不具备 OS 沙箱和可信外部玩家输入；同 JVM 身份伪造、同账户 / 管理员及原生内存攻击的剩余边界见审查报告。普通游戏原文和网页入口没有改动。

完整本机回执：`verification-summary.json`、`forge-final-verified.log`、`fabric-final-build.log`、`native-dying-verified/entity-native-result.json`、`native-player-diagnostic/entity-native-result.json`。本轮未推送 GitHub。
