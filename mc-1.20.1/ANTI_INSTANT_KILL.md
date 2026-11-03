# 0.6 实体故障与反秒杀守护

本组件用于 Minecraft 1.20.1 的 Fabric / Forge 研究场。它检测受管玩家和 EFF 投影，不扫描并复活世界中的任意生物。普通模组安装只提供实体观测；实际的进程外恢复必须从 `start-protected.ps1` 创建并启动全新的封存部署。更新源码不会更新旧的封存实例。

## 从实体故障到运行层恢复

1. `ProjectionProbe` 在服务端线程检查生命值、`isAlive` / `isDeadOrDying` / `deathTime`、移除标记、UUID 和数字 ID 登记、玩家列表身份、有限坐标。投影超出战场 256 格也视为异常。投影现在注册为 `eff:projection`，具有 EFF 实体类，不再用纯原版 ArmorStand 代替其他模组的目标。
2. `RuntimeLink` 在带当前租约认证的心跳中传送不可变观测缓存；缓存序号独立于心跳序号。只有新缓存能刷新观测年龄。旧实例、旧 revision 和重放观测不能直接触发当前战局的恢复。
3. Node `ProjectionGuard` 默认确认异常 1200 ms。死亡界面暂停游戏不会取消已确认的死亡。未暂停的研究场超过 6000 ms 没有匹配的实体样本，会触发观测停滞；普通暂停不按此超时处理。
4. 控制器首先把事故写入外层账本，再生成并验证执行引擎的后继字节码。受保护模式让控制器退出，由现有 WindowsGuard 关闭整个 Job Object、等到活动进程为零后重新启动控制器和 MC。判定、执行、MC、剧情桥及同 Job 内的自重启子 JVM 一起清理；恢复读取已提交的战局和引擎祖先链。
5. 每个封存部署累计第三次实体事故就停止自动恢复（最多两次迁移）。此计数跨控制器重启保留；C# 外层拒绝计数回退、跳代、删除或改写同次事故。不要通过删除账本“修复”正在遭受的持续攻击，应先排查模组组合，再另建实验部署。

已撤销外来者恢复权限时，外部投影死亡按身体丢失提交，不恢复外来者。玩家死亡的保护独立于外来者恢复权限。玩家主动 `erase entity.avatar`、退出研究场、正常暂停、已提交的结局都不会被当成应复活的外来者。合法删除若实际被第三方取消而物理实体仍在，守护会迁移宿主来落实已经提交的删除；它保留 `avatar=false` 和终局。

只有未保护的开发托管模式仍直接替换宿主；它不具备 Windows Job 的整树回收保证。所有模式都只生成 JVM 上的引擎类，并未生成一种新的 HotSpot 实现。拥有同进程原生代码权限的模组仍可能伪造观测或关闭探针；认证心跳防外部重放，不证明被攻陷的 MC 说真话。此组件不提供对 Windows 同账户、管理员或任意原生代码的绝对隔离。

## 实测与对抗回归

`check` 包含纯策略回归、真实工作 JVM 的控制器集成测试、外层账本预算拒绝测试及子孙进程回收测试。原生游戏测试是另一个步骤，不由 CI 的普通构建代替。

从仓库根目录先导出 Forge 专用启动配置（JDK 17、Node 22+）：

```powershell
.\mc-forge-1.20.1\gradlew.bat -p mc-forge-1.20.1 exportManagedLaunch guardianBuild "-PeffManagedDir=C:/EFF-Lab/export"
node mc-1.20.1/runtime/guard/entity-native-test.cjs C:/EFF-Lab/export/private-launch.json C:/EFF-Lab/death-01 mc-forge-1.20.1/build/guard/eff-guard.exe dying
```

最后一项可选 `dying`、`zero-health`、`nan`、`removed` 或 `player`，每次需要新的目录。测试只改变自己建立的专用世界和 EFF 目标，验证实际进程身份、后继字节码、实例保留、旧进程消失和合法终局不会再重启。`player` 案例先合法撤销外来者恢复权限，再将玩家生命值设为零。结果写入该目录的 `entity-native-result.json`；其中明确标记是否验证了模型推理。

## Pig2 对手

本轮参考公开仓库 [pig2mod/jar 的固定提交](https://github.com/pig2mod/jar/tree/7c1017672a663d3216e174b88efd7dfafbb8c042) 中的 1.20.1 / 2.8.3 JAR：

```text
SHA256 40af7684524b479426ced039a28594ddb7efb4e872937bd9db051f771d9b5dcc
```

静态反汇编可追到 `Pig2.tickLevel3 -> MyHelper.removeTheEnemiesInTheServerLevel`，包含禁止更新、移到极远位置、直接写移除状态及删除多个实体登记表的路径。其目标筛选排除玩家，并要求其他模组的实体类及 40 格范围。单测因此覆盖“仍活着但登记丢失”“仍在但已死亡”“被移出战场”，而不是仅监听一次伤害事件。该 JAR 还有原生库和自附加路径；静态可达不等于本机实际执行了攻击。

实际对手实验必须显式提供原样 JAR 与摘要；默认发行包不附带或启用它：

```powershell
node mc-1.20.1/runtime/guard/pig2-native-test.cjs C:/EFF-Lab/export/private-launch.json C:/EFF-Lab/pig2-01 mc-forge-1.20.1/build/guard/eff-guard.exe C:/Downloads/pig2mod-1.20.1-2.8.3.jar 40af7684524b479426ced039a28594ddb7efb4e872937bd9db051f771d9b5dcc
```

此入口显式开启 `researchLab`，封存模组摘要、成员列表和独立临时目录；不关闭安全软件，不放宽 attach 或改写对手。实验从注册表创建实际 `pig2mod:pig2`，放在 EFF 实体旁，并在专用实验中暂停原有外来者规划器，解除 EFF 世界冻结让对手能够 tick。记录加载、生成、故障、后继恢复及停止的证据；加载失败、未出招、崩溃和对抗恢复是不同结果。

这轮“对抗训练”指原样对手实测及把其攻击特征加入可重复防御回归，不包含本地语言模型的权重训练，不把规则策略、静态分析或加载失败算作击败对手。本机本轮动态结果见同目录的 `ANTI_INSTANT_KILL_VALIDATION.md`。
