"use strict";
const fs = require("node:fs"), path = require("node:path"), http = require("node:http");
const { spawn } = require("node:child_process"), { randomBytes, createHash, createHmac, timingSafeEqual } = require("node:crypto");
const { createInterface } = require("node:readline");
const Engines = require("./engine-lineage.cjs");
const { HostFirewall, assertNoInjection } = require("./intrusion-defense.cjs");
const Defense = require("./projection-guard.cjs");
const StateBoundary = require("./state-boundary.cjs");
const monotonic = () => Number(process.hrtime.bigint()/1000000n);
const wait = ms => new Promise(r => setTimeout(r, ms));
const {cleanEnv,workerEnv,assertHostArguments}=require("./launch-policy.cjs");
function atomic(file, value) {
  const text=JSON.stringify(value), temp=file+".tmp";
  const fd=fs.openSync(temp,"w",0o600);
  try {fs.writeFileSync(fd,text);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  fs.renameSync(temp,file);
}
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
class WorkerSlot {
  constructor(owner, role){this.owner=owner;this.role=role;this.epoch=0;this.serial=0;this.pending=new Map();this.failures=[];}
  async start() {
    if(this.owner.closed||this.stopped)throw Error("CONTROLLER_STOPPED");
    if(this.circuit)throw Error("WORKER_CIRCUIT_OPEN");
    if(this.starting)return this.starting;
    if(this.child){if(this.child.exitCode!==null||this.child.signalCode!==null)throw Error("WORKER_EXITED");return;}
    this.starting=this.boot();try{await this.starting;}finally{this.starting=null;}
  }
  async boot(){
    await this.owner.config.store?.verify();
    if(this.owner.closed||this.stopped)throw Error("CONTROLLER_STOPPED");
    this.epoch++;
    const java=this.owner.config.javaByRole?.[this.role] || this.owner.config.java;
    const privateDirectory=path.join(this.owner.directory,"worker-private",this.role+"-"+this.epoch+"-"+randomBytes(6).toString("hex"));fs.mkdirSync(privateDirectory,{recursive:true});
    const child=spawn(java,["-Xms16m","-Xmx64m","-XX:+UseSerialGC","-XX:ReservedCodeCacheSize=24m","-XX:ActiveProcessorCount=2","-XX:+DisableAttachMechanism","-XX:+ExitOnOutOfMemoryError","-XX:ErrorFile="+path.join(this.owner.directory,"worker-error-%p.log"),"-cp",this.owner.config.workerJar,"eff.runtime.Worker",this.role],{env:workerEnv(java,privateDirectory),cwd:privateDirectory,stdio:["pipe","pipe","pipe"],windowsHide:true});
    this.child=child;
    const epoch=this.epoch;
    child.stderr.on("data",()=>{}); // never forward arbitrary process arguments or secrets
    child.on("error",()=>this.fail(child,"WORKER_START_FAILED"));
    child.on("exit",()=>this.fail(child,"WORKER_EXITED"));
    child.stdin.on("error",()=>this.fail(child,"WORKER_PIPE_FAILED"));
    let buffered="";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data",chunk=>{
      if(this.child!==child || this.epoch!==epoch)return;
      buffered+=chunk;
      if(buffered.length>524288){this.fail(child,"WORKER_OUTPUT_BUDGET");child.kill();return;}
      let at;
      while((at=buffered.indexOf("\n"))>=0){const line=buffered.slice(0,at);buffered=buffered.slice(at+1);try{this.deliver(JSON.parse(line),child,epoch);}catch{this.fail(child,"WORKER_BAD_JSON");child.kill();}}
    });
    this.owner.event("worker-start",{role:this.role,pid:child.pid,epoch});
    try{
      const descriptor=this.descriptorOverride||this.owner.activeEngine(this.role);
      const packet=Engines.validatePacket(this.packetOverride||await this.send({op:"prepareEngine",descriptor}),descriptor);
      this.engineProof=await this.send({op:"bootEngine",packet});
      if(Object.keys(descriptor).some(k=>this.engineProof.descriptor?.[k]!==descriptor[k])||this.engineProof.bytecodeSHA256!==packet.bytecodeSHA256||this.engineProof.className!==packet.className||!this.engineProof.loaderId)throw Error("ENGINE_BOOT_ATTESTATION");
    }catch(e){await this.close();throw e;}
  }
  deliver(reply, child, epoch) {
    const p=this.pending.get(reply.id);
    if(this.child!==child || this.epoch!==epoch || reply.epoch!==epoch || !p || p.child!==child){this.owner.event("stale-worker-reply",{role:this.role,epoch});return false;}
    this.pending.delete(reply.id);clearTimeout(p.timer);
    reply.ok ? p.resolve(reply.result) : p.reject(Object.assign(Error(reply.error||"WORKER_REJECTED"),{semantic:true}));return true;
  }
  fail(child,reason){for(const [id,p] of this.pending)if(p.child===child){this.pending.delete(id);clearTimeout(p.timer);p.reject(Error(reason));}}
  async replace(reason) {
    return (await this.owner.regenerate([this.role],this.owner.durable.state,reason))[this.role];
  }
  async send(body){
    const child=this.child,epoch=this.epoch,id=`${this.role}:${++this.serial}`;
    if(!child||child.exitCode!==null||child.signalCode!==null)throw Error("WORKER_EXITED");
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(Error("WORKER_PROGRESS_TIMEOUT"));},this.owner.config.workerTimeout||4000);
      this.pending.set(id,{resolve,reject,timer,child});child.stdin.write(JSON.stringify({id,epoch,body})+"\n");
    });
  }
  async rpc(body,attempt=0) {
    try{await this.start();return await this.send(body);}
    catch(e){if(e.semantic||attempt>=1||!this.owner.durable)throw e;const next=await this.replace(e.message);return next.rpc(body,attempt+1);}
  }
  async close(){this.stopped=true;const child=this.child;this.child=null;if(child){this.fail(child,"CONTROLLER_STOPPED");await terminate(child);}}
}
async function terminate(child) {
  if(child.exitCode!==null || child.signalCode!==null)return;
  const stopped=new Promise(resolve=>child.once("exit",resolve));
  child.kill();
  await Promise.race([stopped,wait(3000)]);
  if(child.exitCode===null && child.signalCode===null){child.kill("SIGKILL");await Promise.race([stopped,wait(3000)]);}
  if(child.exitCode===null&&child.signalCode===null)throw Error("OLD_PROCESS_DID_NOT_EXIT");
}
class Controller {
  constructor(config){
    this.config=config;this.directory=path.resolve(config.directory);fs.mkdirSync(this.directory,{recursive:true});
    this.ruleset=Engines.hash(fs.readFileSync(config.workerJar));
    this.initialEngines=Engines.roots(this.ruleset);
    this.session=randomBytes(16).toString("hex");this.token=randomBytes(32).toString("hex");this.hostEpoch=0;this.requireProjection=!!config.host?.args?.includes("-Deff.previewResearch=true");this.projectionGuard=new Defense.ProjectionGuard(config.projectionGuard);
    this.workers={policy:new WorkerSlot(this,"policy"),execution:new WorkerSlot(this,"execution")};this.events=[];this.firewall=new HostFirewall(monotonic);this.serial=Promise.resolve();this.closed=false;this.hostFailures=[];this.seenRequests=new Set();this.candidates=new Set();
  }
  event(type,details={}){this.events.push({time:Date.now(),type,...details});if(this.events.length>128)this.events.shift();}
  queue(fn){const p=this.serial.then(fn);this.serial=p.catch(()=>{});return p;}
  activeEngine(role){return (this.durable?.engines||this.initialEngines)[role].at(-1);}
  async persist(state,engines=this.durable?.engines||this.initialEngines,defense=this.durable?.defense||Defense.initialDefense()){
    StateBoundary.validateContinuation(this.durable?.state,state);
    Engines.validateLineage(engines,this.ruleset);
    Defense.validateDefense(defense);
    const body={schema:1,commit:(this.durable?.commit||0)+1,state,engines,defense};
    if(this.config.store) await this.config.store.commit(this.durable?.commit||0,body);
    else atomic(path.join(this.directory,"committed.json"),{body,sha256:digest(body)});this.durable=body;
  }
  async start() {
    if(!this.config.store){this.lock=path.join(this.directory,"controller.lock");
    try{const fd=fs.openSync(this.lock,"wx");fs.writeFileSync(fd,JSON.stringify({pid:process.pid,session:this.session}));fs.closeSync(fd);}
    catch(e){throw Error("CONTROLLER_DIRECTORY_LOCKED_USE_NEW_DIRECTORY_OR_REMOVE_VERIFIED_STALE_LOCK");}
    }
    const saved=path.join(this.directory,"committed.json");
    try {
      if(this.config.store){this.durable=await this.config.store.load();this.restored=!!this.durable;if(!this.durable)await this.persist(await this.workers.execution.rpc({op:"initial"}));}
      else if(fs.existsSync(saved)) {const parsed=JSON.parse(fs.readFileSync(saved,"utf8"));if(parsed.sha256!==digest(parsed.body)||parsed.body.schema!==1)throw Error("COMMITTED_STATE_CORRUPT");this.durable=parsed.body;this.restored=true;}
      else await this.persist(await this.workers.execution.rpc({op:"initial"}));
      StateBoundary.validateState(this.durable.state);
      if(!this.durable.engines)await this.persist(this.durable.state,this.initialEngines);
      if(!this.durable.defense)await this.persist(this.durable.state);
      Defense.validateDefense(this.durable.defense);
      if(this.config.host&&this.config.admission?.quarantineOnFault&&(this.restored||this.durable.defense.incidents>0))throw Error("HOST_CAPABILITIES_QUARANTINED");
      if(this.durable.defense.circuitOpen)throw Error("PROJECTION_RESTART_CIRCUIT");
      Engines.validateLineage(this.durable.engines,this.ruleset);
      await this.workers.policy.rpc({op:"snapshot",state:this.durable.state});
      this.server=http.createServer({maxHeaderSize:4096,headersTimeout:3000,requestTimeout:5000},(req,res)=>this.handle(req,res));
      this.server.maxConnections=16;
      await new Promise((resolve,reject)=>{this.server.once("error",reject);this.server.listen(0,"127.0.0.1",resolve);});
      this.endpoint=`http://127.0.0.1:${this.server.address().port}`;
      if(this.config.externalControl){this.controlKey=randomBytes(32).toString('hex');this.controlSeen=new Set();atomic(path.join(this.directory,'control.json'),{schema:1,endpoint:this.endpoint,session:this.session,key:this.controlKey});}
      if(this.config.host)await this.spawnHost();
      this.timer=setInterval(()=>this.monitor().catch(e=>{this.event("host-circuit",{reason:e.message});}),1000);
      return this;
    }catch(e){await this.close();throw e;}
  }
  authorized(req,body){
    const supplied=Buffer.from(req.headers["x-eff-auth"]||"","utf8");
    const actual=Buffer.from(createHmac("sha256",this.token).update("request:").update(body).digest("hex"));
    return supplied.length===actual.length&&timingSafeEqual(supplied,actual);
  }
  async handle(req,res){
    if(req.url==='/v1/control')return this.handleControl(req,res);
    res.setHeader("Content-Type","application/json");res.setHeader("Cache-Control","no-store");
    const finish=(status,body)=>{const raw=JSON.stringify(body);res.statusCode=status;res.setHeader("X-EFF-Auth",createHmac("sha256",this.token).update("reply:"+raw).digest("hex"));res.end(raw);};
    try{
      if(req.method!=="POST"||req.url!=="/v1/host"||!/^[0-9a-f]{64}$/.test(req.headers["x-eff-auth"]||""))throw Error("INVALID_HOST_SIGNATURE");
      if((this.inFlight||0)>=8)throw Error("REQUEST_QUEUE_BUDGET");
      this.inFlight=(this.inFlight||0)+1;let admitted=true;res.once("close",()=>{if(admitted){admitted=false;this.inFlight--;}});req.setTimeout(3000,()=>req.destroy());
      const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>65536)throw Error("REQUEST_BUDGET");chunks.push(chunk);}req.setTimeout(0);
      const raw=Buffer.concat(chunks);if(!this.authorized(req,raw))throw Error("INVALID_HOST_SIGNATURE");
      const r=JSON.parse(raw.toString("utf8"));if(r.session!==this.session||r.epoch!==this.hostEpoch)throw Error("STALE_HOST_EPOCH");
      // Signed only proves the request came from inside MC; admission is decided out here.
      try{this.firewall.admit(r);}catch(e){if(e.intrusion)this.intrusion(e.message,this.hostEpoch);throw e;}
      if(typeof r.requestId!=="string"||!/^[-a-zA-Z0-9]{16,64}$/.test(r.requestId))throw Error("INVALID_REQUEST_ID");
      if(this.seenRequests.has(r.requestId))throw Error("REQUEST_REPLAY");this.seenRequests.add(r.requestId);if(this.seenRequests.size>512)this.seenRequests.delete(this.seenRequests.values().next().value);
      const key=this.token,epoch=this.hostEpoch;
      const execute=async()=>{if(key!==this.token||epoch!==this.hostEpoch)throw Error("STALE_HOST_EPOCH");return this.dispatch(r);};
      const result=await (["heartbeat","goodbye"].includes(r.op)?execute():this.queue(execute));
      finish(200,{ok:true,session:this.session,epoch,result});
    }catch(e){finish(409,{ok:false,error:/^[A-Z0-9_]+$/.test(e.message)?e.message:"CONTROLLER_FAILURE"});}
  }
  async dispatch(r){
    switch(r.op){
      case "heartbeat":
        if(!Number.isSafeInteger(r.clientTick)||!Number.isSafeInteger(r.serverTick)||r.clientTick<0||r.serverTick<0||!Number.isSafeInteger(r.sequence))throw Error("INVALID_PROGRESS");
        if(r.sequence<=(this.lastHeartbeatSequence||0)||this.progress&&(r.clientTick<this.progress.clientTick||r.serverTick<this.progress.serverTick))throw Error("HEARTBEAT_REPLAY");
        if(r.projection!==undefined)this.projectionGuard.observe(r.projection,this.durable.state,monotonic());
        try{this.firewall.checkHeartbeat(r.clientTick);}catch(e){this.intrusion(e.message,this.hostEpoch);throw e;}
        this.lastHeartbeatSequence=r.sequence;
        this.lastContact=monotonic();
        if(r.active===true&&(!this.requireProjection||this.projectionGuard.ready(this.durable.state)))this.hostReady=true;
        if(this.progress?.clientTick!==r.clientTick){this.clientProgress=monotonic();}
        if(this.progress?.serverTick!==r.serverTick){this.serverProgress=monotonic();}
        this.progress={clientTick:r.clientTick,serverTick:r.serverTick,paused:r.paused===true,active:r.active===true};
        return {commit:this.durable.commit,initialized:!!this.hostReady};
      case "goodbye":
        if(this.config.store)throw Error("HOST_STOP_REQUIRES_OUTER_CONTROL");
        if(this.projectionGuard.hasFault(this.durable.state))throw Error("HOST_STOP_WITH_UNRESOLVED_FAULT");
        this.firewall.noteGoodbye();this.event('host-goodbye-demo');return {stopping:true};
      case "snapshot":return this.snapshot();
      case "execute":if(this.config.admission?.hostMutation==="disabled")throw Error("UNTRUSTED_HOST_READ_ONLY");if(this.requireProjection&&!this.hostReady)throw Error("HOST_NOT_INITIALIZED");return this.transition(r);
      default:throw Error("CONTROLLER_OP_NOT_ALLOWED");
    }
  }
  async handleControl(req,res){
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
    let authenticated=false;
    const finish=(status,body)=>{const raw=JSON.stringify(body);res.statusCode=status;if(authenticated)res.setHeader('X-EFF-Auth',createHmac('sha256',this.controlKey).update('control-reply:'+raw).digest('hex'));res.end(raw);};
    try{
      if(!this.controlKey||req.method!=='POST'||(this.controlInFlight||0)>=2)throw Error('CONTROL_NOT_AUTHORIZED');
      this.controlInFlight=(this.controlInFlight||0)+1;let counted=true;res.once('close',()=>{if(counted){counted=false;this.controlInFlight--;}});
      req.setTimeout(3000,()=>req.destroy());const chunks=[];let bytes=0;
      for await(const chunk of req){bytes+=chunk.length;if(bytes>8192)throw Error('CONTROL_REQUEST_BUDGET');chunks.push(chunk);}req.setTimeout(0);const raw=Buffer.concat(chunks).toString('utf8');
      const actual=Buffer.from(createHmac('sha256',this.controlKey).update('control-request:'+raw).digest('hex')),given=Buffer.from(req.headers['x-eff-auth']||'');
      if(actual.length!==given.length||!timingSafeEqual(actual,given))throw Error('CONTROL_NOT_AUTHORIZED');authenticated=true;
      const r=JSON.parse(raw),fields=r.op==='execute'?['op','session','requestId','revision','commit','source']:['op','session','requestId'];
      if(!r||Array.isArray(r)||Object.keys(r).some(k=>!fields.includes(k))||!['snapshot','execute','stop'].includes(r.op))throw Error('CONTROL_REQUEST_INVALID');
      if(r.session!==this.session||typeof r.requestId!=='string'||!/^[a-f0-9]{32}$/.test(r.requestId))throw Error('CONTROL_REQUEST_INVALID');
      if(this.controlSeen.has(r.requestId)||this.controlSeen.size>=4096)throw Error('CONTROL_REQUEST_REPLAY_OR_BUDGET');this.controlSeen.add(r.requestId);
      const result=await this.queue(async()=>{
        if(this.closed)throw Error('CONTROLLER_STOPPED');
        if(r.op==='snapshot')return this.snapshot();
        if(r.op==='stop'){this.event('external-user-stop');setTimeout(()=>this.userStop(),100);return {stopping:true,source:'external-console'};}
        if(r.commit!==this.durable.commit)throw Error('STALE_CONTROL_COMMIT');
        if(this.requireProjection&&!this.hostReady)throw Error('HOST_NOT_INITIALIZED');
        if(typeof r.source!=='string'||r.source.length>4096||require('./intrusion-defense.cjs').DISGUISE.test(r.source))throw Error('INVALID_PROGRAM_REQUEST');
        this.event('external-player-action',{commit:r.commit});return this.transition({source:r.source,revision:r.revision,actor:'player'});
      });finish(200,{ok:true,result});
    }catch(e){finish(409,{ok:false,error:/^[A-Z0-9_]+$/.test(e.message)?e.message:'CONTROL_FAILURE'});}
  }
  async snapshot(){
    if(this.closed)throw Error(this.fatalError||"CONTROLLER_STOPPED");
    const result=await this.workers.execution.rpc({op:"snapshot",state:this.durable.state});
    result.runtime={securityMode:this.config.admission?.hostMutation==='disabled'?'EXTERNAL_CONTROL_ONLY':'EXPERIMENTAL_HOST_ACTOR_DEMO',isolation:this.config.host?.lowIntegrity?'WINDOWS_LOW_INTEGRITY_EXPERIMENTAL':'SAME_USER_NOT_ISOLATED',session:this.session,hostEpoch:this.hostEpoch,hostPid:this.host?.pid||0,commit:this.durable.commit,admission:this.config.admission||{schema:1,hostMutation:"enabled",quarantineOnFault:false,mods:[]},initialized:!!this.hostReady,defense:structuredClone(this.durable.defense),
      policy:{pid:this.workers.policy.child?.pid,epoch:this.workers.policy.epoch,engine:this.workers.policy.engineProof},execution:{pid:this.workers.execution.child?.pid,epoch:this.workers.execution.epoch,engine:this.workers.execution.engineProof},events:this.events.slice(-12)};
    return result;
  }
  async transition(r){
    if(this.closed)throw Error(this.fatalError||"CONTROLLER_STOPPED");
    if(!Number.isSafeInteger(r.revision)||r.revision!==this.durable.state.revision)throw Error("STALE_RESEARCH_REVISION");
    if(typeof r.source!=="string"||r.source.length>4096||!["player","intruder","native-observer"].includes(r.actor))throw Error("INVALID_PROGRAM_REQUEST");
    if(r.actor==='native-observer')throw Error('OBSERVATION_IS_NOT_AUTHORITY');
    const body={op:"transition",state:this.durable.state,source:r.source,actor:r.actor,revision:r.revision,transaction:randomBytes(16).toString("hex")};
    // Both independent JVMs actually calculate the semantics. No proposal gets a native lease without agreement.
    const candidate=await this.workers.execution.rpc(body);
    await this.workers.policy.rpc({...body,candidate});
    if(!this.durable.state.recovery && candidate.state.recovery)throw Error("REVOCATION_ROLLBACK");
    if(candidate.actions.includes("host")&&!this.config.host)throw Error("HOST_NOT_MANAGED");
    const roles=[...new Set(candidate.actions)].filter(role=>role!=="host");
    if(roles.length)await this.regenerate(roles,candidate.state,"program-runtime-rebuild");
    else await this.persist(candidate.state);
    if(candidate.actions.includes("host"))setTimeout(()=>this.queue(()=>this.replaceHost("program-runtime-rebuild")).catch(e=>this.event("host-circuit",{reason:e.message})),250);
    return {snapshot:await this.snapshot(),receipt:candidate.receipt};
  }
  async regenerate(roles,state,reason){
    StateBoundary.validateContinuation(this.durable?.state,state);
    if(this.generating)throw Error("ENGINE_GENERATION_BUSY");
    this.generating=true;const staged={},chains=structuredClone(this.durable.engines);
    try{
      for(const role of roles){
        if(!Engines.roles.includes(role))throw Error("ENGINE_ROLE_INVALID");
        const old=this.workers[role],parent=this.activeEngine(role),next=Engines.successor(parent);
        const failures=old.failures.filter(t=>monotonic()-t<30000);
        if(old.circuit||failures.length>=4){old.circuit=true;await old.close();throw Error("WORKER_CIRCUIT_OPEN");}
        const peer=this.workers[role==="policy"?"execution":"policy"];
        try{await peer.start();}catch{await this.failClosed("ENGINE_PEER_UNAVAILABLE");}
        let packet,source="parent";
        try{packet=await old.send({op:"generateEngine"});}
        catch(e){if(e.semantic)throw e;source="peer-recovery";packet=await peer.send({op:"prepareEngine",descriptor:next});}
        Engines.validatePacket(packet,next);
        const checked=await peer.send({op:"verifyEngine",parent,packet});
        if(checked.verified!==true)throw Error("ENGINE_PEER_VERIFICATION_FAILED");
        const child=new WorkerSlot(this,role);staged[role]=child;this.candidates.add(child);child.epoch=old.epoch;child.failures=[...failures,monotonic()];child.descriptorOverride=next;child.packetOverride=packet;
        await child.start();
        const projected=await child.send({op:"snapshot",state});
        const reference=await peer.send({op:"snapshot",state});
        if(JSON.stringify(projected)!==JSON.stringify(reference))throw Error("ENGINE_SNAPSHOT_MISMATCH");
        chains[role].push(next);this.event("engine-generated",{role,generation:next.generation,id:next.id,parent:parent.id,bytecodeSHA256:packet.bytecodeSHA256,source});
      }
      if(this.closed)throw Error("CONTROLLER_STOPPED");
      await this.persist(state,chains); // The checkpoint and accepted child lineage are one durable commit.
      if(this.closed)throw Error("CONTROLLER_STOPPED");
      const retired=roles.map(role=>({role,old:this.workers[role],child:staged[role],oldPid:this.workers[role].child?.pid}));
      for(const {role,child}of retired)this.workers[role]=child;
      const stops=retired.map(x=>x.old.close()); // close fences all old slots before the first await.
      const results=await Promise.allSettled(stops);
      if(results.some(r=>r.status==="rejected")){
        await Promise.allSettled(retired.map(x=>x.old.close()));
        await this.failClosed("ENGINE_RETIREMENT_FAILED");
      }
      for(const {role,child,oldPid}of retired){this.event("engine-activated",{role,generation:this.activeEngine(role).generation,id:this.activeEngine(role).id,pid:child.child?.pid});this.event("worker-replaced",{role,oldPid,pid:child.child?.pid,epoch:child.epoch,reason});}
      return staged;
    }catch(e){for(const [role,child]of Object.entries(staged))if(this.workers[role]!==child)await child.close();throw e;}
    finally{for(const child of Object.values(staged))this.candidates.delete(child);this.generating=false;}
  }
  userStop(){
    if(this.userStopped)return;this.userStopped=true;this.event("host-user-stop",{epoch:this.hostEpoch});if(this.onUserStop)setTimeout(()=>this.onUserStop(),50);
  }
  // A host that tried to disguise or flood commands is fenced from outside: its lease is rotated at once,
  // so nothing it already holds can sign another request, and the process tree is replaced.
  intrusion(reason,epoch){
    this.event("host-intrusion",{reason,epoch});
    if(!this.firewall.quarantined||this.quarantining||epoch!==this.hostEpoch||!this.host)return;
    this.quarantining=true;this.token=randomBytes(32).toString("hex");
    this.event("host-quarantined",{reason:this.firewall.quarantined,epoch,pid:this.host.pid});
    setImmediate(()=>this.queue(()=>this.replaceHost("intrusion-quarantine:"+this.firewall.quarantined)).catch(e=>this.event("host-circuit",{reason:e.message})).finally(()=>{this.quarantining=false;}));
  }
  hostLaunch(){
    const h=this.config.host;assertNoInjection(h.args);
    let args=h.args;
    // Low integrity: the guard's helper labels mc-host writable for Low, drops its own token to Low and runs MC
    // under it. Windows mandatory integrity control then denies MC (and anything loaded into it) any write or read
    // handle on this controller, the guard, the worker JVMs and the authority directory.
    const low=h.lowIntegrity===true;
    if(low&&(process.platform!=="win32"||typeof h.integrityHelper!=="string"))throw Error("LOW_INTEGRITY_HOST_UNAVAILABLE");
    if(h.useArgFile){
      // The argument file must be readable by a Low process but never writable by it, so it cannot sit in mc-host.
      const dir=low?path.join(path.dirname(this.directory),"host-launch"):this.directory;fs.mkdirSync(dir,{recursive:true});
      const file=path.join(dir,"host-launch.args");
      fs.writeFileSync(file,h.args.map(a=>'"'+String(a).replace(/\\/g,"\\\\").replace(/"/g,'\\"')+'"').join("\n"),{mode:0o600});
      args=["@"+file];
    }
    return low?{command:h.integrityHelper,args:["--low-integrity-host",h.cwd,h.command,...args]}:{command:h.command,args};
  }
  async spawnHost(){
    const h=this.config.host;
    if(h.args.includes("-Deff.previewResearch=true"))assertHostArguments(h.args);
    if(this.closed||this.host)throw Error("HOST_ALREADY_ACTIVE");
    await this.config.store?.verify();
    const launch=this.hostLaunch();
    this.hostEpoch++;this.seenRequests.clear();this.lastHeartbeatSequence=0;this.firewall.reset();this.projectionGuard.reset();this.hostJvmPid=0;this.token=randomBytes(32).toString("hex");
    const env={...cleanEnv(),...(h.env||{}),EFF_RUNTIME_ENDPOINT:this.endpoint,EFF_RUNTIME_SESSION:this.session,EFF_RUNTIME_LEASE:this.token,EFF_RUNTIME_EPOCH:String(this.hostEpoch),EFF_RUNTIME_GUARD_GENERATION:String(this.config.protectedGeneration||0)};
    // A fixed, locally produced launch manifest. No executable/argument input comes from gameplay or a model.
    const child=spawn(launch.command,launch.args,{cwd:h.cwd,env,stdio:["ignore","pipe","pipe"],windowsHide:true});this.host=child;
    this.hostStarted=monotonic();this.lastContact=0;this.hostReady=false;this.clientProgress=monotonic();this.serverProgress=monotonic();this.progress=null;
    const log=fs.createWriteStream(path.join(this.directory,`host-${this.hostEpoch}.log`),{flags:"a"});
    child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});
    child.on("error",()=>this.event("host-start-failed"));
    child.on("exit",()=>{log.end();this.event("host-exit",{pid:child.pid,epoch:this.hostEpoch});
      if(this.host!==child||this.closed||this.userStopped)return;
      // Only an actual exit after goodbye is the player quitting; a goodbye alone never stops the kernel.
      if(!this.config.store&&this.firewall.goodbye&&!this.firewall.quarantined){this.host=null;this.userStop();return;}
      this.queue(()=>this.host===child?this.replaceHost("process-exited"):undefined).catch(e=>this.event("host-circuit",{reason:e.message}));});
    this.event("host-start",{pid:child.pid,epoch:this.hostEpoch});
  }
  async replaceHost(reason){
    if(this.config.admission?.quarantineOnFault&&!this.closed)return this.failClosed("HOST_CAPABILITIES_QUARANTINED");
    if(this.config.store&&!this.closed){this.event("host-job-recovery",{reason});return this.failClosed("HOST_JOB_RECOVERY");}
    const old=this.host;this.host=null;this.token=randomBytes(32).toString("hex"); // Fence first, including queued HTTP requests.
    if(old)await terminate(old);
    this.hostFailures=this.hostFailures.filter(t=>monotonic()-t<60000);
    if(this.hostFailures.length>=3){this.event("host-circuit",{reason:"HOST_RESTART_BUDGET"});throw Error("HOST_RESTART_BUDGET");}
    this.hostFailures.push(monotonic());await wait(500);
    if(!this.closed){await this.spawnHost();this.event("host-replaced",{oldPid:old?.pid,pid:this.host?.pid,epoch:this.hostEpoch,reason});}
  }
  async recoverProjection(fault,epoch){
    if(epoch!==this.hostEpoch||!this.host||this.userStopped||this.closed)return;
    const state=this.durable.state;
    if(state.instance!==fault.instance||state.revision!==fault.revision||!Defense.eligible(fault.subject,state,fault))return;
    const next=Defense.nextDefense(this.durable.defense,fault,state);
    // Reserve the attempt in the outer ledger before any process migration. A controller restart
    // cannot reset the budget or resurrect already revoked recovery authority.
    await this.persist(state,this.durable.engines,next);
    this.event("projection-fault",{...next.lastIncident,attempt:next.incidents,circuitOpen:next.circuitOpen});
    if(next.circuitOpen)return this.failClosed("PROJECTION_RESTART_CIRCUIT");
    await this.regenerate(["execution"],state,"projection-"+fault.reason);
    await this.replaceHost("projection-"+fault.reason);
  }
  async monitor(){
    if(!this.host||this.closed||this.replacing||this.userStopped)return;
    const now=monotonic(), startup=this.config.startupTimeout||180000,timeout=this.config.progressTimeout||12000;
    const fault=this.projectionGuard.poll(this.durable.state,this.progress,now);
    if(fault){this.replacing=true;const epoch=this.hostEpoch;try{await this.queue(()=>this.recoverProjection(fault,epoch));}finally{this.replacing=false;}return;}
    let reason="";
    if(!this.hostReady){if(now-this.hostStarted>startup)reason="HOST_STARTUP_TIMEOUT";}
    else if(now-this.lastContact>timeout||now-this.clientProgress>timeout||this.progress?.active&&!this.progress.paused&&now-this.serverProgress>timeout)reason="HOST_PROGRESS_TIMEOUT";
    if(reason){this.replacing=true;try{await this.queue(()=>this.replaceHost(reason));}finally{this.replacing=false;}}
  }
  async failClosed(reason){
    this.fatalError=reason;this.event("controller-fatal",{reason});
    try{await this.close();}finally{this.onFatal?.(reason);}
    throw Error(reason);
  }
  async close(){
    if(this.closed)return;this.closed=true;clearInterval(this.timer);this.token=randomBytes(32).toString("hex");
    if(this.server){this.server.closeAllConnections();await new Promise(resolve=>this.server.close(resolve));}
    if(this.host){const old=this.host;this.host=null;await terminate(old);}
    await Promise.all([...new Set([...Object.values(this.workers),...this.candidates])].map(w=>w.close()));
    if(this.lock&&fs.existsSync(this.lock)){const lock=JSON.parse(fs.readFileSync(this.lock,"utf8"));if(lock.session===this.session)fs.unlinkSync(this.lock);}
  }
}
module.exports={Controller,WorkerSlot,atomic,cleanEnv,monotonic};
if(require.main===module){
  const file=process.argv[2];if(!file){process.stderr.write("Usage: node controller.cjs private-launch.json\n");process.exit(2);}
  const controller=new Controller(JSON.parse(fs.readFileSync(file,"utf8")));
  controller.start().then(()=>{process.stdout.write("EFF managed runtime started. Ctrl+C closes its owned JVMs.\n");}).catch(e=>{process.stderr.write(e.message+"\n");process.exitCode=1;});
  for(const signal of ["SIGINT","SIGTERM"])process.on(signal,()=>controller.close().then(()=>process.exit()));
}
