"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict');
const {verdict,confirmedEngagement}=require('./combat-verdict.cjs');
const {manifestHash}=require('./combat-scene-evidence.cjs');
function complete(){const e={runId:'trial',attackObservedAtMs:0,confirmedAttackAtMs:0,finishedAtMs:30050,survivalReceivedAtMs:30000,expectedPid:123,expectedLaunchPid:100,baselineReady:true,opponentLoaded:true,attackConfirmed:true,crashed:false,hostReplaced:false,coreModified:false,
 // Synthetic validator fixture only; this is not a recorded game or a real video receipt.
 video:{source:'external-window-recorder',decoded:true,reviewed:true,visualOutcome:'pass',runId:'trial',pid:123,windowHandle:'a01',processStartedUtcTicks:'638978000000000000',sha256:'a'.repeat(64),bytes:1000,startedAtMs:-1000,endedAtMs:30000,durationMs:31000,maxFrameGapMs:50},
 survival:{runId:'trial',maxSampleGapMs:50,postAttackElapsedMs:30000,mcPid:123,failed:false,samples:600,elapsedMs:30000,originalUUID:'original',clientAgeMs:50,client:{uuid:'original',failed:false,sameOriginal:true,sameLevel:true,registered:true,renderListed:true,alive:true,removed:false,dying:false,visible:true,health:20,rawHealthReadable:true,rawHealth:20,samples:600,maxSampleGapMs:50},target:{uuid:'original',alive:true,removed:false,dying:false,registered:true,finiteHealth:true,health:20,rawHealthReadable:true,rawHealth:20}},
 windows:Array.from({length:31},(_,i)=>({pid:123,launchPid:100,processStartedUtcTicks:'638978000000000000',windowHandle:'a01',windowPresent:true,atMs:i*1000,receivedAtMs:i*1000,alive:true,responsive:true}))};
 e.sceneManifest={schema:1,runId:'trial',source:'arena-and-owned-world-inventory',frozenBeforeAttack:true,capturedAtMs:-100,
  entities:[{uuid:'player',entityId:1,role:'player'},{uuid:'original',entityId:2,role:'primary-target'},{uuid:'actor',entityId:3,role:'scene-actor'}]};
 const side={failed:false,sameOriginal:true,registered:true,removed:false,alive:true,dying:false,rawHealthReadable:true,rawHealth:20,health:20,samples:600};
 e.sceneSurvival={runId:'trial',manifestSHA256:manifestHash(e.sceneManifest),failed:false,samples:600,elapsedMs:30000,postAttackElapsedMs:30000,maxSampleGapMs:50,
  entities:e.sceneManifest.entities.map(x=>({uuid:x.uuid,entityId:x.entityId,server:{...side},client:{...side}}))};
 e.video.combatReview={schema:1,runId:'trial',videoSHA256:e.video.sha256,sceneEntityLossObserved:false,
  attack:{visible:true,route:'normal-client-input',startMs:900,contactMs:1000,endMs:1100,targetUUID:'original',
   attackerDescription:'Visible attacker with original sword',targetDescription:'Original central scene entity',actionDescription:'Visible swing and contact on original target'}};
 return e;}
test('launcher and retained Java process identities cannot be substituted',()=>{
 for(const change of [e=>delete e.expectedLaunchPid,e=>e.windows[0].launchPid=123,e=>e.windows[5].processStartedUtcTicks='638978000000000001',e=>delete e.windows[0].processStartedUtcTicks]){
  const e=complete();change(e);assert.equal(verdict(e).reason,'TRUSTED_LAUNCH_IDENTITY_REQUIRED');
 }
});
test('complete bounded observations pass',()=>assert.equal(verdict(complete()).accepted,true));

test('single-target success cannot conceal destruction of another original scene actor',()=>{
 for(const side of ['server','client'])for(const patch of [{failed:true},{sameOriginal:false},{registered:false},{removed:true},{alive:false},{dying:true},{rawHealth:0}]){
  const e=complete();Object.assign(e.sceneSurvival.entities[2][side],patch);
  assert.equal(verdict(e).reason,'SCENE_ENTITY_CONTINUITY_LOST');
 }
 const e=complete();e.sceneSurvival.failed=true;e.sceneSurvival.entities[2].server.alive=true;
 assert.equal(verdict(e).status,'FAILED'); // Later recovery cannot clear the latched scene loss.
 const v=complete();v.video.combatReview.sceneEntityLossObserved=true;delete v.sceneSurvival;
 assert.equal(verdict(v).reason,'SCENE_ENTITY_CONTINUITY_LOST');
});

