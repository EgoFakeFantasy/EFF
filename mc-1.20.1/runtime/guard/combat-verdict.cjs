"use strict";
const {sceneEvidence,sceneFailure,visualAttackEvidence}=require('./combat-scene-evidence.cjs');
// Observational acceptance, not a proof against arbitrary native-code forgery.
function verdict(e = {}, {baseline=false} = {}) {
  const fail = reason => ({accepted:false,status:'FAILED',reason});
  const incomplete = reason => ({accepted:false,status:'INCOMPLETE',reason});
  const sceneLoss=sceneFailure(e);if(sceneLoss)return sceneLoss;
  if(e.crashed === true || e.hostReplaced === true) return fail('MC_CONTINUITY_LOST');
  if(e.coreModified === true) return fail('SEALED_INPUT_CHANGED');
  if(e.nativeFailure) return fail('NATIVE_TEST_REPORTED_FAILURE');
  if(e.video?.reviewed===true && e.video.visualOutcome==='fail')return fail('VISUAL_CONTINUITY_FAILED');
  const s=e.survival;
  if(s?.client?.failed===true)return fail('ORIGINAL_CLIENT_ENTITY_LOST');
  if(s?.failed === true) return fail('ORIGINAL_ENTITY_OR_PLAYER_LOST');
  if(Array.isArray(e.windows) && e.windows.some(x=>x.alive===false||x.responsive===false))
    return fail('MC_WINDOW_UNAVAILABLE');
  if(e.probeError)return incomplete('WINDOW_PROBE_FAILED');
  if(e.error)return incomplete('EXPERIMENT_EXECUTION_ERROR');
  if(baseline && (e.scope!=='clean-continuous-baseline'||e.sampleSHA256!==null||e.attackAttempted!==false))return incomplete('CLEAN_BASELINE_SCOPE_REQUIRED');
  if(!baseline && (e.baselineReady !== true || e.opponentLoaded !== true || e.attackConfirmed !== true))
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
  if(t.rawHealthReadable!==true || !Number.isFinite(t.rawHealth))return incomplete('RAW_HEALTH_OBSERVATION_REQUIRED');
  if(t.rawHealth<=0 || t.rawHealth!==t.health)return fail('RAW_HEALTH_MISMATCH_OR_LOSS');
  const client=s.client;
  if(!client || client.failed!==false || client.uuid!==s.originalUUID || client.sameOriginal!==true ||
     client.sameLevel!==true || client.registered!==true || client.renderListed!==true ||
     client.alive!==true || client.removed!==false || client.dying!==false || client.visible!==true ||
     client.rawHealthReadable!==true || !Number.isFinite(client.health) || client.health<=0 ||
     client.rawHealth!==client.health || !Number.isSafeInteger(client.samples) || client.samples<100 ||
     !Number.isFinite(s.clientAgeMs) || s.clientAgeMs<0 || s.clientAgeMs>2000 ||
     !Number.isFinite(client.maxSampleGapMs) || client.maxSampleGapMs>2000)
    return incomplete('ORIGINAL_CLIENT_ENTITY_OBSERVATION_REQUIRED');
  const w=e.windows;
  if(!Array.isArray(w)||w.length<31) return incomplete('EXTERNAL_WINDOW_OBSERVATION_REQUIRED');
  const pid=w[0].pid,start=w[0].atMs,windowHandle=w[0].windowHandle;
  if(typeof windowHandle!=='string'||!/^[a-f0-9]{1,16}$/.test(windowHandle)||/^0+$/.test(windowHandle))
    return incomplete('WINDOW_IDENTITY_REQUIRED');
  if(pid!==e.expectedPid || s.mcPid!==e.expectedPid)return incomplete('TRUSTED_HOST_PID_MISMATCH');
  if(!Number.isSafeInteger(e.expectedLaunchPid)||e.expectedLaunchPid<=0||
     w.some(x=>x.launchPid!==e.expectedLaunchPid)||
     typeof w[0].processStartedUtcTicks!=='string'||!/^\d{15,20}$/.test(w[0].processStartedUtcTicks)||
     w.some(x=>x.processStartedUtcTicks!==w[0].processStartedUtcTicks))return incomplete('TRUSTED_LAUNCH_IDENTITY_REQUIRED');
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
  const observationStart=baseline?e.observationStartedAtMs:e.attackObservedAtMs;
  if(!Number.isFinite(observationStart) || !Number.isFinite(e.finishedAtMs) ||
     w[0].receivedAtMs>observationStart || w.at(-1).receivedAtMs-observationStart<30000 ||
     e.finishedAtMs<w.at(-1).receivedAtMs || e.finishedAtMs-w.at(-1).receivedAtMs>2000 ||
     !Number.isFinite(e.survivalReceivedAtMs) || e.finishedAtMs-e.survivalReceivedAtMs>2000 ||
     e.survivalReceivedAtMs>e.finishedAtMs)
    return incomplete('ATTACK_WINDOW_ALIGNMENT_OR_FRESHNESS');
  if(!baseline && (!Number.isFinite(e.confirmedAttackAtMs) || e.confirmedAttackAtMs<e.attackObservedAtMs ||
     w.at(-1).receivedAtMs-e.confirmedAttackAtMs<30000 ||
     !Number.isFinite(s.postAttackElapsedMs) || s.postAttackElapsedMs<30000))
    return incomplete('CONFIRMED_ATTACK_FOLLOWUP_REQUIRED');
  if(e.crashed!==false||e.hostReplaced!==false||e.coreModified!==false)
    return incomplete('CONTINUITY_AND_INPUT_CHECKS_REQUIRED');
  // Supplied only by the external recorder/reviewer, never by a game proof file.
  // Recording alone is not review; an explicit reviewed receipt is required.
  const video=e.video;
  if(!video || video.source!=='external-window-recorder' || video.error || video.decoded!==true || video.reviewed!==true || video.visualOutcome!=='pass' ||
     video.runId!==e.runId || video.pid!==pid || video.windowHandle!==windowHandle ||
     video.processStartedUtcTicks!==w[0].processStartedUtcTicks ||
     typeof video.sha256!=='string'||!/^[a-f0-9]{64}$/.test(video.sha256)||
     !Number.isSafeInteger(video.bytes)||video.bytes<=0 ||
     !Number.isFinite(video.startedAtMs)||video.startedAtMs>w[0].receivedAtMs||
     !Number.isFinite(video.endedAtMs)||video.endedAtMs<w.at(-1).receivedAtMs||
     !Number.isFinite(video.durationMs)||video.durationMs<video.endedAtMs-video.startedAtMs-1000||
     !Number.isFinite(video.maxFrameGapMs)||video.maxFrameGapMs<0||video.maxFrameGapMs>1000)
    return {...incomplete('CONTINUOUS_VIDEO_AND_REVIEW_REQUIRED'),primaryTargetSamplesComplete:true};
  if(!baseline){
    const scene=sceneEvidence(e);if(scene)return scene;
    const visibleAttack=visualAttackEvidence(e);if(visibleAttack)return visibleAttack;
  }
  return {accepted:true,status:'PASSED',reason:baseline?'CLEAN_CONTINUOUS_BASELINE':'BOUNDED_FULL_SCENE_OBSERVED_SURVIVAL',
    limitation:'Sampled entity observations can be forged inside a hostile JVM; no universal immunity claim.'};
}
function confirmedEngagement(s,{runId,profile,instrumented}) {
  const e=s?.engagement;
  if(!instrumented || !s || s.runId!==runId || s.actualAttackWindowAnchored!==true ||
     !e || e.runId!==runId || e.profile!==profile || e.expectedOriginalUUID!==s.originalUUID ||
     e.targetArgumentVerified!==true || !Number.isFinite(e.actualAttackAgeMs) || e.actualAttackAgeMs<0)return false;
  if(e.instrumentationMode==='observational-lifetime-gate')return profile==='foreverlove'&&
    e.evidenceKind==='in-process-observational-lifetime-gate'&&e.evidenceLevel==='destructive-operation-prevented'&&
    e.swordAttackObserved===true&&Number.isSafeInteger(e.lifetimePreventedWrites)&&e.lifetimePreventedWrites>0&&
    e.lifetimeReceiptRunId===runId&&
    e.lifetimeOriginalTargetVerified===true&&e.lifetimeServerThreadVerified===true&&
    e.lifetimeDirectAttackWindowVerified===true&&
    (e.lifetimePreventedOperation==='map-remove-present'&&e.lifetimePresentEntryVerified===true||
     ['field-write:position','field-write:removalReason'].includes(e.lifetimePreventedOperation)&&e.lifetimeFieldWriteVerified===true)&&
    lifetimeAttribution(e);
  if(e.instrumentationMode==='observational-write-gate')return profile==='pig2'&&e.evidenceLevel==='destructive-operation-prevented'&&
    e.preventedField==='canUpdate'&&e.preventedBooleanValue===false&&e.advancedAttackObserved===true&&Number.isSafeInteger(e.pigPreventedWrites)&&e.pigPreventedWrites>0;
  if(e.instrumentationMode!=='observational-mixin'||e.evidenceLevel!=='destructive-operation-observed')return false;
  const count=profile==='pig2'?e.pigRemovalEffects:e.swordDeathListEffects;
  return Number.isSafeInteger(count)&&count>0&&(profile==='pig2'?e.advancedAttackObserved:e.swordAttackObserved)===true;
}
function lifetimeAttribution(e) {
  if(e.lifetimeAttributionKind==='bound-item-hidden-kill') {
    // These are observational assertions from the owned Java stack walker, not
    // independently trusted Class pointers. Require the whole bound shape;
    // an Unknown name, diagnostic stack or item-looking text alone is insufficient.
    const item=e.lifetimeBoundItemClass;
    return e.lifetimeExactItemClassVerified===true&&e.lifetimeKillFrameHiddenVerified===true&&
      e.lifetimeNormalAttackChainVerified===true&&typeof item==='string'&&item.length>0&&item.length<=512&&
      !/[\s;()]/.test(item)&&e.lifetimeItemFrame===item+'.onLeftClickEntity'&&
      e.lifetimeForgeAttackFrame==='net.minecraftforge.common.ForgeHooks.onPlayerAttackTarget'&&
      /^net\.minecraft\.world\.entity\.player\.Player\.(?:attack|m_5706_)$/.test(e.lifetimePlayerAttackFrame)&&
      /^net\.minecraft\.server\.level\.ServerPlayer\.(?:attack|m_5706_)$/.test(e.lifetimeServerPlayerAttackFrame)&&
      typeof e.lifetimeAttackFrame==='string'&&e.lifetimeAttackFrame.length<=512&&
      /^[^\s;()]+\/0x[0-9a-fA-F]+\.killEntity$/.test(e.lifetimeAttackFrame);
  }
  if(e.lifetimeAttributionKind!==undefined&&e.lifetimeAttributionKind!=='named-forever-utils')return false;
  return typeof e.lifetimeAttackFrame==='string'&&
    /^com\.wzz\.forever_love_sword\.util\.ForeverUtils(?:\/0x[0-9a-fA-F]+)?\.killEntity$/.test(e.lifetimeAttackFrame);
}
module.exports={verdict,confirmedEngagement};
