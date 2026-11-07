"use strict";
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {provision}=require('../seal-runtime.cjs');
const {baselineIdentity}=require('./baseline-identity.cjs');
const {randomUUID}=require('node:crypto');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const [source,destination,binary,profile='dying']=process.argv.slice(2);
if(!['dying','zero-health','nan','removed','player'].includes(profile))throw Error('UNKNOWN_GUARD_CASE');
if(['zero-health','nan'].includes(profile))throw Error('API_PREVENTION_PROFILE_USE_LIFETIME_NATIVE_TEST');
const baselineRunId=randomUUID(),startedAtUnixMs=Date.now(),lowIntegrityHost=process.env.EFF_TEST_LOW_INTEGRITY==='true';
const runtimeIdentitySHA256=baselineIdentity(source,binary);
const cfg=JSON.parse(fs.readFileSync(source,'utf8'));cfg.host.args=cfg.host.args.filter(x=>!x.startsWith('-Deff.entityGuardCase=')&&!x.startsWith('-Deff.guardedSelftest=')&&!x.startsWith('-Deff.pig2Lab='));
const cp=cfg.host.args.indexOf('-cp');cfg.host.args.splice(cp,0,'-Deff.entityGuardSelftest=true','-Deff.entityGuardCase='+profile);
const input=path.resolve(destination)+'-input.json';fs.writeFileSync(input,JSON.stringify(cfg),{flag:'wx'});
let sealed;try{sealed=provision(input,destination,binary,{lowIntegrityHost});}finally{fs.unlinkSync(input);}
const m=JSON.parse(fs.readFileSync(sealed.manifest,'utf8')),game=m.config.host.cwd,authority=m.config.directory;
const launcher=spawn('cmd.exe',['/d','/c',sealed.launcher],{stdio:['ignore','pipe','pipe'],windowsHide:true});launcher.stdout.resume();let stderr='';launcher.stderr.on('data',b=>stderr+=b);
const events=()=>{const p=path.join(authority,'guard-events.jsonl');return fs.existsSync(p)?fs.readFileSync(p,'utf8').trim().split('\n').filter(Boolean).map(x=>JSON.parse(x)):[];};
const proof=n=>{const p=path.join(game,'entity-guard-proof',n+'.json');return fs.existsSync(p)&&JSON.parse(fs.readFileSync(p,'utf8'));};
function alive(pid){try{process.kill(pid,0);return true;}catch{return false;}}
async function until(fn,limit=250000){const end=Date.now()+limit;while(Date.now()<end){for(const n of ['1-failure','2-failure','1-bootstrap-failure','2-bootstrap-failure']){const f=proof(n);if(f)throw Error(f.error+':'+(f.message||''));}const r=fn();if(r)return r;if(launcher.exitCode!==null||launcher.signalCode!==null)throw Error('GUARD_EXIT_'+stderr);await wait(200);}throw Error('NATIVE_ENTITY_GUARD_TIMEOUT');}
(async()=>{const out={ok:false,profile,modelInferenceVerified:false,baselineRunId,startedAtUnixMs,lowIntegrityHost,runtimeIdentitySHA256,sourceSHA256:require('node:crypto').createHash('sha256').update(fs.readFileSync(source)).digest('hex')};try{
 console.log('Entity guard native case',profile);
 const injected=await until(()=>proof('1-fault-injected'));out.injected=injected;
 const initial=proof('1-ready');assert.ok(initial);out.initial=initial;
 if(profile==='dying'){assert.equal(injected.target.removed,false);assert.equal(injected.target.health>0,true);assert.equal(injected.target.dying,true);}
 if(profile==='player'){assert.equal(injected.player.health,0);assert.equal(injected.research.fields['authority.recovery.active'],false);}
 const completed=await until(()=>proof('2-complete'));out.completed=completed;
 const ready=proof('2-ready');assert.ok(ready);out.recovered=ready;
 assert.notEqual(injected.mcPid,completed.mcPid);assert.equal(ready.research.instance,initial.research.instance);
 const a=initial.research.runtime.execution,b=ready.research.runtime.execution;
 assert.notEqual(a.pid,b.pid);assert.equal(b.engine.descriptor.generation,a.engine.descriptor.generation+1);assert.equal(b.engine.descriptor.parent,a.engine.descriptor.id);assert.notEqual(a.engine.bytecodeSHA256,b.engine.bytecodeSHA256);
 assert.equal(ready.research.runtime.defense.incidents,1);assert.equal(ready.research.runtime.defense.lastIncident.subject,profile==='player'?'player':'avatar');
 if(profile==='player')assert.equal(ready.research.fields['authority.recovery.active'],false);
 assert.equal(completed.research.fields['authority.recovery.active'],false);assert.equal(completed.research.outcome,'won');assert.equal(completed.native.facts.exitOpen,true);
 // Windows can reuse a retired JVM PID for a different process before this check. The
 // Guardian's generation-bound kernel Job accounting proves the whole old tree drained;
 // kill(pid,0) only proves that *some* process currently owns that integer.
 const timeline=events(),firstController=timeline.find(e=>e.type==='controller-start'&&e.detail.generation===1);
 assert.ok(firstController,'FIRST_CONTROLLER_IDENTITY_REQUIRED');
 const drainedIndex=timeline.findIndex(e=>e.type==='job-drained'&&e.detail.generation===1&&e.detail.rootPid===firstController.detail.pid&&e.detail.active===0);
 const successorIndex=timeline.findIndex(e=>e.type==='controller-start'&&e.detail.generation===2);
 assert.ok(drainedIndex>=0&&successorIndex>drainedIndex,'OLD_WHOLE_JOB_MUST_DRAIN_BEFORE_SUCCESSOR');
 out.oldWholeJobEvidence=timeline[drainedIndex];
 await wait(5000);assert.equal(events().filter(e=>e.type==='controller-start').length,2,'legal erase/victory must not launch a third controller');
 out.realDeathTriggeredFreshEngine=true;out.oldWholeJobDrained=true;out.legalErasurePreserved=true;out.events=events();assert.equal(baselineIdentity(source,binary),runtimeIdentitySHA256,'BASELINE_INPUT_CHANGED_DURING_RUN');out.ok=true;
 }catch(e){out.error=e.stack;process.exitCode=1;}
 finally{const outer=events().find(e=>e.type==='guard-ready')?.detail.pid;if(outer&&alive(outer))process.kill(outer);if(launcher.exitCode===null&&launcher.signalCode===null)await new Promise(r=>launcher.once('exit',r));out.finishedAtUnixMs=Date.now();fs.writeFileSync(path.join(destination,'entity-native-result.json'),JSON.stringify(out,null,2));console.log(JSON.stringify({ok:out.ok,error:out.error}));}
})();