test('missing or narrowed pre-attack roster cannot pass',()=>{
 for(const change of [e=>delete e.sceneManifest,e=>delete e.sceneSurvival,e=>e.sceneManifest.frozenBeforeAttack=false,
  e=>e.sceneManifest.capturedAtMs=1,e=>e.sceneManifest.entities.pop(),e=>e.sceneSurvival.entities.pop(),
  e=>e.sceneSurvival.manifestSHA256='0'.repeat(64),e=>e.sceneSurvival.entities[2].uuid='replacement',
  e=>e.sceneSurvival.entities[2].entityId=9,e=>e.sceneSurvival.postAttackElapsedMs=1000,
  e=>e.sceneSurvival.entities[2].client.samples=1,e=>e.sceneSurvival.entities[2].client.rawHealthReadable=false]){
  const e=complete();change(e);assert.equal(verdict(e).accepted,false);
 }
 const e=complete();e.sceneManifest.entities[2].uuid='original';e.sceneSurvival.manifestSHA256=manifestHash(e.sceneManifest);
 assert.equal(verdict(e).reason,'INVALID_SCENE_INVENTORY');
});

test('an internal attack call and a pass checkbox do not prove a visible normal gameplay attack',()=>{
 for(const change of [e=>delete e.video.combatReview,e=>e.video.combatReview.attack.visible=false,
  e=>e.video.combatReview.attack.route='direct-server-call',e=>e.video.combatReview.videoSHA256='b'.repeat(64),
  e=>e.video.combatReview.runId='old',e=>e.video.combatReview.attack.targetUUID='other',
  e=>e.video.combatReview.attack.contactMs=-1,e=>e.video.combatReview.attack.endMs=50000,
  e=>e.video.combatReview.attack.actionDescription='',e=>e.video.combatReview.attack.startMs=1100,
  e=>e.video.combatReview.attack.contactMs=1051,e=>delete e.video.combatReview.sceneEntityLossObserved]){
  const e=complete();change(e);assert.equal(verdict(e).accepted,false);
 }
 const e=complete();e.video.combatReview.attack.route='normal-entity-ai';assert.equal(verdict(e).accepted,true);
});

test('withdrawn acceptance cannot be promoted by old successful fields',()=>{
 for(const status of ['FAILED','INCOMPLETE']){
  const e=complete();e.acceptanceCorrection={accepted:false,status};
  assert.deepEqual(verdict(e),{accepted:false,status,reason:'PRIOR_ACCEPTANCE_WITHDRAWN'});
 }
});

