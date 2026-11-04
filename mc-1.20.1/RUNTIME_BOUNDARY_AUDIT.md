# 0.6.1：启动权限、引擎交接与永爱样本审查

日期：2026-11-04。基点 `85389a0`。本轮包含公开产物静态分析、真实 Java 工作器回归、外层进程树实验和独立 MC 验收；各自的证据不互相替代。永爱二进制没有执行，用户实际使用的版本尚未确认。

## 永爱分析的样本范围

| 样本 | 发布来源 | SHA256 |
| --- | --- | --- |
| ForeverLoveSword / 永爱之刃，Forge MC1.20.1 1.8.1 | [Modrinth Abc0ak7i](https://modrinth.com/mod/forever-love-sword/version/Abc0ak7i) | `ed3ec2cad88fde6a02f534629f4ce6a0d9cf5b0c4224ff15d5342fed94fb46e3` |
| 同项目 1.7weakened，不同代码系列 | [Modrinth Yby952l8](https://modrinth.com/mod/forever-love-sword/version/Yby952l8) | `c83534fa662e6e702d5819f9008fb3b03d6b665eb2c1d548a60dce024b1f5d3a` |

下载与 Modrinth API 的 SHA512 / SHA1 匹配。项目关联 GitHub 源码属于较旧版本，不能代替当前 JAR。未把第三方 JAR、DLL、完整反编译内容加入 EFF 仓库。

静态反汇编确认：

- **1.8.1 的构造器会启动脚本**：仅当 `forever.bat` 不存在时生成默认的 PowerShell 日志跟随脚本，随后执行同名批处理。已有文件也会被执行。这是启动输入的信任问题，默认脚本内容本身不是破坏性操作。
- **1.8.1 会改写健康读数与实体索引**：`MixinLivingEntity.getHealth` 按保护集合 / DeathList 改写返回值；非玩家的 DeathList 按 Java 类名记录。`killEntity` 包含事件总线替换、lookup / section / tick 表操作路径。只换 UUID 的实体仍可能再次命中同一类名。
- **Agent 声明与实际能力有区别**：manifest 有 Premain / Agent / Launcher-Agent 与重转换声明；已找到 `premain` 添加 transformer，但当前 Agent 类未找到 `agentmain`。不能据 manifest 宣称运行期 attach 已成功。
- **1.7weakened 有启动服务**：服务表声明 Transformation / LaunchPlugin；`CorePlugins.<clinit>` 对启动插件表做白名单保留并加入自身 transformer。`CoexistenceManager` 有移除自身服务发现记录与模块配置的反射代码；是否在某个 Java 环境执行成功仍待验证。
- Unsafe、hidden class、反射等只在已追到的静态路径范围内作能力判断；它们不证明全部分支实际执行。

完整 javap 行号、选类清单与限制保留于本机 `output/eff-init-defense-20261104/research/FOREVER_LOVE_STATIC_REVIEW.md` 和 `foreverlove-static-findings.json`，绑定上述摘要。原样 pig2 的对照资料继续使用上一轮 `output/eff-antideath-20261104/` 的固定样本。

## 递归生成引擎能做什么，不能做什么

| 攻击面 | 原架构的缺口 | 本轮处理 / 仍有的边界 |
| --- | --- | --- |
| 携带未知权限字段、类加载器、代理或回调配置 | 双工作器对同一污染 JSON 都 deepCopy，一致性无法证明来源干净 | Java 与独立 Node DTO 检查拒绝未知 / 错型字段，交接失败不激活后继 |
| 后继重新请求初始权限 | G1 仍能调用 `initial`，虽然正常控制器路径未这样调用 | 仅 G0 可生成初值；后继须接续通过校验的已提交状态 |
| 原模组每次随 MC 再启动 | 新工作器没有加载该模组，但新 MC 会重新加载相同列表 | 高权限默认拒绝；显式观察实验只读，首次退出 / 故障后隔离，不把重载当去污 |
| MC getter、事件与自报清单被改写 | 受攻击 JVM 同时是证人，HMAC 只证明消息来自该宿主 | 以进程外封存输入与审查记录作加载基准；自报只作辅助，不能证明同层无篡改 |
| 同一 MC 模组冒充玩家 / 外来者 / 观察者 | 同宿主共享租约，另加一个放在 MC 的密钥也会被读取 | 第三方观察宿主不获得任何 DSL 写入权限；真正不信任的对战还需要可信外部玩家输入 |
| 观察到死亡后关闭 / 伪装恢复探针 | enabled=false、active=false、假健康报告可取消故障 | 已锁存故障不由宿主自行撤销；无关 revision 增长也不洗掉故障。合法撤销、终局、新实例按权威状态复核 |
| 初始化迟迟不交实体样本 | active 心跳就能宣布 ready，绕过启动总期限 | 必须有匹配实例 / revision 的有效投影；就绪前不接受干预程序 |
| 模组发送正常退出 | goodbye 能请求外层停止 | 受保护宿主无停止权；用户从外层窗口或 Ctrl+C 退出 |
| 同账户、管理员、原生内存或共同 HotSpot 缺陷 | Job、哈希和不同生成类不是 OS 安全域 | 本轮没有部署 VM / 独立账户隔离，仍不能承诺抵抗此类攻击 |

生成的 `eff.generated.E…` 是工作 JVM 上的受限引擎类。MC 投影实体的 Java 类仍是 `EffProjection`。新类身份、字节码摘要、独立 PID 是代际与故障隔离证据，不是新 HotSpot 实现，也不是模组影响已经消失的证明。

## 已复现并修复的具体问题

1. **状态一致性洗白**：修复前在真实两个工作 JVM 中加入 marker-only 的 `ambientAuthorities`、把 `recovery` 改为字符串，两者仍一致接受，真实 G1 也继承。marker 没有授予 OS 权限；复现入口是私有控制器接口，普通 HTTP 不能直接传入 state。
2. **玩家 watch 所有权缺失**：外来者可 `unwatch` 删除玩家的守卫。现在检查所属 actor；保留玩家清除外来者守卫等合法玩法。
3. **宿主取消已观察故障**：安全探针实测 enabled / active 状态能让玩家死亡不再处置。现在锁存后先处理故障，再处理宿主活跃声明；合法 avatar 删除和恢复撤销继续有效。
4. **启动 / 退出越权**：安全探针实测无投影也能 ready、goodbye 触发正常停机。现在受保护模式从外层退出，初始化就绪依赖有效投影，程序提交在就绪前被拒绝。

修复前探针及源码摘要保留在 `bootstrap-audit-baseline.json`；没有用修复后的结果覆盖基线。

锁存修复的范围是“已经看见的故障”。如果同 JVM 代码在任何异常样本出现前就全面伪造健康、暂停和活跃状态，现有探针仍可能漏报；`active/paused` 不是可信外部用户意图。初始化门槛和锁存检查不等于解决了这个证人问题。可信玩家 / 暂停通道、宿主外观测以及 OS 隔离仍是后续架构工作，本轮没有将它们记为完成。

## 权限交接的实际规则

- 状态只有 14 个允许的根字段；所有布尔值保持布尔类型。checkpoint / watch / journal 也有字段、类型、长度、数量、程序与终局一致性检查。
- 只允许现有受限 DSL 的 watch，无 Java、环境变量、文件路径、代理对象、类加载器或任意代码字段。
- 合法检查点、已触发守卫、已撤销恢复、已提交终局与剧情原文保持。剧情规定的初始 avatar / tether / possess / recovery 由固定 genesis 模式建立；后继不重新授予。
- Node 在读入、提交和生成后继前独立检查；Java 在初值、快照、转移输入与输出检查。原有外层继续保护提交连续性、恢复撤销、终局和引擎祖先链。
- 工作 JVM 使用独立工作目录、固定启动参数、只含 JDK bin / System32 的搜索路径及最小环境。它不继承 MC 租约、模型密钥、JAVA / NODE / CLR 启动注入变量或用户搜索路径。

## 初始化模组准入

`artifact-policy.cjs` 用 Node 内置模块只读解析有界 ZIP / JAR，不解包或执行目标；校验路径歧义、重复项、CRC、解压长度、元数据和选定类的常量池。检测 Agent、启动服务、Mixin / AT、原生库与原生加载、脚本 / 嵌套 JAR、进程执行、Unsafe、动态类和 Instrumentation 的静态能力候选。

```powershell
node mc-1.20.1/runtime/artifact-policy.cjs C:/Downloads/example.jar
```

有风险候选时输出报告并以非零状态拒绝；“未发现候选”也不证明安全。反射、加密 / 无扩展名载荷、动态获取及首次构建已污染仍有盲区。

普通受保护通道不增加额外研究模组。显式实验必须设置 `researchLab=true`、`researchMode="observe-only"`，每个 JAR 固定摘要；有风险时还必须提供**与检测结果完全相符**的 `allowCapabilities` 数组。该审查记录与 JAR 一起封存，不能用摘要自动换取信任。任何额外实验模组都让宿主只读，并使该部署首次退出 / 故障后进入隔离：新控制器在加载 MC 前停止，后续打开仍不自动重播该部署。

这不是 Java 模组的 OS 降权：首次显式运行它仍在当前账户内。真正对抗不受信任的原生模组，需要 OS 隔离及可信外部输入；本轮没有启用永爱实战，也没有把观察模式称作可玩的安全对战版本。旧 `pig2-native-test.cjs` 不再能直接绕过新的准入策略。

启动入口在 PowerShell / CLR 进入前清理 profiler / hook 环境；JVM 参数准入拒绝已知 agent、间接 flags、替换类加载器与危险回调，并强制 attach / OOM 硬化参数。普通菜单心跳和运行时模块自报不代替这些输入检查。首次信任的构建、Node、JDK、启动器及 OS 本身仍是前提。

## 原生守护补丁的取舍

新增 C# 深层状态 schema / 单次实验补丁候选被系统安全软件阻止执行（候选 SHA256 `6ba8e548760b3817ab6a3ff2318a41b87aea9b23243c73bf2ad5fa27e2e17df3`），未采用。已恢复 `85389a0` 的原外层源代码，新增隔离与 DTO 检查由封存 Node / Java 实现。没有恢复被阻止的候选、放宽安全软件或 attach 策略。候选源码只以文本保存在本机研究证据中。

因此原外层仍是有限的单调约束，不是一个新增的、独立理解全部 DTO 语义的第三实现。若控制器自身被完全劫持，这一边界仍须单独加固；不能把 Java / Node 的检查说成 C# 也独立检查了所有字段。

最终构建、真实游戏与隔离实验记录见 [本轮验收](./RUNTIME_BOUNDARY_VALIDATION.md)。本轮没有训练模型权重或声称击败永爱 / pig2。
