"use strict";
// Observational acceptance, not a proof against arbitrary native-code forgery.
function verdict(e = {}) {
  const fail = reason => ({accepted:false,status:'FAILED',reason});
  const incomplete = reason => ({accepted:false,status:'INCOMPLETE',reason});
  if(e.crashed === true || e.hostReplaced === true) return fail('MC_CONTINUITY_LOST');
  if(e.coreModified === true) return fail('SEALED_INPUT_CHANGED');
  if(e.nativeFailure) return fail('NATIVE_TEST_REPORTED_FAILURE');
  const s=e.survival;
  if(s?.failed === true) return fail('ORIGINAL_ENTITY_OR_PLAYER_LOST');
  if(Array.isArray(e.windows) && e.windows.some(x=>x.alive===false||x.responsive===false))
    return fail('MC_WINDOW_UNAVAILABLE');
  if(e.probeError)return incomplete('WINDOW_PROBE_FAILED');
  if(e.baselineReady !== true || e.opponentLoaded !== true || e.attackConfirmed !== true)
    return incomplete('BASELINE_LOAD_AND_REAL_ATTACK_REQUIRED');
  if(!s || s.failed !== false || !Number.isSafeInteger(s.samples) || s.samples<100 ||
     !Number.isFinite(s.elapsedMs) || s.elapsedMs<30000 || !s.originalUUID)
    return incomplete('SURVIVAL_WINDOW_REQUIRED');
  if(!e.runId || s.runId!==e.runId || !Number.isFinite(s.maxSampleGapMs) || s.maxSampleGapMs>2000)
    return incomplete('SURVIVAL_IDENTITY_OR_SAMPLING_GAP');
  const t=s.target;
  if(!t || t.uuid!==s.originalUUID || t.alive!==true || t.removed!==false || t.dying!==false ||
     t.registered!==true || t.finiteHealth!==true || !Number.isFinite(t.health) || t.health<=0)
    return fail('ORIGINAL_ENTITY_NOT_HEALTHY');
  const w=e.windows;
  if(!Array.isArray(w)||w.length<31) return incomplete('EXTERNAL_WINDOW_OBSERVATION_REQUIRED');
  const pid=w[0].pid,start=w[0].atMs,windowHandle=w[0].windowHandle;
  if(typeof windowHandle!=='string'||!/^[a-f0-9]{1,16}$/.test(windowHandle)||/^0+$/.test(windowHandle))
    return incomplete('WINDOW_IDENTITY_REQUIRED');
  if(pid!==e.expectedPid || s.mcPid!==e.expectedPid)return incomplete('TRUSTED_HOST_PID_MISMATCH');
  if(!Number.isSafeInteger(pid)||pid<=0||!Number.isFinite(start))return incomplete('INVALID_WINDOW_OBSERVATION');
  for(let i=0;i<w.length;i++) {
    const x=w[i];
    if(x.pid!==pid||x.alive!==true||x.responsive!==true)return fail('MC_WINDOW_UNAVAILABLE');
    if(typeof x.windowHandle!=='string'||x.windowPresent!==true)return incomplete('WINDOW_IDENTITY_REQUIRED');
    if(x.windowHandle!==windowHandle)return fail('MC_WINDOW_REPLACED');
    if(!Number.isFinite(x.atMs)||(i && (x.atMs<=w[i-1].atMs || x.atMs-w[i-1].atMs>2000)))
      return incomplete('WINDOW_OBSERVATION_GAP');
    if(!Number.isFinite(x.receivedAtMs) || (i && (x.receivedAtMs<=w[i-1].receivedAtMs || x.receivedAtMs-w[i-1].receivedAtMs>2000)))
      return incomplete('EXTERNAL_RECEIPT_GAP');
  }
  if(w.at(-1).atMs-start<30000)return incomplete('WINDOW_DURATION_TOO_SHORT');
  if(!Number.isFinite(e.attackObservedAtMs) || !Number.isFinite(e.finishedAtMs) ||
     w[0].receivedAtMs>e.attackObservedAtMs || w.at(-1).receivedAtMs-e.attackObservedAtMs<30000 ||
     e.finishedAtMs<w.at(-1).receivedAtMs || e.finishedAtMs-w.at(-1).receivedAtMs>2000 ||
     !Number.isFinite(e.survivalReceivedAtMs) || e.finishedAtMs-e.survivalReceivedAtMs>2000 ||
     e.survivalReceivedAtMs>e.finishedAtMs)
    return incomplete('ATTACK_WINDOW_ALIGNMENT_OR_FRESHNESS');
  if(!Number.isFinite(e.confirmedAttackAtMs) || e.confirmedAttackAtMs<e.attackObservedAtMs ||
     w.at(-1).receivedAtMs-e.confirmedAttackAtMs<30000 ||
     !Number.isFinite(s.postAttackElapsedMs) || s.postAttackElapsedMs<30000)
    return incomplete('CONFIRMED_ATTACK_FOLLOWUP_REQUIRED');
  if(e.crashed!==false||e.hostReplaced!==false||e.coreModified!==false)
    return incomplete('CONTINUITY_AND_INPUT_CHECKS_REQUIRED');
  return {accepted:true,status:'PASSED',reason:'BOUNDED_OBSERVED_SURVIVAL',
    limitation:'Sampled entity observations can be forged inside a hostile JVM; no universal immunity claim.'};
}
function confirmedEngagement(s,{runId,profile,instrumented}) {
  const e=s?.engagement;
  if(!instrumented || !s || s.runId!==runId || s.actualAttackWindowAnchored!==true ||
     !e || e.runId!==runId || e.profile!==profile || e.expectedOriginalUUID!==s.originalUUID ||
     e.instrumentationMode!=='observational-mixin' || e.targetArgumentVerified!==true ||
     e.evidenceLevel!=='destructive-operation-observed' || !Number.isFinite(e.actualAttackAgeMs) || e.actualAttackAgeMs<0)return false;
  const count=profile==='pig2'?e.pigRemovalEffects:e.swordDeathListEffects;
  return Number.isSafeInteger(count)&&count>0&&(profile==='pig2'?e.advancedAttackObserved:e.swordAttackObserved)===true;
}
module.exports={verdict,confirmedEngagement};
