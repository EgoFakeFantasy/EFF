# EffArena 方法完整性：分离来源与规范输出哈希

2026-11-07 v65u 更新：列表删除保护扩展后，当前审核数量为同一
`syncNPCs(JsonObject)` 中的 1 次 `rejectMapRemoval(Map,Object)` 与 2 次
`rejectCollectionRemoval(Collection,Object)`，对应 NPC 索引及两处 actors
删除。审核仍要求精确方法、描述符、分类计数和不变 schema；额外调用不被
泛化放行。负控另确认错误方法及未审核门禁被拒绝。下文数量及收据描述的是
最初 v65f 审核，不代表当前构建数量。

本次仅增加 `eff/minecraft/EffArena` 与嵌套 `EffArena$Placement`，明确目录从 24 项增至 26 项。没有按对手名称决定保护，也没有修改游戏的名单、生成或死亡逻辑。

## 为什么不能直接恢复 JAR 原字节

实际运行构建期 `FieldWriteGate.instrument` 后，发现 `EffArena.syncNPCs(JsonObject)` 内有一处 `npcActors.remove(id)` 被加入 `rejectMapRemoval`。直接把整类恢复为原 JAR 字节会擦掉这处既有门禁。初版审查因此拒绝构建，随后采用分离哈希方案。

- `EffOwnedOriginCatalog.HASHES` 仍钉住原始游戏 JAR 类字节。初始来源不匹配时，在插件流水线之前拒绝。
- 构建时使用实际、记录 SHA-256 的 `FieldWriteGate` 生成 EffArena canonical 字节。严格限定唯一改动位置、调用名称、描述符及编辑数量；新增其他位置会拒绝构建，要求重新审查。
- `CANONICAL_HASHES` 独立钉住输出；生产 `EffOwnedOrigin.finish` 从归档读取并再次验证其哈希。缺失/损坏不回退到原字节或第三方变换结果。
- 归档中的 EffArena 是 canonical 字节。因此最终 owned-agent 的首定义、重定义、重变换恢复使用同一个 canonical，不剥掉已审查门禁。
- 另外 25 项维持原策略。没有把全部游戏或 Minecraft 类加入豁免目录。

计算 frames 只读取 MC/JDK/依赖类的元数据，不初始化 MC。严格 SRG 成员、注解、Mixin 依赖审查保留；新增的 `eff/lifetime/FieldWriteGate` 引用只允许上述 EffArena 方法内的精确 `rejectMapRemoval(Map,Object)` 调用。

schema 检查比较 class header、继承/接口/nest，每个字段和方法的名称、描述符、access、signature、exceptions，以及 inner/record 组件，非仅比较数量。测试另有 12 个成员名称/描述符/access 变动负控。

## Manifest 与消费者

`owned-manifest.txt` 中原类名条目记录 source hash，`canonical:eff/minecraft/EffArena` 记录规范输出 hash。此文本用于构建证据。`BuildOwnedAgent` 按 `META-INF/eff-owned-origin/archive/*.class` 枚举 26 项并构造 `Catalog.bytes()`；bootstrap preload 读取这个 map，不把 manifest 新行当类名。固定数量检查同时要求 EffArena 和 Placement 存在。

## 已执行的边界测试

收据：`output/eff-local-native-20261104/owned-origin-offline-50PyhD/receipt.json`（输入为冻结的 v65f 游戏 JAR，而不是变动中的构建目录）。

- 保留真实 ModLauncher 外层 wrapper，执行合成变换回调，将 `sceneActors()` 改为返回新空 ArrayList；回调并未被跳过。
- 负控 getter 确实返回空名单；输出 canonical 恢复原 `List.copyOf(actors)` 方法行为，保留三个原对象的 identity，并按当前列表产生不可变快照。
- 原 source 错 hash 被拒绝；把 canonical 当 source 也被拒绝。实际 helper 输出端分别拒绝缺失 canonical 资源和损坏 canonical 资源。
- 重新计算 canonical 与归档字节完全相同；原有 `rejectMapRemoval` 保留，完整 schema 不变。
- 原 MC 类、未保护类及原样本类仍通过原流水线，未执行样本 native 入口。

组合 owned-agent 构建及现有真实安装 agent 的离线回归也通过，收据为 `output/eff-local-native-20261104/owned-manager-agent-offline-LxRysW/receipt.json`。bootstrap 明确报告 `helper-ready classes=26`；覆盖原有 Java 重变换/重定义、合成 native 边界、运行期数据门禁和索引租约测试。没有执行 MC 或敌方模组。原有“更晚的 native ClassFileLoadHook 可绕过 Java 最终边界”的反例仍被测试确认，未将它包装成已解决。

这里只验证受控方法变换与来源边界。它不证明战场原名单已恢复、实体连续存活或永爱实战通过；这些仍需新一轮原字段/公开 getter 对照、游戏日志及录屏。
