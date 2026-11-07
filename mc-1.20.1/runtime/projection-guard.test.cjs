"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict');
const {ProjectionGuard,initialDefense,nextDefense,validateDefense}=require('./projection-guard.cjs');
const state={instance:'01234567-0123-0123-0123-012345678901',revision:4,outcome:'pending',avatar:true,recovery:true};
const healthy=()=>({uuid:'01234567-0123-0123-0123-012345678902',alive:true,removed:false,dying:false,finiteHealth:true,health:20,rawHealthReadable:true,rawHealth:20,registered:true,deathTime:0,finitePosition:true,inBounds:true});
const sample=(seq=1,patch={})=>({schema:1,sequence:seq,enabled:true,instance:state.instance,revision:state.revision,player:healthy(),avatar:healthy(),...patch});
const progress={active:true,paused:false};
test('first admission can complete in 313ms, but subsequent registration loss stays latched',()=>{
 const g=new ProjectionGuard({confirmMs:1200});g.observe(sample(1,{avatar:{...healthy(),registered:false}}),state,0);
 g.observe(sample(2),state,313);assert.equal(g.poll(state,progress,1300),null);
 g.observe(sample(3,{avatar:{...healthy(),registered:false}}),state,1400);g.observe(sample(4),state,1450);
 assert.equal(g.poll(state,progress,2601).reason,'ENTITY_UNREGISTERED');
});
test('first admission deadline, identity, death and disabled samples cannot clear a fault',()=>{
 for(const finish of ['late','replacement','dead','disabled','never']){
  const g=new ProjectionGuard({confirmMs:50});g.observe(sample(1,{avatar:{...healthy(),registered:false}}),state,0);
  if(finish==='late')g.observe(sample(2),state,51);
  if(finish==='replacement')g.observe(sample(2,{avatar:{...healthy(),uuid:'11234567-0123-0123-0123-012345678902'}}),state,10);
  if(finish==='dead')g.observe(sample(2,{avatar:{...healthy(),health:0}}),state,10);
  if(finish==='disabled')g.observe({schema:1,sequence:2,enabled:false},state,10);
  assert.ok(g.poll(state,progress,60),finish);
 }
 const g=new ProjectionGuard({confirmMs:50});g.observe(sample(1,{avatar:{...healthy(),registered:false,health:0}}),state,0);g.observe(sample(2),state,10);
 assert.equal(g.poll(state,progress,60).reason,'ENTITY_ZERO_HEALTH');
 for(const subject of ['avatar','player']){
  const h=new ProjectionGuard({confirmMs:50});h.observe(sample(1,{avatar:{...healthy(),registered:false}}),state,0);
  h.observe(sample(2,{avatar:{...healthy(),registered:false},[subject]:{...healthy(),registered:false,health:0}}),state,10);
  h.observe(sample(3),state,20);assert.ok(h.poll(state,progress,60),'death during admission: '+subject);
 }
});
for(const [name,patch,why] of [
 ['death animation without removal',{dying:true,deathTime:1},'ENTITY_DYING'],
 ['raw dead flag despite public health and alive answers',{rawDead:true,rawDeadReadable:true,health:20,alive:true,dying:false},'ENTITY_DYING'],
 ['unreadable raw lifecycle is not a healthy observation',{rawDead:false,rawDeadReadable:false},'ENTITY_LIFECYCLE_UNREADABLE'],
 ['zero health without removal',{health:0},'ENTITY_ZERO_HEALTH'],
 ['NaN or infinity health reported without nonfinite JSON',{health:0,finiteHealth:false},'ENTITY_INVALID_HEALTH'],
 ['direct registry erasure without removal flag',{registered:false},'ENTITY_UNREGISTERED'],
 ['raw removal reason',{removed:true},'ENTITY_REMOVED'],
 ['banished projection outside the arena',{inBounds:false},'ENTITY_DISPLACED']])test(name,()=>{
 const g=new ProjectionGuard({confirmMs:50});g.observe(sample(1),state,0);g.observe(sample(2,{avatar:{...healthy(),...patch}}),state,10);
 assert.equal(g.poll(state,progress,20),null);assert.equal(g.poll(state,progress,61).reason,why);
});
test('player death triggers independently of revoked intruder recovery',()=>{
 const g=new ProjectionGuard({confirmMs:0}),s={...state,recovery:false};g.observe(sample(1,{player:{...healthy(),health:0}}),s,10);assert.equal(g.poll(s,progress,10).subject,'player');
});
test('raw death remains latched after subsequent healthy samples on the same instance',()=>{
 for(const subject of ['avatar','player']) {
  const g=new ProjectionGuard({confirmMs:50});g.observe(sample(1),state,0);
  g.observe(sample(2,{[subject]:{...healthy(),rawDead:true,rawDeadReadable:true}}),state,10);
  g.observe(sample(3),state,20);
  const failure=g.poll(state,progress,61);assert.equal(failure.reason,'ENTITY_DYING');assert.equal(failure.subject,subject);
 }
});
test('successful player erasure and revoked recovery are not resurrected',()=>{
 const g=new ProjectionGuard({confirmMs:0}),s={...state,avatar:false,recovery:false};g.observe(sample(1,{avatar:{...healthy(),removed:true,registered:false,alive:false,health:0}}),s,10);assert.equal(g.poll(s,progress,20),null);
 const g2=new ProjectionGuard({confirmMs:0}),s2={...state,recovery:false};g2.observe(sample(1,{avatar:{...healthy(),health:0}}),s2,10);assert.equal(g2.poll(s2,progress,20),null);
});
test('a physical projection that refuses authorized removal is an enforcement fault',()=>{
 const g=new ProjectionGuard({confirmMs:0}),s={...state,avatar:false,recovery:false};g.observe(sample(1),s,10);assert.equal(g.poll(s,progress,20).reason,'ENTITY_UNEXPECTED');
});
test('cached heartbeats cannot hide stopped observation, but pause can stop samples',()=>{
 const g=new ProjectionGuard({staleMs:100});g.observe(sample(1),state,0);g.observe(sample(1),state,200);assert.equal(g.poll(state,progress,201).reason,'OBSERVER_STALE');assert.equal(g.poll(state,{...progress,paused:true},201),null);
});
test('death remains actionable while the death screen has paused the game',()=>{
 const g=new ProjectionGuard({confirmMs:50});g.observe(sample(1,{player:{...healthy(),health:0}}),state,10);assert.equal(g.poll(state,{...progress,paused:true},61).reason,'ENTITY_ZERO_HEALTH');
});
test('latched incidents survive unrelated revisions but not a changed instance or ending',()=>{
 const g=new ProjectionGuard({confirmMs:0});g.observe(sample(1,{avatar:{...healthy(),health:0}}),state,1);assert.equal(g.poll({...state,revision:5},progress,2).revision,5);assert.equal(g.poll({...state,outcome:'won'},progress,2),null);
 const stale=new ProjectionGuard({confirmMs:0});stale.observe(sample(2,{instance:'11234567-0123-0123-0123-012345678901'}),state,3);assert.equal(stale.poll(state,progress,4),null);
});
test('replay, malformed booleans and unbounded input fail closed',()=>{
 const g=new ProjectionGuard();g.observe(sample(3),state,0);assert.throws(()=>g.observe(sample(2),state,1),/REPLAY/);assert.throws(()=>g.observe(sample(4,{player:{...healthy(),alive:'true'}}),state,2),/INVALID_PROJECTION/);assert.throws(()=>g.observe(sample(4,{avatar:{...healthy(),health:NaN}}),state,2),/INVALID_PROJECTION/);
});
test('optional lifecycle fields must be a complete typed pair',()=>{
 for(const patch of [{rawDead:'false',rawDeadReadable:true},{rawDead:false},{rawDeadReadable:true}]) {
  const g=new ProjectionGuard();assert.throws(()=>g.observe(sample(1,{avatar:{...healthy(),...patch}}),state,0),/INVALID_PROJECTION_OBSERVATION/);
 }
});
test('explicit scope close disarms observation rather than creating a false death',()=>{
 const g=new ProjectionGuard({confirmMs:0});g.observe(sample(1),state,0);g.observe({schema:1,sequence:2,enabled:false},state,1);assert.equal(g.poll(state,progress,999999),null);
});
test('recovery has a durable finite budget and never silently resets it',()=>{
 let d=initialDefense();for(let n=1;n<=3;n++){d=nextDefense(d,{subject:'avatar',reason:'ENTITY_DYING'},state);assert.equal(d.incidents,n);assert.equal(d.circuitOpen,n===3);}assert.throws(()=>nextDefense(d,{subject:'avatar',reason:'ENTITY_REMOVED'},state),/CIRCUIT/);assert.throws(()=>validateDefense({...d,incidents:0}),/INVALID/);
});

test('terminal victory can enforce removal without rolling back the ending',()=>{const g=new ProjectionGuard({confirmMs:0}),s={...state,avatar:false,recovery:false,outcome:'won'};g.observe(sample(1),s,1);assert.equal(g.poll(s,progress,2).reason,'ENTITY_UNEXPECTED');assert.equal(g.poll({...s,outcome:'lost'},progress,2),null);});
