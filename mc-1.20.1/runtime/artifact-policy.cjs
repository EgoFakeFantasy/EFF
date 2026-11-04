"use strict";
// Static capability candidates only. This reader never extracts, links or executes a target.
const fs = require("node:fs");
const zlib = require("node:zlib");
const { createHash } = require("node:crypto");
const { TextDecoder } = require("node:util");

const LIMITS = Object.freeze({
  archiveBytes: 64 * 1024 * 1024,
  entries: 8192,
  entryBytes: 32 * 1024 * 1024,
  expandedBytes: 128 * 1024 * 1024,
  selectedEntryBytes: 8 * 1024 * 1024,
  scannedBytes: 32 * 1024 * 1024,
  nameBytes: 2048,
});
const utf8 = new TextDecoder("utf-8", { fatal: true });
const kinds = new Set([
  "agent-manifest", "startup-service", "bytecode-transformer", "native-library",
  "executable-resource", "process-execution", "unsafe-access",
  "dynamic-class-definition", "runtime-instrumentation", "native-loading",
]);
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function need(ok, code = "ARTIFACT_ZIP_INVALID") { if (!ok) fail(code); }

const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
function decode(bytes, code) {
  try { return utf8.decode(bytes); } catch { fail(code); }
}
function canonicalName(bytes, flags) {
  need(bytes.length > 0 && bytes.length <= LIMITS.nameBytes, "ARTIFACT_PATH_INVALID");
  if (!(flags & 0x800)) need(bytes.every(b => b < 128), "ARTIFACT_ZIP_NAME_ENCODING");
  const name = decode(bytes, "ARTIFACT_PATH_INVALID");
  need(!/[\\:\x00-\x1f\x7f]/u.test(name) && !name.startsWith("/"), "ARTIFACT_PATH_INVALID");
  const parts = name.endsWith("/") ? name.slice(0, -1).split("/") : name.split("/");
  need(parts.every(p => p && p !== "." && p !== ".." && !/[. ]$/u.test(p)
    && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)), "ARTIFACT_PATH_INVALID");
  return { name, key: name.normalize("NFC").toLowerCase().replace(/\/$/, "") };
}
function checkExtra(bytes) {
  for (let at = 0; at < bytes.length;) {
    need(at + 4 <= bytes.length);
    const id = bytes.readUInt16LE(at), size = bytes.readUInt16LE(at + 2);
    need(id !== 1, "ARTIFACT_ZIP64_UNSUPPORTED");
    at += 4 + size; need(at <= bytes.length);
  }
}
function readArchive(file) {
  const fd = fs.openSync(file, "r");
  try {
    const stat = fs.fstatSync(fd);
    need(stat.isFile() && stat.size >= 22, "ARTIFACT_ZIP_INVALID");
    need(stat.size <= LIMITS.archiveBytes, "ARTIFACT_BUDGET");
    const bytes = Buffer.alloc(stat.size);
    let at = 0;
    while (at < bytes.length) {
      const count = fs.readSync(fd, bytes, at, bytes.length - at, at);
      need(count > 0, "ARTIFACT_CHANGED_DURING_READ"); at += count;
    }
    const tail = Buffer.alloc(1);
    need(fs.readSync(fd, tail, 0, 1, at) === 0 && fs.fstatSync(fd).size === stat.size,
      "ARTIFACT_CHANGED_DURING_READ");
    return bytes;
  } finally { fs.closeSync(fd); }
}
function zipIndex(bytes) {
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65557); at--) {
    if (bytes.readUInt32LE(at) === 0x06054b50 && at + 22 + bytes.readUInt16LE(at + 20) === bytes.length) {
      end = at; break;
    }
  }
  need(end >= 0);
  need(bytes.readUInt16LE(end + 4) === 0 && bytes.readUInt16LE(end + 6) === 0,
    "ARTIFACT_MULTIDISK_UNSUPPORTED");
  const count = bytes.readUInt16LE(end + 10), length = bytes.readUInt32LE(end + 12),
    start = bytes.readUInt32LE(end + 16);
  need(count !== 65535 && length !== 0xffffffff && start !== 0xffffffff, "ARTIFACT_ZIP64_UNSUPPORTED");
  need(bytes.readUInt16LE(end + 8) === count && count <= LIMITS.entries, "ARTIFACT_BUDGET");
  need(start + length === end);
  const entries = [], names = new Set();
  let at = start, expanded = 0;
  for (let n = 0; n < count; n++) {
    need(at + 46 <= end && bytes.readUInt32LE(at) === 0x02014b50);
    const flags = bytes.readUInt16LE(at + 8), method = bytes.readUInt16LE(at + 10),
      crc = bytes.readUInt32LE(at + 16), compressed = bytes.readUInt32LE(at + 20),
      size = bytes.readUInt32LE(at + 24), nameLength = bytes.readUInt16LE(at + 28),
      extraLength = bytes.readUInt16LE(at + 30), commentLength = bytes.readUInt16LE(at + 32),
      disk = bytes.readUInt16LE(at + 34), mode = bytes.readUInt32LE(at + 38) >>> 16,
      local = bytes.readUInt32LE(at + 42);
    need((flags & ~0x80e) === 0 && !(flags & 1), "ARTIFACT_ZIP_FLAGS_UNSUPPORTED");
    need(method === 0 || method === 8, "ARTIFACT_ZIP_METHOD_UNSUPPORTED");
    need(disk === 0 && local !== 0xffffffff && compressed !== 0xffffffff && size !== 0xffffffff,
      "ARTIFACT_ZIP64_UNSUPPORTED");
    need([0, 0x8000, 0x4000].includes(mode & 0xf000), "ARTIFACT_SPECIAL_ENTRY");
    need(size <= LIMITS.entryBytes && (expanded += size) <= LIMITS.expandedBytes, "ARTIFACT_BUDGET");
    const next = at + 46 + nameLength + extraLength + commentLength;
    need(next <= end);
    const rawName = bytes.subarray(at + 46, at + 46 + nameLength);
    const { name, key } = canonicalName(rawName, flags);
    need(!names.has(key), "ARTIFACT_DUPLICATE_PATH"); names.add(key);
    checkExtra(bytes.subarray(at + 46 + nameLength, at + 46 + nameLength + extraLength));
    need(local + 30 <= start && bytes.readUInt32LE(local) === 0x04034b50);
    need(bytes.readUInt16LE(local + 6) === flags && bytes.readUInt16LE(local + 8) === method);
    const localName = bytes.readUInt16LE(local + 26), localExtra = bytes.readUInt16LE(local + 28),
      data = local + 30 + localName + localExtra;
    need(data + compressed <= start && localName === nameLength
      && bytes.subarray(local + 30, local + 30 + localName).equals(rawName));
    checkExtra(bytes.subarray(local + 30 + localName, data));
    let finish = data + compressed;
    if (flags & 8) {
      need(finish + 12 <= start);
      if (bytes.readUInt32LE(finish) === 0x08074b50) finish += 4;
      need(finish + 12 <= start && bytes.readUInt32LE(finish) === crc
        && bytes.readUInt32LE(finish + 4) === compressed && bytes.readUInt32LE(finish + 8) === size);
      finish += 12;
    } else {
      need(bytes.readUInt32LE(local + 14) === crc && bytes.readUInt32LE(local + 18) === compressed
        && bytes.readUInt32LE(local + 22) === size);
    }
    need(method !== 0 || compressed === size);
    need(!name.endsWith("/") || size === 0);
    entries.push({ name, flags, method, crc, compressed, size, local, data, finish });
    at = next;
  }
  need(at === end);
  const ordered = [...entries].sort((a, b) => a.local - b.local);
  need(ordered.length ? ordered[0].local === 0 : start === 0, "ARTIFACT_PREFIX_UNSUPPORTED");
  for (let n = 1; n < ordered.length; n++) need(ordered[n].local >= ordered[n - 1].finish, "ARTIFACT_ZIP_OVERLAP");
  return entries;
}
function content(bytes, entry, selected = true) {
  const limit = selected ? LIMITS.selectedEntryBytes : LIMITS.entryBytes;
  need(entry.size <= limit, "ARTIFACT_SCAN_BUDGET");
  const compressed = bytes.subarray(entry.data, entry.data + entry.compressed);
  let value;
  try { value = entry.method === 0 ? compressed
    : zlib.inflateRawSync(compressed, { maxOutputLength: Math.min(limit, entry.size) + 1 }); }
  catch { fail("ARTIFACT_ZIP_INFLATE"); }
  need(value.length === entry.size && crc32(value) === entry.crc, "ARTIFACT_ZIP_CRC");
  return value;
}
// JVM constant pools use modified UTF-8 (including NUL and UTF-16 surrogate code units).
function modifiedUtf8(bytes) {
  const codes = [];
  for (let n = 0; n < bytes.length;) {
    const a = bytes[n++];
    if (a > 0 && a < 128) { codes.push(a); continue; }
    if ((a & 0xe0) === 0xc0) {
      need(n < bytes.length && (bytes[n] & 0xc0) === 0x80, "ARTIFACT_CLASS_INVALID");
      const code = ((a & 31) << 6) | (bytes[n++] & 63);
      need(code >= 128 || code === 0 && a === 0xc0, "ARTIFACT_CLASS_INVALID"); codes.push(code); continue;
    }
    need((a & 0xf0) === 0xe0 && n + 1 < bytes.length
      && (bytes[n] & 0xc0) === 0x80 && (bytes[n + 1] & 0xc0) === 0x80, "ARTIFACT_CLASS_INVALID");
    const code = ((a & 15) << 12) | ((bytes[n++] & 63) << 6) | (bytes[n++] & 63);
    need(code >= 2048, "ARTIFACT_CLASS_INVALID"); codes.push(code);
  }
  let out = "";
  for (let n = 0; n < codes.length; n += 4096) out += String.fromCharCode(...codes.slice(n, n + 4096));
  return out;
}
function classSignals(bytes) {
  let at = 0;
  const take = n => { need(n >= 0 && at + n <= bytes.length, "ARTIFACT_CLASS_INVALID"); const start = at; at += n; return start; };
  const u1 = () => bytes[take(1)], u2 = () => bytes.readUInt16BE(take(2)), u4 = () => bytes.readUInt32BE(take(4));
  need(u4() === 0xcafebabe, "ARTIFACT_CLASS_INVALID"); u2(); need(u2() >= 45, "ARTIFACT_CLASS_INVALID");
  const count = u2(), pool = new Array(count); need(count > 0, "ARTIFACT_CLASS_INVALID");
  for (let n = 1; n < count; n++) {
    const tag = u1(), item = { tag }; pool[n] = item;
    if (tag === 1) { const size = u2(); item.text = modifiedUtf8(bytes.subarray(at, at + size)); take(size); }
    else if (tag === 3 || tag === 4) take(4);
    else if (tag === 5 || tag === 6) { take(8); need(++n < count, "ARTIFACT_CLASS_INVALID"); }
    else if ([7, 8, 16, 19, 20].includes(tag)) item.a = u2();
    else if ([9, 10, 11, 12, 17, 18].includes(tag)) { item.a = u2(); item.b = u2(); }
    else if (tag === 15) { item.a = u1(); item.b = u2(); }
    else fail("ARTIFACT_CLASS_INVALID");
  }
  const get = (index, tags) => { const item = pool[index]; need(item && tags.includes(item.tag), "ARTIFACT_CLASS_INVALID"); return item; };
  const text = index => get(index, [1]).text;
  const strings = new Set(pool.filter(x => x?.tag === 1).map(x => x.text));
  const signals = new Set();
  if (strings.has("java/lang/ProcessBuilder")) signals.add("process-execution");
  if (strings.has("sun/misc/Unsafe") || strings.has("jdk/internal/misc/Unsafe")) signals.add("unsafe-access");
  if (["java/lang/instrument/Instrumentation", "java/lang/instrument/ClassFileTransformer", "com/sun/tools/attach/VirtualMachine", "sun/tools/attach/HotSpotVirtualMachine"].some(x => strings.has(x))) signals.add("runtime-instrumentation");
  for (const item of pool) {
    if (!item) continue;
    if ([7, 8, 16, 19, 20].includes(item.tag)) text(item.a);
    if (item.tag === 12) { text(item.a); text(item.b); }
    if ([9, 10, 11].includes(item.tag)) {
      const owner = text(get(item.a, [7]).a), pair = get(item.b, [12]), method = text(pair.a); text(pair.b);
      if (owner === "java/lang/Runtime" && method === "exec") signals.add("process-execution");
      if (["java/lang/System", "java/lang/Runtime"].includes(owner) && ["load", "loadLibrary"].includes(method)) signals.add("native-loading");
      if ((owner === "java/lang/ClassLoader" && method === "defineClass")
        || (owner === "java/lang/invoke/MethodHandles$Lookup" && ["defineClass", "defineHiddenClass", "defineHiddenClassWithClassData"].includes(method))
        || (["sun/misc/Unsafe", "jdk/internal/misc/Unsafe"].includes(owner) && ["defineClass", "defineAnonymousClass"].includes(method))) signals.add("dynamic-class-definition");
    }
    if ([17, 18].includes(item.tag)) get(item.b, [12]);
    if (item.tag === 15) { need(item.a >= 1 && item.a <= 9, "ARTIFACT_CLASS_INVALID"); get(item.b, [9, 10, 11]); }
  }
  u2(); get(u2(), [7]); const superclass = u2(); if (superclass) get(superclass, [7]);
  for (let n = u2(); n > 0; n--) get(u2(), [7]);
  const attributes = () => { for (let n = u2(); n > 0; n--) { text(u2()); take(u4()); } };
  for (let group = 0; group < 2; group++) {
    for (let n = u2(); n > 0; n--) { u2(); text(u2()); text(u2()); attributes(); }
  }
  attributes(); need(at === bytes.length, "ARTIFACT_CLASS_INVALID");
  return signals;
}
function manifestRisks(value, mark, name) {
  const logical = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n /g, "");
  for (const line of logical.split("\n")) {
    if (!line) continue;
    const colon = line.indexOf(":");
    need(colon > 0 && /^[A-Za-z0-9_-]{1,70}$/.test(line.slice(0, colon))
      && line[colon + 1] === " " && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(line), "ARTIFACT_MANIFEST_INVALID");
    const key = line.slice(0, colon).toLowerCase(), text = line.slice(colon + 1).trim();
    if (!text) continue;
    if (["premain-class", "agent-class", "launcher-agent-class", "boot-class-path"].includes(key)
      || ["can-redefine-classes", "can-retransform-classes"].includes(key) && text.toLowerCase() === "true") mark("agent-manifest", name);
    if (["fmlcoreplugin", "tweakclass"].includes(key)) mark("startup-service", name);
    if (key === "mixinconfigs") mark("bytecode-transformer", name);
  }
}
function inspectArtifact(file) {
  const bytes = readArchive(file), entries = zipIndex(bytes), found = new Map();
  const mark = (kind, name) => { if (!found.has(kind)) found.set(kind, new Set()); found.get(kind).add(name); };
  let scannedEntries = 0, scannedBytes = 0;
  for (const entry of entries) {
    const lower = entry.name.toLowerCase(); if (lower.endsWith("/")) continue;
    if (/\.(dll|dylib|jnilib|so(?:\.[0-9]+)*)$/i.test(lower)) mark("native-library", entry.name);
    if (/\.(exe|com|bat|cmd|ps1|psm1|vbs|vbe|wsf|wsh|js|jse|sh|bash|zsh|py|pyw|jar)$/i.test(lower)) mark("executable-resource", entry.name);
    const manifest = lower === "meta-inf/manifest.mf", service = lower.startsWith("meta-inf/services/"),
      coremod = lower === "meta-inf/coremods.json", access = lower === "meta-inf/accesstransformer.cfg",
      javaClass = lower.endsWith(".class");
    if (!(manifest || service || coremod || access || javaClass)) {
      content(bytes, entry, false); // Bounded CRC/length validation even for uninspected resource semantics.
      continue;
    }
    need((scannedBytes += entry.size) <= LIMITS.scannedBytes, "ARTIFACT_SCAN_BUDGET"); scannedEntries++;
    const value = content(bytes, entry);
    if (javaClass) { for (const kind of classSignals(value)) mark(kind, entry.name); continue; }
    const text = decode(value, "ARTIFACT_TEXT_INVALID");
    if (manifest) manifestRisks(text, mark, entry.name);
    if (service && text.split(/\r?\n/).some(x => x.replace(/#.*/, "").trim())) mark("startup-service", entry.name);
    if (coremod) { try { JSON.parse(text); } catch { fail("ARTIFACT_COREMOD_INVALID"); } mark("startup-service", entry.name); }
    if (access) mark("bytecode-transformer", entry.name);
  }
  return {
    schema: 1, sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length,
    entryCount: entries.length, scannedEntries, scannedBytes,
    assessment: "static-capability-candidates",
    risks: [...found].sort(([a], [b]) => a.localeCompare(b)).map(([kind, names]) => ({ kind, entries: [...names].sort() })),
    coverage: { zip: "classic-stored-or-deflated-all-members-crc-checked", classScan: "constant-pool-and-envelope-not-bytecode-verification", resourceScan: "selected-metadata-and-class-members", executed: false, limits: LIMITS },
    limitations: [
      "Markers describe static capability candidates, not observed execution or malicious intent.",
      "No markers is not proof of safety; reflection, encrypted/extensionless resources, native behavior and dynamically fetched inputs may evade this scan.",
      "Archive bytes were read only; this report does not lock files, attest a running JVM, or establish publisher trust.",
    ],
  };
}
function assertArtifactPolicy(report, { allowRisky = false } = {}) {
  need(typeof allowRisky === "boolean", "ARTIFACT_POLICY_OPTION");
  need(report?.schema === 1 && /^[a-f0-9]{64}$/.test(report.sha256)
    && Number.isSafeInteger(report.size) && report.size >= 22 && report.size <= LIMITS.archiveBytes
    && Number.isSafeInteger(report.entryCount) && report.entryCount >= 0 && report.entryCount <= LIMITS.entries
    && Array.isArray(report.risks) && report.risks.length <= kinds.size, "ARTIFACT_REPORT_INVALID");
  const seen = new Set();
  for (const risk of report.risks) {
    need(kinds.has(risk?.kind) && !seen.has(risk.kind) && Array.isArray(risk.entries)
      && risk.entries.length > 0 && risk.entries.length <= LIMITS.entries
      && risk.entries.every(x => typeof x === "string" && x.length > 0 && x.length <= LIMITS.nameBytes), "ARTIFACT_REPORT_INVALID");
    seen.add(risk.kind);
  }
  if (!allowRisky && report.risks.length) fail("UNAPPROVED_MOD_CAPABILITY");
  return report;
}
module.exports = { inspectArtifact, assertArtifactPolicy, LIMITS };

if(require.main===module){try{const report=inspectArtifact(process.argv[2]);console.log(JSON.stringify(report,null,2));assertArtifactPolicy(report);}catch(error){process.stderr.write((error.code||error.message)+"\n");process.exitCode=2;}}
