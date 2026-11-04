# 0.6.1：指南落实与信任边界

2026-11-04，参考用户提供的《EFF 防御架构与 Agent 适配修改指南》并整合 Claude PR #15。原指南审计基线是 `1426aba`；当前实现同时包含此后的实体故障恢复、严格交接 DTO 与启动能力审查。这里列实施状态，不将目标架构当作安全证明。网页剧情与普通世界存档不在本轮修改范围。

## 运行模式

| 模式 | 指令来源 | OS 边界 | 能声称的范围 |
|---|---|---|---|
| 干净剧情／开发演示 | MC 自报角色，受限 DSL | 默认同用户同完整性 | `EXPERIMENTAL_HOST_ACTOR_DEMO`，不是恶意宿主下的真实玩家认证 |
| `-ExternalControlOnly` | 外部 Node 控制台，MC 只读 | 默认同用户同完整性 | 独立凭据和入口；不抵抗同账户 Medium 恶意代码 |
| 再加 `-LowIntegrityHost` | 同上 | 显式实验 Low token / MIC / Job | 仅在对应 Windows 探针、实际 MC 和启动输入均通过后评估；本机尚未验收 Low |
| 第三方兼容实验 | 外部提交，MC 只读，故障即隔离 | 要求实验 Low 构建 | 仅静态准入与一次性诊断；不在开发机自动执行未知 JAR/DLL |

