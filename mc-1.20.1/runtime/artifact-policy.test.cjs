"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const zlib = require("node:zlib"), { createHash } = require("node:crypto");
const { inspectArtifact, assertArtifactPolicy, LIMITS } = require("./artifact-policy.cjs");

function crc32(bytes) {
  let n = 0xffffffff;
  for (const byte of bytes) { n ^= byte; for (let k = 0; k < 8; k++) n = n & 1 ? (n >>> 1) ^ 0xedb88320 : n >>> 1; }
  return (n ^ 0xffffffff) >>> 0;
}
// Safe synthetic ZIPs, built in memory. No Java target or executable is run.
function zip(items, comment = "") {
  const local = [], central = []; let offset = 0;
  for (const item of items) {
    const name = Buffer.from(item.name), data = Buffer.from(item.data || ""),
      method = item.method ?? 8, flags = 0x800 | (item.descriptor ? 8 : 0),
      compressed = method === 8 ? zlib.deflateRawSync(data) : data,
      crc = crc32(data), size = item.declaredSize ?? data.length;
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4);
    header.writeUInt16LE(flags, 6); header.writeUInt16LE(method, 8);
    if (!item.descriptor) { header.writeUInt32LE(crc, 14); header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(size, 22); }
    header.writeUInt16LE(name.length, 26);
    const descriptor = item.descriptor ? Buffer.alloc(16) : Buffer.alloc(0);
    if (item.descriptor) { descriptor.writeUInt32LE(0x08074b50); descriptor.writeUInt32LE(crc, 4); descriptor.writeUInt32LE(compressed.length, 8); descriptor.writeUInt32LE(size, 12); }
    local.push(header, name, compressed, descriptor);
    const index = Buffer.alloc(46); index.writeUInt32LE(0x02014b50); index.writeUInt16LE(20, 4); index.writeUInt16LE(20, 6);
    index.writeUInt16LE(flags, 8); index.writeUInt16LE(method, 10); index.writeUInt32LE(crc, 16);
    index.writeUInt32LE(compressed.length, 20); index.writeUInt32LE(size, 24); index.writeUInt16LE(name.length, 28);
    index.writeUInt32LE(item.attributes ?? 0, 38); index.writeUInt32LE(item.localOffset ?? offset, 42);
    central.push(index, name); offset += header.length + name.length + compressed.length + descriptor.length;
  }
  const index = Buffer.concat(central), end = Buffer.alloc(22), tail = Buffer.from(comment);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(items.length, 8); end.writeUInt16LE(items.length, 10);
  end.writeUInt32LE(index.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(tail.length, 20);
  return Buffer.concat([...local, index, end, tail]);
}
function classFile(extra = []) {
  const pool = [], u2 = n => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; };
  const utf = value => { const b = Buffer.from(value); pool.push(Buffer.concat([Buffer.from([1]), u2(b.length), b])); return pool.length; };
  const clazz = value => { const i = utf(value); pool.push(Buffer.concat([Buffer.from([7]), u2(i)])); return pool.length; };
  const self = clazz("fixture/Example"), parent = clazz("java/lang/Object");
  for (const value of extra) {
    if (typeof value === "string") { utf(value); continue; }
    const owner = clazz(value.owner), name = utf(value.method), descriptor = utf(value.descriptor || "()V");
    pool.push(Buffer.concat([Buffer.from([12]), u2(name), u2(descriptor)])); const pair = pool.length;
    pool.push(Buffer.concat([Buffer.from([10]), u2(owner), u2(pair)]));
  }
  const header = Buffer.from([0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 61]);
  return Buffer.concat([header, u2(pool.length + 1), ...pool, u2(0x21), u2(self), u2(parent),
    u2(0), u2(0), u2(0), u2(0)]);
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eff-artifact-policy-")); let n = 0;
  t.after(() => {
    const real = fs.realpathSync(root), base = fs.realpathSync(os.tmpdir());
    assert.equal(path.dirname(real), base); assert.match(path.basename(real), /^eff-artifact-policy-/);
    fs.rmSync(real, { recursive: true, force: true });
  });
  return bytes => { const file = path.join(root, (++n) + ".jar"); fs.writeFileSync(file, bytes); return file; };
}
const kinds = report => report.risks.map(r => r.kind);

