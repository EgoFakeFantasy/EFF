'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {describeHostFault,retainManualEvidence}=require('./host-fault.cjs');
const {Controller}=require('./controller.cjs');
test('startup with no heartbeat is distinct from loaded but not admitted',()=>{
 const c={config:{protectedGeneration:1},host:{pid:42,exitCode:null},hostEpoch:1,hostStarted:100,requireProjection:true};
 const empty=describeHostFault(c,'HOST_STARTUP_TIMEOUT',240100);
 assert.equal(empty.elapsedSinceStartMs,240000);assert.equal(empty.progress,null);
 assert.equal(empty.initialized,false);assert.equal(empty.heartbeatSequence,null);
 c.progress={clientTick:50,serverTick:0,active:false,paused:true};c.lastHeartbeatSequence=7;c.lastContact=239100;
 const loaded=describeHostFault(c,'HOST_STARTUP_TIMEOUT',240100);
 assert.equal(loaded.lastContactAgeMs,1000);assert.equal(loaded.progress.clientTick,50);assert.equal(loaded.heartbeatSequence,7);
});
function manualConfig(){return {manualEvidenceRetention:true,researchLab:true,
 researchMode:'observe-only',externalControl:true,host:{lowIntegrity:true,args:['-Deff.manualCombat=foreverlove']},
 admission:{hostMutation:'disabled',quarantineOnFault:true}};}