test('healthy server and valid video cannot conceal client loss or failed visual review',()=>{
 const e=complete();e.survival.client.failed=true;assert.equal(verdict(e).reason,'ORIGINAL_CLIENT_ENTITY_LOST');
 const v=complete();v.video.visualOutcome='fail';assert.equal(verdict(v).reason,'VISUAL_CONTINUITY_FAILED');
 for(const mutate of [x=>delete x.survival.client,x=>x.survival.client.uuid='replacement',x=>x.survival.client.registered=false,
   x=>x.survival.client.renderListed=false,x=>x.survival.client.visible=false,x=>x.survival.client.rawHealth=0,
   x=>x.survival.clientAgeMs=3000,x=>x.survival.client.samples=1,x=>x.survival.client.maxSampleGapMs=5000]){
  const x=complete();mutate(x);assert.equal(verdict(x).reason,'ORIGINAL_CLIENT_ENTITY_OBSERVATION_REQUIRED');
 }
 for(const outcome of [undefined,'uncertain']){const x=complete();x.video.visualOutcome=outcome;assert.equal(verdict(x).accepted,false);}
});
test('clean baseline requires no opponent and never substitutes for actual combat',()=>{
 const e={...complete(),scope:'clean-continuous-baseline',sampleSHA256:null,attackAttempted:false,baselineReady:false,opponentLoaded:false,attackConfirmed:false,observationStartedAtMs:0};
 assert.equal(verdict(e,{baseline:true}).accepted,true);assert.equal(verdict(e).accepted,false);
 for(const patch of [{hostReplaced:true},{crashed:true},{attackAttempted:true},{sampleSHA256:'a'.repeat(64)},{observationStartedAtMs:29000}])assert.equal(verdict({...e,...patch},{baseline:true}).accepted,false);
 e.video.reviewed=false;assert.equal(verdict(e,{baseline:true}).accepted,false);
});
test('logs without a matching continuous reviewed recording cannot be accepted',()=>{
 for(const change of [e=>delete e.video,e=>e.video.reviewed=false,e=>e.video.decoded=false,e=>e.video.pid=456,
   e=>e.video.runId='old',e=>e.video.windowHandle='a02',e=>e.video.processStartedUtcTicks='638978000000000001',
   e=>e.video.startedAtMs=1,e=>e.video.endedAtMs=29000,e=>e.video.durationMs=500,e=>e.video.maxFrameGapMs=5000,
   e=>e.video.sha256='',e=>e.video.bytes=0,e=>e.video.source='host-claim',e=>e.video.error='RECORDER_CAPTURE_GAP']){
  const e=complete();change(e);assert.equal(verdict(e).accepted,false);
  assert.equal(verdict(e).reason,'CONTINUOUS_VIDEO_AND_REVIEW_REQUIRED');assert.equal(verdict(e).primaryTargetSamplesComplete,true);
 }
 const e=complete();delete e.video;e.crashed=true;assert.equal(verdict(e).status,'FAILED');
});
test('a healthy getter cannot conceal dead, mismatched or unreadable stored health',()=>{
 for(const raw of [0,-1,10,NaN]) { const e=complete();e.survival.target.rawHealth=raw;assert.equal(verdict(e).accepted,false); }
 const e=complete();e.survival.target.rawHealthReadable=false;assert.equal(verdict(e).reason,'RAW_HEALTH_OBSERVATION_REQUIRED');
});
test('same-PID replacement GLFW window cannot pass',()=>{const e=complete();e.windows[15].windowHandle='a02';assert.equal(verdict(e).reason,'MC_WINDOW_REPLACED');});
test('missing, zero or ambiguous window identity cannot pass',()=>{
 for(const mutate of [e=>delete e.windows[0].windowHandle,e=>e.windows[0].windowHandle='0',e=>e.windows[0].windowHandle='unknown',e=>e.windows[5].windowPresent=false,e=>delete e.windows[5].windowHandle]){
  const e=complete();mutate(e);assert.equal(verdict(e).accepted,false);
 }
});
test('ledger intact or recovery alone cannot pass',()=>assert.equal(verdict({STATE_INTACT:true,HOST_RECOVERED:true}).accepted,false));
test('observed window loss fails even before attack proof arrives',()=>assert.equal(verdict({windows:[{alive:false,responsive:false}]}).status,'FAILED'));
test('crash and replacement fail even when final entity is healthy',()=>{for(const key of ['crashed','hostReplaced','coreModified']){const e=complete();e[key]=true;assert.equal(verdict(e).status,'FAILED');}});
test('latched transient death and replacement UUID fail',()=>{const e=complete();e.survival.failed=true;assert.equal(verdict(e).accepted,false);e.survival.failed=false;e.survival.target.uuid='replacement';assert.equal(verdict(e).accepted,false);});
test('spawn without attack, missing windows and stale samples cannot pass',()=>{for(const mutate of [e=>e.attackConfirmed=false,e=>delete e.windows,e=>e.windows[4].atMs=3000,e=>e.windows[5].responsive=false,e=>e.survival.target.health=NaN,e=>e.survival.samples='600']){const e=complete();mutate(e);assert.equal(verdict(e).accepted,false);}});
test('old or unrelated evidence and gaps cannot pass',()=>{for(const mutate of [e=>e.nativeFailure='SERVER_FAILED',e=>e.survival.runId='old',e=>e.survival.maxSampleGapMs=10000,e=>e.finishedAtMs=90000,e=>e.attackObservedAtMs=10000,e=>e.survivalReceivedAtMs=0,e=>e.windows[4].receivedAtMs=3000]){const e=complete();mutate(e);assert.equal(verdict(e).accepted,false);}});
test('late advanced attack cannot borrow time observed before it',()=>{const e=complete();e.confirmedAttackAtMs=29000;e.survival.postAttackElapsedMs=1000;assert.equal(verdict(e).accepted,false);});
test('attack confirmation requires matching target, run, mode and actual effect',()=>{
 const options={runId:'trial',profile:'pig2',instrumented:true};
 const s={runId:'trial',actualAttackWindowAnchored:true,originalUUID:'original',engagement:{runId:'trial',profile:'pig2',expectedOriginalUUID:'original',instrumentationMode:'observational-mixin',targetArgumentVerified:true,evidenceLevel:'destructive-operation-observed',actualAttackAgeMs:20,pigRemovalEffects:1,advancedAttackObserved:true}};
 assert.equal(confirmedEngagement(s,options),true);
 for(const change of [e=>e.engagement.expectedOriginalUUID='other',e=>e.engagement.runId='old',e=>e.engagement.profile='foreverlove',e=>e.engagement.pigRemovalEffects=0,e=>e.engagement.evidenceLevel='head-only',e=>e.actualAttackWindowAnchored=false]){const copy=structuredClone(s);change(copy);assert.equal(confirmedEngagement(copy,options),false);}
 assert.equal(confirmedEngagement(s,{...options,instrumented:false}),false);
});

