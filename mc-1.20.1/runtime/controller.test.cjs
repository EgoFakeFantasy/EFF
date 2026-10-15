"use strict";
const {test}=require("node:test"), assert=require("node:assert/strict"), fs=require("node:fs"), os=require("node:os"), path=require("node:path");
const {Controller,cleanEnv}=require("./controller.cjs");
const java=process.env.EFF_TEST_JAVA,workerJar=process.env.EFF_TEST_WORKERS;
if(!java||!workerJar)throw Error("Run Gradle managedRuntimeTest to supply the actual Java worker jar");
const wait=ms=>new Promise(r=>setTimeout(r,ms));
test("independent JVMs, durable authority and fenced replacement",async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),"eff-multi-jvm-"));
 let c=new Controller({java,workerJar,directory,workerTimeout:1500});await c.start();
 const execute=(source,actor="player")=>c.queue(()=>c.transition({source,actor,revision:c.durable.state.revision}));
 t.after(async()=>{await c.close();fs.rmSync(directory,{recursive:true,force:true});});
 await t.test("policy and execution run in distinct real processes",async()=>{
  assert.ok(c.workers.policy.child.pid>0);assert.notEqual(c.workers.policy.child.pid,c.workers.execution.child.pid);
  const s=await c.snapshot();assert.equal(s.fields["control.tether.active"],true);
 });
 await t.test("whole-program parsing rejects injection before mutation",async()=>{
  const before=JSON.stringify(c.durable);await assert.rejects(execute("erase entity.avatar; java.lang.Runtime.halt(0)"),/PROGRAM_SYNTAX|UNKNOWN_INTERVENTION/);assert.equal(JSON.stringify(c.durable),before);
 });
 await t.test("a real removed body can be recovered from the intruder checkpoint",async()=>{
  await execute("erase entity.avatar");assert.equal(c.durable.state.avatar,false);
  await execute("restore checkpoint.origin","intruder");assert.equal(c.durable.state.avatar,true);
 });
 await t.test("named checkpoints and a fresh instance survive independent evaluation",async()=>{
  const old=c.durable.state.instance;await execute("save checkpoint.player; rebuild instance.world");
  assert.notEqual(c.durable.state.instance,old);assert.equal(c.durable.state.generation,2);
  assert.equal(c.durable.state.checkpoints["checkpoint.player"].owner,"player");
  await execute("rebuild instance.world; save checkpoint.player; rebuild instance.world");
  assert.equal(c.durable.state.generation,4);
 });
 await t.test("one-shot guards commit their fired state instead of rearming on recovery",async()=>{
  await execute("watch guard when entity.avatar.alive == false -> disable event.possess");
  await execute("erase entity.avatar");assert.equal(c.durable.state.possess,false);assert.equal(c.durable.state.watches.guard.fired,true);
  await execute("restore checkpoint.origin","intruder");assert.equal(c.durable.state.possess,true);assert.equal(c.durable.state.watches.guard.fired,true);
 });
 await t.test("unmanaged host rebuild is rejected before committing any effects",async()=>{
  const before=JSON.stringify(c.durable);await assert.rejects(execute("erase entity.avatar; rebuild runtime.host"),/HOST_NOT_MANAGED/);assert.equal(JSON.stringify(c.durable),before);
 });
 await t.test("disk failure cannot acknowledge a transition or alter the committed authority",async()=>{
  const file=path.join(directory,"committed.json.tmp"),before=JSON.stringify(c.durable);
  fs.mkdirSync(file);try{await assert.rejects(execute("disable control.tether"));assert.equal(JSON.stringify(c.durable),before);}finally{fs.rmdirSync(file);}
 });
 await t.test("independent policy JVM rejects forged transitions",async()=>{
  const body={op:"transition",state:c.durable.state,revision:c.durable.state.revision,source:"inspect instance.world",actor:"player",candidate:{state:{recovery:false}}};
  await assert.rejects(c.workers.policy.rpc(body),/POLICY_TRANSITION_MISMATCH/);
 });
 await t.test("a live but non-progressing worker is killed and replaced, then the transaction retries once",async()=>{
  const slot=c.workers.execution,old=slot.child.pid;slot.child.stdin.cork();
  await execute("inspect instance.world");assert.notEqual(slot.child.pid,old);assert.ok(c.events.some(e=>e.type==="worker-replaced"&&e.reason==="WORKER_PROGRESS_TIMEOUT"));
 });
 await t.test("revocation is committed outside every replaceable JVM",async()=>{
  await execute("disable control.tether; disable event.possess; disable authority.recovery");assert.equal(c.durable.state.recovery,false);
  const body=JSON.parse(fs.readFileSync(path.join(directory,"committed.json"))).body;assert.equal(body.state.recovery,false);
 });
 await t.test("gameplay replaces two real JVMs without reviving revoked sources",async()=>{
  const a=c.workers.policy.child.pid,b=c.workers.execution.child.pid;
  await execute("rebuild runtime.execution; rebuild runtime.policy");assert.notEqual(c.workers.policy.child.pid,a);assert.notEqual(c.workers.execution.child.pid,b);assert.equal(c.durable.state.recovery,false);
 });
 await t.test("late replies from the stopped epoch cannot complete a newer request",async()=>{
  const slot=c.workers.execution;assert.equal(slot.deliver({id:"execution:1",epoch:slot.epoch-1,ok:true,result:{}},{pid:123},slot.epoch-1),false);
  assert.equal(c.durable.state.recovery,false);
 });
 await t.test("actual policy process death is detected on the next operation",async()=>{
  const old=c.workers.policy.child.pid;c.workers.policy.child.kill();await wait(150);
  await execute("inspect authority.recovery");assert.notEqual(c.workers.policy.child.pid,old);assert.equal(c.durable.state.recovery,false);
 });
 await t.test("intruder cannot restore or replace layers after authority was cut",async()=>{
  for(const source of ["restore checkpoint.origin","rebuild instance.world","rebuild runtime.execution","rebuild runtime.host"]){const r=await execute(source,"intruder");assert.match(JSON.stringify(r.receipt),/RECOVERY_AUTHORITY_REVOKED/);assert.equal(c.durable.state.recovery,false);}
 });
 await t.test("old observations and unauthenticated HTTP writes fail closed",async()=>{
  await assert.rejects(c.transition({source:"spawn entity.avatar",actor:"intruder",revision:0}),/STALE_RESEARCH_REVISION/);
  const response=await fetch(c.endpoint+"/v1/host",{method:"POST",body:JSON.stringify({op:"execute",source:"spawn entity.avatar"})});assert.equal(response.status,409);
 });
 await t.test("an authenticated old host write loses its lease while waiting in the transaction queue",async()=>{
  let release;const block=new Promise(resolve=>release=resolve);c.queue(()=>block);
  const response=fetch(c.endpoint+"/v1/host",{method:"POST",headers:{"X-EFF-Lease":c.token},body:JSON.stringify({session:c.session,epoch:c.hostEpoch,op:"execute",source:"inspect instance.world",actor:"player",revision:c.durable.state.revision})});
  await wait(100);c.token="f".repeat(64);release();const reply=await response;assert.equal(reply.status,409);assert.equal((await reply.json()).error,"STALE_HOST_EPOCH");
 });
 await t.test("a new controller process lifetime reloads durable revocation and sealed checkpoints",async()=>{
  await execute("seal checkpoint.origin");const rev=c.durable.state.revision;await c.close();
  c=new Controller({java,workerJar,directory});await c.start();assert.equal(c.durable.state.recovery,false);assert.equal(c.durable.state.revision,rev);assert.equal(c.durable.state.checkpoints["checkpoint.origin"],undefined);
 });
 await t.test("long sessions keep worker envelopes bounded without losing authority",async()=>{
  const source=Array(16).fill("inspect authority.recovery").join("; ");
  for(let n=0;n<50;n++)await execute(source);
  assert.ok(JSON.stringify(c.durable.state.journal).length<=48000);assert.equal(c.durable.state.recovery,false);
 });
 await t.test("finish uses the preserved state, then rejects further intervention",async()=>{
  await execute("erase entity.avatar; refuse ending.owned");assert.equal(c.durable.state.outcome,"won");
  await assert.rejects(execute("rebuild runtime.execution"),/RESEARCH_FINISHED/);
 });
 await t.test("world loading and deliberate pause are distinct from a stalled active loop",async()=>{
  const oldReplace=c.replaceHost;c.replaceHost=async reason=>{c.detected=reason;};
  c.host={pid:1};c.hostReady=false;c.hostStarted=Date.now();c.lastContact=Date.now();c.clientProgress=0;c.serverProgress=0;
  await c.monitor();assert.equal(c.detected,undefined);
  c.hostReady=true;c.clientProgress=Date.now();c.progress={active:true,paused:true};
  await c.monitor();assert.equal(c.detected,undefined);
  c.progress.paused=false;await c.monitor();assert.equal(c.detected,"HOST_PROGRESS_TIMEOUT");
  c.host=null;c.hostReady=false;c.replaceHost=oldReplace;
 });
 await t.test("launch environment excludes JVM option injection",async()=>{
  const before=process.env.JAVA_TOOL_OPTIONS;process.env.JAVA_TOOL_OPTIONS="-agentpath:unexpected";assert.equal(cleanEnv().JAVA_TOOL_OPTIONS,undefined);if(before===undefined)delete process.env.JAVA_TOOL_OPTIONS;else process.env.JAVA_TOOL_OPTIONS=before;
 });
 await t.test("a tripped worker circuit cannot be bypassed by another snapshot request",async()=>{
  const slot=c.workers.execution;slot.failures=Array(4).fill(Date.now());
  await assert.rejects(slot.replace("fault-budget-exhausted"),/WORKER_CIRCUIT_OPEN/);assert.equal(slot.child,null);
  await assert.rejects(slot.rpc({op:"snapshot",state:c.durable.state}),/WORKER_CIRCUIT_OPEN/);assert.equal(slot.child,null);
 });
 await t.test("corrupt durable state never silently becomes a fresh fight",async()=>{
  await c.close();const file=path.join(directory,"committed.json"),original=fs.readFileSync(file,"utf8");fs.writeFileSync(file,original.replace('"recovery":false','"recovery":true'));
  c=new Controller({java,workerJar,directory});await assert.rejects(c.start(),/COMMITTED_STATE_CORRUPT/);
 });
});
