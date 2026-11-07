# Read-only live tick evidence

`NativeHiddenBoundary.inspectTick(Class<?>)` samples already-loaded connection,
server-player, or local-player tick methods through the existing JVMTI environment.
It returns method bytecode, modifiers, obsolete status and (if available) the
constant pool. It never looks up target classes, initializes them, invokes methods,
suspends threads, redefines classes, repairs metadata or modifies gameplay state.

The API admits fixed class signatures and `()V` tick names only. Calls are capped
at 32 per JVM, bytecode at the classfile limit and pool output at 512 KiB. Missing
capabilities, unprepared classes, omitted pools and exhausted budgets are explicit
diagnostic outcomes. This is a bounded diagnostic, not an access-control boundary:
same-process native interference can compromise observation itself.

The opt-in manual player fixture records samples when prepared, before an attack,
and when the attack returns. Native loading remains the responsibility of the
sealed startup agent. Missing diagnostics never trigger an attach, repair or retry
of the attack. Receipts retain the original target identity and mark combatPassed
false; this addition does not establish successful defense.

Bytecode and pool retrieval are separate reads, not an atomic snapshot. Unchanged
bytes do not prove the branch executed, exclude transient replacement or establish
native/JIT integrity. Compare these samples with fresh functional observations and
video. A surviving window or health value cannot override a stalled player tick.

Offline fixtures verify selection, stable reads, null/unsupported classes, bounded
calls, and absence of target initialization or execution. These are synthetic JVM
tests, not Minecraft combat results.
