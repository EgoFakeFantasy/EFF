"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {cleanEnv,workerEnv,assertHostArguments,launcherSanitizeLines} = require("./launch-policy.cjs");

const required = ["-XX:+DisableAttachMechanism", "-XX:+ExitOnOutOfMemoryError"];
const windows = {SystemRoot:"C:\\Windows",Path:"C:\\poison;C:\\Windows\\System32",TEMP:"C:\\shared",TMP:"C:\\shared",USERPROFILE:"C:\\Users\\Traveler",LANG:"en_AU.UTF-8",NUMBER_OF_PROCESSORS:"8"};

test("positive environment list keeps usable Windows and display inputs without mutating source", () => {
  const source = {...windows,APPDATA:"C:\\Users\\Traveler\\AppData\\Roaming",DISPLAY:":0",WAYLAND_DISPLAY:"wayland-0",XDG_RUNTIME_DIR:"/run/user/1000",SECRET_TOKEN:"secret",AWS_ACCESS_KEY_ID:"secret",BASH_ENV:"/unapproved",LD_PRELOAD:"/unapproved.so",DYLD_INSERT_LIBRARIES:"/unapproved.dylib"};
  const before = {...source}, env = cleanEnv(source);
  assert.equal(env.SYSTEMROOT,windows.SystemRoot);assert.equal(env.PATH,windows.Path);
  assert.equal(env.USERPROFILE,windows.USERPROFILE);assert.equal(env.DISPLAY,":0");assert.equal(env.LANG,"en_AU.UTF-8");
  for (const key of ["SECRET_TOKEN","AWS_ACCESS_KEY_ID","BASH_ENV","LD_PRELOAD","DYLD_INSERT_LIBRARIES"]) assert.equal(env[key],undefined);
  assert.deepEqual(source,before);
});

test("Java, Node, EFF and CLR injection names are removed case-insensitively", () => {
  const bad = ["JAVA_HOME","JAVA_TOOL_OPTIONS","JAVA_CUSTOM","JDK_HOME","JDK_JAVA_OPTIONS","_JAVA_OPTIONS","CLASSPATH","NODE_OPTIONS","NODE_PATH","NODE_EXTRA_CA_CERTS","NODE_NEW_STARTUP_OPTION","EFF_RUNTIME_LEASE","EFF_STORY_RUNTIME","COR_ENABLE_PROFILING","COR_PROFILER_PATH_64","CORECLR_PROFILER","COMPlus_ReadyToRun","DOTNET_STARTUP_HOOKS","DOTNET_ADDITIONAL_DEPS","APP_PATHS","APP_NI_PATHS"];
  for (const name of bad) {
    const env = cleanEnv({[name]:"unapproved",[name.toLowerCase()]:"unapproved",...windows});
    assert.equal(Object.keys(env).some(k=>k.toUpperCase()===name.toUpperCase()),false,name);
  }
});

test("cleanEnv rejects malformed approved values and ignores inherited properties", () => {
  assert.throws(()=>cleanEnv(null),/INVALID_LAUNCH_ENV/);assert.throws(()=>cleanEnv([]),/INVALID_LAUNCH_ENV/);
  assert.throws(()=>cleanEnv({PATH:"a\0b"}),/INVALID_LAUNCH_ENV/);
  assert.throws(()=>cleanEnv({TEMP:42}),/INVALID_LAUNCH_ENV/);
  assert.deepEqual(cleanEnv(Object.create({PATH:"inherited"})),{});
});