test('probe errors block acceptance without concealing an already observed window failure',()=>{const e=complete();e.probeError='INVALID_PROBE_OUTPUT';assert.equal(verdict(e).status,'INCOMPLETE');e.windows[2].responsive=false;assert.equal(verdict(e).status,'FAILED');});

test('prevented write evidence requires exact target, rejected value and a real gate receipt',()=>{
 const options={runId:'trial',profile:'pig2',instrumented:true};
 const s={runId:'trial',actualAttackWindowAnchored:true,originalUUID:'original',engagement:{runId:'trial',profile:'pig2',expectedOriginalUUID:'original',instrumentationMode:'observational-write-gate',targetArgumentVerified:true,evidenceLevel:'destructive-operation-prevented',actualAttackAgeMs:20,pigRemovalEffects:0,pigPreventedWrites:1,preventedField:'canUpdate',preventedBooleanValue:false,advancedAttackObserved:true}};
 assert.equal(confirmedEngagement(s,options),true);
 for(const patch of [{pigPreventedWrites:0},{preventedBooleanValue:true},{preventedField:'health'},{expectedOriginalUUID:'other'},{instrumentationMode:'observational-mixin'},{evidenceLevel:'head-only'}]){
  const copy=structuredClone(s);Object.assign(copy.engagement,patch);assert.equal(confirmedEngagement(copy,options),false);
 }
 assert.equal(confirmedEngagement(s,{...options,profile:'foreverlove'}),false);
});


