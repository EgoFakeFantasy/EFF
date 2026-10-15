"use strict";
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {provision}=require('../seal-runtime.cjs');const wait=ms=>new Promise(r=>setTimeout(r,ms));
const source=process.argv[2],destination=process.argv[3],binary=process.argv[4];
const s=provision(source,destination,binary),seal=JSON.parse(fs.readFileSync(s.manifest,'utf8'));
const p=spawn(s.guard,[s.manifest,s.pin],{stdio:['ignore','pipe','pipe'],windowsHide:true});let stderr='';p.stdout.resume();p.stderr.on('data',b=>stderr+=b);
function alive(pid){try{process.kill(pid,0);return true;}catch{return false;}}
async function until(fn,limit=240000){const end=Date.now()+limit;while(Date.now()<end){if(p.exitCode!==null||p.signalCode!==null)throw Error('GUARD_STOPPED_'+stderr);const result=fn();if(result)return result;const failed=path.join(seal.config.host.cwd,'guarded-failure.json');if(fs.existsSync(failed))throw Error(fs.readFileSync(failed,'utf8'));await wait(250);}throw Error('NATIVE_GUARD_TIMEOUT');}
function proof(name){const f=path.join(seal.config.host.cwd,'guarded-proof',name+'.json');return fs.existsSync(f)&&JSON.parse(fs.readFileSync(f,'utf8'));}
function events(){const f=path.join(seal.config.directory,'guard-events.jsonl');return fs.existsSync(f)?fs.readFileSync(f,'utf8').trim().split('\n').filter(Boolean).map(x=>JSON.parse(x)):[];}
(async()=>{const evidence={ok:false};try{
 console.log('Guarded MC native test started, outer PID',p.pid);
 const first=await until(()=>proof('1-ready-for-controller-death'));evidence.first=first;
 const root=events().find(e=>e.type==='controller-start').detail.pid;evidence.oldController=root;
 for(const f of [s.manifest,path.join(seal.payload,'controller.cjs'),path.join(seal.payload,'workers.jar'),path.join(seal.payload,'mc-mod.jar'),path.join(seal.config.directory,'ledger.bin')])assert.throws(()=>fs.writeFileSync(f,'poison'));
 evidence.liveCodeAndLedgerWritesBlocked=true;process.kill(root);console.log('Killed owned controller',root,'and checking whole-job recovery');
 const second=await until(()=>proof('2-complete'));evidence.second=second;assert.equal(second.research.fields['authority.recovery.active'],false);assert.equal(second.research.fields['world.exitOpen'],true);
 for(const pid of [first.mcPid,first.research.runtime.policy.pid,first.research.runtime.execution.pid])assert.equal(alive(pid),false);
 evidence.events=events();assert.ok(evidence.events.some(e=>e.type==='job-drained'&&e.detail.active===0));
 const newRoot=evidence.events.filter(e=>e.type==='controller-start').at(-1).detail.pid;
 p.kill();await new Promise(r=>p.once('exit',r));const deadline=Date.now()+15000;let cleared=false;
 while(Date.now()<deadline){cleared=[newRoot,second.mcPid,second.research.runtime.policy.pid,second.research.runtime.execution.pid].every(id=>!alive(id));if(cleared)break;await wait(50);}assert.ok(cleared);
 evidence.guardDeathReapedWholeJob=true;evidence.ok=true;
 }catch(e){evidence.error=e.message;process.exitCode=1;}
 finally{if(p.exitCode===null&&p.signalCode===null){p.kill();await new Promise(r=>p.once('exit',r));}fs.writeFileSync(path.join(destination,'native-result.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({ok:evidence.ok,error:evidence.error}));}
})();
