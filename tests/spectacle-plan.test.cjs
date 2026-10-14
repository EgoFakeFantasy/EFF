"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const R=require('../local-version/phenomenon-runtime.js'),P=require('../local-version/agent-policies.js'),S=require('../local-version/spectacle-plan.js'),V=require('../local-version/virtual-engine.js');
const act=(state,target)=>R.resolveRound(state,P.make(state,target),P.intruder(state));
test('each accepted claim gets its own visual meaning without changing the authority state',()=>{
 for(const [target,kind] of [['body','body'],['attribution','attribution'],['bad_owned','ending']]){
  const state=act(R.initial(),target),before=JSON.stringify(state),plan=S.round(state);
  assert.equal(plan.kind,kind);assert.equal(plan.rebuild,undefined);assert.ok(plan.trace.some(t=>t.includes('commit revision 1')));assert.equal(JSON.stringify(state),before);
 }
});
test('rebirth belongs to all three completed claims, while partial success and failure remain occupation',()=>{
 let state=R.initial();for(const goal of ['bad_owned','body','attribution'])state=act(state,goal);
 assert.equal(S.round(state).kind,'rebirth');assert.equal(S.round(state).rebuild,true);
 let failed=act(R.initial(),'body');for(let i=0;i<5;i++)failed=R.resolveRound(failed,{...P.make(failed,'attribution'),reason_code:'INVALID'},P.intruder(failed));
 assert.equal(S.round(failed).kind,'occupation');assert.equal(S.round(failed).rebuild,undefined);assert.equal(failed.bodyOwner,'intruder');
});
test('checkpoint and order visuals do not look like winning a claim',()=>{
 const state=R.initial();assert.equal(S.round(R.resolveRound(state,P.preserve(state),P.intruder(state))).kind,'preserve');
 assert.equal(S.round(R.resolveRound(state,P.order(state,'repression','attribution','body'),P.intruder(state))).kind,'order');
});
test('a new virtual runtime instance is rebuilt from real inputs with identical state and independent objects',()=>{
 const state=act(R.initial(),'body'),checkpoint=R.checkpoint(state),old=V.instantiate(checkpoint),next=V.replace(old,checkpoint);
 assert.equal(next.generation,2);assert.equal(next.ruleset,1);assert.notEqual(next.state,old.state);assert.deepEqual(next.state,old.state);assert.notEqual(next.state.history,old.state.history);assert.equal(old.generation,1);
});
test('rebuilding rejects forged checkpoints, foreign battles, new revisions and generation overflow',()=>{
 const state=R.initial(),checkpoint=R.checkpoint(state),old=V.instantiate(checkpoint);
 const forged=structuredClone(checkpoint);forged.expected.outcome='won';assert.throws(()=>V.replace(old,forged),/REPLAY_MISMATCH/);
 assert.throws(()=>V.replace(old,R.checkpoint(R.initial({battleId:'court-other'}))),/INSTANCE_STATE_MISMATCH/);
 assert.throws(()=>V.replace(old,R.checkpoint(act(state,'body'))),/INSTANCE_STATE_MISMATCH/);
 assert.throws(()=>V.replace(V.instantiate(checkpoint,32),checkpoint),/INVALID_GENERATION/);
});
test('finale rewrite shows complete original and replacement without granting past authority',()=>{
 const line={rewrite:{original:'原句完整保留。',replacement:'新句完整保留。'}};
 const plan=S.finale(line,{node:'meta_state_2',intervening:false});assert.equal(plan.kind,'rewrite');assert.equal(plan.original,line.rewrite.original);assert.equal(plan.replacement,line.rewrite.replacement);assert.equal(plan.tone,'intruder');assert.match(plan.trace.join('\n'),/not granted/);
});
test('unconscious past-directed effects require the original intervention boundary',()=>{
 const line={s:'无意识',c:'revealed fracture',t:'从原文开放的锚点写入。'};
 assert.equal(S.finale(line,{node:'meta_1',step:0,intervening:false}),null);
 assert.equal(S.finale(line,{node:'meta_1',step:1,intervening:true}).kind,'retroaction');
 assert.equal(S.finale(line,{node:'meta_1',step:1,intervening:true,rewritten:true}),null);
 assert.equal(S.action('unconsciousStep'),null);assert.equal(S.action('summonUnconscious').kind,'summon');assert.equal(S.action('rewriteChapter').rebuild,true);
});
test('visual traces stay bounded even after a rejected long player input',()=>{
 const state=R.initial(),bad={...P.make(state,'body'),action:'x'.repeat(4000)},after=R.resolveRound(state,bad,P.intruder(state)),plan=S.round(after);
 assert.ok(plan.trace.every(t=>t.length<=180));assert.ok(plan.trace.length<=24);assert.notEqual(plan.kind,'rebirth');
});
