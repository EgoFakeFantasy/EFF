# Rust 监督层换代：可行性、工程边界与首个实现

## 验收口径

实体在整个观察期持续存在、没有死亡／移除，且 MC 窗口和游戏线程持续正常工作，才是本轮对抗通过。MC 崩溃、退出后重开、实体从外部状态重新投影，均不是通过。`STATE_INTACT` 只能说明权威状态完整，不能代替实体和窗口存活。

## 当前实际架构

原实现的 Windows 外层守护是 C# `runtime/guard/WindowsGuard.cs`，不是 Rust，也不是 Windows 内核驱动。它监督 Node 控制器与两个 JVM，保存外部 HMAC 日志，封存代码与参数，通过 Windows Job Object 管理进程树。JVM 引擎已有递增世代、父代与规则集标识，换代不是获得更高 OS 权限。

本次新增 `runtime/rust-supervisor`，作为**显式启用的实验性外层**。默认启动器没有迁移到它。它没有重新实现成熟的 C# 状态裁决，也不把未经验证的新 Rust 逻辑直接替换现有信任根。

```text
Windows 内核（访问控制、MIC、Job，属于信任基础）
└─ 稳定 Rust root（固定程序与配置、持久世代预算）
   └─ 该代独占 Job
      └─ 可替换 Rust 监督进程 R[n]
         └─ 原有封存 C# Guardian
            └─ 原有 Job / Node 控制器 / policy JVM / execution JVM / MC
```

稳定 root 先消耗一代预算，再启动同一封存 Rust 映像；将它加入独占 Job 并设置进程标签后，才经私有 stdin 下发固定启动消息。后继进程从已核验配置读取 C# 守护路径、manifest 和固定摘要，不接受旧代提供的新程序、环境变量、权限列表或启动参数。Rust 子层只监督现有 Guardian 的退出与自身心跳，不改写现象状态。当前心跳证明 Rust 监督循环仍工作；它不证明 C# Guardian 内部仍有语义进展。Guardian 挂起而 Rust 循环继续工作的情况，需要后续增加独立的有界进度协议，当前原型尚不覆盖。

这里重置的是 Rust 子监督器的进程内存、句柄和受控运行树，**不在每代重新编译不同的 Rust 机器码**。JVM 层已有受限新类生成与独立验证；Rust 原型采用固定可信映像重新实例化，两者不能混称。让代码每代变化本身不会增加 OS 权限隔离，还会扩大需要验证的代码和工具链。若以后加入 Rust 规则模块生成，仍须由稳定外部验证器约束指令、状态与能力，不能让旧代或模型直接生成拥有宿主权限的程序。

子层死亡、异常退出或 15 秒没有心跳时，root 先终止并确认旧 Job 的活动进程数为零，再创建后继。每代都有父标识和程序／配置摘要派生标识；总计最多 1–4 代，预算在进程重开后仍生效。成功的正常停止不会自动复活。root 自身退出时，Job 的 `KILL_ON_JOB_CLOSE` 让旧树停止。

**这提供有限的控制基础设施恢复，不提供窗口无中断存活。** 因为排空旧树会终止旧 MC，所以发生这种恢复时，对抗验收仍然失败。不能把换 PID 的成功当成挡住秒杀。

## 原生操作与权限

C、Rust、JNI、JNA、JVMTI、Unsafe 只是进入原生执行或修改 JVM 的不同途径。执行 C 代码本身不会自动获得管理员、驱动或 hypervisor 权限。真正决定能否写内存、开进程句柄或删除文件的是进程令牌、完整性级别、对象 ACL、句柄共享方式和更外层的信任边界。

同一 JVM 中拥有任意原生执行能力的模组，可以直接破坏该 JVM 的实体数据或终止自身进程。另一个用户态守护器不能保证它始终保留实体、正常渲染并不崩溃。检测后的恢复也不能撤销已经发生的死亡或窗口退出。严格通过需要在破坏之前限制操作，或者把攻击代码放到独立权限域，通过有限、经过验证的命令接口作用于可信游戏状态；未经修改的任意 Forge 原生模组未必兼容这种隔离。

当前 Rust 实验实现：

