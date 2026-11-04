# ForeverLove 2.2 Public 用户样本静态审查

样本：`!永爱之刃mc1.20.1-2.2-Public.jar`，33,606,049 bytes。
SHA256：`3bf3ba852bbafec9f4440210d4084bb92ba9586c9a146ae03ddf003f17f1b5f8`。

本报告仅来自 ZIP 元数据、javap 反汇编、常量字符串只读解码及内存中的 PE 导入/导出表解析。没有执行样本类、初始化器、JAR、DLL、EXE 或脚本，没有把样本加入可信启动目录。`javap` 是 JDK 自带静态工具。以下 FL22-S 编号是本地发现编号，不冒充 REA MCP 留存 Evidence ID。

| ID | 可确认的静态行为路径 | 证据文件与行 | 限制 |
|---|---|---|---|
| FL22-S1 | CorePlugins 经 ITransformationService 声明加载；静态初始化要求 Java17，并调用 JavaAgentUtil.loadAgent；多个生命周期尝试过滤转换服务 | CorePlugins.javap.txt:89-111,124-150,163-200；父目录 inventory 服务配置 | 服务执行顺序、是否成功附加尚未实际启动确认 |
| FL22-S2 | JavaAgentUtil.removeUnwantedServices 受 interceptCore 控制；读取 Launcher.transformationServicesHandler.serviceLookup，保留自身前缀、fml、按interceptMixin选择mixin，最后替换 serviceLookup；若自身服务缺失还尝试重建 | JavaAgentUtil.javap.txt:9-245 | 反射/版本约束可能失败；不等于已成功移除EFF |
| FL22-S3 | loadAgent 检查 Android、javaAgent、已注册标志，打开模块/启用selfAttach后向当前PID发起VirtualMachine.attach/loadAgent，并有enqueue/impl回退 | JavaAgentUtil.javap.txt:248-350,367-588 | 调用存在不证明 DisableAttachMechanism 被突破；未运行 |
| FL22-S4 | AgentEntry 同时实现 premain 与 agentmain；前者转发ServiceLoaderPriorityAgent，后者转发ForeverJavaAgent；后者最终注册变换器 | AgentEntry.javap.txt:115-179,208-292；ForeverJavaAgent.javap.txt:11-37；AgentTransformers.javap.txt:9-175 | 旧1.8.1缺失agentmain的结论不能沿用2.2 |
| FL22-S5 | AgentTransformers 按配置加载Hidden/Service bridge并总是加入LaunchModule；AbstractBridgeModule会导出资源并appendToBootstrapClassLoaderSearch；PriorityAgent还改写ClassLoader相关类以调整服务资源顺序 | AgentTransformers.javap.txt:9-93；AbstractBridgeModule.javap.txt:170-300；ServiceLoaderPriorityAgent.javap.txt:10-94；nested-bridge-inventory.json | 嵌入3个JAR是启动层扩展资源；没有实际动态执行证明 |
| FL22-S6 | Windows + useNative + antiInjection + hasNative 条件进入 Interceptor.init；SecurityHook静态初始化经LoaderUtil加载SecurityHook DLL。LoaderUtil会临时复制DLL，然后走Runtime.load、StealthLoader、内部NativeLibraries或JNA LoadLibraryW回退 | ModMain.javap.txt:3180-3192；Interceptor.javap.txt:254-283；SecurityHook.javap.txt:110-114；LoaderUtil.javap.txt:76-199 | 各分支是否成功未知。API hook名称不是内核驱动证据 |
| FL22-S7 | WzzNative静态加载wzzapi并请求本JVM JVMTI capabilities；ModMain另有受jvmtiRemove控制的遍历/禁用其他JVMTI环境路径 | WzzNative.javap.txt:756-772；ModMain.javap.txt:224-297 | JVMTI capabilities是JVM权限，不可称Windows系统提权；ConfigData默认jvmtiRemove=false |
| FL22-S8 | ModMain仅在restartJVM=true时调用restartCurrentJVM；该方法提取内嵌wzz.exe并通过反射ProcessBuilder构建监控参数。2.2的ConfigData构造默认restartJVM=false | ModMain.javap.txt:3167-3178；JavaMonitorLauncher.javap.txt:2370-2590；ConfigData.javap.txt:112-119；decoded-constants.json | 存在其他启动API不证明默认路径会执行wzz.exe；运行配置可能覆盖DTO默认 |
| FL22-S9 | DeathList同时匹配UUID、Class<?>对象和临时类表，类级加入使用getClass，临时类表按秒调度解除 | DeathList.javap.txt:19-45,151-213 | 不再是旧版本类名字符串表；单换UUID不足以去掉同JVM的Class级命中，进程重启若再次加载攻击代码仍可重新布置 |
| FL22-S10 | EarlyBootstrapHook的构造、accept与静态块仅打印日志 | EarlyBootstrapHook.javap.txt:1-35 | 不因其早期服务名就声称它执行系统权限攻击 |

