'use strict';
// Static content identity, not authentication against a hostile same-account process.
// Covers original launch inputs (not regenerated JAR timestamps): source config,
// all named JDK bin/lib/conf/release files, workers, Guardian/config, Node,
// runtime/guard JS, host class/module paths, MOD_CLASSES, native libraries,
// Forge mappings/refmap/logging/legacy paths and Fabric launch/remap paths.
// Mutable game cwd, saves, downloaded assets and OS libraries are deliberately
// excluded. A matching baseline remains a bounded compatibility observation.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
function baselineIdentity(source,binary){
 const inventory=new Map(),buf=Buffer.allocUnsafe(1024*1024);let bytes=0;
 const norm=p=>path.resolve(p);
 function visit(p,depth=0){
  p=norm(p);if(inventory.has(p))return;
  if(depth>32||inventory.size>=40000)throw Error('BASELINE_INVENTORY_BUDGET');
  const st=fs.lstatSync(p);if(st.isSymbolicLink())throw Error('BASELINE_REPARSE_REJECTED');
  if(st.isDirectory()){
   inventory.set(p,{kind:'directory'});
   for(const n of fs.readdirSync(p).sort())visit(path.join(p,n),depth+1);
  }else if(st.isFile()){
   bytes+=st.size;if(st.size>2*1024**3||bytes>8*1024**3)throw Error('BASELINE_BYTE_BUDGET');
   const h=createHash('sha256'),fd=fs.openSync(p,'r');let read=0;
   try{let n;while((n=fs.readSync(fd,buf,0,buf.length,null))>0){read+=n;h.update(buf.subarray(0,n));}
    const end=fs.fstatSync(fd);if(read!==st.size||end.size!==st.size||end.mtimeMs!==st.mtimeMs)throw Error('BASELINE_INPUT_CHANGED');
   }finally{fs.closeSync(fd);}
   inventory.set(p,{kind:'file',size:read,sha256:h.digest('hex')});
  }else throw Error('BASELINE_SPECIAL_FILE');
 }
 function list(value){if(typeof value!=='string'||!value)throw Error('BASELINE_PATH_LIST_REQUIRED');for(const p of value.split(path.delimiter)){if(!p)throw Error('BASELINE_EMPTY_PATH');visit(p);}}
 visit(source);const cfg=JSON.parse(fs.readFileSync(source,'utf8'));
 visit(binary);if(fs.existsSync(binary+'.config'))visit(binary+'.config');
 visit(path.join(path.dirname(binary),'WindowProbe.exe'));visit(path.join(__dirname,'WindowProbe.cs'));
 visit(path.join(__dirname,'WindowsGuard.exe.config'));visit(process.execPath);visit(cfg.workerJar);
 for(const dir of [path.join(__dirname,'..'),__dirname])for(const n of fs.readdirSync(dir).sort())
  if(n.endsWith('.cjs')&&!n.endsWith('.test.cjs'))visit(path.join(dir,n));
 for(const exe of new Set([cfg.java,...Object.values(cfg.javaByRole||{}),...(cfg.host?[cfg.host.command]:[])])){
  visit(exe);const root=path.resolve(exe,'..','..');
  for(const n of ['bin','lib','conf'])visit(path.join(root,n));
  if(fs.existsSync(path.join(root,'release')))visit(path.join(root,'release'));
 }
 if(cfg.host){
  const h=cfg.host,args=h.args;if(!Array.isArray(args))throw Error('BASELINE_HOST_ARGS');
  for(let i=0;i<args.length;i++){
   const a=args[i];if(['-cp','-classpath','--class-path','-p','--module-path','--upgrade-module-path'].includes(a))list(args[++i]);
   else if(/^(--class-path|--module-path|--upgrade-module-path)=/.test(a))list(a.slice(a.indexOf('=')+1));
   else if(a.startsWith('-DlegacyClassPath.file=')){
    const p=a.slice('-DlegacyClassPath.file='.length);visit(p);for(const f of fs.readFileSync(p,'utf8').split(/\r?\n/).filter(Boolean))visit(f);
   }else if(/^-D(java.library.path|org.lwjgl.librarypath)=/.test(a))list(a.slice(a.indexOf('=')+1));
   else if(/^-D(mixin.env.refMapRemappingFile|net.minecraftforge.gradle.GradleStart.srg.srg-mcp|log4j.configurationFile)=/.test(a))visit(a.slice(a.indexOf('=')+1));
   else if(a.startsWith('-Dfabric.dli.config=')){
    const p=a.slice('-Dfabric.dli.config='.length);visit(p);
    for(const line of fs.readFileSync(p,'utf8').split(/\r?\n/)){
     const m=line.trim().match(/^(fabric.remapClasspathFile|log4j.configurationFile)=(.+)$/);if(!m)continue;
     visit(m[2]);if(m[1]==='fabric.remapClasspathFile')list(fs.readFileSync(m[2],'utf8').trim());
    }
   }
  }
  if(h.modRefmap)visit(h.modRefmap);
   const startup=require('../startup-agent-policy.cjs').validateStartupAgent(h);
   if(startup){visit(startup.path);if(startup.bootstrap)visit(startup.bootstrap.path);if(startup.nativeBoundary)visit(startup.nativeBoundary.path);}
  if(h.distribution==='production')for(const key of ['libraryDirectory','modJar','storyBundle'])visit(h[key]);
  if(h.distribution==='production')for(const entry of require('../forge-production.cjs').validateLibraryOverrides(h).values())visit(entry.source);
  if(h.env?.MOD_CLASSES)for(const entry of h.env.MOD_CLASSES.split(path.delimiter)){
   if(!entry.startsWith('eff%%'))throw Error('BASELINE_MOD_CLASSES');visit(entry.slice(5));
  }
  if(h.env?.MCP_MAPPINGS&&h.env.MCP_MAPPINGS!=='official_1.20.1')visit(h.env.MCP_MAPPINGS);
 }
 return createHash('sha256').update(JSON.stringify({schema:1,files:[...inventory].sort((a,b)=>a[0].localeCompare(b[0],'en'))})).digest('hex');
}
function checkBaseline(report,identity,{now=Date.now(),maxAgeMs=2*60*60*1000,sourceSHA256,requireLow=true,requireContinuous=true}={}){
 const no=reason=>({ready:false,reason});
 if(report?.ok!==true)return no('BASELINE_NOT_SUCCESSFUL');
 if(requireContinuous){if(!require('./combat-verdict.cjs').verdict(report,{baseline:true}).accepted)return no('REVIEWED_CONTINUOUS_BASELINE_REQUIRED');}
 else if(report?.oldWholeJobDrained!==true)return no('BASELINE_NOT_SUCCESSFUL');
 if(!/^[a-f0-9]{64}$/.test(identity)||report.runtimeIdentitySHA256!==identity)return no('BASELINE_ARTIFACT_MISMATCH');
 if(sourceSHA256!==undefined&&report.sourceSHA256!==sourceSHA256)return no('BASELINE_SOURCE_MISMATCH');
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(report.baselineRunId||''))return no('BASELINE_RUN_ID_REQUIRED');
 if(requireLow&&report.lowIntegrityHost!==true)return no('BASELINE_LOW_INTEGRITY_REQUIRED');
 if(!Number.isSafeInteger(now)||!Number.isSafeInteger(maxAgeMs)||maxAgeMs<=0||maxAgeMs>24*60*60*1000||
    !Number.isSafeInteger(report.startedAtUnixMs)||!Number.isSafeInteger(report.finishedAtUnixMs)||
    report.startedAtUnixMs<=0||report.finishedAtUnixMs<report.startedAtUnixMs||report.finishedAtUnixMs>now||
    now-report.finishedAtUnixMs>maxAgeMs)return no('BASELINE_STALE_OR_INVALID_TIME');
 return {ready:true,reason:'FRESH_MATCHING_BASELINE'};
}
module.exports={baselineIdentity,checkBaseline};