- 只允许中等完整性启动，拒绝管理员高完整性和 Low 上下文，避免低权限子进程继承高权限运行环境的语义混淆。
- 所有 Rust 入口在读取配置、映像、Guardian 或 manifest 之前先检查 Medium 令牌，并设置自身 `NR/NW/NX` 标签；状态目录设置可继承的同类标签。这个自标记仍发生在进程创建之后：从 Windows 创建对象到自标记完成之间存在时间窗口，攻击者若已在该窗口取得句柄，后续改标签不会撤销既有句柄。要完整关闭创建窗口，需受信任启动器通过进程创建时的 security descriptor 设置标签和 DACL；当前原型没有完成该创建时保护，不能宣称边界已完全封闭。
- 精确核验配置、Rust 映像、Guardian、Guardian 的 `.exe.config` 和 manifest，并持有拒绝写入／删除共享的文件句柄。`.exe.config` 必须在 CLR 启动之前校验。
- 拒绝 UNC／设备路径、reparse 祖先、未知配置字段及不合法摘要；限制输入大小、心跳行长、子进程数量与 Job 总提交内存。
- 环境从明确的 Windows 路径变量白名单重建，排除 `JAVA_TOOL_OPTIONS`、`NODE_OPTIONS`、profiler、模型文本等可执行上下文。
- `rust-generations.json` 在启动前同步写盘。中途写盘损坏会停止启动，不能回退到新初值。它不是对抗同等完整性用户或管理员回滚磁盘的硬件单调计数器。预算读取和每次写入之间会释放文件句柄；`root.lock` 排斥合作式双 root，Medium 对 Low 的标签阻止低权限写入，但不能防御同 Medium 对手在这些间隙篡改／换路径。同 Medium 和管理员对手明确不在这个原型的保护范围。

## 为什么不能承诺“超过 Windows 内核”

用户态 Rust 程序依赖 Windows 内核执行这些保护。被攻破的宿主内核能够破坏进程、改变页面和句柄权限或关闭 VM，因此用户态重写、换 PID、递归生成都不能凌驾于它。

把信任根放在 guest 外的受支持 hypervisor／另一台机器上，可以把**guest 内核**排除出该信任根的权限域。它仍依赖宿主、hypervisor、启动链、固件或远端机器。Windows 的 VBS/VTL 也不是任意 Rust 应用可以自行申请的“更高权限模式”。本项目不会通过 unsigned driver、关闭系统防护、关键进程标记或无限互相复活实现所谓不可终止。