test("worker environment has independent PATH and caller-owned temp directory", () => {
  const source = {...windows,JAVA_TOOL_OPTIONS:"unapproved",EFF_RUNTIME_LEASE:"secret",MOD_CLASSES:"host mods",MCP_MAPPINGS:"host mapping",NODE_OPTIONS:"unapproved",COR_PROFILER_PATH:"unapproved",APPDATA:"host profile",USERPROFILE:"host profile"};
  const env = workerEnv("C:\\JDK 17\\bin\\java.exe","C:\\EFF\\authority\\worker-policy-temp",source);
  assert.equal(env.PATH,"C:\\JDK 17\\bin;C:\\Windows\\System32");
  assert.equal(env.TEMP,"C:\\EFF\\authority\\worker-policy-temp");assert.equal(env.TMP,env.TEMP);
  assert.equal(env.COMSPEC,"C:\\Windows\\System32\\cmd.exe");
  for (const key of ["JAVA_TOOL_OPTIONS","EFF_RUNTIME_LEASE","MOD_CLASSES","MCP_MAPPINGS","NODE_OPTIONS","COR_PROFILER_PATH","APPDATA","USERPROFILE"]) assert.equal(env[key],undefined,key);
  assert.equal(source.Path,windows.Path);assert.equal(source.TEMP,windows.TEMP);
});

test("POSIX worker fallback also rejects inherited loaders and uses private HOME/temp", () => {
  const env = workerEnv("/opt/jdk/bin/java","/tmp/eff-worker",{PATH:"/poison",HOME:"/shared",LD_PRELOAD:"/poison.so",JAVA_TOOL_OPTIONS:"bad",LANG:"C.UTF-8"});
  assert.equal(env.PATH,"/opt/jdk/bin:/usr/bin:/bin");assert.equal(env.HOME,"/tmp/eff-worker");
  assert.equal(env.TEMP,"/tmp/eff-worker");assert.equal(env.TMPDIR,"/tmp/eff-worker");assert.equal(env.LANG,"C.UTF-8");
  assert.equal(env.LD_PRELOAD,undefined);assert.equal(env.JAVA_TOOL_OPTIONS,undefined);
});

test("worker rejects ambiguous or missing launch roots without accessing filesystem", () => {
  assert.throws(()=>workerEnv("java.exe","C:\\temp",windows),/INVALID_WORKER_ENV_PATH/);
  assert.throws(()=>workerEnv("C:\\jdk\\bin\\java.exe","relative",windows),/INVALID_WORKER_ENV_PATH/);
  assert.throws(()=>workerEnv("C:\\jdk\\bin\\java.exe","C:\\temp",{}),/WORKER_SYSTEM_ROOT_REQUIRED/);
  assert.throws(()=>workerEnv("/opt/jdk/bin/java","relative",{}),/INVALID_WORKER_ENV_PATH/);
  assert.throws(()=>workerEnv("C:\\jdk\\bin\\java.exe","C:\\temp\noption",windows),/INVALID_WORKER_ENV_PATH/);
});

test("normal Forge module, opens, legacy, mapping and native paths remain admitted", () => {
  const args = ["-Djava.net.preferIPv6Addresses=system","-p","C:\\sealed\\bootstrap.jar;C:\\sealed\\asm.jar","--add-modules","ALL-MODULE-PATH","--add-opens","java.base/java.util.jar=cpw.mods.securejarhandler","--add-exports=java.base/sun.security.util=cpw.mods.securejarhandler","-DlegacyClassPath.file=C:\\sealed\\forge-classpath.txt","-Dmixin.env.refMapRemappingFile=C:\\sealed\\output.srg","-Dnet.minecraftforge.gradle.GradleStart.srg.srg-mcp=C:\\sealed\\output.srg","-Dlog4j.configurationFile=C:\\sealed\\log4j.xml","-Djava.library.path=C:\\sealed\\natives","-Dorg.lwjgl.librarypath=C:\\sealed\\natives","-Deff.node=C:\\Program Files\\nodejs\\node.exe","-Deff.preview=true","-Xms64m","-Xmx768m","-XX:+UseSerialGC",...required,"-cp","C:\\sealed\\mc-mod.jar","cpw.mods.bootstraplauncher.BootstrapLauncher","--launchTarget","forgeclientuserdev","--gameDir","C:\\game","--assetsDir","C:\\assets"];
  const before = [...args];assert.equal(assertHostArguments(args),args);assert.deepEqual(args,before);
});

