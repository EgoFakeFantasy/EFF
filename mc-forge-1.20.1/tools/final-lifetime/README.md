# 最后 Java 转换阶段的生命周期查询边界

`FinalLifetimeTransform` 是供已固定来源的 Java 转换管理器出口调用的纯 ASM 候选。它不注册一个“最后添加”的普通 CFT：普通 CFT 后面仍能被注册新 CFT。集成方须在本轮所有 Java CFT 回调执行完后，对最终字节码调用 `transform`，并保留未修改输入作为 `transformed == null` 时的有效字节码。

支持 MC 1.20.1 的以下声明方法，兼容开发名和生产 SRG 名，并检查精确方法数量：

| 声明类 | 查询 | 已认领对象的返回来源 |
| --- | --- | --- |
| Entity | isRemoved、getBoundingBox | 原 removalReason、原 bb 字段 |
| LivingEntity | getHealth、isAlive、isDeadOrDying | 已认证 ProjectionProbe 的实际 DataItem 值；原 removalReason |
| EntityLookup | getEntity(int/UUID) | 当前实际 byId/byUuid 中的同一对象 |
| ClientLevel | getEntity(int) | 当前 ClientLevel→TransientEntitySectionManager→EntityLookup 的实际 byId |
| ServerLevel | getEntity(int) | 当前 ServerLevel→PersistentEntitySectionManager→EntityLookup 的实际 byId |
| Int2ObjectLinkedOpenHashMap、Int2ObjectOpenHashMap | remove(int)、clear() | 删除前检查实际存在的受管对象；拒绝后不执行删除，不补回条目 |

每条分支都调用 `FieldWriteGate.rejectQuery` 做对象生命周期归属判定；普通对象继续执行全部已有方法体。不存在的索引条目不会从缓存、UUID 认领表或其他世界补回。零、负数、NaN 血量和真实移除原因不会改成健康值。原 bb 被破坏时照样返回损坏值，验收必须判失败。

客户端和服务端公开 id 查询使用当前 manager/lookup 的实际声明字段。当前 map 可沿至多四层
Map 类型的 delegate 读取；仅接受精确 fastutil 8.5.9 两种审过的类，按实际 key/value、mask、
n、size、containsNullKey 进行原查找算法，不靠扫描到某个旧槽就认定登记存在。
候选还须与实体实际 id/level/UUID 字段及当前 UUID 索引一致，返回前再次核对当前引用链和条目。
未知布局、断裂探测链、缺条目、循环或超出预算均不返回候选；普通对象仍走原方法。
这恢复正常游戏公开查询，不只是改变验收探针；不重登记、不缓存旧实体。
它不覆盖所有内部自定义查询入口，也不保证抵抗在读取期间任意原生内存篡改。

`rejectQuery` 必须区分同对象的递归查询与递归破坏写：首次客户端认领需要原索引证明登记，递归查询暂让原方法完成；递归破坏写不能借这个窗口获准。此实现依赖主工程对应版本的门控，不自带替代认领协议。

实现在方法开头添加边界，保留外来转换的其余代码、标签、异常表和栈帧。幂等判断比较整段可执行指令、字段/方法引用、局部变量关系及跳转目标，不凭BEGIN标记。若后续转换保留标记却改写内部判断或字段读取，也会再添加正确边界；不会删除可能被其他代码引用的旧标签。完整边界未变化时重复处理幂等。只计算 max stack/locals，所有新增分支显式写入帧，避免加载 MC 类猜测继承关系。

异常表也属于完整性检查范围。外来处理器若覆盖边界，即使全部指令仍相同，也会重新添加处于原异常范围之外的边界；校验失败不能被原处理器吞掉并替换成正常返回。原方法体的异常处理仍保留，不覆盖新边界时重复处理仍幂等。

离线测试包括真实 JVM `-Xverify:all` 加载的合成 MC 形状、晚插入提前返回、保留标记但篡改查询判断、保留指令但新增异常捕获、真实零/NaN/移除值、索引缺失、普通对象行为、首次查询递归、外层过滤、生产 SRG 类的精确映射及字段/方法 schema 不变。异常回归实际触发所有权检查失败，验证异常不会被旧处理器吞掉。Gate测试还以真正的隐藏调用方调用两种fastutil容器，验证remove/clear、未认领与释放后的语义。离线通过不是实战通过；真实 Forge 基线与攻击仍须录像验证原窗口、原实体、实际登记和原字段持续有效。

边界限制：Java 转换管理器之外的原生 JVMTI 顺序、直接 native 内存写、运行期对象换类、未知子类重写及实际容器内容破坏，不由这个只读查询补丁自动解决。不能据此声称 Windows 内核级隔离或任意 native 代码不可绕过。
