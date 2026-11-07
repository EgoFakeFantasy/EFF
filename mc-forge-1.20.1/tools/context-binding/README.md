# Idempotent early renderer binding candidate

Run `node mc-forge-1.20.1/tools/context-binding/build-and-test.cjs [original-renderer.jar]` from this repository. Uses the existing local JDK 17 and ASM dependencies; downloads nothing. The reviewed Forge 47.4.20 renderer hash is mandatory. Output is private and content addressed, with an original/patched SHA-256 receipt. The script never installs a library or starts Minecraft.

Only `DisplayWindow.renderThreadFunc`'s `this.window` binding is redirected to a new private helper. The helper calls `glfwGetCurrentContext` and binds only if the target differs. Initial context transfer, early-window rendering, buffer swaps, all detach calls, mod initialization, and existing exception handling remain unchanged. No mod names are inspected.

The patcher proves the JAR entry set is unchanged and only DisplayWindow bytes differ. Reversing the one call replacement and removing the helper must restore the parsed class exactly, including all other method bodies and metadata. Existing frames are retained; the new helper has an explicit stack-map frame and no extra dependency.

Offline tests execute actual ASM-generated helper bytecode with a JVM-verified synthetic GLFW boundary: same/different/empty contexts, detach, exception identity, per-thread ownership, and original redundant-binding negative control. They do not load graphics natives or the opponent. They establish these local semantics, not success against the observed native loader race. Full MC baseline and combat recording remain necessary.

Ordering investigation: the reviewed Forge Minecraft constructor already completes Window creation/context transfer before `ClientModLoader.begin`. Its mod-loading wait loop invokes `ImmediateWindowHandler.renderTick`, which delegates `DisplayWindow.periodicTick` to `renderThreadFunc`. That function repeatedly binds the same context during loading. Deferring constructors merely until initial transfer is redundant; delaying until mod loading completes creates a dependency cycle. This candidate only removes the redundant later binding entry and preserves normal loading order.