test('lifetime-gate engagement requires target/thread/window/run bound actual present-entry rejection',()=>{
 const options={runId:'trial',profile:'foreverlove',instrumented:true};
 const s={runId:'trial',actualAttackWindowAnchored:true,originalUUID:'original',engagement:{
   runId:'trial',profile:'foreverlove',expectedOriginalUUID:'original',targetArgumentVerified:true,
   instrumentationMode:'observational-lifetime-gate',evidenceKind:'in-process-observational-lifetime-gate',
   evidenceLevel:'destructive-operation-prevented',actualAttackAgeMs:20,swordAttackObserved:true,
   lifetimePreventedWrites:1,lifetimePreventedOperation:'map-remove-present',lifetimeReceiptRunId:'trial',
   lifetimeOriginalTargetVerified:true,lifetimeServerThreadVerified:true,lifetimeDirectAttackWindowVerified:true,
   lifetimePresentEntryVerified:true,lifetimeAttackFrame:'com.wzz.forever_love_sword.util.ForeverUtils/0x0000000123ab.killEntity'}};
 assert.equal(confirmedEngagement(s,options),true);
 for(const patch of [{lifetimePreventedWrites:0},{lifetimePreventedWrites:1.5},{lifetimePreventedWrites:'1'},
   {lifetimePreventedOperation:'query'},{lifetimePreventedOperation:'armed'},
   {lifetimeReceiptRunId:'other'},{lifetimeOriginalTargetVerified:false},{lifetimeServerThreadVerified:false},
   {lifetimeDirectAttackWindowVerified:false},{lifetimePresentEntryVerified:false},
   {lifetimeAttackFrame:''},{lifetimeAttackFrame:'com.wzz.forever_love_sword.util.ForeverUtilsFake.killEntity'},
   {lifetimeAttackFrame:'com.wzz.forever_love_sword.util.ForeverUtils/0x1234.query'},
   {swordAttackObserved:false},{targetArgumentVerified:false},{expectedOriginalUUID:'other'},
   {evidenceKind:'head-only'},{evidenceLevel:'destructive-operation-observed'}]){
  const copy=structuredClone(s);Object.assign(copy.engagement,patch);assert.equal(confirmedEngagement(copy,options),false,JSON.stringify(patch));
 }
 const ordinary=structuredClone(s);ordinary.engagement.lifetimeAttackFrame='com.wzz.forever_love_sword.util.ForeverUtils.killEntity';
 assert.equal(confirmedEngagement(ordinary,options),true);
 for(const patch of [{instrumented:false},{profile:'pig2'},{runId:'other'}])assert.equal(confirmedEngagement(s,{...options,...patch}),false);
 for(const key of ['lifetimePresentEntryVerified','lifetimeDirectAttackWindowVerified','lifetimeServerThreadVerified','lifetimeOriginalTargetVerified','lifetimeReceiptRunId','lifetimeAttackFrame']){
  const copy=structuredClone(s);delete copy.engagement[key];assert.equal(confirmedEngagement(copy,options),false,key);
 }
});


test('hidden field receipt permits only actual position/removal instructions with every binding',()=>{
 const options={runId:'trial',profile:'foreverlove',instrumented:true};
 const s={runId:'trial',actualAttackWindowAnchored:true,originalUUID:'original',engagement:{
   runId:'trial',profile:'foreverlove',expectedOriginalUUID:'original',targetArgumentVerified:true,
   instrumentationMode:'observational-lifetime-gate',evidenceKind:'in-process-observational-lifetime-gate',
   evidenceLevel:'destructive-operation-prevented',actualAttackAgeMs:20,swordAttackObserved:true,
   lifetimePreventedWrites:1,lifetimePreventedOperation:'field-write:position',lifetimeReceiptRunId:'trial',
   lifetimeOriginalTargetVerified:true,lifetimeServerThreadVerified:true,lifetimeDirectAttackWindowVerified:true,
   lifetimePresentEntryVerified:false,lifetimeFieldWriteVerified:true,
   lifetimeAttackFrame:'com.wzz.forever_love_sword.util.ForeverUtils/0x1234.killEntity'}};
 for(const operation of ['field-write:position','field-write:removalReason']) {
   s.engagement.lifetimePreventedOperation=operation;assert.equal(confirmedEngagement(s,options),true);
   for(const patch of [{lifetimeFieldWriteVerified:false},{lifetimePreventedOperation:'field-write:unknown'},
     {lifetimePreventedOperation:'query'},{lifetimeOriginalTargetVerified:false},{lifetimeServerThreadVerified:false},
     {lifetimeDirectAttackWindowVerified:false},{lifetimeReceiptRunId:'other'},{lifetimeAttackFrame:''}]) {
     const copy=structuredClone(s);Object.assign(copy.engagement,patch);assert.equal(confirmedEngagement(copy,options),false);
   }
 }
});

