"use strict";
const {test}=require("node:test"), assert=require("node:assert/strict"), fs=require("node:fs"), os=require("node:os"), path=require("node:path");
const {Controller,cleanEnv,monotonic}=require("./controller.cjs");
const Engines=require("./engine-lineage.cjs");
const java=process.env.EFF_TEST_JAVA,workerJar=process.env.EFF_TEST_WORKERS;
if(!java||!workerJar)throw Error("Run Gradle managedRuntimeTest to supply the actual Java worker jar");
const {createHmac,randomUUID}=require("node:crypto");
function signed(c,body){const raw=JSON.stringify({session:c.session,epoch:c.hostEpoch,requestId:randomUUID(),...body});return {method:"POST",headers:{"X-EFF-Auth":createHmac("sha256",c.token).update("request:"+raw).digest("hex")},body:raw};}
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
 await t.test("generated executable class is the active engine and its child can generate a grandchild",async()=>{
  const proofs=[];for(let n=0;n<3;n++){const snap=await c.snapshot();proofs.push(snap.runtime.execution.engine);if(n<2)await execute("rebuild runtime.execution");}
  assert.equal(new Set(proofs.map(x=>x.className)).size,3);assert.equal(new Set(proofs.map(x=>x.bytecodeSHA256)).size,3);assert.equal(new Set(proofs.map(x=>x.loaderId)).size,3);
  for(let n=1;n<3;n++){assert.equal(proofs[n].descriptor.parent,proofs[n-1].descriptor.id);assert.equal(proofs[n].descriptor.generation,n);}
  assert.ok(c.events.some(e=>e.type==="engine-generated"&&e.generation===2&&e.source==="parent"));
 });
 await t.test("the independent JVM rejects changed bytecode even when its supplied hash is recomputed",async()=>{
  const parent=c.activeEngine("execution"),packet=await c.workers.execution.send({op:"generateEngine"});const bytes=Buffer.from(packet.artifact,"base64");bytes[bytes.length-1]^=1;packet.artifact=bytes.toString("base64");packet.bytecodeSHA256=Engines.hash(bytes);
  await assert.rejects(c.workers.policy.send({op:"verifyEngine",parent,packet}),/ENGINE_ARTIFACT_MISMATCH/);
 });
 await t.test("wrong parent, arbitrary source fields, double boot and generation exhaustion fail closed",async()=>{
  const parent=c.activeEngine("execution"),packet=await c.workers.execution.send({op:"generateEngine"});
  await assert.rejects(c.workers.policy.send({op:"verifyEngine",parent:Engines.descriptor("execution",c.ruleset),packet}),/ENGINE_ANCESTRY_MISMATCH/);
  await assert.rejects(c.workers.execution.send({op:"prepareEngine",descriptor:{...parent,source:"System.exit(0)"}}),/ENGINE_DESCRIPTOR_KEYS/);
  await assert.rejects(c.workers.execution.send({op:"bootEngine",packet}),/ENGINE_ALREADY_BOOTED/);
  const max=Engines.descriptor("execution",c.ruleset,16,"a".repeat(64));assert.throws(()=>Engines.successor(max),/ENGINE_GENERATION_BUDGET/);
  const invalid={...max,generation:17};await assert.rejects(c.workers.execution.send({op:"prepareEngine",descriptor:invalid}),/ENGINE_GENERATION_BUDGET/);
 });
 await t.test("a candidate snapshot mismatch cannot activate a child or mutate the durable checkpoint",async()=>{
  const before=JSON.stringify(c.durable),oldPid=c.workers.execution.child.pid,peer=c.workers.policy,send=peer.send.bind(peer);
  peer.send=async body=>body.op==="snapshot"?{forged:true}:send(body);
  try{await assert.rejects(execute("rebuild runtime.execution"),/ENGINE_SNAPSHOT_MISMATCH/);assert.equal(JSON.stringify(c.durable),before);assert.equal(c.workers.execution.child.pid,oldPid);}finally{peer.send=send;}
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
 c.workers.execution.failures=[];
 await t.test("a live but non-progressing worker is killed and replaced, then the transaction retries once",async()=>{
  const slot=c.workers.execution,old=slot.child.pid;slot.child.stdin.cork();
  await execute("inspect instance.world");assert.notEqual(c.workers.execution.child.pid,old);assert.ok(c.events.some(e=>e.type==="worker-replaced"&&e.reason==="WORKER_PROGRESS_TIMEOUT"));
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
  const response=fetch(c.endpoint+"/v1/host",signed(c,{op:"execute",source:"inspect instance.world",actor:"player",revision:c.durable.state.revision}));
  await wait(100);c.token="f".repeat(64);release();const reply=await response;assert.equal(reply.status,409);assert.equal((await reply.json()).error,"STALE_HOST_EPOCH");
 });
 await t.test("a valid signed request cannot be replayed or have its payload changed",async()=>{
  const request=signed(c,{op:"snapshot"});let response=await fetch(c.endpoint+"/v1/host",request);assert.equal(response.status,200);const raw=await response.text();assert.equal(response.headers.get("x-eff-auth"),createHmac("sha256",c.token).update("reply:"+raw).digest("hex"));
  response=await fetch(c.endpoint+"/v1/host",request);assert.equal((await response.json()).error,"REQUEST_REPLAY");
  response=await fetch(c.endpoint+"/v1/host",{...request,body:request.body.replace("snapshot","goodbye")});assert.equal((await response.json()).error,"INVALID_HOST_SIGNATURE");assert.equal(c.userStopped,undefined);
 });
 await t.test("a new controller process lifetime reloads durable revocation and sealed checkpoints",async()=>{
  await execute("seal checkpoint.origin");const rev=c.durable.state.revision;const lineage=JSON.stringify(c.durable.engines);await c.close();
  c=new Controller({java,workerJar,directory});await c.start();assert.equal(JSON.stringify(c.durable.engines),lineage);assert.equal(c.durable.state.recovery,false);assert.equal(c.durable.state.revision,rev);assert.equal(c.durable.state.checkpoints["checkpoint.origin"],undefined);
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
  c.host={pid:1};c.hostReady=false;c.hostStarted=monotonic();c.lastContact=monotonic();c.clientProgress=0;c.serverProgress=0;
  await c.monitor();assert.equal(c.detected,undefined);
  c.hostReady=true;c.clientProgress=monotonic();c.progress={active:true,paused:true};
  await c.monitor();assert.equal(c.detected,undefined);
  c.progress.paused=false;await c.monitor();assert.equal(c.detected,"HOST_PROGRESS_TIMEOUT");
  c.host=null;c.hostReady=false;c.replaceHost=oldReplace;
 });
 await t.test("replayed or decreasing progress never refreshes the watchdog",async()=>{
  c.progress=null;c.lastHeartbeatSequence=0;
  await c.dispatch({op:"heartbeat",sequence:1,clientTick:20,serverTick:40,active:true,paused:false});const stamp=c.lastContact;
  await assert.rejects(c.dispatch({op:"heartbeat",sequence:1,clientTick:20,serverTick:40}),/HEARTBEAT_REPLAY/);assert.equal(c.lastContact,stamp);
  await assert.rejects(c.dispatch({op:"heartbeat",sequence:2,clientTick:19,serverTick:41}),/HEARTBEAT_REPLAY/);assert.equal(c.lastContact,stamp);
  await c.dispatch({op:"heartbeat",sequence:3,clientTick:21,serverTick:41,active:true,paused:false});
 });
 await t.test("clock rollback cannot extend a dead active host's progress deadline",async()=>{
  const original=Date.now,replace=c.replaceHost;c.replaceHost=async reason=>{c.detected=reason;};c.detected=undefined;
  c.host={pid:1};c.hostReady=true;c.lastContact=monotonic()-30000;c.clientProgress=monotonic()-30000;c.serverProgress=monotonic()-30000;
  Date.now=()=>1;try{await c.monitor();assert.equal(c.detected,"HOST_PROGRESS_TIMEOUT");}finally{Date.now=original;c.replaceHost=replace;c.host=null;}
 });
 await t.test("launch environment excludes JVM option injection",async()=>{
  const before=process.env.JAVA_TOOL_OPTIONS;process.env.JAVA_TOOL_OPTIONS="-agentpath:unexpected";const oldNode=process.env.NODE_OPTIONS;process.env.NODE_OPTIONS="--require unexpected.cjs";assert.equal(cleanEnv().NODE_OPTIONS,undefined);if(oldNode===undefined)delete process.env.NODE_OPTIONS;else process.env.NODE_OPTIONS=oldNode;assert.equal(cleanEnv().JAVA_TOOL_OPTIONS,undefined);if(before===undefined)delete process.env.JAVA_TOOL_OPTIONS;else process.env.JAVA_TOOL_OPTIONS=before;
 });
 await t.test("a tripped worker circuit cannot be bypassed by another snapshot request",async()=>{
  const slot=c.workers.execution;slot.failures=Array(4).fill(monotonic());
  await assert.rejects(slot.replace("fault-budget-exhausted"),/WORKER_CIRCUIT_OPEN/);assert.equal(slot.child,null);
  await assert.rejects(slot.rpc({op:"snapshot",state:c.durable.state}),/WORKER_CIRCUIT_OPEN/);assert.equal(slot.child,null);
 });
 await t.test("corrupt durable state never silently becomes a fresh fight",async()=>{
  await c.close();const file=path.join(directory,"committed.json"),original=fs.readFileSync(file,"utf8");fs.writeFileSync(file,original.replace('"recovery":false','"recovery":true'));
  c=new Controller({java,workerJar,directory});await assert.rejects(c.start(),/COMMITTED_STATE_CORRUPT/);
 });
});