test("ordinary resources and RuntimeException do not become executable capability evidence", t => {
  const file = fixture(t), bytes = zip([
    { name: "META-INF/MANIFEST.MF", data: "Manifest-Version: 1.0\r\n\r\n", descriptor: true },
    { name: "fixture/Example.class", data: classFile(["java/lang/RuntimeException", "notjava/lang/ProcessBuilder"]), descriptor: true },
    { name: "assets/normal.txt", data: "ordinary text", method: 0 },
  ], "comment with PK magic");
  const p = file(bytes), report = inspectArtifact(p);
  assert.equal(report.schema, 1); assert.equal(report.coverage.executed, false);
  assert.equal(report.sha256, createHash("sha256").update(bytes).digest("hex"));
  assert.equal(report.entryCount, 3); assert.equal(report.scannedEntries, 2); assert.deepEqual(report.risks, []);
  assert.equal(assertArtifactPolicy(report), report); assert.deepEqual(fs.readFileSync(p), bytes);
  assert.ok(report.limitations.some(s => s.includes("not proof of safety")));
});

test("agent manifest, core/launch services, mixin metadata, native and script resources are explicit candidates", t => {
  const file = fixture(t), report = inspectArtifact(file(zip([
    { name: "META-INF/MANIFEST.MF", data: "Manifest-Version: 1.0\r\nPremain-Class: example.\r\n Agent\r\nCan-Retransform-Classes: true\r\nFMLCorePlugin: example.Core\r\nMixinConfigs: example.mixins.json\r\n\r\n" },
    { name: "META-INF/services/cpw.mods.modlauncher.api.ITransformationService", data: "# comment\nexample.Core\n" },
    { name: "META-INF/services/cpw.mods.modlauncher.serviceapi.ILaunchPluginService", data: "example.Plugin\n" },
    { name: "META-INF/coremods.json", data: "{}" },
    { name: "META-INF/accesstransformer.cfg", data: "public example.Field" },
    { name: "lib/helper.dll", data: "synthetic bytes, never executable", method: 0 },
    { name: "startup.bat", data: "synthetic fixture" },
    { name: "embedded.jar", data: "synthetic fixture" },
  ])));
  for (const expected of ["agent-manifest", "startup-service", "bytecode-transformer", "native-library", "executable-resource"]) assert.ok(kinds(report).includes(expected));
  assert.throws(() => assertArtifactPolicy(report), { code: "UNAPPROVED_MOD_CAPABILITY" });
  assert.equal(assertArtifactPolicy(report, { allowRisky: true }), report);
});

test("constant pool owners and method references distinguish execution, Unsafe, agents and dynamic definition", t => {
  const file = fixture(t), report = inspectArtifact(file(zip([{ name: "fixture/Example.class", data: classFile([
    "java/lang/ProcessBuilder", "sun/misc/Unsafe", "jdk/internal/misc/Unsafe",
    "java/lang/instrument/Instrumentation", "com/sun/tools/attach/VirtualMachine",
    { owner: "java/lang/Runtime", method: "exec", descriptor: "(Ljava/lang/String;)Ljava/lang/Process;" },
    { owner: "java/lang/System", method: "load", descriptor: "(Ljava/lang/String;)V" },
    { owner: "java/lang/invoke/MethodHandles$Lookup", method: "defineHiddenClass" },
  ]) }])));
  for (const expected of ["process-execution", "unsafe-access", "runtime-instrumentation", "dynamic-class-definition", "native-loading"]) assert.ok(kinds(report).includes(expected));
  assert.throws(() => assertArtifactPolicy(report), /UNAPPROVED_MOD_CAPABILITY/);
  const harmless = inspectArtifact(file(zip([{ name: "Example.class", data: classFile([{ owner: "java/lang/Runtime", method: "availableProcessors", descriptor: "()I" }]) }])));
  assert.deepEqual(harmless.risks, []);
});

test("duplicate, case/Unicode aliases and unsafe Windows or traversal paths fail closed", t => {
  const file = fixture(t);
  for (const pair of [["same.txt", "same.txt"], ["Same.txt", "same.txt"], ["caf\u00e9.txt", "cafe\u0301.txt"], ["thing", "thing/"]]) {
    assert.throws(() => inspectArtifact(file(zip(pair.map(name => ({ name }))))), { code: "ARTIFACT_DUPLICATE_PATH" });
  }
  for (const name of ["../outside", "a/../outside", "/absolute", "C:/absolute", "a\\b", "x:ads", "a//b", "a/./b", "nul.txt", "x. ", "bad\u0000name"]) {
    assert.throws(() => inspectArtifact(file(zip([{ name }]))), { code: "ARTIFACT_PATH_INVALID" });
  }
  assert.throws(() => inspectArtifact(file(zip([{ name: "link", attributes: 0xa1ff0000 }]))), { code: "ARTIFACT_SPECIAL_ENTRY" });
});

