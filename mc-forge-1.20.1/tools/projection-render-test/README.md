# Projection render boundary offline checks

Run from repository root: `node mc-forge-1.20.1/tools/projection-render-test/run.cjs`.
Set `JAVA_HOME` to JDK 17; the local checked JDK is the fallback.

The runner compiles the actual production `ProjectionRenderBoundary.java` against
small isolated MC API stubs, then runs with `-Xverify:all` and 128 MB heap. Each run
uses a new retained `run-*` folder and records the production source SHA-256. It
does not start Minecraft, operate an opponent mod, modify an existing recording,
or delete files.

Checks distinguish current registered objects from absent/replaced identities,
test ordinary dispatch behavior and frustum rejection, and require actual
removal/invalid health to suppress drawing. A failed draw must restore the pose
stack and must not increment the successful-return receipt.

This verifies boundary branch behavior only. The raw index/health probes and
Minecraft renderer are stubs here; this is not evidence that mixin call sites,
actual GPU rendering, or continuity under a real attack pass. `drawCount` means
the renderer call returned, not that pixels were independently observed.
