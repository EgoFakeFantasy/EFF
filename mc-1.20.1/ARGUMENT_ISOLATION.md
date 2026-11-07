# 调用参数隔离与重新定义（实验）

## 问题与证据

2026-11-05 的永爱 2.2 实测在玩家 tick 中出现 Inventory 读取返回 null。原包字节码把
方法参数写到 private static 字段再读取，并发或递归调用会共享这些暂存槽。加载阶段
的结构转换已在 v31 日志中执行，但随后仍崩溃。

原包启动流程还会比较并还原类字节码。v31 日志先出现 FieldHandler 的 7 槽转换，随后
样本自报还原 611 类，再出现接收者错位。此数量没有逐类成功回执，不能断言 611 类全部
成功还原或 FieldHandler 明确包含其中。静态 PE 审查显示 wzzapi.dll 的两项 redefine
导出指向同一 RVA 0xBCC0；其实现取得 JVMTI 1.2 环境并调用表项 87 RedefineClasses。
这里只读分析 DLL，没有为该审查执行样本原生代码。

## 结构转换

`StaticArgumentIsolation` 只接受能由当前类直接字节码证明的结构：私有静态暂存字段，
全部直接访问限于同一个普通方法，唯一写入来自该方法参数，且写入支配所有读取。
构造器、final/volatile、逃逸字段句柄及不符合控制流条件的情况不转换。
转换把存取移到新局部变量槽，保留调用、分支与异常行为；不按对手名称匹配，不改原 JAR。
反射、Unsafe 或 JNI 对这些字段的额外访问不在此直接字节码证明范围内。

加载服务覆盖正常 ModLauncher 转换。可选启动代理还在标准 Instrumentation 的初载、
重新定义、重新转换回调中应用同一个规则。ASM 和规则实现使用独立包名，避免与 Forge
模块加载的 ASM 冲突；计算栈映射只读取层级资源，不在回调内初始化目标类。
失败会记录 `unavailable` 并返回未改写结果，不将失败伪报成保护成功。

## 显式部署与信任边界

运行配置可用 `host.startupAgent` 指定唯一组件：

```json
{
  "mechanism": "static-argument-isolation-v1",
  "path": "C:\\absolute\\eff-argument-isolation-agent.jar",
  "sha256": "本次构建的64位小写SHA256"
}
```

`host.args` 必须恰好含一次对应 `-javaagent:<path>`，不支持额外 agent options。
部署检查普通文件、大小和内容哈希，复制并固定封存副本，重写对应路径，并将源组件纳入
基线身份。默认仍拒绝任意 javaagent/agentlib/agentpath、动态参数文件或弱化字节码校验。
哈希声明由可信部署者提供，不是对任意 JAR 的安全认证；此选项也不是动态附加授权。

独立构建与离线验证：

```text
node mc-forge-1.20.1/tools/argument-agent/build-and-test.cjs
node --test mc-1.20.1/runtime/startup-agent-policy.test.cjs
```

构建输出的 `test-control-agent.jar`、synthetic JNI DLL 仅为测试夹具，**不部署到 MC**。
参数隔离单独部署时仅使用 `eff-argument-isolation-agent.jar`；脚本保留每次独立输出，不清理已有文件。

### 自有逻辑的 Java 转换链最终边界候选

v40 可使用组合代理，在固定 JDK 的 `TransformerManager` 完成所有 Java 转换回调后，恢复
明确认证的自有协议、观察和验收类；所有回调仍执行，非清单类输出保留。此方案补充初次
ModLauncher 收尾看不到的后续 Java CFT 转换，不改变磁盘 JDK。原参数隔离组件字节保持不变。

```json
{
  "mechanism": "owned-java-transform-boundary-v1",
  "path": "C:\\absolute\\eff-owned-argument-agent.jar",
  "sha256": "本次组合代理的64位小写SHA256",
  "bootstrap": {
    "path": "C:\\absolute\\eff-owned-origin-bootstrap.jar",
    "sha256": "本次辅助组件的64位小写SHA256"
  }
}
```

仍仅有一个 `-javaagent`，不接收参数；固定文件名的辅助 JAR 必须与它同目录，分别验证哈希、
复制并登记封存。辅助 JAR 只含四个独立命名的 JDK-only helper 类，不向 bootstrap 注入 ASM。
组合代理同时核对当前 JDK manager 字节、补丁字节和辅助文件。版本不符即拒绝，不能换一个
未经验证的 JDK 后沿用结论。

真实离线验证包含晚注册 Java CFT、Java/native redefine、retransform；也已复现**后置独立
native ClassFileLoadHook 绕过**。初次绑定依据首先出现的认证字节及 loader 身份，存在被其他
loader 抢先占用的限制。该机制不是任意原生内存安全保证。构建与完整边界见
[组件说明](../mc-forge-1.20.1/tools/owned-origin/agent/README.md)，MC 是否通过仍以录像实测为准。

## 已验证与未验证

独立真实 JVM 测试覆盖初载、Java redefine、retransform、自有 JNI 测试 DLL 发起的
官方 JVMTI RedefineClasses，并实际检查双线程参数隔离、递归、数组与层级合并。
后置转换器覆盖结果的反例也已复现：回调执行过，并不保证最后执行的字节码仍受保护。

此机制不是同 JVM 的原生内存隔离；不能阻挡任意 DLL 直接写内存、修改回调、清空注册表
或终止进程。不能因为用了 native/JVMTI 就声称超越 Windows 内核权限。
真实 MC 的双端原实体、原窗口和实际攻击验收以
[逐轮录像记录](../mc-forge-1.20.1/RELEASE_0.8.0.md)为准；本文件不宣布永爱实战通过。