test("truncation, corrupt metadata, unsupported compression/encryption and payload CRC fail closed", t => {
  const file = fixture(t), good = zip([{ name: "normal.txt", data: "hello", method: 0 }]);
  for (const bytes of [Buffer.alloc(0), Buffer.from("not a ZIP"), good.subarray(0, good.length - 3)]) assert.throws(() => inspectArtifact(file(bytes)), /ARTIFACT_/);
  const wrongName = Buffer.from(good); wrongName[30] ^= 1; assert.throws(() => inspectArtifact(file(wrongName)), /ARTIFACT_ZIP_INVALID/);
  const encrypted = Buffer.from(good); encrypted.writeUInt16LE(0x801, 6); encrypted.writeUInt16LE(0x801, 30 + 10 + 5 + 8); assert.throws(() => inspectArtifact(file(encrypted)), /ARTIFACT_ZIP_FLAGS_UNSUPPORTED/);
  const crc = Buffer.from(good); crc[30 + Buffer.byteLength("normal.txt")] ^= 1; assert.throws(() => inspectArtifact(file(crc)), /ARTIFACT_ZIP_CRC/);
  const zip64 = Buffer.from(good); zip64.writeUInt32LE(0xffffffff, zip64.length - 22 + 16); assert.throws(() => inspectArtifact(file(zip64)), /ARTIFACT_ZIP64_UNSUPPORTED/);
  const method = Buffer.from(good); const central = method.readUInt32LE(method.length - 22 + 16); method.writeUInt16LE(99, central + 10); assert.throws(() => inspectArtifact(file(method)), /ARTIFACT_ZIP_METHOD_UNSUPPORTED/);
});

test("declared entry, expanded total and selected metadata limits are enforced before allocation", t => {
  const file = fixture(t);
  assert.throws(() => inspectArtifact(file(zip([{ name: "large", declaredSize: LIMITS.entryBytes + 1 }]))), /ARTIFACT_BUDGET/);
  assert.throws(() => inspectArtifact(file(zip(Array.from({ length: 5 }, (_, i) => ({ name: "resource" + i, declaredSize: LIMITS.entryBytes }))))), /ARTIFACT_BUDGET/);
  assert.throws(() => inspectArtifact(file(zip([{ name: "TooLarge.class", declaredSize: LIMITS.selectedEntryBytes + 1 }]))), /ARTIFACT_SCAN_BUDGET/);
  const many = zip([]); many.writeUInt16LE(LIMITS.entries + 1, 8); many.writeUInt16LE(LIMITS.entries + 1, 10); assert.throws(() => inspectArtifact(file(many)), /ARTIFACT_BUDGET/);
});

test("malformed class constant pools and text inputs cannot silently become clean reports", t => {
  const file = fixture(t);
  for (const data of [Buffer.from("not a class"), classFile().subarray(0, 24), Buffer.concat([classFile(), Buffer.from([0])])]) assert.throws(() => inspectArtifact(file(zip([{ name: "Bad.class", data }]))), /ARTIFACT_CLASS_INVALID/);
  assert.throws(() => inspectArtifact(file(zip([{ name: "META-INF/MANIFEST.MF", data: "broken manifest" }]))), /ARTIFACT_MANIFEST_INVALID/);
  assert.throws(() => inspectArtifact(file(zip([{ name: "META-INF/MANIFEST.MF", data: "Agent-Class : hidden.Agent\n" }]))), /ARTIFACT_MANIFEST_INVALID/);
  assert.throws(() => inspectArtifact(file(zip([{ name: "META-INF/MANIFEST.MF", data: "Agent-Class:\x00 hidden.Agent\n" }]))), /ARTIFACT_MANIFEST_INVALID/);
  assert.throws(() => inspectArtifact(file(zip([{ name: "META-INF/coremods.json", data: "{" }]))), /ARTIFACT_COREMOD_INVALID/);
  assert.throws(() => inspectArtifact(file(zip([{ name: "META-INF/MANIFEST.MF", data: Buffer.from([0xff]) }]))), /ARTIFACT_TEXT_INVALID/);
});

test("policy rejects malformed or duplicate risk reports and truthy nonboolean opt-ins", t => {
  const file = fixture(t), report = inspectArtifact(file(zip([{ name: "normal.txt", data: "hi" }])));
  assert.throws(() => assertArtifactPolicy({ risks: [] }), /ARTIFACT_REPORT_INVALID/);
  assert.throws(() => assertArtifactPolicy(report, { allowRisky: "true" }), /ARTIFACT_POLICY_OPTION/);
  assert.throws(() => assertArtifactPolicy({ ...report, risks: [{ kind: "unknown", entries: ["x"] }] }), /ARTIFACT_REPORT_INVALID/);
  assert.throws(() => assertArtifactPolicy({ ...report, risks: [{ kind: "unsafe-access", entries: [] }] }), /ARTIFACT_REPORT_INVALID/);
  const risk = { kind: "unsafe-access", entries: ["x.class"] };
  assert.throws(() => assertArtifactPolicy({ ...report, risks: [risk, risk] }, { allowRisky: true }), /ARTIFACT_REPORT_INVALID/);
});
