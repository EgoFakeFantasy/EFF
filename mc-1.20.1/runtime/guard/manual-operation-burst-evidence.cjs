'use strict';
// Read-only correlation of fresh callback stacks; not a trust root or combat verdict.
const requireEvidence=(ok,code)=>{if(!ok)throw Error(code);};
function reviewOperationBursts({runId,targetIdentity,batches,rows,inputs,start,end,callChain,operation,postAttackMs=30000}){
 requireEvidence(typeof runId==='string'&&typeof targetIdentity==='string'&&targetIdentity.includes(':'),'BURST_BINDING');
 requireEvidence(Number.isFinite(start)&&Number.isFinite(end)&&end>start&&Number.isFinite(postAttackMs)&&postAttackMs>=30000,'BURST_INTERVAL');
 requireEvidence(Array.isArray(callChain)&&callChain.length>=2&&callChain.every(f=>typeof f==='string'&&f.length>0)&&typeof operation==='string','BURST_EXPECTED_CHAIN');
 requireEvidence(Array.isArray(inputs)&&inputs.length>0&&inputs.length<=16&&Array.isArray(batches)&&batches.length<=256,'BURST_INPUTS');
 const bursts=batches.flatMap(b=>{
  requireEvidence(b.runId===runId&&b.combatPassed===false&&Array.isArray(b.bursts),'BURST_RUN_MISMATCH');return b.bursts;
 });
 requireEvidence(bursts.length<=256&&bursts.every((b,i)=>b.sequence===i+1),'BURST_SEQUENCE');
 const inRange=rows.filter(r=>r.observedAtUnixMs>=start&&r.observedAtUnixMs<=end);
 requireEvidence(inRange.length>0,'BURST_NO_TRACE');
 for(const r of inRange){
  const m=r.manualOperations;
  requireEvidence(m?.bound===true&&m.runId===runId&&m.operationBurstDropped===0&&m.droppedCallbacks===0&&m.wrongThreadCallbacks===0,'BURST_TRACE_INCOMPLETE');
 }
 function orderedChain(frames){
  let index=-1;
  return callChain.every(expected=>{
   // Hidden-class addresses vary per JVM. Preserve the full observed frame in
   // the report and normalize only its documented address suffix for comparison.
   index=frames.findIndex((frame,i)=>i>index&&frame.split(';')[0].replace(/\/0x[0-9a-fA-F]+(?=\.)/g,'')===expected);return index>=0;
  });
 }
 const used=new Set();let previousEnd=-Infinity;
 const results=inputs.map(input=>{
  const before=input.beforeUnixMs,after=input.afterUnixMs;
  requireEvidence(Number.isFinite(before)&&Number.isFinite(after)&&before>=start&&after>=before&&after<=end
   &&before>previousEnd,'BURST_INPUT_CLOCK');previousEnd=after+2000;
  const beforeRow=rows.findLast(r=>r.observedAtUnixMs<before),afterRow=rows.find(r=>r.observedAtUnixMs>=after+2000);
  requireEvidence(beforeRow&&afterRow&&before-beforeRow.observedAtUnixMs<=2000&&afterRow.observedAtUnixMs-after<=4000,'BURST_TRACE_GAP');
  const found=bursts.filter(b=>b.originalIdentity===targetIdentity&&b.operation===operation
   &&b.observedAtUnixMs>=before&&b.observedAtUnixMs<=after+2000);
  const sides={};
  for(const side of ['client','server']){
   const matching=found.filter(b=>b.side===side&&b.kind==='gate-rejected'&&b.attackAttributionVerified===false
    &&b.stackUnavailable!==true&&Array.isArray(b.stackDiagnosticOnly)&&b.stackDiagnosticOnly.length<=24
    &&b.stackDiagnosticOnly.every(f=>typeof f==='string'&&f.length<=256)&&orderedChain(b.stackDiagnosticOnly));
   requireEvidence(matching.length>0,'BURST_FRESH_CHAIN_MISSING:'+side);
   const b=matching[0];
   requireEvidence(!used.has(b.sequence),'BURST_REUSED');used.add(b.sequence);
   const old=beforeRow.manualOperations.operations.find(o=>o.sequence===b.operationSequence);
   const current=afterRow.manualOperations.operations.find(o=>o.sequence===b.operationSequence);
   requireEvidence(current&&current.side===side&&current.kind===b.kind&&current.operation===operation
    &&current.originalIdentity===targetIdentity&&Number.isSafeInteger(b.operationCount)
    &&b.operationCount>(old?.count??0)&&b.operationCount<=current.count
    &&current.lastObservedAtUnixMs>=b.observedAtUnixMs,'BURST_COUNTER_MISMATCH');
   sides[side]={sequence:b.sequence,operationSequence:b.operationSequence,operationCount:b.operationCount,
    observedAtUnixMs:b.observedAtUnixMs,stackDiagnosticOnly:b.stackDiagnosticOnly};
  }
  const last=Math.max(...Object.values(sides).map(b=>b.observedAtUnixMs));
  requireEvidence(end-last>=postAttackMs,'BURST_POST_ATTACK_COVERAGE');
  return {input,sides,freshBothSideCallChainsObserved:true};
 });
 return {scope:'time-correlated-fresh-operation-stacks-on-bound-original',combatPassed:false,
  runId,targetIdentity,results,limitation:'In-process stacks and counters can be forged by hostile code. This establishes observed call chains, not full attack completion, entity survival or window continuity; those require separate evidence.'};
}
module.exports={reviewOperationBursts};
