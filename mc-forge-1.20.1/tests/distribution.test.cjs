"use strict";
// Validate the installable, reobfuscated JAR rather than a source-tree approximation.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const artifact = path.resolve(process.argv[2] || "build/libs/eff-minecraft-forge-1.20.1-0.5.2+mc1.20.1-forge.jar");
const javaHome = process.env.JAVA_HOME;
const jarTool = javaHome ? path.join(javaHome, "bin", process.platform === "win32" ? "jar.exe" : "jar") : "jar";
const jvm = ["-J-Xmx64m", "-J-XX:+UseSerialGC", "-J-XX:ActiveProcessorCount=2"];
const runJar = (args, cwd) => execFileSync(jarTool, [...jvm, ...args], { cwd, encoding: "utf8", windowsHide: true });
const names = runJar(["tf", artifact]).trim().split(/\r?\n/);
assert.equal(new Set(names).size, names.length, "duplicate archive entries");
assert(!names.includes("fabric.mod.json"), "Fabric metadata leaked into the Forge installable");
assert(!names.some(n => /^(net\/(minecraft|minecraftforge|fabricmc)\/|com\/mojang\/)/.test(n)), "game or loader binaries embedded in the mod");
assert(!names.some(n => /(^|\/)(sealed-runtime\.json|private-launch\.json|node_modules|saves)(\/|$)/.test(n)), "private deployment content in distribution");
const expected = [
  "META-INF/mods.toml", "META-INF/MANIFEST.MF", "pack.mcmeta", "eff.mixins.json", "eff.client.mixins.json",
  "eff-1201-refmap.json", "eff-story-runtime.zip", "data/eff/dimension/phenomenon.json",
  "data/eff/dimension_type/phenomenon.json", "eff/minecraft/EffMod.class",
  "eff/minecraft/EffPackets.class", "eff/minecraft/BridgeProcess.class",
  "eff/minecraft/client/EffClient.class", "eff/minecraft/client/NativeTheatre.class",
  "eff/minecraft/mixin/ServerLevelMixin.class", "eff/minecraft/mixin/ChunkMapAccessor.class",
  "eff/minecraft/mixin/GameRendererMixin.class"
];
for (const name of expected) assert(names.includes(name), `missing runtime entry ${name}`);
const tempRoot = fs.realpathSync(os.tmpdir());
const temp = fs.mkdtempSync(path.join(tempRoot, "eff-forge-distribution-"));
assert.equal(path.dirname(path.resolve(temp)), tempRoot, "temporary extraction escaped its root");
try {
  runJar(["xf", artifact, ...expected], temp);
  const read = name => fs.readFileSync(path.join(temp, name), "utf8");
  const meta = read("META-INF/mods.toml");
  assert.match(meta, /modLoader\s*=\s*"javafml"/);
  assert.match(meta, /modId\s*=\s*"eff"/);
  assert.match(meta, /versionRange\s*=\s*"\[47\.4\.20,48\)"/);
  assert.match(meta, /versionRange\s*=\s*"\[1\.20\.1\]"/);
  assert(!meta.includes("${"), "unexpanded release metadata");
  const manifest = read("META-INF/MANIFEST.MF").replace(/\r?\n /g, "");
  assert.match(manifest, /MixinConfigs:.*eff\.mixins\.json.*eff\.client\.mixins\.json/);
  assert.equal(JSON.parse(read("pack.mcmeta")).pack.pack_format, 15);
  const common = JSON.parse(read("eff.mixins.json"));
  const client = JSON.parse(read("eff.client.mixins.json"));
  assert.equal(common.minVersion, "0.8.5");
  assert.equal(client.minVersion, "0.8.5");
  assert(common.required && client.required, "simulation and rendering hooks must fail closed");
  assert(!common.mixins.includes("GameRendererMixin"), "client renderer installed on dedicated server");
  assert(client.client.includes("GameRendererMixin"));
  assert.equal(common.refmap, "eff-1201-refmap.json");
  assert.equal(client.refmap, common.refmap);
  const refmap = JSON.parse(read(common.refmap));
  const mapped = JSON.stringify(refmap.mappings);
  assert.match(mapped, /ServerLevelMixin/);
  assert.match(mapped, /ChunkMapAccessor/);
  assert.match(mapped, /GameRendererMixin/);
  assert.match(mapped, /m_\d+_/, "no SRG method mapping; dev-only refmap cannot install in production");
  for (const name of expected.filter(n => n.endsWith(".class"))) {
    const bytes = fs.readFileSync(path.join(temp, name));
    assert.equal(bytes.readUInt32BE(0), 0xcafebabe);
    assert.equal(bytes.readUInt16BE(6), 61, `${name} does not target Java 17`);
    assert(!bytes.includes(Buffer.from("net/fabricmc/")), `Fabric class linkage in ${name}`);
  }
  // @Shadow fields use Mixin AP supplemental SRG mappings, applied to bytecode by reobfJar.
  const freezeClass = fs.readFileSync(path.join(temp, "eff/minecraft/mixin/ServerLevelMixin.class"));
  assert(freezeClass.includes(Buffer.from("f_143244_")), "ServerLevel.entityManager shadow was not reobfuscated for MC 1.20.1");
  assert(fs.readFileSync(path.join(temp, "eff/minecraft/EffMod.class")).includes(Buffer.from("net/minecraftforge/fml/common/Mod")), "missing Forge entry annotation");
  assert(fs.readFileSync(path.join(temp, "eff/minecraft/EffPackets.class")).includes(Buffer.from("net/minecraftforge/network/simple/SimpleChannel")), "wrong networking runtime");
  const storyNames = runJar(["tf", path.join(temp, "eff-story-runtime.zip")]).trim().split(/\r?\n/);
  for (const n of ["bridge/server.cjs", "bridge/story-host.cjs", "desktop/model-client.cjs", "pixel-version/game.js"])
    assert(storyNames.includes(n), `missing story dependency ${n}`);
  assert(!storyNames.some(n => /(^|\/)(node_modules|saves|models)(\/|$)|\.(gguf|safetensors)$/i.test(n)), "private or model content embedded");
  console.log("Forge production distribution checks passed: " + path.basename(artifact));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
