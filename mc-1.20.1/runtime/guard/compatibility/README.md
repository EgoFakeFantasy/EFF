# 永爱 2.2 本地兼容实验

这不是原版样本，也不是防御通过证明。`RepairForeverLoveServiceFilter.java` 只处理 SHA256 为
`3bf3ba852bbafec9f4440210d4084bb92ba9586c9a146ae03ddf003f17f1b5f8` 的用户提供样本。
原文件不会覆盖；输出必须是不存在的新路径。仓库不包含原样本或修复后的模组。

## 修复范围

原版 `ImplementationFilterTransformer` 在 `Iterator.next()` 后生成的允许分支已经保留一个候选引用，
却再次生成 `ALOAD 10`，导致 `ServiceLoader.hasNext()` 的循环出现不一致栈高度。
它同时仅使用 `COMPUTE_MAXS`，没有为新增分支重算栈映射。

工具仅修改两个 class：删除多余压栈的生成指令，并把该生成器改为 `COMPUTE_FRAMES`。
过滤谓词、阻止分支、其他转换器、Mixin、攻击代码、配置和所有 native 资源逐条保持原始字节。
工具把 class 当数据处理，使用 ASM 的 `BasicVerifier` 检查，不加载或调用样本类。

本机 JDK 17.0.20.1 中，Module/Layer 迭代器的原始局部变量数分别为 3/5，临时槽 10 不冲突；
其首标签也是正确的循环入口。这个结论不能推广到任意 JDK。ASM 静态镜像检查原生成结果均报
`Incompatible stack heights`，修正后通过；静态检查不替代完整 MC 测试。

## 构建与运行边界

用 JDK 17 及 ASM 9.9.1 的 `asm`、`asm-tree`、`asm-analysis` 编译工具，再执行：

```text
java -cp <tool-classes-and-ASM-jars> RepairForeverLoveServiceFilter <original.jar> <new-repaired.jar>
```

工具校验固定源哈希、精确指令形状和最终 ZIP 差异必须恰好是上述两项。
本次输出 SHA256 为 `7eee66a0c9505a4babc502ac1707e7598e0fe284121dde1ade11936666f8ec9b`。
测试启动配置明确使用 `host.nativeCompatibility=foreverlove-2.2-servicefilter-repair`，
仅允许此固定哈希、Low 完整性 MC 宿主和 observe-only 研究模式；外层及工作 JVM 的策略不放宽。
它允许 MC 宿主 self-attach，不能称为默认禁用 attach 的硬化配置通过。

必须为该配置重新运行干净基线，报告修复包实际哈希。检查转换器没有抛错后悄悄回退、
原攻击真实作用于同一目标，以及原 PID/窗口/实体连续性。能启动、攻击函数返回、外层账本完整，
都不独立构成抗秒杀成功。
