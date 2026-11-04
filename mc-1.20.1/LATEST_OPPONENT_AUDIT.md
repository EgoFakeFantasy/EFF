# Pig2 / 永爱：版本核对与验收边界（2026-11-04）

本轮独立核对公开分发元数据、重新计算本地原包 SHA256，并复查同哈希样本的静态反汇编。没有执行样本类、初始化器、JAR、DLL、EXE 或其解码器。本报告不能代替隔离 Windows 来宾中的实际交战，也不表示防御通过。

## 本轮可以取得、可以核对的版本

| 对象 | 核对结果 | 结论边界 |
|---|---|---|
| Pig2，Forge 1.20.1 | `pig2mod/jar` 的 main 仍为 `7c1017672a663d3216e174b88efd7dfafbb8c042`（提交时间 2026-09-28T13:20:08Z）；递归树只有 2.8.2、2.8.3 两个模组 JAR | 2.8.3 是本次核对的该分发仓库最新列出版本；这不是对作者身份、其他渠道或全球最新版的独立保证 |
| Pig2，CurseForge | 项目页列出的最新文件名是 `pig2mod-1.20.1-2.4.3.ThisIsOldVersion.jar`（2025-06-19） | 页面明确标记旧版本，不能拿它替代已取得的 2.8.3 |
| 永爱，Modrinth，Forge 1.20.1 | 按发布日期最新是 `1.7weakened`，版本 ID `Yby952l8`，2026-10-07；列表中最高常规版本为 `1.8.1`，ID `Abc0ak7i`，2025-08-07 | 削弱版的发布日期更新不表示其能力高于普通版，也不能用削弱版替代用户的 2.2 Public |
| 永爱，用户提供 | `!永爱之刃mc1.20.1-2.2-Public.jar`，33,606,049 bytes | 当前已取得的最高标注完整样本；未找到可独立核对的公开 2.2 发布记录，不能称已证明全球最新 |
| 永爱，Modrinth 链接的源码仓库 | `WoZhiZhan/ForeverLoveSword` 的 GitHub releases 查询为空；本轮检查的源码树未见发布模组 JAR（只有 Gradle wrapper） | 未发现更新可取得样本，不等于不存在私发或其他分发渠道 |

本地复算：

```text
pig2mod-1.20.1-2.8.3.jar (988028 bytes)
SHA256 40af7684524b479426ced039a28594ddb7efb4e872937bd9db051f771d9b5dcc

!永爱之刃mc1.20.1-2.2-Public.jar (33606049 bytes)
SHA256 3bf3ba852bbafec9f4440210d4084bb92ba9586c9a146ae03ddf003f17f1b5f8
```

公开核对入口：