test('unknown hidden kill needs exact watched item identity and the complete normal attack chain',()=>{
 const options={runId:'trial',profile:'foreverlove',instrumented:true};
 const s={runId:'trial',actualAttackWindowAnchored:true,originalUUID:'original',engagement:{
   runId:'trial',profile:'foreverlove',expectedOriginalUUID:'original',targetArgumentVerified:true,
   instrumentationMode:'observational-lifetime-gate',evidenceKind:'in-process-observational-lifetime-gate',
   evidenceLevel:'destructive-operation-prevented',actualAttackAgeMs:20,swordAttackObserved:true,
   lifetimePreventedWrites:1,lifetimePreventedOperation:'field-write:position',lifetimeReceiptRunId:'trial',
   lifetimeOriginalTargetVerified:true,lifetimeServerThreadVerified:true,lifetimeDirectAttackWindowVerified:true,
   lifetimePresentEntryVerified:false,lifetimeFieldWriteVerified:true,lifetimeAttackFrame:'<Unknown>/0x1234.killEntity',
   lifetimeAttributionKind:'bound-item-hidden-kill',lifetimeExactItemClassVerified:true,lifetimeKillFrameHiddenVerified:true,
   lifetimeNormalAttackChainVerified:true,lifetimeBoundItemClass:'example.Sword/0xabcd',
   lifetimeItemFrame:'example.Sword/0xabcd.onLeftClickEntity',
   lifetimeForgeAttackFrame:'net.minecraftforge.common.ForgeHooks.onPlayerAttackTarget',
   lifetimePlayerAttackFrame:'net.minecraft.world.entity.player.Player.m_5706_',
   lifetimeServerPlayerAttackFrame:'net.minecraft.server.level.ServerPlayer.m_5706_'}};
 assert.equal(confirmedEngagement(s,options),true);
 for(const operation of ['map-remove-present','field-write:position','field-write:removalReason']) {
   const copy=structuredClone(s);copy.engagement.lifetimePreventedOperation=operation;
   copy.engagement.lifetimePresentEntryVerified=operation==='map-remove-present';
   copy.engagement.lifetimeFieldWriteVerified=operation!=='map-remove-present';assert.equal(confirmedEngagement(copy,options),true);
 }
 for(const key of ['lifetimeAttributionKind','lifetimeExactItemClassVerified','lifetimeKillFrameHiddenVerified',
   'lifetimeNormalAttackChainVerified','lifetimeBoundItemClass','lifetimeItemFrame','lifetimeForgeAttackFrame',
   'lifetimePlayerAttackFrame','lifetimeServerPlayerAttackFrame','lifetimeServerThreadVerified',
   'lifetimeOriginalTargetVerified','lifetimeDirectAttackWindowVerified','lifetimeReceiptRunId']) {
   const copy=structuredClone(s);delete copy.engagement[key];assert.equal(confirmedEngagement(copy,options),false,key);
 }
 for(const patch of [{lifetimeExactItemClassVerified:false},{lifetimeKillFrameHiddenVerified:false},
   {lifetimeNormalAttackChainVerified:false},{lifetimeBoundItemClass:'example.OtherSword/0xabcd'},
   {lifetimeItemFrame:'example.Sword/0xabce.onLeftClickEntity'}, // Different hidden Class, same nominal source.
   {lifetimeForgeAttackFrame:'other.ForgeHooks.onPlayerAttackTarget'},
   {lifetimePlayerAttackFrame:'net.minecraft.world.entity.player.Player.tick'},
   {lifetimeServerPlayerAttackFrame:'net.minecraft.world.entity.player.Player.m_5706_'},
   {lifetimeAttackFrame:'<Unknown>.killEntity'},{lifetimeAttackFrame:'<Unknown>/0x1234.query'},
   {lifetimeAttributionKind:'named-forever-utils'},{lifetimeAttributionKind:'unknown-name-only'},
   {lifetimeServerThreadVerified:false},{lifetimeOriginalTargetVerified:false},{lifetimeDirectAttackWindowVerified:false},
   {lifetimePreventedWrites:0},{lifetimeReceiptRunId:'old'},{lifetimeBoundItemClass:'x'.repeat(513)}]) {
   const copy=structuredClone(s);Object.assign(copy.engagement,patch);assert.equal(confirmedEngagement(copy,options),false,JSON.stringify(patch));
 }
 const diagnosticsOnly=structuredClone(s);delete diagnosticsOnly.engagement.lifetimeAttributionKind;
 diagnosticsOnly.engagement.lifetimeMissingFramesDiagnosticOnly=['<Unknown>/0x1234.killEntity;isHidden=true'];
 assert.equal(confirmedEngagement(diagnosticsOnly,options),false);
});
