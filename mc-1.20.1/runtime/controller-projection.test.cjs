"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Controller}=require('./controller.cjs');const {createHmac,randomUUID}=require('node:crypto');
const java=process.env.EFF_TEST_JAVA,workerJar=process.env.EFF_TEST_WORKERS;if(!java||!workerJar)throw Error('Java test inputs required');
const healthy=()=>({uuid:randomUUID(),alive:true,removed:false,dying:false,finiteHealth:true,health:20,registered:true,deathTime:0,finitePosition:true,inBounds:true});
async function heartbeat(c,n,patch){const s=c.durable.state,projection={schema:1,sequence:n,enabled:true,instance:s.instance,revision:s.revision,player:healthy(),avatar:healthy(),...patch};const body=JSON.stringify({session:c.session,epoch:c.hostEpoch,requestId:randomUUID(),op:'heartbeat',sequence:n,clientTick:n,serverTick:n,active:true,paused:false,projection});const response=await fetch(c.endpoint+'/v1/host',{method:'POST',headers:{'X-EFF-Auth':createHmac('sha256',c.token).update('request:').update(body).digest('hex')},body});assert.equal(response.status,200);}
function alive(pid){try{process.kill(pid,0);return true;}catch{return false;}}
test('native death reports replace real JVM engines and host without resetting authority or budget',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'eff-projection-controller-'));
 const config={java,workerJar,directory:root,projectionGuard:{confirmMs:0},host:{command:process.execPath,args:['-e','setInterval(()=>{},1000)'],cwd:root}};
 let c=new Controller(config);await c.start();
 t.after(async()=>{await c.close();const real=fs.realpathSync(root),base=fs.realpathSync(os.tmpdir());assert.equal(path.dirname(real),base);assert.match(path.basename(real),/^eff-projection-controller-/);fs.rmSync(real,{recursive:true,force:true});});
 const firstHost=c.host.pid,firstExecution=c.workers.execution.child.pid,firstInstance=c.durable.state.instance;
 await heartbeat(c,1,{avatar:{...healthy(),dying:true,deathTime:1}});await c.monitor();
 assert.notEqual(c.host.pid,firstHost);assert.notEqual(c.workers.execution.child.pid,firstExecution);assert.equal(alive(firstHost),false);assert.equal(alive(firstExecution),false);assert.equal(c.activeEngine('execution').generation,1);assert.equal(c.durable.state.instance,firstInstance);assert.equal(c.durable.defense.incidents,1);
 // A user-selected authoritative erase is not an entity fault.
 await c.queue(()=>c.transition({actor:'player',source:'disable control.tether; disable event.possess; disable authority.recovery',revision:c.durable.state.revision}));
 const saved=JSON.parse(JSON.stringify(c.durable));await c.close();c=new Controller(config);await c.start();assert.deepEqual(c.durable.defense,saved.defense);assert.equal(c.durable.state.recovery,false);
 const secondHost=c.host.pid;await heartbeat(c,1,{player:{...healthy(),health:0}});await c.monitor();assert.notEqual(c.host.pid,secondHost);assert.equal(c.durable.defense.incidents,2);assert.equal(c.durable.state.recovery,false);assert.equal(c.activeEngine('execution').generation,2);
 // The third real incident opens a persisted circuit instead of creating an endless launch loop.
 await heartbeat(c,1,{player:{...healthy(),health:0}});await assert.rejects(c.monitor(),/PROJECTION_RESTART_CIRCUIT/);assert.equal(c.closed,true);assert.equal(c.durable.defense.incidents,3);assert.equal(c.durable.defense.circuitOpen,true);
 c=new Controller(config);await assert.rejects(c.start(),/PROJECTION_RESTART_CIRCUIT/);assert.equal(c.host,undefined);assert.equal(c.durable.state.recovery,false);
});