独立控制台凭据只写入 `authority/control.json`，不传给 MC 或模型。标准接口见 [PROTECTED_RUNTIME.md](PROTECTED_RUNTIME.md)。它是本机可信控制台，不是远程人类身份认证系统。Low MIC 也不是完整 AppContainer、虚拟机或对 T2/T3 的通用保证。Microsoft 文档明确说明默认标签只有 no-write-up；读保护必须依据具体对象标签和探针，不能由“Low”一词自动推出：[Mandatory Integrity Control](https://learn.microsoft.com/en-us/windows/win32/secauthz/mandatory-integrity-control)。

## 分阶段落实

| 指南阶段 | 已实现 | 剩余边界 |
|---|---|---|
| PR-00 基线 | [源码审查](RUNTIME_BOUNDARY_AUDIT.md)、[先前原生回执](RUNTIME_BOUNDARY_VALIDATION.md)、本次整合验收 | 每份证据只绑定其代码与环境 |
| PR-01 来源 | 只读宿主拒绝全部 actor 状态写入；独立签名域控制台；角色固定玩家；commit、session、nonce 检查；保护入口拒绝 goodbye，真实退出也不能停守护 | 游戏内独立输入 UI 尚未实现；演示模式仍明确接纳宿主角色声明 |
| PR-02 权威／观测 | MC 快照保留内核的 `entity.avatar.alive`；新增 `authority.entity.avatar.desiredAlive`、`projection.entity.avatar.observedAlive`、`projection.status` 与派生稳定身份；Controller 和 Java 内核均拒绝 native-observer 权威写入 | 不可信 ACK 不能证明真实画面；仅保护专用研究场 |
| PR-03 故障 | 单调时间、初始化确认、投影故障锁定；加载／暂停门控；普通世界不启用研究场守护 | 恶意宿主在首次报告故障前可虚报健康／暂停；同进程观测不是独立传感器 |
| PR-04 有限恢复 | 已提交 incident、预算、谱系、撤权／终局不回滚；先撤销租约，外层 Job 全树回收，封存基线复查；第三方实验隔离而非重放攻击输入 | 不恢复任意第三方存档、多人会话或 JVM 内存 |
| PR-05 AI | 保留候选指令、模型 JSON、超时／规则回退；发给模型的 runtime 只含 commit、代次、有限故障摘要，不包含租约、启动路径、准入审查路径和字节码 | 未训练模型权重；新路径不等于实际 Ollama 推理已验证 |
| PR-06 准入 | 只读 ZIP／class 常量池审查、能力逐项确认、环境白名单、私有工作目录、完整 JDK／依赖封存、外来模组只读及一次性隔离 | 静态无标记不证明安全；ForeverLove／Pig2 没有执行或交战胜利证据 |
| PR-07 异构内核 | 后置 | 未实现 Rust 权威根、替代 HotSpot 或完整 MC 引擎 |

严格交接允许读取既有合法历史中的 native-observer 记录，但禁止新观测改变权威字段，避免用清空旧存档掩盖迁移问题。账本继续 schema 1，没有缺字段就恢复初值或自动重新封存。旧部署升级必须新建目录。

## 对 Claude PR 的整合修正

- 接受宿主准入防火墙和实验性 MIC 实现；补入投影心跳字段，避免把真实心跳当作入侵。
- 保护模式不接受“goodbye 后真实退出＝人工停机”。该便利性仅保留在非封存演示中。
- 新 MIC 代码经 `EFF_LOW_INTEGRITY_EXPERIMENTAL` 显式编译；标准构建保留原守护语义。`-LowIntegrityHost` 对应 `-PeffLowIntegrityExperiment`，不是运行时自动降级。
- 本机原始新实验二进制 SHA256 为 `3eb4e405512a25eb136ceed78d34489f64d481621a757fb01abc86a255192aa5`，系统拒绝执行并报告病毒／潜在垃圾软件。未绕过、恢复或加入排除项。默认原守护重新构建可执行，不代表实验路径通过。
- CI 将 Low 模式单独构建和执行，额外检查结束／注入／内存读写／复制句柄请求是否被拒绝。标准构建中的 Low 测例明确 skip，不计为通过；真实 MC 的 Low 图形兼容性仍须单独验收。

## 可复现验收

```powershell
./mc-forge-1.20.1/gradlew.bat -p mc-forge-1.20.1 --no-daemon --max-workers=1 build
./mc-1.20.1/gradlew.bat -p mc-1.20.1 --no-daemon --max-workers=1 assemble
# 实验路径只在显式选择的 Windows 验证环境执行
./mc-forge-1.20.1/gradlew.bat -p mc-forge-1.20.1 --no-daemon guardianTest -PeffLowIntegrityExperiment
```

`authority-contract.test.cjs` 使用两个真实 Java 工作进程，覆盖宿主租约冒充外部控制、actor 冒充、合法外部操作、过期 commit、重放、越界代码、观测写入、会话轮换和外部停机。`controller-projection.test.cjs` 检查观测故障导致引擎／宿主替换时，原权威实体仍存在。`guard.test.cjs` 验证外层账本和整树回收。游戏内回执与自动化测试、CI、实验 Low 分开记录。

故障恢复必须分别记录 `STATE_INTACT`、`HOST_RECOVERED`、`PLAYABLE_RESTORED`。本轮受保护研究场里的受控死亡仍按用户先前要求触发有限恢复；普通世界死亡不套用该机制。没有无限重启、系统关键进程标记、驱动安装或自动信任第三方攻击组件。

本轮最新测试对象改为用户提供的 [ForeverLove 2.2 Public](FOREVERLOVE_22_AUDIT.md)，旧版 1.8.1／1.7weakened 结论仅保留作版本对照。

## 本机整合验收结果

- Forge 47.4.20 完整构建通过：181 项 Node TAP 检查通过，0 失败；另有 17 项 Java 语法／语义检查通过。Low 专项 1 项显式跳过，不计入通过数。
- 最新 Forge 装包后真实 MC `player` 与 `dying` 两条受控验收通过：MC 与执行 JVM 均实际换 PID、G0→G1，已撤销权限不恢复，最后合法消除并打开胜利出口，旧 Job 排空。`player` 回执生成后仅新增只读模式 UI／自动提案门控，`dying` 使用包含该门控的最终代码。两者使用命名开发启动，不声称正式发行安装器或 Low 模式实测。
- Fabric 构建与正式 Forge 分发检查单独执行；没有 Fabric 原生游戏回执。
- 本次没有执行 ForeverLove 2.2／旧版／Pig2，也没有本地模型推理或权重训练回执；实际样本只读准入拒绝已验证。
- Windows 虚拟机正在另行准备，来宾动态兼容与交战不包含在上述通过数内。远端 CI 及 PR 合并状态以 GitHub 页面为准。

新增实验句柄探针在原 MIC 实现中发现最小 PROCESS_TERMINATE 访问仍被允许（原来的 Node kill 复合访问检查不足）。修正实验 helper：在降低完整性前以 SE_PRIVILEGE_REMOVED 去除继承令牌中的全部特权，防止管理员启动环境遗留 SeDebugPrivilege；不只禁用可重新启用的特权。默认守护不编译该代码，实验结果须以修正后的独立 CI 为准。

进一步探针确认 Low 子进程确为 IL=4096、特权数=0，但最小终止句柄仍被默认进程标签允许，线程／内存／复制句柄已拒绝。实验修正增加进程对象的 NR/NW/NX 标签：外层自身、启动前的控制器及每个工作 JVM 都单独处理；新工作 JVM 在协议初始化／发布 PID 前向外层请求，外层仅接受当前 Job 内的进程。保持同完整性用户工具与监督者正常终止，不使用全用户拒绝 DACL 或关键进程标记。完整声明仍以对应 CI 结果为准。
