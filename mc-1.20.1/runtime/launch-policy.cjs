"use strict";

// Launch admission and environment minimization, not an OS sandbox or proof that a mod is safe.
// A same-account/native attacker remains outside this policy's isolation guarantees.
const path = require("node:path");

const allowedEnvironment = new Set([
  "SYSTEMROOT", "WINDIR", "COMSPEC", "OS", "PATH", "PATHEXT", "TEMP", "TMP",
  "HOMEDRIVE", "HOMEPATH", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "PROGRAMDATA",
  "PROGRAMFILES", "PROGRAMFILES(X86)", "PROGRAMW6432", "COMMONPROGRAMFILES",
  "COMMONPROGRAMFILES(X86)", "COMMONPROGRAMW6432", "PUBLIC", "ALLUSERSPROFILE",
  "USERNAME", "USERDOMAIN", "USERDNSDOMAIN", "COMPUTERNAME", "SESSIONNAME",
  "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE", "PROCESSOR_IDENTIFIER",
  "PROCESSOR_LEVEL", "PROCESSOR_REVISION", "HOME", "USER", "LOGNAME", "SHELL",
  "LANG", "LC_ALL", "LC_CTYPE", "LC_MESSAGES", "TZ", "TERM", "COLORTERM",
  "DISPLAY", "WAYLAND_DISPLAY", "XDG_RUNTIME_DIR", "TMPDIR"
]);

function cleanEnv(source = process.env) {
  if (!source || typeof source !== "object" || Array.isArray(source)) throw Error("INVALID_LAUNCH_ENV");
  const result = {};
  for (const [name, value] of Object.entries(source)) {
    const key = name.toUpperCase();
    if (!allowedEnvironment.has(key)) continue;
    if (typeof value !== "string" || value.includes("\0")) throw Error("INVALID_LAUNCH_ENV");
    // Canonical names avoid Windows' case-insensitive duplicate environment keys.
    result[key] = value;
  }
  return result;
}

function workerEnv(java, directory, source = process.env) {
  if (typeof java !== "string" || typeof directory !== "string" || /[\0\r\n]/.test(java + directory))
    throw Error("INVALID_WORKER_ENV_PATH");
  const safe = cleanEnv(source), result = {};
  const windows = /^[a-zA-Z]:[\\/]/.test(java);
  if (windows) {
    if (!path.win32.isAbsolute(directory) || !/^[a-zA-Z]:[\\/]/.test(directory))
      throw Error("INVALID_WORKER_ENV_PATH");
    const root = safe.SYSTEMROOT || safe.WINDIR;
    if (!root || !/^[a-zA-Z]:[\\/]/.test(root)) throw Error("WORKER_SYSTEM_ROOT_REQUIRED");
    result.SYSTEMROOT = path.win32.normalize(root);
    result.WINDIR = result.SYSTEMROOT;
    result.COMSPEC = path.win32.join(result.SYSTEMROOT, "System32", "cmd.exe");
    result.PATHEXT = ".COM;.EXE;.BAT;.CMD";
    result.PATH = [path.win32.dirname(java), path.win32.join(result.SYSTEMROOT, "System32")].join(";");
    result.TEMP = result.TMP = path.win32.normalize(directory);
  } else {
    // Ordinary Java worker tests also run on POSIX CI; no inherited loader/preload variables.
    if (!path.posix.isAbsolute(java) || !path.posix.isAbsolute(directory)) throw Error("INVALID_WORKER_ENV_PATH");
    result.PATH = [path.posix.dirname(java), "/usr/bin", "/bin"].join(":");
    result.TEMP = result.TMP = result.TMPDIR = path.posix.normalize(directory);
    result.HOME = path.posix.normalize(directory);
  }
  for (const key of ["LANG", "LC_ALL", "LC_CTYPE", "TZ", "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE", "OS"])
    if (safe[key] !== undefined) result[key] = safe[key];
  // Directory creation belongs to the caller; constructing a policy has no filesystem effects.
  return result;
}

function assertHostArguments(args) {
  if (!Array.isArray(args) || args.some(a => typeof a !== "string" || /[\0\r\n]/.test(a)))
    throw Error("INVALID_HOST_ARGUMENTS");
  for (const arg of args) {
    const a = arg.trimStart();
    if (
      a.startsWith("@") ||
      /^-{1,2}(?:javaagent|agentlib|agentpath)(?::|=|$)/i.test(a) ||
      /^-X(?:bootclasspath|run)/i.test(a) ||
      /^--patch-module(?:=|$)/i.test(a) ||
      /^-XX:(?:Flags|VMOptionsFile|OnError|OnOutOfMemoryError)(?:=|$)/i.test(a) ||
      /^-D(?:java\.(?:system\.class\.loader|ext\.dirs|endorsed\.dirs)|endorsed\.dirs)(?:=|$)/i.test(a) ||
      /^-XX:-(?:DisableAttachMechanism|ExitOnOutOfMemoryError)(?:=|$)/i.test(a) ||
      /^-XX:(?:DisableAttachMechanism|ExitOnOutOfMemoryError)=/i.test(a) ||
      /^-XX:\+EnableDynamicAgentLoading(?:=|$)/i.test(a) ||
      /^-Djdk\.attach\.allowAttachSelf=(?!false$)/i.test(a)
    ) throw Error("UNAPPROVED_JVM_INJECTION");
  }
  if (!args.includes("-XX:+DisableAttachMechanism") || !args.includes("-XX:+ExitOnOutOfMemoryError"))
    throw Error("HOST_JVM_HARDENING_REQUIRED");
  return args;
}

function launcherSanitizeLines() {
  // Run in the trusted .cmd entry point BEFORE starting PowerShell or the CLR guardian.
  // A cleanup performed inside the guardian's Main is too late to prevent CLR startup hooks.
  const names = [
    "JAVA_TOOL_OPTIONS", "JDK_JAVA_OPTIONS", "_JAVA_OPTIONS", "JAVA_HOME", "JDK_HOME", "CLASSPATH",
    "NODE_OPTIONS", "NODE_PATH", "NODE_EXTRA_CA_CERTS", "NODE_V8_COVERAGE", "NODE_ICU_DATA",
    "COR_ENABLE_PROFILING", "COR_PROFILER", "COR_PROFILER_PATH", "COR_PROFILER_PATH_32", "COR_PROFILER_PATH_64",
    "CORECLR_ENABLE_PROFILING", "CORECLR_PROFILER", "CORECLR_PROFILER_PATH", "CORECLR_PROFILER_PATH_32", "CORECLR_PROFILER_PATH_64",
    "DOTNET_STARTUP_HOOKS", "DOTNET_ADDITIONAL_DEPS", "DOTNET_SHARED_STORE", "APP_PATHS", "APP_NI_PATHS"
  ];
  const prefixes = ["JAVA", "_JAVA", "JDK_", "NODE_", "EFF_", "COR_", "CORECLR_", "COMPlus_", "DOTNET_"];
  return [
    "setlocal DisableDelayedExpansion",
    ...names.map(name => `set "${name}="`),
    ...prefixes.map(prefix => `for /f "tokens=1 delims==" %%G in ('set ${prefix} 2^>nul') do set "%%G="`),
    ""
  ].join("\r\n");
}

module.exports = { cleanEnv, workerEnv, assertHostArguments, launcherSanitizeLines };