test('evidence retention requires every trusted manual observer restriction',()=>{
 assert.equal(retainManualEvidence(manualConfig()),true);
 for(const key of ['manualEvidenceRetention','researchLab','externalControl']){
  const c=manualConfig();c[key]=false;assert.equal(retainManualEvidence(c),false,key);
 }
 for(const alter of [c=>c.researchMode='active',c=>c.host.lowIntegrity=false,
  c=>c.admission.hostMutation='enabled',c=>c.admission.quarantineOnFault=false,
  c=>c.host.args=['-Deff.manualCombat=unknown'],c=>c.host.args=[]]){
  const c=manualConfig();alter(c);assert.equal(retainManualEvidence(c),false);
 }
});
test('manual failure fences authority, keeps original process, and never clears on retry',async()=>{
 const original={pid:42,exitCode:null,kill(){throw Error('MUST_NOT_KILL');}};
 const c={config:manualConfig(),host:original,hostEpoch:1,hostReady:true,token:'old-lease',
  directory:'\0',firewall:{},events:[],event(type,data){this.events.push({type,data});},
  failClosed(){throw Error('MUST_NOT_TEARDOWN');}};
 await Controller.prototype.replaceHost.call(c,'HOST_STARTUP_TIMEOUT');
 assert.equal(c.host,original);assert.equal(c.hostEpoch,1);assert.equal(c.hostReady,false);
 assert.notEqual(c.token,'old-lease');assert.equal(c.firewall.quarantined,'MANUAL_EVIDENCE_FAILED');
 const failure=c.manualEvidenceFailure;assert.equal(failure.failed,true);assert.equal(failure.combatPassed,false);
 await Controller.prototype.replaceHost.call(c,'process-exited');
 assert.equal(c.manualEvidenceFailure,failure);assert.equal(c.host,original);
 await assert.rejects(Controller.prototype.dispatch.call(c,{op:'heartbeat'}),/MANUAL_EVIDENCE_FAILED/);
 await assert.rejects(Controller.prototype.transition.call(c,{}),/MANUAL_EVIDENCE_FAILED/);
 await assert.rejects(Controller.prototype.spawnHost.call(c),/MANUAL_EVIDENCE_FAILED/);
 await assert.rejects(Controller.prototype.regenerate.call(c,['execution'],{},'worker-failure'),/MANUAL_EVIDENCE_FAILED/);
 await assert.rejects(Controller.prototype.persist.call(c,{}),/MANUAL_EVIDENCE_FAILED/);
 await Controller.prototype.monitor.call(c); // Must not poll, regenerate or close.
 assert.ok(c.events.some(e=>e.type==='manual-evidence-record-failed'));
});
test('manual projection loss is recorded before any regeneration or state reset',async()=>{
 const c={config:manualConfig(),host:{pid:42},hostEpoch:1,
  replaceHost(reason){assert.equal(reason,'projection-PLAYER_DEAD');this.called=true;},
  persist(){throw Error('MUST_NOT_PERSIST');},regenerate(){throw Error('MUST_NOT_REGENERATE');}};
 await Controller.prototype.recoverProjection.call(c,{reason:'PLAYER_DEAD'},1);
 assert.equal(c.called,true);
});
test('latched manual failure keeps authenticated snapshot and user stop, refuses control writes',async()=>{
 const http=require('node:http'),{createHmac,randomBytes}=require('node:crypto');
 const c={controlKey:randomBytes(32).toString('hex'),session:'test-session',controlSeen:new Set(),
  manualEvidenceFailure:{failed:true,combatPassed:false},queue:fn=>Promise.resolve().then(fn),
  snapshot:async()=>({runtime:{manualEvidenceFailure:{failed:true,combatPassed:false}}}),
  transition(){throw Error('MUST_NOT_TRANSITION');},event(){},userStop(){this.userStopped=true;}};
 const server=http.createServer((req,res)=>Controller.prototype.handleControl.call(c,req,res));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const send=async(op,key=c.controlKey)=>{
  const raw=JSON.stringify({op,session:c.session,requestId:randomBytes(16).toString('hex'),
   ...(op==='execute'?{revision:0,commit:0,source:'disable event.possess'}:{})});
  const response=await fetch(`http://127.0.0.1:${server.address().port}/v1/control`,{method:'POST',body:raw,
   headers:{'x-eff-auth':createHmac('sha256',key).update('control-request:'+raw).digest('hex')}});
  return response.json();
 };
 try{
  assert.equal((await send('execute')).error,'MANUAL_EVIDENCE_FAILED');
  assert.equal((await send('snapshot')).result.runtime.manualEvidenceFailure.combatPassed,false);
  assert.equal((await send('stop','host-lease')).error,'CONTROL_NOT_AUTHORIZED');
  assert.equal(c.userStopped,undefined);
  assert.equal((await send('stop')).result.stopping,true);
  for(let i=0;i<20&&!c.userStopped;i++)await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(c.userStopped,true);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('fault record excludes credentials and invalid counters',()=>{
 const c={config:{host:{args:['secret']},lease:'secret'},token:'secret',host:{pid:-1,exitCode:3},hostEpoch:Infinity,
 progress:{clientTick:NaN,serverTick:-1,active:true,paused:false,projection:{lease:'secret'}},lastContact:500};
 const record=describeHostFault(c,'secret\nforged',100);
 assert.equal(record.reason,'UNKNOWN_HOST_FAULT');assert.equal(record.hostPid,null);assert.equal(record.lastContactAgeMs,null);
 assert.equal(record.hostExitCode,3);assert.equal(JSON.stringify(record).includes('secret'),false);
});
test('quarantine preserves first triggering reason even if diagnostic disk write fails',async()=>{
 // No process or file is started. Invalid directory forces the bounded diagnostic error path.
 const c={config:{admission:{quarantineOnFault:true}},host:{pid:42,exitCode:null},hostEpoch:1,directory:'\0',events:[],
 event(type,data){this.events.push({type,data});},failClosed(reason){return Promise.reject(Error(reason));}};
 await assert.rejects(Controller.prototype.replaceHost.call(c,'HOST_STARTUP_TIMEOUT'),/HOST_CAPABILITIES_QUARANTINED/);
 assert.equal(c.hostFault.reason,'HOST_STARTUP_TIMEOUT');assert.ok(c.events.some(x=>x.type==='host-fault-record-failed'));
 await assert.rejects(Controller.prototype.replaceHost.call(c,'process-exited'),/HOST_CAPABILITIES_QUARANTINED/);
 assert.equal(c.hostFault.reason,'HOST_STARTUP_TIMEOUT');
});