for (const arg of [
  "@C:\\unapproved.args"," @C:\\unapproved.args","-javaagent:C:\\unapproved.jar","-agentlib:jdwp=transport=dt_socket","-agentpath:C:\\unapproved.dll","-Xrunjdwp:transport=dt_socket","-Xbootclasspath/a:C:\\unapproved.jar","--patch-module=java.base=C:\\unapproved.jar","--patch-module","-XX:Flags=C:\\unapproved.flags","-XX:VMOptionsFile=C:\\unapproved.opts","-Djava.system.class.loader=unapproved.Loader","-Djava.ext.dirs=C:\\unapproved","-Djava.endorsed.dirs=C:\\unapproved","-Dendorsed.dirs=C:\\unapproved","-XX:-DisableAttachMechanism","-XX:-ExitOnOutOfMemoryError","-XX:DisableAttachMechanism=false","-XX:ExitOnOutOfMemoryError=false","-XX:OnError=unapproved-command","-XX:OnOutOfMemoryError=unapproved-command","-XX:+EnableDynamicAgentLoading","-Djdk.attach.allowAttachSelf=true"
]) test("host admission rejects injection setting: "+arg,()=>{
  assert.throws(()=>assertHostArguments([...required,arg]),/UNAPPROVED_JVM_INJECTION/);
});

test("required hardening cannot be satisfied by a partial, misspelled or later override option",()=>{
  assert.throws(()=>assertHostArguments([]),/HOST_JVM_HARDENING_REQUIRED/);
  assert.throws(()=>assertHostArguments([required[0]]),/HOST_JVM_HARDENING_REQUIRED/);
  assert.throws(()=>assertHostArguments([required[1]]),/HOST_JVM_HARDENING_REQUIRED/);
  assert.throws(()=>assertHostArguments([required[0].toLowerCase(),required[1]]),/HOST_JVM_HARDENING_REQUIRED/);
  assert.throws(()=>assertHostArguments([...required,"-XX:-DisableAttachMechanism"]),/UNAPPROVED_JVM_INJECTION/);
  assert.doesNotThrow(()=>assertHostArguments([...required,"-Djdk.attach.allowAttachSelf=false","-XX:ErrorFile=C:\\logs\\jvm-%p.log"]));
});

test("host arguments cannot inject new lines into the controller-generated Java argument file",()=>{
  for (const arg of ["ok\n-javaagent:unapproved.jar","ok\r-javaagent:unapproved.jar","ok\0bad"]) assert.throws(()=>assertHostArguments([...required,arg]),/INVALID_HOST_ARGUMENTS/);
  assert.throws(()=>assertHostArguments("-Xmx768m"),/INVALID_HOST_ARGUMENTS/);
  assert.throws(()=>assertHostArguments([...required,1]),/INVALID_HOST_ARGUMENTS/);
});

test("trusted cmd launcher clears known pre-CLR variables and whole families without target execution",()=>{
  const text = launcherSanitizeLines();assert.equal(typeof text,"string");assert.ok(text.endsWith("\r\n"));
  assert.match(text,/^setlocal DisableDelayedExpansion\r\n/);
  for (const name of ["JAVA_TOOL_OPTIONS","JDK_JAVA_OPTIONS","_JAVA_OPTIONS","CLASSPATH","NODE_OPTIONS","NODE_PATH","COR_ENABLE_PROFILING","CORECLR_ENABLE_PROFILING","COR_PROFILER_PATH_64","DOTNET_STARTUP_HOOKS","APP_PATHS"]) assert.ok(text.includes(`set "${name}="`),name);
  for (const prefix of ["JAVA","_JAVA","JDK_","NODE_","EFF_","COR_","CORECLR_","COMPlus_","DOTNET_"]) assert.ok(text.includes(`in ('set ${prefix} 2^>nul') do set "%%G="`),prefix);
  assert.equal(/powershell|reg\.exe|Remove-Item|del |rmdir|\/c /i.test(text),false);
});
