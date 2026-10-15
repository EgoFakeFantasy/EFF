"use strict";
const fs = require("node:fs"), path = require("node:path"), http = require("node:http");
const { spawn } = require("node:child_process"), { randomBytes, createHash, timingSafeEqual } = require("node:crypto");
const { createInterface } = require("node:readline");
const wait = ms => new Promise(r => setTimeout(r, ms));
const cleanEnv = () => { const env={...process.env}; for(const k of Object.keys(env)) if(["JAVA_TOOL_OPTIONS","JDK_JAVA_OPTIONS","_JAVA_OPTIONS","CLASSPATH"].includes(k.toUpperCase())) delete env[k]; return env; };
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
    if(this.owner.closed)throw Error("CONTROLLER_STOPPED");
    if(this.circuit)throw Error("WORKER_CIRCUIT_OPEN");
    if(this.child) return;
    this.epoch++;
    const child=spawn(this.owner.config.javaByRole?.[this.role] || this.owner.config.java,["-Xms16m","-Xmx96m","-XX:+DisableAttachMechanism","-XX:+ExitOnOutOfMemoryError","-cp",this.owner.config.workerJar,"eff.runtime.Worker",this.role],{env:cleanEnv(),stdio:["pipe","pipe","pipe"],windowsHide:true});
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
  }
  deliver(reply, child, epoch) {
    const p=this.pending.get(reply.id);
    if(this.child!==child || this.epoch!==epoch || reply.epoch!==epoch || !p || p.child!==child){this.owner.event("stale-worker-reply",{role:this.role,epoch});return false;}
    this.pending.delete(reply.id);clearTimeout(p.timer);
    reply.ok ? p.resolve(reply.result) : p.reject(Object.assign(Error(reply.error||"WORKER_REJECTED"),{semantic:true}));return true;
  }
  fail(child,reason){for(const [id,p] of this.pending)if(p.child===child){this.pending.delete(id);clearTimeout(p.timer);p.reject(Error(reason));}}
  async replace(reason) {
    const old=this.child;
    this.child=null; // Fence before stopping: late stdout cannot complete a transaction.
    if(old){this.fail(old,"WORKER_REPLACED");await terminate(old);}
    this.failures=this.failures.filter(t=>Date.now()-t<30000);
    if(this.failures.length>=4){this.circuit=true;throw Error("WORKER_CIRCUIT_OPEN");}
    this.failures.push(Date.now());await wait(Math.min(1000,100*this.failures.length));
    if(!this.owner.closed){await this.start();this.owner.event("worker-replaced",{role:this.role,oldPid:old?.pid,pid:this.child?.pid,epoch:this.epoch,reason});}
  }
  async rpc(body) {
    for(let attempt=0;attempt<2;attempt++) {
      await this.start();const child=this.child,epoch=this.epoch,id=`${this.role}:${++this.serial}`;
      try{return await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{this.pending.delete(id);reject(Error("WORKER_PROGRESS_TIMEOUT"));},this.owner.config.workerTimeout||4000);
        this.pending.set(id,{resolve,reject,timer,child});child.stdin.write(JSON.stringify({id,epoch,body})+"\n");
      });} catch(e){if(e.semantic)throw e;await this.replace(e.message);if(attempt)throw e;}
    }
  }
  async close(){const child=this.child;this.child=null;if(child){this.fail(child,"CONTROLLER_STOPPED");await terminate(child);}}
}
async function terminate(child) {
  if(child.exitCode!==null || child.signalCode!==null)return;
  const stopped=new Promise(resolve=>child.once("exit",resolve));child.kill();
  await Promise.race([stopped,wait(3000)]);
  if(child.exitCode===null && child.signalCode===null){child.kill("SIGKILL");await Promise.race([stopped,wait(3000)]);}
  if(child.exitCode===null&&child.signalCode===null)throw Error("OLD_PROCESS_DID_NOT_EXIT");
}
class Controller {
  constructor(config){
    this.config=config;this.directory=path.resolve(config.directory);fs.mkdirSync(this.directory,{recursive:true});
    this.session=randomBytes(16).toString("hex");this.token=randomBytes(32).toString("hex");this.hostEpoch=0;
    this.workers={policy:new WorkerSlot(this,"policy"),execution:new WorkerSlot(this,"execution")};this.events=[];this.serial=Promise.resolve();this.closed=false;this.hostFailures=[];
  }
  event(type,details={}){this.events.push({time:Date.now(),type,...details});if(this.events.length>128)this.events.shift();}
  queue(fn){const p=this.serial.then(fn);this.serial=p.catch(()=>{});return p;}
  persist(state){
    const body={schema:1,commit:(this.durable?.commit||0)+1,state};
    atomic(path.join(this.directory,"committed.json"),{body,sha256:digest(body)});this.durable=body;
  }
  async start() {
    this.lock=path.join(this.directory,"controller.lock");
    try{const fd=fs.openSync(this.lock,"wx");fs.writeFileSync(fd,JSON.stringify({pid:process.pid,session:this.session}));fs.closeSync(fd);}
    catch(e){throw Error("CONTROLLER_DIRECTORY_LOCKED_USE_NEW_DIRECTORY_OR_REMOVE_VERIFIED_STALE_LOCK");}
    const saved=path.join(this.directory,"committed.json");
    try {
      if(fs.existsSync(saved)) {const parsed=JSON.parse(fs.readFileSync(saved,"utf8"));if(parsed.sha256!==digest(parsed.body)||parsed.body.schema!==1)throw Error("COMMITTED_STATE_CORRUPT");this.durable=parsed.body;}
      else this.persist(await this.workers.execution.rpc({op:"initial"}));
      await this.workers.policy.rpc({op:"snapshot",state:this.durable.state});
      this.server=http.createServer((req,res)=>this.handle(req,res));
      await new Promise((resolve,reject)=>{this.server.once("error",reject);this.server.listen(0,"127.0.0.1",resolve);});
      this.endpoint=`http://127.0.0.1:${this.server.address().port}`;
      if(this.config.host)await this.spawnHost();
      this.timer=setInterval(()=>this.monitor().catch(e=>{this.event("host-circuit",{reason:e.message});}),1000);
      return this;
    }catch(e){await this.close();throw e;}
  }
  authorized(req){const supplied=Buffer.from(req.headers["x-eff-lease"]||""),actual=Buffer.from(this.token);return supplied.length===actual.length&&timingSafeEqual(supplied,actual);}
  async handle(req,res){
    res.setHeader("Content-Type","application/json");res.setHeader("Cache-Control","no-store");
    try{
      if(req.method!=="POST"||req.url!=="/v1/host"||!this.authorized(req))throw Error("INVALID_HOST_LEASE");
      let text="";for await(const chunk of req){text+=chunk;if(text.length>32768)throw Error("REQUEST_BUDGET");}
      const r=JSON.parse(text);if(r.session!==this.session||r.epoch!==this.hostEpoch)throw Error("STALE_HOST_EPOCH");
      const key=this.token,epoch=this.hostEpoch;
      const execute=async()=>{
        if(key!==this.token||epoch!==this.hostEpoch)throw Error("STALE_HOST_EPOCH");
        return this.dispatch(r);
      };
      const result=await (["heartbeat","goodbye"].includes(r.op)?execute():this.queue(execute));
      // A response also carries the generation; clients reject it after reconnection.
      res.end(JSON.stringify({ok:true,session:this.session,epoch,result}));
    }catch(e){res.statusCode=409;res.end(JSON.stringify({ok:false,error:/^[A-Z0-9_]+$/.test(e.message)?e.message:"CONTROLLER_FAILURE"}));}
  }
  async dispatch(r){
    switch(r.op){
      case "heartbeat":
        if(!Number.isSafeInteger(r.clientTick)||!Number.isSafeInteger(r.serverTick))throw Error("INVALID_PROGRESS");
        this.lastContact=Date.now();if(r.active===true)this.hostReady=true;
        if(this.progress?.clientTick!==r.clientTick){this.clientProgress=Date.now();}
        if(this.progress?.serverTick!==r.serverTick){this.serverProgress=Date.now();}
        this.progress={clientTick:r.clientTick,serverTick:r.serverTick,paused:r.paused===true,active:r.active===true};
        return {commit:this.durable.commit};
      case "goodbye":this.userStopped=true;this.event("host-user-stop",{epoch:this.hostEpoch});return {stopped:true};
      case "snapshot":return this.snapshot();
      case "execute":return this.transition(r);
      default:throw Error("CONTROLLER_OP_NOT_ALLOWED");
    }
  }
  async snapshot(){
    const result=await this.workers.execution.rpc({op:"snapshot",state:this.durable.state});
    result.runtime={session:this.session,hostEpoch:this.hostEpoch,hostPid:this.host?.pid||0,commit:this.durable.commit,
      policy:{pid:this.workers.policy.child?.pid,epoch:this.workers.policy.epoch},execution:{pid:this.workers.execution.child?.pid,epoch:this.workers.execution.epoch},events:this.events.slice(-10)};
    return result;
  }
  async transition(r){
    if(!Number.isSafeInteger(r.revision)||r.revision!==this.durable.state.revision)throw Error("STALE_RESEARCH_REVISION");
    if(typeof r.source!=="string"||r.source.length>4096||!["player","intruder","native-observer"].includes(r.actor))throw Error("INVALID_PROGRAM_REQUEST");
    const body={op:"transition",state:this.durable.state,source:r.source,actor:r.actor,revision:r.revision,transaction:randomBytes(16).toString("hex")};
    // Both independent JVMs actually calculate the semantics. No proposal gets a native lease without agreement.
    const candidate=await this.workers.execution.rpc(body);
    await this.workers.policy.rpc({...body,candidate});
    if(!this.durable.state.recovery && candidate.state.recovery)throw Error("REVOCATION_ROLLBACK");
    if(candidate.actions.includes("host")&&!this.config.host)throw Error("HOST_NOT_MANAGED");
    this.persist(candidate.state); // Commit before projection or process replacement.
    for(const role of new Set(candidate.actions)){
      if(role==="host"){
        if(!this.config.host)throw Error("HOST_NOT_MANAGED");
        setTimeout(()=>this.queue(()=>this.replaceHost("program-runtime-rebuild")).catch(e=>this.event("host-circuit",{reason:e.message})),250);
      }else await this.workers[role].replace("program-runtime-rebuild");
    }
    return {snapshot:await this.snapshot(),receipt:candidate.receipt};
  }
  async spawnHost(){
    const h=this.config.host;
    if(this.closed||this.host)throw Error("HOST_ALREADY_ACTIVE");
    this.hostEpoch++;this.token=randomBytes(32).toString("hex");
    const env={...cleanEnv(),...(h.env||{}),EFF_RUNTIME_ENDPOINT:this.endpoint,EFF_RUNTIME_SESSION:this.session,EFF_RUNTIME_LEASE:this.token,EFF_RUNTIME_EPOCH:String(this.hostEpoch)};
    // A fixed, locally produced launch manifest. No executable/argument input comes from gameplay or a model.
    let args=h.args;
    if(h.useArgFile){
      const file=path.join(this.directory,"host-launch.args");
      fs.writeFileSync(file,h.args.map(a=>'"'+String(a).replace(/\\/g,"\\\\").replace(/"/g,'\\"')+'"').join("\n"),{mode:0o600});
      args=["@"+file];
    }
    const child=spawn(h.command,args,{cwd:h.cwd,env,stdio:["ignore","pipe","pipe"],windowsHide:true});this.host=child;
    this.hostStarted=Date.now();this.lastContact=0;this.hostReady=false;this.clientProgress=Date.now();this.serverProgress=Date.now();this.progress=null;
    const log=fs.createWriteStream(path.join(this.directory,`host-${this.hostEpoch}.log`),{flags:"a"});
    child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});
    child.on("error",()=>this.event("host-start-failed"));
    child.on("exit",()=>{log.end();this.event("host-exit",{pid:child.pid,epoch:this.hostEpoch});if(this.host===child&&!this.closed&&!this.userStopped)this.queue(()=>this.host===child?this.replaceHost("process-exited"):undefined).catch(e=>this.event("host-circuit",{reason:e.message}));});
    this.event("host-start",{pid:child.pid,epoch:this.hostEpoch});
  }
  async replaceHost(reason){
    const old=this.host;this.host=null;this.token=randomBytes(32).toString("hex"); // Fence first, including queued HTTP requests.
    if(old)await terminate(old);
    this.hostFailures=this.hostFailures.filter(t=>Date.now()-t<60000);
    if(this.hostFailures.length>=3){this.event("host-circuit",{reason:"HOST_RESTART_BUDGET"});throw Error("HOST_RESTART_BUDGET");}
    this.hostFailures.push(Date.now());await wait(500);
    if(!this.closed){await this.spawnHost();this.event("host-replaced",{oldPid:old?.pid,pid:this.host?.pid,epoch:this.hostEpoch,reason});}
  }
  async monitor(){
    if(!this.host||this.closed||this.replacing||this.userStopped)return;
    const now=Date.now(), startup=this.config.startupTimeout||180000,timeout=this.config.progressTimeout||12000;
    let reason="";
    if(!this.hostReady){if(now-this.hostStarted>startup)reason="HOST_STARTUP_TIMEOUT";}
    else if(now-this.lastContact>timeout||now-this.clientProgress>timeout||this.progress?.active&&!this.progress.paused&&now-this.serverProgress>timeout)reason="HOST_PROGRESS_TIMEOUT";
    if(reason){this.replacing=true;try{await this.queue(()=>this.replaceHost(reason));}finally{this.replacing=false;}}
  }
  async close(){
    if(this.closed)return;this.closed=true;clearInterval(this.timer);this.token=randomBytes(32).toString("hex");
    if(this.server)await new Promise(resolve=>this.server.close(resolve));
    if(this.host){const old=this.host;this.host=null;await terminate(old);}
    await Promise.all(Object.values(this.workers).map(w=>w.close()));
    if(this.lock&&fs.existsSync(this.lock)){const lock=JSON.parse(fs.readFileSync(this.lock,"utf8"));if(lock.session===this.session)fs.unlinkSync(this.lock);}
  }
}
module.exports={Controller,WorkerSlot,atomic,cleanEnv};
if(require.main===module){
  const file=process.argv[2];if(!file){process.stderr.write("Usage: node controller.cjs private-launch.json\n");process.exit(2);}
  const controller=new Controller(JSON.parse(fs.readFileSync(file,"utf8")));
  controller.start().then(()=>{process.stdout.write("EFF managed runtime started. Ctrl+C closes its owned JVMs.\n");}).catch(e=>{process.stderr.write(e.message+"\n");process.exitCode=1;});
  for(const signal of ["SIGINT","SIGTERM"])process.on(signal,()=>controller.close().then(()=>process.exit()));
}
