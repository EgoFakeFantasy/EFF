"use strict";
// Explicit provisioning only. Starting a sealed deployment never refreshes its trust baseline.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
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
  if(args.some(a=>/^(@|-javaagent:|-agentlib:|-agentpath:|-Xbootclasspath|--patch-module|-XX:(OnError|OnOutOfMemoryError)=|-XX:-DisableAttachMechanism)/i.test(a)))throw Error('UNAPPROVED_JVM_INJECTION');
  for(const key of Object.keys(h.env||{}))if(/^(JAVA|JDK_JAVA|_JAVA|NODE_|EFF_)/i.test(key))throw Error('UNAPPROVED_LAUNCH_ENV');
  const cp=args.indexOf('-cp');if(cp<0)throw Error('EXPECTED_EXPLICIT_CLASSPATH');
  const paths=args[cp+1].split(path.delimiter),dirs=paths.filter(p=>fs.statSync(p).isDirectory());
  if(dirs.length){const joined=path.join(payload,'mc-mod.jar');const jar=path.join(config.java,'..','jar.exe');execFileSync(jar,['cf',joined,...dirs.flatMap(d=>['-C',d,'.'])],{windowsHide:true});pin(joined);args[cp+1]=[...paths.filter(p=>!dirs.includes(p)).map(dependency),joined].join(path.delimiter);}
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
  // The bridge is extracted before play and locked, not rewritten in the writable MC config tree.
  const bundle=dirs.map(d=>path.join(d,'eff-story-runtime.zip')).find(f=>fs.existsSync(f));
  if(!bundle)throw Error('STORY_BUNDLE_REQUIRED');const story=path.join(payload,'story');fs.mkdirSync(story);
  execFileSync(path.join(config.java,'..','jar.exe'),['xf',bundle],{cwd:story,windowsHide:true});
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
