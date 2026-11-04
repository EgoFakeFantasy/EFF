"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{createInterface}=require('node:readline'),{createHash,randomUUID}=require('node:crypto');
const Engines=require('./engine-lineage.cjs');
const java=process.env.EFF_TEST_JAVA,jar=process.env.EFF_TEST_WORKERS;
if(!java||!jar)throw Error('Supply EFF_TEST_JAVA and EFF_TEST_WORKERS');
const ruleset=createHash('sha256').update(fs.readFileSync(jar)).digest('hex');
function worker(role){
 const child=spawn(java,['-Xms16m','-Xmx64m','-XX:+UseSerialGC','-XX:ActiveProcessorCount=2','-XX:+DisableAttachMechanism','-cp',jar,'eff.runtime.Worker',role],{stdio:['pipe','pipe','pipe'],windowsHide:true});
 let serial=0;const pending=new Map();child.stderr.resume();
 createInterface({input:child.stdout,crlfDelay:Infinity}).on('line',line=>{const reply=JSON.parse(line),p=pending.get(reply.id);if(!p)return;pending.delete(reply.id);clearTimeout(p.timer);reply.ok?p.resolve(reply.result):p.reject(Error(reply.error));});
 child.on('exit',()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('WORKER_EXITED'));}pending.clear();});
 return {child,send(body){return new Promise((resolve,reject)=>{const id=role+':'+(++serial),timer=setTimeout(()=>{pending.delete(id);reject(Error('TEST_WORKER_TIMEOUT'));},10000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({id,epoch:1,body})+'\n');});},async close(){if(child.exitCode!==null||child.signalCode!==null)return;child.stdin.end();await Promise.race([new Promise(r=>child.once('exit',r)),new Promise(r=>setTimeout(r,1000))]);if(child.exitCode===null&&child.signalCode===null)child.kill();}};
}
async function boot(w,role,packet){packet||=await w.send({op:'prepareEngine',descriptor:Engines.descriptor(role,ruleset)});return w.send({op:'bootEngine',packet});}
const clone=structuredClone;
const transition=(w,state,source,actor='player')=>w.send({op:'transition',state,source,actor,revision:state.revision,transaction:randomUUID()});