test("engine handoff lifecycle fences",async t=>{
 async function fixture(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),"eff-engine-lifecycle-"));const c=new Controller({java,workerJar,directory:dir});await c.start();try{await fn(c);}finally{await c.close();fs.rmSync(dir,{recursive:true,force:true});}}
 const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
 await t.test("concurrent starts wait for the complete engine boot handshake",()=>fixture(async c=>{
  await c.workers.execution.close();const {WorkerSlot}=require("./controller.cjs"),slot=new WorkerSlot(c,"execution");c.workers.execution=slot;
  const first=slot.start();const results=await Promise.all([first,slot.rpc({op:"snapshot",state:c.durable.state}),slot.rpc({op:"snapshot",state:c.durable.state})]);assert.equal(results[1].revision,c.durable.state.revision);assert.equal(results[2].revision,c.durable.state.revision);
 }));
 await t.test("postcommit retirement failure closes the controller with both child lineages committed",()=>fixture(async c=>{
  const old=c.workers.execution,close=old.close.bind(old);let calls=0;old.close=async()=>{if(++calls===1)throw Error("INJECTED_RETIREMENT_FAILURE");return close();};
  await assert.rejects(c.transition({source:"rebuild runtime.execution; rebuild runtime.policy",actor:"player",revision:c.durable.state.revision}),/ENGINE_RETIREMENT_FAILED/);
  assert.equal(c.closed,true);assert.equal(c.durable.engines.policy.length,2);assert.equal(c.durable.engines.execution.length,2);assert.equal(old.child,null);
 }));
 await t.test("simultaneous death of both JVMs fails closed instead of leaving a healthy-pulsing stuck controller",()=>fixture(async c=>{
  for(const slot of Object.values(c.workers))slot.child.kill();await wait(150);
  await assert.rejects(c.snapshot(),/ENGINE_PEER_UNAVAILABLE/);assert.equal(c.closed,true);assert.equal(c.fatalError,"ENGINE_PEER_UNAVAILABLE");
 }));
 await t.test("closing during an outstanding commit drains candidates and never activates them afterward",()=>fixture(async c=>{
  const original=c.persist.bind(c);let release,entered;const gate=new Promise(r=>release=r),ready=new Promise(r=>entered=r);let candidatePids=[];
  c.persist=async(...args)=>{candidatePids=[...c.candidates].map(w=>w.child.pid);entered();await gate;return original(...args);};
  const changing=c.transition({source:"rebuild runtime.execution",actor:"player",revision:c.durable.state.revision});await ready;await c.close();release();await assert.rejects(changing,/CONTROLLER_STOPPED/);assert.ok(candidatePids.every(pid=>!alive(pid)));assert.equal(c.candidates.size,0);
 }));
});