参考：[Windows MIC](https://learn.microsoft.com/en-us/windows/win32/secauthz/mandatory-integrity-control)、[Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)、[Windows VBS](https://learn.microsoft.com/en-us/windows-hardware/design/device-experiences/oem-vbs)。

## 启用和建设阶段

1. **已实现实验原型**：Rust 固定 root、可替换监督子层、持久预算、封存核验、Job 排空和心跳。使用仓库 `Cargo.lock` 执行 `cargo test --locked` 与 `cargo build --locked`。
2. **仍需整合验收**：在隔离 Windows 中，用同版本封存 C# Guardian 测试 Rust 子层故障、root 意外退出、存储故障、Low 句柄拒绝及冷启动。通过之后，才考虑给现有 `start-protected.ps1` 添加明确的实验选项。
3. **严格对抗路径**：分别验收 pig2 和永爱；连续观察实体注册、生命／死亡状态、世界 tick 与窗口。真实样本若在初始化、参数或核心校验阶段退出，记录失败；不能删除其校验逻辑后称作原样本通过。
4. **更强边界研究**：可信游戏状态／渲染与任意原生攻击模块分离，评估模组兼容性代价。若要求整个原生模组仍能任意写同一 JVM，就不能同时承诺该 JVM 永不被它破坏。

配置 schema 1 必须包含 `guard`、`guard_sha256`、`guard_config_sha256`、`manifest`、`manifest_sha256`、`directory`、`max_generations`。路径均为本机绝对路径；directory 必须预先建立、只用于这个部署，首次 `--init` 时必须为空；配置、映像和 manifest 必须存放在该状态目录之外。配置文件 SHA256 由受信任启动器固定。

```powershell
eff-generation-supervisor.exe --init C:\EFFLab\rust-root.json <配置SHA256>
eff-generation-supervisor.exe --run C:\EFFLab\rust-root.json <同一配置SHA256>
```

`--init` 只允许首次建立预算，已有预算不会覆盖。它先检查新目录的当前所有者是否为本用户或本令牌的默认 owner，利用已有 owner 的 WRITE_DAC 权限设置仅当前用户／SYSTEM 的可继承 FullControl DACL，取得设置 MIC 标签所必需的 WRITE_OWNER；随后仍按原规则加上 NR/NW/NX 标签。这样从父目录仅继承 Modify 的普通 Medium 用户也能初始化；没有提权、改 owner、开启特权或放宽 Low 边界。`--run` 和 `--generation` 不会修复／重置 DACL，更不会重建预算。直接删除预算、重新初始化或改配置属于新的显式部署，不是从崩溃中恢复。不要把 `--init` 放进每次启动脚本。

稳定 root 不可能通过自己再生成自己，消除自身被破坏的风险：若要替换 root，必须存在更外部、固定的验证者来审核映像、转移持久状态并封锁旧租约。这个验证者才是新的信任根，递归不会消除信任根。当前原型明确保留这个稳定根。

## 本机证据与未完成项

- 官方 Rust GNU 1.99.1 工作区工具链已编译成功，4 项单元检查通过，包括世代上限、祖先伪造、未知权限字段与强制摘要。
- 原生完整 descendant fixture 被 Windows 以错误 225（病毒或潜在垃圾软件）拒绝执行。保留失败记录，没有添加排除或重新包装该被阻止的程序。该项不得记为通过。
- `native-budget-smoke.ps1` 已通过，使用 Windows 原有已签名的文件查询工具，验证两代不同的真实 Rust 进程、每代 Job 排空返回、重开 root 后预算不重置及 CLR 配置篡改拒绝，并验证真实目录 junction 祖先被拒绝；它不能代替完整后代回收或真实 MC／模组测试。
- `native-guardian-smoke.cjs` 使用已有真实 C# Guardian 和既有双 JVM workers，通过了独立的完整进程树检查：杀死 Rust 子层后，旧 Guardian、控制器、双 JVM、额外子孙进程均退出；新代保留已撤销的 authority.recovery；杀死稳定 root 后，第二代整棵树退出；重开 root 仍受已用尽预算约束。证据位于 `output/eff-rust-tools/real-guardian-2/result.json`。首次运行的 fixture 漏写撤权前置操作而失败，补齐既有 `guard.test.cjs` 的前置操作后重新通过；不是修改防御实现使断言通过。
- 尚未验收 Rust 外层对真实 MC 的兼容性、Low 对该 Rust 外层的完整句柄攻击矩阵，以及任何“实体持续存活”的模组实战保证。root 的外部恢复服务未实现，当前测试验证 root 死亡会排空旧树。

所有本地工具链、可执行文件、账号、样本与测试日志保留于忽略的 `output/`，不随源码发布。

2026-11-04 补充：目录 DACL 修复后的 C# 默认／Low 构建已在隔离 Windows 的实际 Medium 令牌下编译，新增目录准备回归与守护原生套件合计 19/19 通过、无跳过。新的 Rust 二进制也已在该来宾以 Medium 运行真实 Guardian／双 JVM 集成测试，验证子层重建、完整旧树退出、root 死亡清理、撤权与持久预算；结果为 `verified-rust-guardian-smoke-result.json`。这仍未加载 MC 或攻击模组。单独的 PowerShell 预算测试被来宾执行策略阻止，未更改执行策略，不能沿用旧版本结果声称该新增用例已通过。主机 C# 新构建曾出现 UNKNOWN／ENOENT 且文件消失，原因尚未确认；没有添加安全软件排除或恢复被移除文件。

若 Windows 的脚本执行策略为 Restricted，使用独立的 Node 原生预算测试，不修改执行策略、不解除文件阻止，也不把被阻止的 `.ps1` 交给其他求值入口：

```text
node mc-1.20.1/runtime/rust-supervisor/native-budget-smoke.cjs <RustExe> <全新输出目录>
```

这个版本用 `icacls` 设置刚创建、归本用户所有的测试父目录的 Modify DACL，再由 Rust 初始化子目录；只用独立的只读 `Get-AuthenticodeSignature` 命令核验 Windows 原有查询工具。没有运行 `.ps1` 文件。它保留两代预算、真实进程换代、Job 排空、重启预算和配置篡改检查，不涉及 MC 或对手样本。
C# experimental Low 构建采用相同的启动顺序：除 `--low-integrity-host` 和只读 `--integrity` 助手外，所有守护入口先拒绝 Low 令牌并给自身进程加标签，然后才读取部署文件。`--provision` 在写入任何 DPAPI key／ledger／head 之前标记空 authority 目录，因此首次真正运行 Guardian 之前也不应向 Low 暴露这些文件。默认非实验构建的权限行为未改变。这个提前自标记仍不能消除进程创建至自标记之间的窗口，也不能撤销攻击者已取得的旧句柄；完整关闭窗口仍需要可信创建者在创建进程时设置 security descriptor，不能用本补丁宣称已完全封闭。
最新复验状态：提前启动标签后的 C# 构建在来宾运行了完整原生套件，19/20 通过，唯一失败为目录测试结束时的 EPERM 清理错误。Rust 提前标签版的两项原生测试未运行，不能继承上一版通过结论。干净来宾多次挂起阻塞了真实 MC／样本验收；详见 [本轮验证记录](NATIVE_VALIDATION_20261104.md)。
