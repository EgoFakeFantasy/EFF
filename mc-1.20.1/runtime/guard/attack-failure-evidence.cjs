'use strict';
// Preserve same-run observations when a recorder/probe exception interrupts the
// normal reporting path. These in-process files never establish combat success.
function attackFailureEvidence(read,{runId,pid}){
 const matches=value=>value&&typeof value==='object'&&value.runId===runId&&
  Number.isSafeInteger(pid)&&pid>0&&value.mcPid===pid;
 const started=read('sword-attack-started'),returned=read('sword-attack-returned');
 return {
  attackStartFileObserved:!!matches(started),
  attackReturnFileObserved:!!matches(returned),
  ...(matches(returned)?{attackReturnObservation:returned}:{}),
  attackReturnEvidenceScope:'same-run in-process return observation only; not external continuity or destructive-operation proof'
 };
}
module.exports={attackFailureEvidence};
