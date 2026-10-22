# Third-party components

- Minecraft Forge 47.4.20+ (47.x): https://github.com/MinecraftForge/MinecraftForge , LGPL 2.1. Forge binaries are resolved by the build or the player's launcher and are not embedded in the EFF mod JAR.
- ForgeGradle 6: https://github.com/MinecraftForge/ForgeGradle , LGPL 2.1. Used for development, official mappings and production reobfuscation.
- Mixin and MixinGradle: https://github.com/SpongePowered/Mixin and https://github.com/SpongePowered/MixinGradle , MIT. The Mixin runtime is supplied by Forge; the annotation processor generates the EFF refmap.
- Gradle Wrapper: https://github.com/gradle/gradle , Apache License 2.0. The wrapper distribution URL and checksum specify the exact build tool version.
- Gson 2.10: https://github.com/google/gson , Apache License 2.0. Bundled only in the shared `eff-runtime-workers.jar`; license at [the shared runtime license](../mc-1.20.1/runtime/GSON-LICENSE.txt).
- Minecraft official mappings are used for development and reobfuscation under Mojang's mappings terms. Complete mappings and Minecraft binaries are not part of the EFF mod distribution.
- EFF gameplay and narrative scripts are reused from this repository; novel attribution remains in the root README.

No Minecraft binaries, Forge distribution, JDK, Node runtime, model weights, private manuscripts, sealed deployment secrets or test-world data are included in the EFF mod JAR. A locally prepared protected deployment copies and pins its own executable dependencies for that machine; it is not a redistributable game bundle.
