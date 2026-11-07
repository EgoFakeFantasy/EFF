'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {attackFailureEvidence}=require('./attack-failure-evidence.cjs');
test('exception path retains same-run return without inventing engagement or acceptance',()=>{
 const returned={runId:'run-a',mcPid:41,engagement:{swordAttackObserved:false}};
 const value=attackFailureEvidence(name=>name==='sword-attack-returned'?returned:{runId:'run-a',mcPid:41},{runId:'run-a',pid:41});
 assert.equal(value.attackStartFileObserved,true);assert.equal(value.attackReturnFileObserved,true);
 assert.equal(value.attackReturnObservation,returned);
 for(const key of ['attackConfirmed','accepted','STATE_INTACT','HOST_RECOVERED','attackReturned'])assert.equal(Object.hasOwn(value,key),false);
});
test('other-run, replacement-PID, missing and malformed observations are not adopted',()=>{
 for(const file of [null,{},'text',{runId:'old',mcPid:41},{runId:'run-a',mcPid:42}]){
  const value=attackFailureEvidence(()=>file,{runId:'run-a',pid:41});
  assert.equal(value.attackStartFileObserved,false);assert.equal(value.attackReturnFileObserved,false);
  assert.equal(Object.hasOwn(value,'attackReturnObservation'),false);
 }
 for(const pid of [0,NaN,null,'41'])assert.equal(attackFailureEvidence(()=>({runId:'run-a',mcPid:pid}),{runId:'run-a',pid}).attackReturnFileObserved,false);
});
