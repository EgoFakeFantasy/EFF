# Third-party components

- Minecraft Forge 47.4.20+ (47.x): https://github.com/MinecraftForge/MinecraftForge , LGPL 2.1. Forge binaries are resolved by the build or the player's launcher and are not embedded in the EFF mod JAR.
- ForgeGradle 6: https://github.com/MinecraftForge/ForgeGradle , LGPL 2.1. Used for development, official mappings and production reobfuscation.
- Mixin and MixinGradle: https://github.com/SpongePowered/Mixin and https://github.com/SpongePowered/MixinGradle , MIT. The Mixin runtime is supplied by Forge; the annotation processor generates the EFF refmap.
- Gradle Wrapper: https://github.com/gradle/gradle , Apache License 2.0. The wrapper distribution URL and checksum specify the exact build tool version.
- Gson 2.10: https://github.com/google/gson , Apache License 2.0. Bundled only in the shared `eff-runtime-workers.jar`; license at [the shared runtime license](../mc-1.20.1/runtime/GSON-LICENSE.txt).
- Minecraft official mappings are used for development and reobfuscation under Mojang's mappings terms. Complete mappings and Minecraft binaries are not part of the EFF mod distribution.
- EFF gameplay and narrative scripts are reused from this repository; novel attribution remains in the root README.

No Minecraft binaries, Forge distribution, JDK, Node runtime, model weights, private manuscripts, sealed deployment secrets or test-world data are included in the EFF mod JAR. A locally prepared protected deployment copies and pins its own executable dependencies for that machine; it is not a redistributable game bundle.

## Optional 0.8.0 runtime kit

The separately labelled Windows research kit includes modified **ModLauncher 10.0.9**, **Forge coremods 5.2.4** and **FML early display 1.20.1-47.4.20** libraries. Corresponding upstream source archives and Maven metadata are included under `licenses/`; EFF modifications and patch generators are in this repository under `mc-forge-1.20.1/tools`. These are application-local copies, not replacements for system files. LGPL 2.1 terms are supplied with the kit; recipients may inspect, modify and rebuild these components under their applicable licenses. Changing a binary also requires regenerating EFF's content pins.

- ModLauncher: https://github.com/McModLauncher/modlauncher (10.0.9), LGPL 2.1.
- Coremods: https://github.com/MinecraftForge/CoreMods (5.2.4), LGPL 2.1.
- FML early display: https://github.com/MinecraftForge/MinecraftForge (1.20.1-47.4.20), LGPL 2.1.
- ASM / ASM Tree 9.9.1: https://asm.ow2.io/ , BSD 3-Clause; relocated into the startup agent. License and upstream source archives are supplied in `licenses/`.
- MinHook v1.3.4: https://github.com/TsudaKageyu/minhook/tree/c3fcafdc10146beb5919319d0683e44e3c30d537 , bundled in the native boundary; full upstream license is supplied in `licenses/MinHook-LICENSE.txt`.

The kit contains EFF's own mod, worker JAR, story bundle and guard. It does not bundle Minecraft, a JDK, third-party opponent mods, model weights, user saves or credentials. The fixed JDK must be supplied separately; runtime bytecode boundaries do not redistribute modified JDK binaries.