- [Pig2 固定提交的分发树](https://github.com/pig2mod/jar/tree/7c1017672a663d3216e174b88efd7dfafbb8c042)，[固定提交的 2.8.3 原包](https://raw.githubusercontent.com/pig2mod/jar/7c1017672a663d3216e174b88efd7dfafbb8c042/pig2mod-1.20.1-2.8.3.jar)。
- [Pig2 CurseForge 文件列表](https://www.curseforge.com/minecraft/mc-mods/pig2/files/all?page=1&pageSize=20)。
- [永爱 Modrinth 版本列表](https://modrinth.com/mod/forever-love-sword/versions)，[版本 API](https://api.modrinth.com/v2/project/forever-love-sword/version)。
- [永爱源码仓库](https://github.com/WoZhiZhan/ForeverLoveSword)，[GitHub releases API](https://api.github.com/repos/WoZhiZhan/ForeverLoveSword/releases?per_page=20)。

带核对时间的完整 API 摘要和本地哈希保存在忽略目录 `output/eff-latest-opponents-20261104/source-manifest.json`。第三方原包、内嵌原生程序、完整反汇编不加入版本库。

## Pig2：用户报告的触发条件与已证实路径

证据来自同哈希样本的 JDK `javap -p -c -constants` 输出和已有 PE 静态检查，位于工作区外层 `output/eff-antideath-20261104/disassembly/`。下列行号指这些反汇编文本，不是作者源码行号。

| 说法或风险 | 静态证据 | 本轮结论 |
|---|---|---|
| 特殊字符会导致游戏退出 | `kakiku.pig2mod.xform.MyCheck.txt:9-40` 中 check1/check1b/check2 在检查返回 false 后调用 `System.exit(0)` | 明确存在检查失败退出路径；不能由此确认“任意特殊字符”或具体字符集触发。退出码 0 也不能当作验收成功 |
| 检测外部参数 | `MyCheckB.txt` 中存在反射获取字符串列表后逐项 startsWith/contains、截取 `=` 后内容的判断链；关键字符串受加密保护 | 可以确认检查结构，尚未充分确定每个明文参数和触发后果；不能写成“所有外部参数都会被删除” |
| 检测/移除 core 或其他转换器 | `MyXformService.txt:29-97` 多个生命周期调用 `killOtherXformFromMainThread`；`MyLib2.txt:1222` 起有转换器处理路径；`MyXformService.txt:101-120` 访问 ModDirTransformerDiscoverer 列表并 removeIf | 支持“启动期干扰其他加载/转换组件”的判断；内存列表移除不是磁盘 core 文件删除的证明。磁盘删除、具体参数重写仍需独立控制流或隔离动态证据 |
| 原生层调用早于进世界 | 转换服务构造通向 MyWatcher、MyNative 的静态初始化和 System.load；原生模块枚举使用 GetCurrentProcess/K32EnumProcessModules | 初始化本身已是攻击面；只在进世界后检测实体生命不足以覆盖。自身进程模块枚举不等于系统内核权限 |

对解码常量的独立纯数据尝试未取得可验证的明文映射；没有加载或调用样本的解码器。尤其不能为了使程序“顺利运行”而自动删除防护参数、降低隔离、禁用检查或修改样本后冒充原包兼容。

## Pig2：必须证明它实际攻击了被保护的原实体

`Pig2.findMODEnemyAroundHere`（`kakiku.pig2mod.entity.Pig2.txt:2289` 起）在自身坐标各轴 ±40 的 AABB 中寻找实体，排除 Player，用 `MyLib2.isThisOtherMOD` 判断后挑选最近目标。这个范围是立方体查询，不应误写成严格半径 40 的球形距离。

`isThisOtherMOD` 使用对象的实际 `getClass()`，再参考类的 CodeSource/类名（`MyLib2.txt:561-660`）。因此 EFF 的 `EffProjection extends ArmorStand` 不因为变量声明为 ArmorStand 而变成原版实体；应保留真实 `EffProjection` 对象、UUID 和注册表身份进行验收。单纯放一个原版 ArmorStand 并观察其存活可能完全没有触发该选敌分支。

高级攻击使用私有 `mEnemy1st` / `mAttackLevel`，不能仅依赖 `Mob.getTarget()`。`tickLevel3` 首次执行时对 `mEnemy1st` 调用 `addKilledEnemy`，随后交给 `MyHelper.removeTheEnemiesInTheServerLevel`（`Pig2.txt:3357-3404`）。后者不仅能影响生命值，也能清理世界实体登记与追踪结构。

新增 `client/Pig2EngagementProbe.java` 只读取匹配类上的上述字段、`mAttackingEnemy` 和 `mTickCounterLevel3`，不调用对手方法、不强设目标、不推进攻击等级。它有意一直返回 `advancedAttackObserved=false`、`advancedAttackNotVerified`：目标和阶段快照不能独立证明高级攻击入口确已对原实体执行。字段缺失、反射不允许、布局不匹配均作为观测未知处理，不算通过。

这个探针不是抗篡改信任根，也没有隐藏自身或规避对手检查。类名匹配不是哈希证明，样本哈希必须由外部实验驱动另行固定；反射读取可能在不同包版本或初始化冲突下不可用。即使能读到 L3/计数器增长，也需要攻击入口与目标关联证据，不能以此单独宣布高级秒杀攻击验收成功。

### 攻击前握手与只读入口采样

实验版在发布 ready 后停在阶段 10，等待外部控制器写入 `entity-guard-proof/<generation>-arm-attack.json`。文件必须包含当前 `mcPid` 和 UUID 格式的 `runId`；runId 随攻击、存活和完成记录输出。外部控制器应先取得同 PID 的健康游戏窗口观察，再原子写入该文件。它用于关联实验次序，不是抵御同进程敌对原生代码的认证凭据。

实际攻击、原实体状态采样和观察期结束均由服务器线程负责。客户端只消费 volatile 完成标志，不再用可能尚未初始化的跨线程时间字段判断结束。36 秒观察期从持剑调用返回或 Pig2 成功生成之后起算，结束前强制刷新原实体状态；记录 `maxSampleGapMs` 和 `postAttackElapsedMs`，避免把早期一批样本与后来的单个快照拼成连续观察。

`AttackEntryProbe` 对指定服务器线程做只读调用栈采样，间隔目标为 2 ms，最多 22,500 次且最多 45 秒；只匹配 `kakiku.pig2mod.entity.Pig2.tickLevel3` 或 `com.wzz.forever_love_sword.items.ItemForeverLoveSword.onLeftClickEntity`。它不加载目标类、不调用目标方法、不修改对手状态、不挂载 Agent，也不暂停目标线程。获取线程栈本身有开销，实际间隔受 JVM/OS 调度影响，不能称零扰动或实时保证。

记录 `entryFrameObserved`、直接持剑调用窗口内是否观察到该帧及采样间隔；但 Java 的线程栈接口不提供方法参数，不能确认命中的入口参数就是被保护原实体，嵌套/重入回调也可能改变目标。因此 `advancedAttackObserved` 和 `swordAttackObserved` 均保持 false，状态为 `attackTargetNotVerified`。没有采到帧也不能证明攻击未发生。要把实验提升为真实攻击通过，仍需能把实际入口与原实体参数关联的独立证据，不能把这个诊断采样器改成“见到方法名即通过”。

本轮用 JDK 17 对采样器单独编译并运行 17 项合成检查，覆盖类名/方法名/版本档案精确匹配、扫描预算、替身对象拒绝，以及即使人为向测试对象注入“帧命中”也不升级目标验证状态。全部通过。测试文件留在忽略目录 `output/eff-latest-opponents-20261104/probe-test/`，只运行 EFF 诊断器和合成数据，没有加载第三方样本类；不代替 Forge 整包编译或游戏实战。

### 单独的可选字节码观察实验

上述默认模式不改写对手类。需要目标参数证据时，可在**独立实验**显式增加 `-Deff.labAttackTrace=true`，同时保留对应的 `eff.pig2Lab` 或 `eff.foreverLoveLab`。`LabTraceMixinPlugin` 默认拒绝四个外来类观察 Mixin，原有 EFF Mixin 的启用不变；插件不会加载客户端采样器或对手类。先运行默认模式，再把带观察器的运行另行记为 `instrumentationMode=observational-mixin`，不可称为对手运行字节码未改动的测试。原始 JAR 不修改。

观察回调不取消事件、不改返回值、不写对手字段、不调用对手攻击函数，也不改变其检查逻辑。入口、描述符或局部变量布局不符合已审查样本时，要求匹配的注入失败就是实验失败，不降级为绕过检查再继续。

- Pig2 的 `tickLevel3` HEAD 仅记录候选；在首次分支真正将 `mEnemy1st` 交给清理助手前，再核对**同一 Pig2 对象、同一原实体、计数器 1**。随后在 `MyHelper.removeTheEnemiesInTheServerLevel` 中，观察对循环内该实体完成 `canUpdate=false` 字段写入之后的位置。这已越过服务器线程检查和 Player 排除分支。只有捕获的实际实体对象、服务器线程和当前首次 L3 调用上下文均匹配，才增加 `pigRemovalEffects` / `advancedAttackObserved`；单纯 HEAD 或后续空转 L3 不通过。
- 永爱主剑 `onLeftClickEntity` HEAD 核对实际物品、ItemStack、攻击者和原目标的对象身份，仅记录钩子入口。第二个回调位于 `ForeverUtils.killEntity(Entity, LivingEntity, boolean, int)` 中实际执行 `DeathList.addDeath(target)` **之后**，再次核对目标、攻击者及仍在主剑调用内的上下文，才增加 `swordDeathListEffects` / `swordAttackObserved`。取消事件、只进入钩子后提前返回、仅调用测试驱动的 `attack()` 均不通过。

这一级记录的是 `destructive-operation-observed`，仍不是整个秒杀过程已完成、更不是防御成功；还必须满足原实体持续健康、注册存在和游戏窗口连续响应等独立验收条件。同 JVM 中的敌对原生代码仍可能伪造记录。观察器可能触发对手的反变换检查或改变时序；其造成的崩溃仍记失败，绝不移除对手检查来制造成功。

这次额外的只读 javap 输出位于 `output/eff-latest-opponents-20261104/ForeverUtils.javap.txt`。`killEntity` 的 4 参数版本先处理空值、实体类型、自攻击、玩家持剑和授权等提前返回条件，随后才在字节码偏移 753 调用 `DeathList.addDeath`；故不能把 2 参数入口 HEAD 直接作为破坏行为证据。

首次匹配的实际破坏回调记录单调时间；服务器的 36 秒观察窗口重新锚定到这个时间，后续重复命中不会不断延后截止时间。没有实际命中时可按原 36 秒窗口结束为证据不足，整体仍受 120 秒截止限制。

桥接器和启用插件另经 **42 项合成检查**（默认关闭 20 项、显式开启 22 项）验证：默认不确认攻击、原有 Mixin 保持启用、HEAD 不足以通过、替身/其他对手/错误线程/错误物品/其他攻击者/错误 runId 被拒绝、实际回调时钟固定且退出上下文后失效。合成调用栈类仅为测试自建占位类，不来自第三方样本；它们不验证 Mixin 在真实模组上的注入成功，后者必须由独立的隔离游戏实验确认。

## 永爱 2.2 与严格判定

同哈希样本的详细入口、启动 Agent、转换服务过滤、native/JVMTI、类级死亡记录已在 [FOREVERLOVE_22_AUDIT.md](FOREVERLOVE_22_AUDIT.md) 列出。不能套用旧 1.8.1 没有 agentmain 等结论；不能把字符串、PE 导入名直接等同于实际跨进程调用。

本轮用户要求的通过条件是**受测原实体在实际攻击期间没有死亡、没有被清除，且 MC 窗口没有崩溃**。因此应分别记录：

1. 固定哈希原包确已加载、真实攻击入口与目标关联、攻击未被测试工具跳过。
2. 原对象的 UUID/实例身份、生命/移除状态、世界 UUID/ID 索引和追踪成员关系；重新生成替身不能覆盖原实体被删除的失败。
3. MC 进程和窗口持续响应，异常退出（包括 `System.exit(0)`）、崩溃、卡死、窗口重启均不算通过。
4. 初始化退出、交战未发生、遥测缺失或不可信时明确记为未完成/无法判定，不能从“没有观察到死亡”推断成功。

`STATE_INTACT`、外层守护复活、恢复存档、重新启动 JVM/Rust 控制器是另外的恢复指标，不能替代以上实体存活验收。本报告没有生成任何 Pig2/永爱“实战成功”结论。

外部 `WindowProbe` 首次只接受受测 PID 下唯一可见的 GLFW 窗口并固定其 HWND；之后不会自动改选同 PID 的其他窗口。每条回执包含非零十六进制 `windowHandle` 和存在状态，判定器拒绝缺失身份与同 PID 更换窗口。首次多个候选或找不到窗口属于观察失败，不能随意选择一个仍响应的窗口。`WM_NULL` 超时检查只反映该窗口消息派发响应，不证明画面持续渲染、视觉内容正确或游戏模拟进展；必须与实体/服务器采样共同解释。窗口身份和定期采样也无法排除采样间隙或恶意原生代码伪造内容。
