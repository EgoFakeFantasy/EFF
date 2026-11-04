"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict');
const {verdict,confirmedEngagement}=require('./combat-verdict.cjs');
function complete(){return {runId:'trial',attackObservedAtMs:0,confirmedAttackAtMs:0,finishedAtMs:30050,survivalReceivedAtMs:30000,expectedPid:123,baselineReady:true,opponentLoaded:true,attackConfirmed:true,crashed:false,hostReplaced:false,coreModified:false,
 survival:{runId:'trial',maxSampleGapMs:50,postAttackElapsedMs:30000,mcPid:123,failed:false,samples:600,elapsedMs:30000,originalUUID:'original',target:{uuid:'original',alive:true,removed:false,dying:false,registered:true,finiteHealth:true,health:20}},
 windows:Array.from({length:31},(_,i)=>({pid:123,windowHandle:'a01',windowPresent:true,atMs:i*1000,receivedAtMs:i*1000,alive:true,responsive:true}))};}
test('complete bounded observations pass',()=>assert.equal(verdict(complete()).accepted,true));
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