## 原生资源范围

9个DLL、1个EXE均为PE x64（0x8664）。导入/导出表及选定字符串记录于 `native-pe-imports.json`。SecurityHook的导入可见VirtualProtect、线程枚举/挂起/恢复及GetProcAddress；API名称字符串另含OpenProcess、VirtualProtectEx、WriteProcessMemory、CreateRemoteThread，可能用于hook匹配，不能由字符串推出实际跨进程调用。wzz.exe的真实导入表含OpenProcess、TerminateProcess、CreateProcessW与QueryFullProcessImageNameW；未反汇编其控制流或执行，不能据此断言它会终止EFF。CRT在多个DLL中也导入TerminateProcess，不能把每个导入都归为攻击路径。

## 对EFF的直接含义

- 样本提供的是初始化/类加载/Instrumentation/原生加载的真实候选路径，不能只测试实体health=0。
- 新工作引擎类、PID或实体UUID不是新的OS信任域。重新加载同一模组与配置会再次进入上述初始化路径；状态DTO再严格也不能自动撤销同JVM代码的环境权限。
- 应继续外部权威状态与宿主观测分离、封存启动输入、外部控制凭据、有限预算及敌对输入故障隔离；现有严格模式应在未逐项审核能力时拒绝本JAR。
- 2.2交战、初始化兼容性、Low MIC下的实际行为、实际实体删除效果与跨进程访问效果均未验证。建议在独立可丢弃VM中按`STATE_INTACT/HOST_RECOVERED/PLAYABLE_RESTORED`分别取证；本静态结果不等于实战通过。

## 搜索边界

已反汇编约27个明确入口/依赖类并静态解析全部内嵌PE与3个bridge JAR布局，没有全量反编译3850个归档条目。混淆常量仅解码可明确识别的纯XOR/Base64表达式，未执行解码器类。未查询网络或取得作者源码，也没有验证DLL签名/可信性。`util.AttackUtil`不存在这一有限查询失败不能证明没有实体攻击逻辑。

## EFF 实际准入测试

已对同一 SHA256 的用户原包直接调用新版 `artifact-policy.cjs`，严格默认策略和显式 `allowRisky:false` 均返回 `UNAPPROVED_MOD_CAPABILITY`，检测到 10 类能力风险。该测试不提取执行、不启动 MC；不是“击败永爱”。原样本及 DLL/EXE、完整反汇编均未上传仓库。

用户随后授权准备隔离 Windows 虚拟机。镜像下载／虚拟机创建／来宾系统启动／加载样本／真实交战需要分别验收；本报告的静态结论不随下载完成自动升级为动态结论。

## 正常持剑攻击的独立实验入口

新增 `runtime/guard/foreign-sword-native-test.cjs`，只接受上述固定 SHA256。它要求 Windows 与显式 `EFF_DISPOSABLE_VM_LAB=1`；这个环境变量是误操作防护，不是虚拟机证明，也不是安全边界。操作者必须另外核实可丢弃 VM、网络断开、无共享目录／剪贴板、无安装凭据残留和干净基线。

测试仅在一次性 `observe-only`、Low 宿主、外部控制模式中逐项批准该样本已检出的能力，不修改默认准入策略。玩家装备注册物品 `forever_love_sword:forever_love_sword`，通过正常 `ServerPlayer.attack(target)` 进入 Forge 攻击事件与物品回调；目标只允许当前 EFF 战场唯一带标记的 ArmorStand。事件若被取消不会绕过，不调用样本私有击杀函数。启动期失败和攻击未发生必须保留为未完成交战。

在来宾内准备好同版本可信启动配置和实验守护程序后运行：

```powershell
$env:EFF_DISPOSABLE_VM_LAB='1'
node runtime/guard/foreign-sword-native-test.cjs C:\EFFLab\private-launch.json C:\EFFLab\foreverlove22-lab C:\EFFLab\guard\low.exe C:\EFFLab\specimen\foreverlove-2.2-public.jar
```

MC 内的 `sword-attack-started`、`sword-attack-returned` 和 30 秒观测文件属于不可信宿主观察，不能单独证明防御成功。驱动另外重启独立外层守护以验证封存文件与 HMAC 日志；恢复的实验会在启动 worker／MC 之前隔离，禁止自动再次加载样本。只有验证成功、日志字节不变且权威 avatar／recovery 状态仍有效时，才记录 `STATE_INTACT=true`。`HOST_RECOVERED` 和 `PLAYABLE_RESTORED` 不因隔离而置真。没有验证本地模型推理或权重训练。
