'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {reviewOperationBursts}=require('./manual-operation-burst-evidence.cjs');
function fixture(){
 const op=(side,sequence,count)=>({side,sequence,count,kind:'gate-rejected',operation:'remove',originalIdentity:'1:original',lastObservedAtUnixMs:1120});
 return {runId:'run',targetIdentity:'1:original',start:0,end:40000,operation:'remove',callChain:['Item.onClick','Player.attack'],
  inputs:[{beforeUnixMs:1000,afterUnixMs:1100}],
  batches:[{runId:'run',combatPassed:false,bursts:['client','server'].map((side,i)=>({sequence:i+1,side,operationSequence:i+1,operationCount:1,
   originalIdentity:'1:original',kind:'gate-rejected',operation:'remove',observedAtUnixMs:1120,attackAttributionVerified:false,
   stackDiagnosticOnly:['Gate.reject;isHidden=false','Item.onClick;isHidden=false','Player.attack;isHidden=false']}))}],
  rows:[900,3200].map((at,i)=>({observedAtUnixMs:at,manualOperations:{bound:true,runId:'run',operationBurstDropped:0,droppedCallbacks:0,wrongThreadCallbacks:0,
   operations:i?[op('client',1,1),op('server',2,1)]:[]}}))};
}
test('fresh stack correlation requires both sides and never returns combat success',()=>{
 const r=reviewOperationBursts(fixture());assert.equal(r.combatPassed,false);assert.equal(r.results[0].freshBothSideCallChainsObserved,true);
});
test('hidden class suffix is normalized without broadening the method name',()=>{
 const f=fixture();for(const b of f.batches[0].bursts)b.stackDiagnosticOnly[1]='Item/0x000000010123abcd.onClick;isHidden=true';
 assert.equal(reviewOperationBursts(f).results.length,1);
 f.batches[0].bursts[0].stackDiagnosticOnly[1]='OtherItem/0x000000010123abcd.onClick;isHidden=true';
 assert.throws(()=>reviewOperationBursts(f),/BURST_FRESH_CHAIN_MISSING/);
});
test('second input requires its own distinct stacks and increased counters',()=>{
 const f=fixture();f.end=50000;f.inputs.push({beforeUnixMs:10000,afterUnixMs:10100});
 f.batches[0].bursts.push(...f.batches[0].bursts.map(b=>({...b,sequence:b.sequence+2,operationCount:2,observedAtUnixMs:10120})));
 f.rows.push({observedAtUnixMs:9900,manualOperations:structuredClone(f.rows[1].manualOperations)});
 const after=structuredClone(f.rows[1]);after.observedAtUnixMs=12200;
 for(const op of after.manualOperations.operations){op.count=2;op.lastObservedAtUnixMs=10120;}
 f.rows.push(after);
 assert.equal(reviewOperationBursts(f).results.length,2);
 f.batches[0].bursts.pop();assert.throws(()=>reviewOperationBursts(f),/BURST_FRESH_CHAIN_MISSING:server/);
});
for(const [name,mutate,code] of [
 ['wrong run',x=>x.batches[0].runId='other','BURST_RUN_MISMATCH'],
 ['missing repeated stack',x=>x.batches[0].bursts[1].observedAtUnixMs=200,'BURST_FRESH_CHAIN_MISSING'],
 ['wrong original',x=>x.batches[0].bursts[1].originalIdentity='2:replacement','BURST_FRESH_CHAIN_MISSING'],
 ['changed operation',x=>x.batches[0].bursts[1].operation='other','BURST_FRESH_CHAIN_MISSING'],
 ['first stack cannot stand for a fresh record',x=>{x.batches[0].bursts[1].firstStackDiagnosticOnly=x.batches[0].bursts[1].stackDiagnosticOnly;delete x.batches[0].bursts[1].stackDiagnosticOnly;},'BURST_FRESH_CHAIN_MISSING'],
 ['unordered frames',x=>x.batches[0].bursts[1].stackDiagnosticOnly.reverse(),'BURST_FRESH_CHAIN_MISSING'],
 ['no new operation',x=>x.rows[0].manualOperations.operations=x.rows[1].manualOperations.operations,'BURST_COUNTER_MISMATCH'],
 ['unrecorded input',x=>x.inputs[0].beforeUnixMs=-1,'BURST_INPUT_CLOCK'],
 ['missing trace',x=>x.rows=[],'BURST_NO_TRACE'],
 ['dropped burst',x=>x.rows[0].manualOperations.operationBurstDropped=1,'BURST_TRACE_INCOMPLETE'],
 ['missing new diagnostic field',x=>delete x.rows[0].manualOperations.operationBurstDropped,'BURST_TRACE_INCOMPLETE'],
 ['duplicate sequence',x=>x.batches[0].bursts[1].sequence=1,'BURST_SEQUENCE'],
 ['short aftermath',x=>x.end=3000,'BURST_POST_ATTACK_COVERAGE'],
 ['overlapping input cannot reuse entry',x=>x.inputs.push({...x.inputs[0]}),'BURST_INPUT_CLOCK']
])test(name,()=>{const f=fixture();mutate(f);assert.throws(()=>reviewOperationBursts(f),e=>e.message.startsWith(code));});
