# Actual index storage reader regression

Run from the repository root:

```
node mc-forge-1.20.1/tools/entity-index-test/run.cjs
```

The runner compiles the actual production `EntityIndexStorage.java` with the real
fastutil 8.5.9 jar and runs on JDK 17 using `-Xverify:all -Xmx128m`. Set
`JAVA_HOME` or `EFF_FASTUTIL_JAR` to override the local checked tool paths.
No `--add-opens java.base/java.util` flag is used. A check requires
`HashMap.table.trySetAccessible()` to fail, proving that the test process has not
silently received that package opening.

Synthetic map subclasses hide their virtual queries and shadow storage fields.
The actual reader must still use the inherited original storage, and must return
absence after an actual deletion. Tests also cover both real fastutil map kinds,
zero IDs, empty maps, detached stale slots, UUID collision/tree bins, current
delegate wrappers, cycles, depth bounds, and unknown shapes.

Each invocation retains a new ignored `run-*` directory with compiled classes
and a receipt recording production source and dependency SHA-256. No cleanup is
performed. These checks do not load Minecraft, run an opponent mod, or establish
in-game entity survival.
