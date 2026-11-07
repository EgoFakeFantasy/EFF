# Repeated argument isolation experiment

This is an independently built startup instrumentation agent. It reapplies the
existing `StaticArgumentIsolation` structural transformation when application
classes are defined, redefined, or retransformed. It does not disable native
features, suppress class restoration, select an opponent by name, replace an
entity, or restart a JVM. The production launcher does not yet accept this agent.

The normalizer isolates a private static argument scratch field into a local slot
only when its single-method direct-bytecode use satisfies the existing strict
write/read/dominance checks. It does not prove the absence of reflective, Unsafe,
or JNI access to that field. Such access remains a semantic limitation.

Run from the repository root using existing local JDK 17 and ASM 9.9.1 artifacts:

```powershell
node mc-forge-1.20.1/tools/argument-agent/build-and-test.cjs
```

Each run creates a new retained `output/eff-local-native-20261104/argument-agent-offline-*`
directory. It does not clean earlier output, modify the shared game build, start
MC, or load opponent code. If the existing MinGW g++ is present, it compiles and
loads only the small synthetic JVMTI fixture in this directory. `--no-native`
omits that test and the receipt then records no native fixture. Nothing is downloaded.

The candidate JAR contains the agent, the normalizer, and relocated ASM core/tree/
analysis classes under `eff.argumentagent.internal`. Build-time ASM Commons and
test `ControlAgent` are not packaged in the candidate. The test JVM classpath has
no external ASM JARs. The candidate exposes no Instrumentation getter and accepts
no agent options. The test-only control agent exposes Instrumentation solely to
exercise the real API and must not be deployed with MC.

The transformer recomputes frames using class-resource metadata without invoking
`Class.forName`, so resolving hierarchy does not initialize target classes. When
the requesting loader hides a resource, a fallback reads only the uniquely
matching package in a JDK system module with an exact `jrt:/<module>` location
and a matching descriptor/location in the boot-layer configuration. It reads
through the system ModuleReference, not through an application module/loader.
Declared `--patch-module` arguments disable this fallback. Checking loader identity
alone was insufficient: this JDK 17 loads `jdk.attach` through AppClassLoader,
although its source is the JDK image. Application modules are excluded. Returned class names are verified;
incorrect direct resources are rejected rather than concealed by the fallback.
Tests use a real child loader which delegates JDK type loading but hides resources,
including `VirtualMachine.class`, plus missing application and wrong-name cases.
Unknown
hierarchy/resources produce a diagnostic and no transform. Bootstrap/JDK classes,
the agent's own namespace, reentrant callbacks, and oversized classes are excluded.
This is a conservative compatibility experiment, not a universal class transformer.
Hierarchy diagnostics include only a fixed code and a bounded, validated internal
class name, never arbitrary exception messages or class contents.

The test checks actual invocation results after initial definition, Java
`redefineClasses` supplied with original bytes, Java retransformation, and a
synthetic native call to JVMTI `RedefineClasses`. Deterministically interleaved
threads and recursive calls must keep their own arguments. Array/interface/class
frame merges also run under `-Xverify:all`.

A deliberately later transformer replaces the repaired bytes with originals.
The same business tests must then reproduce interference. Removing this test
transformer and retransformation must restore correct behavior. This negative
case is essential: an earlier callback log is not proof of the final executing
bytecode. A native agent with later callbacks, disabled hooks, or direct memory
mutation can remain outside the protection. Instrumentation exceptions do not
veto class loading; the implementation reports unavailability and returns null.
These rules follow the [JDK 17 ClassFileTransformer contract](https://docs.oracle.com/en/java/javase/17/docs/api/java.instrument/java/lang/instrument/ClassFileTransformer.html).

For a future controlled MC run, pass only the candidate `-javaagent:<sealed path>`.
The production seal and launch policy must explicitly recognize its exact path
and digest; arbitrary agent flags remain forbidden. Do not deploy the test control
agent or the synthetic native fixture. Preserve the original same-JVM/entity/window
acceptance checks and full video. Callback counts alone never establish defense.

## Why the earlier one-shot transformation was insufficient

Private v31 evidence shows the initial seven-slot transformation of FieldHandler
at `authority/host-1.log:330`, followed by the sample's report that it restored
611 classes at line 710, then incompatible reflection receiver exceptions at
lines 976 and 1049 and the inventory tick crash. The archive's ModMain calls
ClassBytecodeRestorer under `fixByte`; that component compares class bytes and
passes original bytes to WzzNative's native redefinition method.

Static PE analysis of the original `wzzapi.dll` shows `redefineClass` and
`redefineClassOfficial` share RVA `0xBCC0`. Their code obtains JVMTI 1.2 and calls
function-table slot 87 (`RedefineClasses`, offset `0x2B0` on x64), matching the
installed JDK's `jvmti.h`. The function does not check the return code. Therefore
the reported 611 restorations are not proof that every redefinition succeeded,
nor a definitive list that identifies FieldHandler. The observed restoration
path plus receiver interference strongly supports bytecode rollback as the next
failure boundary; it does not establish that this candidate has fixed real MC.

No sample DLL was executed in this analysis. Original sample and private native
disassembly remain outside the public source tree.
