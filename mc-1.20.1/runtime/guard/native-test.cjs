"use strict";
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {provision}=require('../seal-runtime.cjs');const wait=ms=>new Promise(r=>setTimeout(r,ms));
const source=process.argv[2],destination=process.argv[3],binary=process.argv[4];
// Native QA uses a small, fixed JVM profile; gameplay launch manifests are untouched.
const qa=JSON.parse(fs.readFileSync(source,'utf8'));
qa.host.args=qa.host.args.filter(a=>!/^-(Xms|Xmx)/.test(a)&&!/^[-]XX:(ReservedCodeCacheSize|ActiveProcessorCount)=/.test(a)&&a!=='-XX:+UseG1GC');
qa.host.args.splice(qa.host.args.indexOf('-cp'),0,'-Xms64m','-Xmx768m','-XX:+UseSerialGC','-XX:ReservedCodeCacheSize=64m','-XX:ActiveProcessorCount=2','-Deff.lowMemory=true');
const qaInput=path.resolve(destination)+'-qa-input.json';fs.writeFileSync(qaInput,JSON.stringify(qa),{flag:'wx'});
let s;try{s=provision(qaInput,destination,binary);}finally{fs.unlinkSync(qaInput);}
const seal=JSON.parse(fs.readFileSync(s.manifest,'utf8'));
// Low-memory initial options are provided identically by the sealer for QA and play.
const p=spawn('cmd.exe',['/d','/c',s.launcher],{stdio:['ignore','pipe','pipe'],windowsHide:true});let stderr='';p.stdout.resume();p.stderr.on('data',b=>stderr+=b);
function alive(pid){try{process.kill(pid,0);return true;}catch{return false;}}
async function until(fn,limit=240000){const end=Date.now()+limit;while(Date.now()<end){if(p.exitCode!==null||p.signalCode!==null)throw Error('GUARD_STOPPED_'+stderr);const result=fn();if(result)return result;const failed=path.join(seal.config.host.cwd,'guarded-failure.json');if(fs.existsSync(failed))throw Error(fs.readFileSync(failed,'utf8'));await wait(250);}throw Error('NATIVE_GUARD_TIMEOUT');}
function proof(name){const f=path.join(seal.config.host.cwd,'guarded-proof',name+'.json');return fs.existsSync(f)&&JSON.parse(fs.readFileSync(f,'utf8'));}
function events(){const f=path.join(seal.config.directory,'guard-events.jsonl');return fs.existsSync(f)?fs.readFileSync(f,'utf8').trim().split('\n').filter(Boolean).map(x=>JSON.parse(x)):[];}
(async()=>{const evidence={ok:false,nativeQaHeapMiB:768};try{
 console.log('Guarded MC native test started through verified launcher, launcher PID',p.pid);evidence.verifiedLauncherUsed=true;
 const first=await until(()=>proof('1-ready-for-controller-death'));evidence.first=first;const recovered=proof("1-counter-recovered");assert.ok(recovered);evidence.counterSource=recovered.research.counter.source;evidence.modelInferenceVerified=evidence.counterSource==="local-model";assert.ok(evidence.modelInferenceVerified||seal.config.host.args.includes("-Deff.guardedAllowFallback=true")&&evidence.counterSource==="rule-template");assert.equal(first.research.runtime.execution.engine.descriptor.generation,2);const engineId=first.research.runtime.execution.engine.descriptor.id;
 const firstEngine=proof("1-first-generated-engine");assert.ok(firstEngine);assert.notEqual(firstEngine.research.runtime.execution.pid,first.research.runtime.execution.pid);assert.notEqual(firstEngine.research.runtime.execution.engine.className,first.research.runtime.execution.engine.className);assert.equal(first.research.runtime.execution.engine.descriptor.parent,firstEngine.research.runtime.execution.engine.descriptor.id);assert.notEqual(firstEngine.research.runtime.execution.engine.bytecodeSHA256,first.research.runtime.execution.engine.bytecodeSHA256);evidence.recursiveParentChildVerified=true;
 const root=events().find(e=>e.type==='controller-start').detail.pid;evidence.oldController=root;
 for(const f of [s.manifest,path.join(seal.payload,'controller.cjs'),path.join(seal.payload,'workers.jar'),path.join(seal.payload,'mc-mod.jar'),path.join(seal.config.directory,'ledger.bin')])assert.throws(()=>fs.writeFileSync(f,'poison'));
 evidence.liveCodeAndLedgerWritesBlocked=true;process.kill(root);console.log('Killed owned controller',root,'and checking whole-job recovery');
 const second=await until(()=>proof('2-complete'));evidence.second=second;assert.equal(second.research.runtime.execution.engine.descriptor.id,engineId);evidence.lineageRetainedAfterControllerDeath=true;assert.equal(second.research.fields['authority.recovery.active'],false);assert.equal(second.research.fields['world.exitOpen'],true);assert.equal(second.native.facts.exitOpen,true);
 for(const pid of [first.mcPid,first.research.runtime.policy.pid,first.research.runtime.execution.pid])assert.equal(alive(pid),false);
 evidence.events=events();evidence.peakJobCommittedBytes=Math.max(...evidence.events.filter(e=>e.type==='job-drained').map(e=>e.detail.peakCommittedBytes||0));assert.ok(evidence.events.some(e=>e.type==='job-drained'&&e.detail.active===0));
 const newRoot=evidence.events.filter(e=>e.type==='controller-start').at(-1).detail.pid;
 const outer=evidence.events.find(e=>e.type==='guard-ready').detail.pid;process.kill(outer);await new Promise(r=>p.once('exit',r));const deadline=Date.now()+15000;let cleared=false;
 while(Date.now()<deadline){cleared=[newRoot,second.mcPid,second.research.runtime.policy.pid,second.research.runtime.execution.pid].every(id=>!alive(id));if(cleared)break;await wait(50);}assert.ok(cleared);
 evidence.guardDeathReapedWholeJob=true;evidence.ok=true;
 }catch(e){evidence.error=e.message;process.exitCode=1;}
 finally{if(p.exitCode===null&&p.signalCode===null){const outer=events().find(e=>e.type==='guard-ready')?.detail.pid;if(outer&&alive(outer))process.kill(outer);else p.kill();await new Promise(r=>p.once('exit',r));}fs.writeFileSync(path.join(destination,'native-result.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({ok:evidence.ok,error:evidence.error}));}
})();
