"use strict";
// Explicit provisioning only. Starting a sealed deployment never refreshes its trust baseline.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
const hashBuffer=Buffer.allocUnsafe(1024*1024);
function sha(file){const hash=createHash('sha256'),fd=fs.openSync(file,'r');try{let count;while((count=fs.readSync(fd,hashBuffer,0,hashBuffer.length,null))>0)hash.update(hashBuffer.subarray(0,count));return hash.digest('hex');}finally{fs.closeSync(fd);}}
const jarMemory=['-J-Xms8m','-J-Xmx64m','-J-XX:+UseSerialGC','-J-XX:ReservedCodeCacheSize=16m','-J-XX:ActiveProcessorCount=2'];
function walk(root){if(!fs.existsSync(root))return [];let list=[];for(const e of fs.readdirSync(root,{withFileTypes:true})){const f=path.join(root,e.name);if(e.isSymbolicLink())throw Error('SEAL_SYMLINK');if(e.isDirectory())list.push(...walk(f));else if(e.isFile())list.push(f);else throw Error('SEAL_SPECIAL_FILE');}return list.sort();}
function provision(source,destination,guardBinary){
 if(process.platform!=='win32')throw Error('WINDOWS_GUARD_REQUIRED');
 destination=path.resolve(destination);fs.mkdirSync(destination);fs.writeFileSync(path.join(destination,'.gitignore'),'*\n');const payload=path.join(destination,'payload');fs.mkdirSync(payload);
 const config=JSON.parse(fs.readFileSync(source,'utf8'));config.directory=path.join(destination,'authority');fs.mkdirSync(config.directory);
 const pinned=new Set(),trees=[],dependencies=new Map();
 const dependencyDir=path.join(payload,'dependencies');fs.mkdirSync(dependencyDir);
 function dependency(file){file=path.resolve(file);const key=file.toLowerCase();if(dependencies.has(key))return dependencies.get(key);const dir=path.join(dependencyDir,String(dependencies.size).padStart(4,'0'));fs.mkdirSync(dir);const target=path.join(dir,path.basename(file));fs.copyFileSync(file,target);dependencies.set(key,target);pin(target);return target;}
 function pin(file){file=path.resolve(file);if(!fs.statSync(file).isFile())throw Error('SEAL_EXPECTED_FILE');pinned.add(file);return file;}
 function copy(source,name){const target=path.join(payload,name);fs.copyFileSync(source,target);pin(target);return target;}
 const guard=copy(guardBinary,'eff-guard.exe');
 const guardConfig=copy(path.join(__dirname,'guard/WindowsGuard.exe.config'),'eff-guard.exe.config');
 for(const name of ['controller.cjs','protected-child.cjs','engine-lineage.cjs'])copy(path.join(__dirname,name),name);
 config.workerJar=copy(config.workerJar,'workers.jar');pin(process.execPath);
 const executables=new Set([config.java,...Object.values(config.javaByRole||{})]);if(config.host)executables.add(config.host.command);
 for(const executable of executables){pin(executable);if(path.basename(executable).toLowerCase()==='java.exe'){const root=path.resolve(executable,'..','..');for(const dir of ['bin','lib','conf'])for(const f of walk(path.join(root,dir)))pin(f);if(fs.existsSync(path.join(root,'release')))pin(path.join(root,'release'));}}
 if(config.host){
  const h=config.host;h.cwd=path.join(destination,'mc-host');fs.mkdirSync(h.cwd);const args=h.args;
  if(h.loader&&h.loader!=='forge')throw Error('UNSUPPORTED_SEALED_LOADER');
  if(args.includes('-Deff.lowMemory=true'))fs.writeFileSync(path.join(h.cwd,'options.txt'),'renderDistance:2\nsimulationDistance:5\nparticles:2\nmipmapLevels:0\ngraphicsMode:0\nao:false\n');
  if(args.some(a=>/^(@|-javaagent:|-agentlib:|-agentpath:|-Xbootclasspath|--patch-module|-XX:(OnError|OnOutOfMemoryError)=|-XX:-DisableAttachMechanism)/i.test(a)))throw Error('UNAPPROVED_JVM_INJECTION');
  for(const key of Object.keys(h.env||{}))if(/^(JAVA|JDK_JAVA|_JAVA|NODE_|EFF_)/i.test(key))throw Error('UNAPPROVED_LAUNCH_ENV');
  const cp=args.indexOf('-cp');if(cp<0)throw Error('EXPECTED_EXPLICIT_CLASSPATH');
  const paths=args[cp+1].split(path.delimiter),dirs=paths.filter(p=>fs.statSync(p).isDirectory());
  let joined;
  if(dirs.length){joined=path.join(payload,'mc-mod.jar');const jar=path.join(config.java,'..','jar.exe');
   let manifestArgs=[],extraResources=[];
   if(h.loader==='forge'){
    if(!h.modManifest||Object.keys(h.modManifest).some(k=>k!=='MixinConfigs')||h.modManifest.MixinConfigs!=='eff.mixins.json,eff.client.mixins.json')throw Error('FORGE_MOD_MANIFEST');
    const refmapName='eff-1201-refmap.json';
    if(typeof h.modRefmap!=='string'||path.basename(h.modRefmap)!==refmapName||!fs.existsSync(h.modRefmap)||!fs.statSync(h.modRefmap).isFile())throw Error('FORGE_REFMAP_REQUIRED');
    const refmap=JSON.parse(fs.readFileSync(h.modRefmap,'utf8'));
    if(!refmap||typeof refmap!=='object'||Array.isArray(refmap)||!refmap.mappings||typeof refmap.mappings!=='object'||Array.isArray(refmap.mappings))throw Error('FORGE_REFMAP_INVALID');
    const modResources=path.join(payload,'mod-resources');fs.mkdirSync(modResources);
    const privateRefmap=path.join(modResources,refmapName);fs.copyFileSync(h.modRefmap,privateRefmap);pin(privateRefmap);
    const existingRefmaps=dirs.map(d=>path.join(d,refmapName)).filter(f=>fs.existsSync(f));
    if(existingRefmaps.length>1||existingRefmaps.some(f=>!fs.statSync(f).isFile()||sha(f)!==sha(privateRefmap)))throw Error('FORGE_REFMAP_CONFLICT');
    if(!existingRefmaps.length)extraResources=['-C',modResources,refmapName];h.modRefmap=privateRefmap;
    const manifest=path.join(payload,'mc-mod.mf');fs.writeFileSync(manifest,'Manifest-Version: 1.0\nMixinConfigs: '+h.modManifest.MixinConfigs+'\n\n');pin(manifest);manifestArgs=['--manifest',manifest];
   }
   execFileSync(jar,[...jarMemory,'--create','--file',joined,...manifestArgs,...dirs.flatMap(d=>['-C',d,'.']),...extraResources],{windowsHide:true});pin(joined);args[cp+1]=[...paths.filter(p=>!dirs.includes(p)).map(dependency),joined].join(path.delimiter);}
  if(!dirs.length)args[cp+1]=paths.map(dependency).join(path.delimiter);
  for(const f of args[cp+1].split(path.delimiter))pin(f);
  const dli=args.findIndex(a=>a.startsWith('-Dfabric.dli.config='));
  if(dli>=0){const original=args[dli].split('=').slice(1).join('=');let text=fs.readFileSync(original,'utf8');
   for(const key of ['fabric.remapClasspathFile','log4j.configurationFile']){
    const line=text.split(/\r?\n/).find(l=>l.trim().startsWith(key+'='));if(!line)continue;const f=line.trim().slice(key.length+1);const target=copy(f,path.basename(f));
    if(key==='fabric.remapClasspathFile'){const entries=fs.readFileSync(f,'utf8').trim().split(path.delimiter);if(entries.some(e=>!fs.statSync(e).isFile()))throw Error('UNSEALED_REMAP_DIRECTORY');fs.writeFileSync(target,entries.map(dependency).join(path.delimiter));}
    text=text.replace(f,target);
   }
   const fixed=path.join(payload,'launch.cfg');fs.writeFileSync(fixed,text);pin(fixed);args[dli]='-Dfabric.dli.config='+fixed;
  }
  if(h.loader==='forge'){
   // Forge has executable dependencies outside -cp. Snapshot each one into the same closed payload.
   const modules=args.indexOf('-p');
   if(args.filter(a=>a==='-p').length!==1||args.filter(a=>a==='-cp').length!==1||args.some(a=>/^(--module-path(?:=|$)|--class-path(?:=|$)|-classpath$|--upgrade-module-path(?:=|$)|-DlegacyClassPath=)/.test(a)))throw Error('FORGE_AMBIGUOUS_CODE_PATH');
   if(modules<0||!args[modules+1]||!joined)throw Error('FORGE_MODULE_PATH_REQUIRED');
   args[modules+1]=args[modules+1].split(path.delimiter).map(dependency).join(path.delimiter);
   const legacy=args.findIndex(a=>a.startsWith('-DlegacyClassPath.file='));
   if(legacy<0)throw Error('FORGE_LEGACY_CLASSPATH_REQUIRED');
   const legacySource=args[legacy].slice('-DlegacyClassPath.file='.length);
   const legacyPaths=fs.readFileSync(legacySource,'utf8').split(/\r?\n/).filter(Boolean);
   if(!legacyPaths.length||legacyPaths.some(f=>!fs.statSync(f).isFile()))throw Error('FORGE_LEGACY_CLASSPATH_FILE_ONLY');
   const legacyTarget=path.join(payload,'forge-classpath.txt');fs.writeFileSync(legacyTarget,legacyPaths.map(dependency).join('\n'));pin(legacyTarget);
   args[legacy]='-DlegacyClassPath.file='+legacyTarget;
   const env=h.env||{},modRoots=(env.MOD_CLASSES||'').split(path.delimiter);
   if(Object.keys(env).some(k=>!['MOD_CLASSES','MCP_MAPPINGS'].includes(k)))throw Error('FORGE_UNAPPROVED_ENV');
   if(!modRoots.length||modRoots.some(entry=>!entry.startsWith('eff%%')||!dirs.some(d=>path.resolve(d).toLowerCase()===path.resolve(entry.slice(5)).toLowerCase())))throw Error('FORGE_MOD_ROOTS_REQUIRED');
   if(typeof env.MCP_MAPPINGS!=='string'||!env.MCP_MAPPINGS)throw Error('FORGE_MAPPINGS_REQUIRED');
   // Current ForgeGradle uses a mapping identifier; older exports may supply a mapping file.
   const mappingId=env.MCP_MAPPINGS==='official_1.20.1';
   if(!mappingId&&(!fs.existsSync(env.MCP_MAPPINGS)||!fs.statSync(env.MCP_MAPPINGS).isFile()))throw Error('FORGE_MAPPINGS_REQUIRED');
   h.env={...env,MOD_CLASSES:'eff%%'+joined,MCP_MAPPINGS:mappingId?env.MCP_MAPPINGS:copy(env.MCP_MAPPINGS,'forge-mappings.tsrg')};
   // Refmap remapping and logging configuration are code inputs, not writable game configuration.
   for(let i=0;i<args.length;i++)for(const key of ['mixin.env.refMapRemappingFile','net.minecraftforge.gradle.GradleStart.srg.srg-mcp','log4j.configurationFile']){
    const prefix='-D'+key+'=';if(args[i].startsWith(prefix)){const source=args[i].slice(prefix.length);if(!fs.statSync(source).isFile())throw Error('FORGE_INPUT_FILE_REQUIRED');args[i]=prefix+dependency(source);}
   }
   const nativeCopies=new Map();
   for(let i=0;i<args.length;i++)for(const key of ['java.library.path','org.lwjgl.librarypath']){
    const prefix='-D'+key+'=';if(!args[i].startsWith(prefix))continue;
    args[i]=prefix+args[i].slice(prefix.length).split(path.delimiter).map(source=>{
     source=path.resolve(source);const canonical=source.toLowerCase();if(nativeCopies.has(canonical))return nativeCopies.get(canonical);
     if(!fs.statSync(source).isDirectory())throw Error('FORGE_NATIVE_DIRECTORY_REQUIRED');const target=path.join(payload,'natives-'+nativeCopies.size);fs.mkdirSync(target);nativeCopies.set(canonical,target);
     for(const f of walk(source)){const to=path.join(target,path.relative(source,f));fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(f,to);pin(to);}return target;
    }).join(path.delimiter);
   }
  }
  // The bridge is extracted before play and locked, not rewritten in the writable MC config tree.
  const bundle=dirs.map(d=>path.join(d,'eff-story-runtime.zip')).find(f=>fs.existsSync(f));
  if(!bundle)throw Error('STORY_BUNDLE_REQUIRED');const story=path.join(payload,'story');fs.mkdirSync(story);
  execFileSync(path.join(config.java,'..','jar.exe'),[...jarMemory,'xf',bundle],{cwd:story,windowsHide:true});
  for(const file of walk(story))pin(file);
  h.env={...(h.env||{}),EFF_STORY_RUNTIME:story};args.splice(cp,0,'-Deff.node='+process.execPath);
  const mods=path.join(h.cwd,'mods');fs.mkdirSync(mods);trees.push({root:mods,entries:[]});
 }
 // The payload tree itself is closed: an added helper, mod or package file is a deployment change.
 const entries=walk(payload).map(f=>path.relative(payload,f));trees.push({root:payload,entries});
 const seal={schema:1,node:process.execPath,child:path.join(payload,'protected-child.cjs'),payload,config,files:[...pinned].map(file=>({path:file,sha256:sha(file),size:fs.statSync(file).size})),trees};
 const manifest=path.join(destination,'sealed-runtime.json');fs.writeFileSync(manifest,JSON.stringify(seal,null,2));
 execFileSync(guard,['--provision',config.directory],{windowsHide:true});
 const pinValue=sha(manifest),guardHash=sha(guard),guardConfigHash=sha(guardConfig),launcher=path.join(destination,'Start-Protected.cmd');
 const literal=s=>s.replace(/'/g,"''");
 const command=`$ErrorActionPreference='Stop';function GetEffPinnedHash($s){$h=[Security.Cryptography.SHA256]::Create();try{[BitConverter]::ToString($h.ComputeHash($s)).Replace('-','')}finally{$h.Dispose()}};$g='${literal(guard)}';$e=[IO.File]::Open($g,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read);$c=[IO.File]::Open(($g+'.config'),[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read);try{if((GetEffPinnedHash $e) -ne '${guardHash}'){throw 'GUARD_HASH_MISMATCH'};if((GetEffPinnedHash $c) -ne '${guardConfigHash}'){throw 'GUARD_CONFIG_HASH_MISMATCH'};& $g '${literal(manifest)}' '${pinValue}';$r=$LASTEXITCODE}finally{$e.Dispose();$c.Dispose()};exit $r`;
 fs.writeFileSync(launcher,'@echo off\r\nchcp 65001 >nul\r\nset "NODE_OPTIONS="\r\nset "NODE_PATH="\r\n"%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -Command "'+command+'"\r\nset "EFF_GUARD_EXIT=%ERRORLEVEL%"\r\npause\r\nexit /b %EFF_GUARD_EXIT%\r\n');
 return {directory:destination,manifest,pin:pinValue,guard,guardHash,launcher,files:seal.files.length};
}
module.exports={provision,sha};
if(require.main===module){try{const result=provision(process.argv[2],process.argv[3],process.argv[4]);process.stdout.write(JSON.stringify(result)+'\n');}catch(e){process.stderr.write(e.message+'\n');process.exitCode=1;}}