test('real generated JVM layers reject ambient capability/state pollution and retain legal progress',async t=>{
 const execution=worker('execution'),policy=worker('policy');let successor;
 t.after(async()=>{await Promise.all([execution.close(),policy.close(),successor?.close()].filter(Boolean));});
 const rootProof=await boot(execution,'execution');await boot(policy,'policy');const initial=await execution.send({op:'initial'});
 await t.test('canonical gameplay genesis is accepted without treating fiction authority as OS privilege',async()=>{
  assert.equal(initial.revision,0);assert.equal(initial.generation,1);for(const key of ['avatar','tether','possess','recovery'])assert.equal(initial[key],true);
  assert.deepEqual(await execution.send({op:'snapshot',state:initial}),await policy.send({op:'snapshot',state:initial}));
 });
 await t.test('unknown root execution/capability context cannot be inherited by either worker',async()=>{
  for(const key of ['ambientAuthorities','runtime','initialPermissions','nativeAgent']){const bad={...clone(initial),[key]:{marker:'data-only-no-code'}};for(const w of [execution,policy])await assert.rejects(w.send({op:'snapshot',state:bad}),/STATE_UNKNOWN_OR_MISSING_KEYS/);await assert.rejects(transition(execution,bad,'inspect authority.recovery'),/STATE_UNKNOWN_OR_MISSING_KEYS/);}
 });
 await t.test('string booleans, malformed integers and inconsistent terminal facts are rejected',async()=>{
  for(const patch of [{recovery:'true'},{revision:'0'},{generation:0},{counterRounds:1},{instance:'1-1-1-1-1'},{outcome:'won',refused:true}])await assert.rejects(execution.send({op:'snapshot',state:{...clone(initial),...patch}}),/STATE_/);
 });
 await t.test('checkpoint payload cannot smuggle capabilities or an unknown owner',async()=>{
  let bad=clone(initial);bad.checkpoints['checkpoint.origin'].permissions={nativeAgent:true};await assert.rejects(execution.send({op:'snapshot',state:bad}),/STATE_UNKNOWN_OR_MISSING_KEYS/);
  bad=clone(initial);bad.checkpoints['checkpoint.origin'].owner='native-observer';await assert.rejects(execution.send({op:'snapshot',state:bad}),/STATE_ACTOR_INVALID/);
 });
 let watched=(await transition(execution,initial,'watch playerguard when entity.avatar.alive == false -> disable event.possess')).state;
 await t.test('watch owner is checked both when overwriting and removing a player defense',async()=>{
  const rejected=await transition(execution,watched,'unwatch playerguard','intruder');assert.equal(rejected.receipt.steps[0].accepted,false);assert.equal(rejected.receipt.steps[0].reason,'WATCH_OWNERSHIP');assert.deepEqual(rejected.state.watches,watched.watches);
  const own=await transition(execution,rejected.state,'unwatch playerguard');assert.equal(own.receipt.steps[0].accepted,true);assert.deepEqual(own.state.watches,{});
 });
 await t.test('watch name/program mismatch and nested journal execution fields are rejected',async()=>{
  let bad=clone(watched);bad.watches.playerguard.program='watch another when entity.avatar.alive == false -> disable event.possess';await assert.rejects(execution.send({op:'snapshot',state:bad}),/STATE_WATCH_INVALID/);
  bad=clone(watched);bad.watches.playerguard.program='watch playerguard when unknown.permission == false -> disable event.possess';await assert.rejects(execution.send({op:'snapshot',state:bad}),/STATE_WATCH_FIELD_INVALID/);
  bad=clone(watched);bad.journal[0].runtime={privileges:true};await assert.rejects(execution.send({op:'snapshot',state:bad}),/STATE_UNKNOWN_OR_MISSING_KEYS/);
 });
 let legal=(await transition(execution,watched,'save checkpoint.player; erase entity.avatar')).state;
 await t.test('legal checkpoints, fired guards and their receipts survive validation',async()=>{
  assert.equal(legal.watches.playerguard.fired,true);assert.equal(legal.possess,false);assert.equal(legal.checkpoints['checkpoint.player'].owner,'player');
  const snapshot=await execution.send({op:'snapshot',state:legal});assert.equal(snapshot.watches[0].fired,true);assert.ok(snapshot.journal.some(r=>r.actor==='player/watch'));
 });
 legal=(await transition(execution,legal,'disable control.tether; disable event.possess; disable authority.recovery')).state;
 await t.test('real G1 child retains revoked authority and legal records while refusing pollution',async()=>{
  const packet=await execution.send({op:'generateEngine'});assert.equal((await policy.send({op:'verifyEngine',parent:rootProof.descriptor,packet})).verified,true);
  successor=worker('execution');const childProof=await boot(successor,'execution',packet);assert.equal(childProof.descriptor.generation,1);assert.notEqual(childProof.bytecodeSHA256,rootProof.bytecodeSHA256);
  await assert.rejects(successor.send({op:'initial'}),/ENGINE_INITIAL_ONLY_AT_GENESIS/);
  const child=await successor.send({op:'snapshot',state:legal});assert.equal(child.recovery,false);assert.equal(child.watches[0].fired,true);assert.ok(child.checkpoints.some(c=>c.handle==='checkpoint.player'));
  await assert.rejects(successor.send({op:'snapshot',state:{...clone(legal),ambientAuthorities:{marker:true}}}),/STATE_UNKNOWN_OR_MISSING_KEYS/);
 });
 await t.test('legal victory validates; native reports cannot mutate authority or restore terminal control',async()=>{
  await assert.rejects(transition(execution,initial,'entity.avatar removed externally','native-observer'),/OBSERVATION_IS_NOT_AUTHORITY/);
  const win=(await transition(execution,legal,'refuse ending.owned')).state;assert.equal(win.outcome,'won');assert.equal(win.refused,true);assert.equal((await successor.send({op:'snapshot',state:win})).recovery,false);
  await assert.rejects(successor.send({op:'snapshot',state:{...clone(win),avatar:true}}),/STATE_ENDING_INCONSISTENT/);
 });
 await t.test('legal lost ending and failed watch receipts keep their original semantics',async()=>{
  let lost=clone(initial);for(let n=0;n<3;n++)lost=(await transition(execution,lost,'bind control.tether','intruder')).state;lost=(await transition(execution,lost,'commit ending.owned','intruder')).state;assert.equal(lost.outcome,'lost');await execution.send({op:'snapshot',state:lost});
  const armed=(await transition(execution,initial,'watch blocked when entity.avatar.alive == false -> bind control.tether')).state;
  const triggered=(await transition(execution,armed,'erase entity.avatar')).state;assert.ok(triggered.journal.some(r=>r.actor==='player/watch'&&r.reason==='ACTOR_AUTHORITY'));await execution.send({op:'snapshot',state:triggered});
 });
});
