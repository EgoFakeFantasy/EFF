'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {reviewManualBaseline}=require('./manual-baseline-evidence.cjs');
const {captureClock}=require('./window-recorder.cjs');
const target='00000000-0000-4000-8000-000000000001',player='00000000-0000-4000-8000-000000000002';
const run='00000000-0000-4000-8000-000000000003',epoch=1700000000000;
function fixture(){
 const identity={pid:123,processStartedUtcTicks:'638977123456789012',windowHandle:'1a23'};
 const frames=Array.from({length:206},(_,i)=>5000+i*100),clock=captureClock(frames,epoch);
 const windows=Array.from({length:28},(_,i)=>({...identity,alive:true,windowPresent:true,responsive:true,receivedAtMs:i*1000}));
 function entity(id,side,i){return {uuid:id===1?target:player,id,objectIdentity:id+(side==='client'?100:200),
  sameOriginalIdentity:true,structuralFailure:false,observationIncomplete:false,publicStateMismatch:false,combatPassed:false,
  rawRemoval:'null',rawHealthReadable:true,rawHealth:20,
  registration:{readable:true,idOriginal:true,uuidOriginal:true,sameLevel:true},
  lifecycle:{rawReadable:true,publicReadable:true,rawDead:false,rawDeathTime:0,deathStateObserved:false,
   publicAlive:true,publicDying:false,publicRemoved:false},entityClass:id===2?'net.minecraft.client.player.LocalPlayer':'eff.minecraft.EffProjection',
  lifetimeClaimed:true,ownedDrawReturns:100+i*10,renderEvents:{callbacks:100+i*10},lastOwnedDrawAgeMs:50};}
 const rows=Array.from({length:29},(_,i)=>({pid:123,samples:i+1,elapsedMs:i*1000,observedAtUnixMs:epoch+i*1000,
  structuralFailureLatched:false,paused:false,serverAgeMs:10,serverSamplePending:false,
  client:[entity(1,'client',i),entity(2,'client',i)],server:{failed:false,entities:[entity(1,'server',i),entity(2,'server',i)]},
  manualOperations:{bound:true,runId:run,serverOriginals:2,clientOriginals:2}}));
 return {ready:{pid:123,manualRunId:run,targetUUID:target,sceneEntities:[{uuid:target,id:1}]},
  bound:{pid:123,count:2,originalsFrozen:true},rows,timeline:{clock,frames,windows},
  recording:{manualRunId:run,error:'',automaticAttack:false,automaticVerdict:false,video:{...identity,error:null,
   decoded:true,mediaDecoded:true,clock,frameCount:206,captureFrames:206,durationMs:20500,startedAtMs:5000,endedAtMs:25500}}};
}
test('aligned frame, window and original-object intervals produce only a sampled precombat report',()=>{
 const r=reviewManualBaseline(fixture());
 assert.equal(r.baselineEvidenceConsistent,true);assert.equal(r.combatPassed,false);assert.equal(r.visualReviewRequired,true);
 assert.equal(r.coveringSnapshots,22);assert.equal(r.originalCount,2);assert.equal(r.playerUUID,player);
 assert.equal(r.captureStartedAtUnixMs,epoch+5000);assert.equal(r.captureEndedAtUnixMs,epoch+25500);
});
test('long or newly touched logs outside the recording do not cover the video',()=>{
 for(const shift of [-60000,60000]){const f=fixture();for(const r of f.rows)r.observedAtUnixMs+=shift;
  assert.throws(()=>reviewManualBaseline(f),/VIDEO_NOT_BRACKETED/);}
 const f=fixture();f.rows=f.rows.slice(0,26);assert.throws(()=>reviewManualBaseline(f),/VIDEO_NOT_BRACKETED/);
});
test('retained backing maps cannot conceal a broken public interaction lookup',()=>{
 function withPublicIndex(){const f=fixture();for(const r of f.rows)for(const [side,list] of [['client',r.client],['server',r.server.entities]])for(const e of list){
  e.publicIndex={scope:'public-interaction-lookup-not-trust-root',side,readable:true,idOriginal:true,idAbsent:false,idEntryIdentity:e.objectIdentity,
   ...(side==='server'?{uuidOriginal:true,interactionOriginal:true,uuidAbsent:false,interactionAbsent:false,uuidEntryIdentity:e.objectIdentity,interactionEntryIdentity:e.objectIdentity}:{})};
 }return f;}
 assert.equal(reviewManualBaseline(withPublicIndex()).publicIndexEvidenceChecked,true);
 assert.equal(reviewManualBaseline(fixture()).publicIndexEvidenceChecked,false);
 for(const mutate of [
  f=>f.rows[10].server.entities[0].publicIndex.interactionOriginal=false,
  f=>f.rows[10].server.entities[0].publicIndex.interactionEntryIdentity++,
  f=>f.rows[10].client[0].publicIndex.idAbsent=true,
  f=>f.rows[10].server.entities[0].publicIndex.uuidOriginal=false,
  f=>f.rows[10].client[0].publicIndex.readable=false,
  f=>delete f.rows[10].client[0].publicIndex,
  f=>f.rows[10].client[0].publicIndex.side='server'
 ]){const f=withPublicIndex();mutate(f);assert.throws(()=>reviewManualBaseline(f),/PUBLIC_INTERACTION_LOOKUP_FAILED/);}
});
test('legacy missing capture clock and run binding cannot silently receive invented timestamps',()=>{
 const f=fixture();delete f.recording.video.clock;assert.throws(()=>reviewManualBaseline(f),/VIDEO_CLOCK_MISSING/);
 const g=fixture();delete g.ready.manualRunId;assert.throws(()=>reviewManualBaseline(g),/RUN_BINDING/);
});
test('same duration with substituted clock, window, process start or frame timeline fails',()=>{
 for(const mutate of [
  f=>f.recording.video.clock={...f.recording.video.clock,epochOffsetUnixMs:epoch+1000},
  f=>f.timeline.windows[10].windowHandle='1a24',
  f=>f.timeline.windows[10].processStartedUtcTicks='638977123456789013',
  f=>f.timeline.frames[10]=f.timeline.frames[9],
  f=>f.recording.video.startedAtMs='5000',
 ]){const f=fixture();mutate(f);assert.throws(()=>reviewManualBaseline(f),/BASELINE_/);}
});
test('old negative server-age race, stale samples and clock jumps are evidence failures',()=>{
 for(const age of [-1,5001,NaN,'0']){const f=fixture();f.rows[10].serverAgeMs=age;
  assert.throws(()=>reviewManualBaseline(f),/SERVER_SAMPLE_UNAVAILABLE/);}
 const f=fixture();f.rows[10].elapsedMs-=600;assert.throws(()=>reviewManualBaseline(f),/TRACE_CLOCK/);
});
test('paired observation clocks retain clock-jump rejection and bound sampling uncertainty',()=>{
 const f=fixture();for(const r of f.rows)r.observationClock={source:'paired-at-observation-start',readSkewMs:0.1,observationSpanMs:30};
 assert.equal(reviewManualBaseline(f).observationClockChecked,true);
 assert.equal(reviewManualBaseline(fixture()).observationClockChecked,false);
 for(const mutate of [
  r=>delete r.observationClock,
  r=>r.observationClock.source='derived-from-uptime',
  r=>r.observationClock.readSkewMs=26,
  r=>r.observationClock.readSkewMs=-1,
  r=>r.observationClock.observationSpanMs=501,
  r=>r.observationClock.observationSpanMs=0,
  r=>r.observationClock.observationSpanMs='30',
 ]){const g=structuredClone(f);mutate(g.rows[10]);assert.throws(()=>reviewManualBaseline(g),/OBSERVATION_TIMING/);}
 const jumped=structuredClone(f);jumped.rows[10].observedAtUnixMs+=600;
 assert.throws(()=>reviewManualBaseline(jumped),/TRACE_CLOCK/);
});
test('initial pending server sample is allowed only outside video with explicit markers',()=>{
 const f=fixture();Object.assign(f.rows[0],{server:{},serverSamplePending:true,serverAgeMs:-1});
 assert.equal(reviewManualBaseline(f).initialServerPending,true);
 const g=fixture();Object.assign(g.rows[10],{server:{},serverSamplePending:true,serverAgeMs:-1});
 assert.throws(()=>reviewManualBaseline(g),/SERVER_SAMPLE_UNAVAILABLE/);
});
test('healthy replacement with the same UUID cannot erase the original object failure',()=>{
 const f=fixture();for(const r of f.rows.slice(10))r.server.entities[0].objectIdentity++;
 assert.throws(()=>reviewManualBaseline(f),/ORIGINAL_CHANGED/);
});
test('duplicate rosters, removed registration and unprotected original player cannot pass',()=>{
 const mutations=[f=>f.rows[10].client[1]=structuredClone(f.rows[10].client[0]),
  f=>f.rows[10].server.entities[0].registration.uuidOriginal=false,
  f=>f.rows[10].client[1].lifetimeClaimed=false,
  f=>f.rows[10].server.entities[0].lifecycle.rawDead=true,
  f=>delete f.rows[10].client[0].rawHealthReadable];
 for(const change of mutations){const f=fixture();change(f);assert.throws(()=>reviewManualBaseline(f),/BASELINE_/);}
});
test('earlier successful drawing is not evidence of rendering during this video',()=>{
 const f=fixture();for(const r of f.rows)r.client[0].ownedDrawReturns=500;
 assert.throws(()=>reviewManualBaseline(f),/PRIMARY_NOT_DRAWN_DURING_VIDEO/);
 const g=fixture();g.rows[26].client[0].lastOwnedDrawAgeMs=3000;
 assert.throws(()=>reviewManualBaseline(g),/PRIMARY_NOT_DRAWN_DURING_VIDEO/);
});
test('paired trace and external window sample gaps and pause remain explicit failures',()=>{
 const f=fixture();f.rows.splice(10,2);assert.throws(()=>reviewManualBaseline(f),/TRACE_GAP/);
 const g=fixture();g.timeline.windows.splice(10,3);assert.throws(()=>reviewManualBaseline(g),/WINDOW_OBSERVATION_GAP/);
 const h=fixture();h.rows[10].paused=true;assert.throws(()=>reviewManualBaseline(h),/PAUSED_OR_PENDING/);
});
test('a prior latched loss is not cleared by healthy current objects or a later recording',()=>{
 const f=fixture();f.rows[1].structuralFailureLatched=true;
 assert.throws(()=>reviewManualBaseline(f),/TRACE_IDENTITY_OR_FAILURE/);
 const g=fixture();g.rows[10].manualOperations.runId='changed';assert.throws(()=>reviewManualBaseline(g),/OPERATION_BINDING/);
});
test('position caches must match the actual stored position, including negative chunk coordinates',()=>{
 const f=fixture(),v=(x,y,z)=>({x:String(x),y:String(y),z:String(z),finite:true});
 for(const r of f.rows)for(const e of [...r.client,...r.server.entities])e.spatial={rawReadable:true,publicReadable:true,
  storedPosition:v(-0.5,65,17.5),publicPosition:v(-0.5,65,17.5),storedBoundsMin:v(-1,65,17),storedBoundsMax:v(0,67,18),
  cullingBoundsMin:v(-1,65,17),cullingBoundsMax:v(0,67,18),storedBlockPosition:v(-1,65,17),publicBlockPosition:v(-1,65,17),
  storedChunkPosition:{x:-1,z:1},cacheMatchesPosition:true};
 assert.equal(reviewManualBaseline(f).spatialCacheEvidenceChecked,true);
 for(const change of [s=>s.storedChunkPosition.x=0,s=>s.cacheMatchesPosition=false,s=>s.storedBlockPosition.x='0',
  s=>s.publicBlockPosition.x='0',s=>delete s.storedBlockPosition,s=>s.storedPosition.x='NaN',s=>s.publicPosition.x='300']){
  const g=structuredClone(f);change(g.rows[10].client[0].spatial);
  assert.throws(()=>reviewManualBaseline(g),/SPATIAL_OBSERVATION_FAILED|POSITION_CACHE_INCONSISTENT/);
 }
 const g=structuredClone(f);delete g.rows[10].server.entities[0].spatial;
 assert.throws(()=>reviewManualBaseline(g),/SPATIAL_OBSERVATION_FAILED/);
 assert.equal(reviewManualBaseline(fixture()).spatialCacheEvidenceChecked,false);
});
function queryFixture(){
 const f=fixture();for(const r of f.rows)r.pickState={hitType:'BLOCK',originals:r.client.map(e=>({
  id:e.id,uuid:e.uuid,objectIdentity:e.objectIdentity,readable:true,
  pickable:true,spectator:false,attackable:true,spatialQueryContainsOriginal:true}))};return f;
}
test('query evidence checks original identities while allowing the camera to look away',()=>{
 const f=queryFixture();assert.equal(reviewManualBaseline(f).pickEvidenceChecked,true);
 assert.equal(reviewManualBaseline(fixture()).pickEvidenceChecked,false);
});
test('healthy visible registered originals missing from spatial queries are failures',()=>{
 for(const mutate of [q=>q.spatialQueryContainsOriginal=false,q=>q.readable=false,
  q=>q.pickable=false,q=>q.spectator=true,q=>q.attackable=false,q=>delete q.spatialQueryContainsOriginal]){
  const f=queryFixture();mutate(f.rows[10].pickState.originals[0]);
  assert.throws(()=>reviewManualBaseline(f),/ORIGINAL_QUERY_FAILED/);
 }
});
test('missing query rows and same-UUID replacement observations cannot pass',()=>{
 for(const mutate of [f=>delete f.rows[10].pickState,f=>f.rows[10].pickState.originals.pop(),
  f=>f.rows[10].pickState.observationUnavailable=true]){
  const f=queryFixture();mutate(f);assert.throws(()=>reviewManualBaseline(f),/QUERY_OBSERVATION_INCOMPLETE/);
 }
 for(const mutate of [q=>q[0].objectIdentity++,q=>q[0].id++,q=>q[1]=structuredClone(q[0])]){
  const f=queryFixture();mutate(f.rows[10].pickState.originals);
  assert.throws(()=>reviewManualBaseline(f),/QUERY_ORIGINAL_MISMATCH/);
 }
});
test('an advertised route diagnostic must be enabled, complete and contain the original',()=>{
 const f=queryFixture();for(const r of f.rows)r.pickState.originals[0].queryRoute={
  managerClass:'manager',getterClass:'getter',sectionStorageClass:'storage',
  getterQueryContainsOriginal:true,sectionQueryContainsOriginal:true};
 assert.equal(reviewManualBaseline(f).pickEvidenceChecked,true);
 for(const route of [{},{observationDisabled:true},{error:'unavailable'},
  {...f.rows[0].pickState.originals[0].queryRoute,getterQueryContainsOriginal:undefined}]){
  const g=structuredClone(f);g.rows[10].pickState.originals[0].queryRoute=route;
  assert.throws(()=>reviewManualBaseline(g),/QUERY_ROUTE_INCOMPLETE/);
 }
 for(const field of ['getterQueryContainsOriginal','sectionQueryContainsOriginal']){
  const g=structuredClone(f);g.rows[10].pickState.originals[0].queryRoute[field]=false;
  assert.throws(()=>reviewManualBaseline(g),/QUERY_ROUTE_ORIGINAL_MISSING/);
 }
});
