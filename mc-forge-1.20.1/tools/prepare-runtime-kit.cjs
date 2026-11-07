'use strict';
// Prepare a new configuration only. Never launch MC or mutate an existing deployment.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {validateProduction,validateLibraryOverrides}=require('../../mc-1.20.1/runtime/forge-production.cjs');
const {validateStartupAgent}=require('../../mc-1.20.1/runtime/startup-agent-policy.cjs');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function contained(root,name){
 if(typeof name!=='string'||!name||name.includes('\\')||name.includes(':')||name.split('/').some(v=>!v||v==='.'||v==='..'))throw Error('KIT_RELATIVE_PATH');
 const result=path.resolve(root,name),rel=path.relative(root,result);
 if(path.isAbsolute(rel)||rel.startsWith('..'+path.sep))throw Error('KIT_PATH_ESCAPE');
 for(let current=result;current!==root;current=path.dirname(current))if(fs.lstatSync(current).isSymbolicLink())throw Error('KIT_SYMLINK');
 return result;
}
function prepare(source,kit,output){
 source=path.resolve(source);kit=fs.realpathSync(kit);output=path.resolve(output);
 if(fs.existsSync(output))throw Error('OUTPUT_ALREADY_EXISTS');
 const cfg=JSON.parse(fs.readFileSync(source,'utf8')),m=JSON.parse(fs.readFileSync(path.join(kit,'manifest.json'),'utf8'));
 if(m.schema!==1||m.version!=='0.8.0'||!Array.isArray(m.files)||m.files.length>32)throw Error('KIT_MANIFEST');
 if(process.platform!=='win32'||process.arch!=='x64')throw Error('WINDOWS_X64_REQUIRED');
 validateProduction(cfg.host,cfg.host.args);
 if(cfg.host.startupAgent||cfg.host.libraryOverrides||cfg.host.args.some(a=>a.startsWith('-javaagent:')||a.startsWith('-agentlib:')||a.startsWith('-agentpath:')))throw Error('CLEAN_LAUNCH_REQUIRED');
 const at=cfg.host.args.indexOf('--fml.forgeVersion');
 if(at<0||cfg.host.args[at+1]!=='47.4.20')throw Error('PINNED_FORGE_REQUIRED');
 if(typeof cfg.host.command!=='string'||!path.isAbsolute(cfg.host.command)||path.basename(cfg.host.command).toLowerCase()!=='java.exe')throw Error('JDK_COMMAND');
 const jvm=path.join(path.dirname(cfg.host.command),'server','jvm.dll');
 if(sha(jvm)!==m.jvmSHA256)throw Error('PINNED_JVM_REQUIRED');
 const files=new Map();
 for(const f of m.files){
  if(!f||!/^[a-f0-9]{64}$/.test(f.sha256)||files.has(f.path))throw Error('KIT_FILE_DESCRIPTOR');
  const p=contained(kit,f.path),s=fs.statSync(p);
  if(!s.isFile()||s.size>64*1024*1024||s.size!==f.bytes||sha(p)!==f.sha256)throw Error('KIT_FILE_CHANGED:'+f.path);
  files.set(f.path,{path:p,sha256:f.sha256});
 }
 const file=name=>{if(!files.has(name))throw Error('KIT_MISSING:'+name);return files.get(name)};
 cfg.host.modJar=file(m.mod).path;cfg.host.storyBundle=file(m.story).path;
 cfg.workerJar=file(m.workers).path;
 cfg.host.libraryOverrides=m.libraries.map(e=>({relativePath:e.relativePath,source:file(e.path).path,sha256:file(e.path).sha256,originalSHA256:e.originalSHA256}));
 validateLibraryOverrides(cfg.host);
 cfg.host.startupAgent={mechanism:'owned-native-transform-boundary-v2',...file(m.agent),bootstrap:file(m.bootstrap),nativeBoundary:file(m.native)};
 const agent=validateStartupAgent(cfg.host),gate=file(m.gate),cp=cfg.host.args.indexOf('-cp');
 if(cfg.host.args[cp+1].split(path.delimiter).some(p=>path.basename(p)==='eff-lifetime-gate.jar'))throw Error('GATE_ALREADY_CONFIGURED');
 const target=path.join(cfg.host.libraryDirectory,'eff','lifetime',gate.sha256,'eff-lifetime-gate.jar');
 if(fs.existsSync(target)&&sha(target)!==gate.sha256)throw Error('EXISTING_GATE_CHANGED');
 fs.mkdirSync(path.dirname(target),{recursive:true});
 if(!fs.existsSync(target))fs.copyFileSync(gate.path,target,fs.constants.COPYFILE_EXCL);
 if(sha(target)!==gate.sha256)throw Error('GATE_COPY_CHANGED');
 cfg.host.args[cp+1]+=path.delimiter+target;
 cfg.host.args.splice(cp,0,agent.argument);
 validateProduction(cfg.host,cfg.host.args);
 fs.writeFileSync(output,JSON.stringify(cfg,null,2)+'\n',{flag:'wx'});
 return {prepared:true,launched:false,version:m.version,configuration:output};
}
if(require.main===module){
 const args=process.argv.slice(2);if(args.length!==3)throw Error('USAGE: prepare-runtime-kit.cjs production-launch.json kit-directory new-config.json');
 console.log(JSON.stringify(prepare(...args)));
}
module.exports={prepare,contained};
