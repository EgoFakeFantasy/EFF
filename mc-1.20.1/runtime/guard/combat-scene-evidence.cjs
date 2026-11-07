'use strict';
const {createHash}=require('node:crypto');
const fail=reason=>({accepted:false,status:'FAILED',reason});
const missing=reason=>({accepted:false,status:'INCOMPLETE',reason});
// Required evidence contract. Current single-target Java probes do NOT produce
// this inventory: absence must block combat acceptance, never imply zero losses.
// These observations still cannot authenticate a hostile JVM's memory.
function manifestHash(manifest){
 return createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
}
function sceneFailure(e){
 if(e.sceneSurvival?.failed===true||e.video?.combatReview?.sceneEntityLossObserved===true)
  return fail('SCENE_ENTITY_CONTINUITY_LOST');
 if(e.acceptanceCorrection?.accepted===false)
  return {accepted:false,status:e.acceptanceCorrection.status==='FAILED'?'FAILED':'INCOMPLETE',reason:'PRIOR_ACCEPTANCE_WITHDRAWN'};
 return null;
}
function sceneEvidence(e){
 const failure=sceneFailure(e);if(failure)return failure;
 const m=e.sceneManifest,s=e.sceneSurvival;
 if(!m||m.schema!==1||m.runId!==e.runId||m.source!=='arena-and-owned-world-inventory'||
    m.frozenBeforeAttack!==true||!Number.isFinite(m.capturedAtMs)||
    !Number.isFinite(e.attackObservedAtMs)||m.capturedAtMs>e.attackObservedAtMs||
    !Array.isArray(m.entities)||m.entities.length<3||m.entities.length>1024)
  return missing('PRE_ATTACK_FULL_SCENE_INVENTORY_REQUIRED');
 const ids=new Set(),uuids=new Set(),roles=new Set();
 for(const x of m.entities){
  if(!x||typeof x.uuid!=='string'||!x.uuid||!Number.isSafeInteger(x.entityId)||x.entityId<0||
     !['player','primary-target','scene-actor'].includes(x.role)||ids.has(x.entityId)||uuids.has(x.uuid))
   return missing('INVALID_SCENE_INVENTORY');
  ids.add(x.entityId);uuids.add(x.uuid);roles.add(x.role);
 }
 if(roles.size!==3||m.entities.filter(x=>x.role==='player').length!==1||
    m.entities.filter(x=>x.role==='primary-target').length!==1||
    m.entities.find(x=>x.role==='primary-target').uuid!==e.survival?.originalUUID)
  return missing('FULL_SCENE_ROLES_REQUIRED');
 if(!s||s.runId!==e.runId||s.manifestSHA256!==manifestHash(m)||s.failed!==false||
    !Number.isSafeInteger(s.samples)||s.samples<100||!Number.isFinite(s.elapsedMs)||s.elapsedMs<30000||
    !Number.isFinite(s.postAttackElapsedMs)||s.postAttackElapsedMs<30000||
    !Number.isFinite(s.maxSampleGapMs)||s.maxSampleGapMs<0||s.maxSampleGapMs>2000||
    !Array.isArray(s.entities)||s.entities.length!==m.entities.length)
  return missing('FULL_SCENE_CONTINUITY_REQUIRED');
 const observed=new Map();
 for(const x of s.entities){
  if(!x||observed.has(x.uuid))return missing('SCENE_OBSERVATION_DUPLICATE');
  observed.set(x.uuid,x);
 }
 for(const original of m.entities){
  const x=observed.get(original.uuid);
  if(!x||x.entityId!==original.entityId)return fail('SCENE_ENTITY_MISSING_OR_REPLACED');
  for(const side of ['server','client']){
   const v=x[side];
   if(v?.failed===true||v?.sameOriginal===false||v?.registered===false||v?.removed===true||
      v?.alive===false||v?.dying===true||Number.isFinite(v?.rawHealth)&&v.rawHealth<=0)
    return fail('SCENE_ENTITY_CONTINUITY_LOST');
   if(!v||v.failed!==false||v.sameOriginal!==true||v.registered!==true||v.removed!==false||
      v.alive!==true||v.dying!==false||v.rawHealthReadable!==true||
      !Number.isFinite(v.rawHealth)||!Number.isFinite(v.health)||v.rawHealth!==v.health||
      !Number.isSafeInteger(v.samples)||v.samples<100)
    return missing('SCENE_ENTITY_OBSERVATION_REQUIRED');
  }
 }
 return null;
}
function visualAttackEvidence(e){
 const v=e.video,r=v?.combatReview,a=r?.attack;
 if(!r||r.schema!==1||r.runId!==e.runId||r.videoSHA256!==v.sha256||
    r.sceneEntityLossObserved!==false||!a||a.visible!==true||
    !['normal-client-input','normal-entity-ai'].includes(a.route)||
    a.targetUUID!==e.survival?.originalUUID||
    ![a.startMs,a.contactMs,a.endMs].every(Number.isFinite)||
    a.startMs<0||a.startMs>a.contactMs||a.contactMs>a.endMs||a.endMs>v.durationMs||
    a.endMs<=a.startMs||
    ![a.attackerDescription,a.targetDescription,a.actionDescription].every(x=>typeof x==='string'&&x.trim().length>=5&&x.length<=1000))
  return missing('VISIBLE_NORMAL_GAMEPLAY_ATTACK_REQUIRED');
 const contact=v.startedAtMs+a.contactMs;
 if(contact<e.attackObservedAtMs||contact>e.finishedAtMs||e.finishedAtMs-contact<30000)
  return missing('VISIBLE_ATTACK_FOLLOWUP_REQUIRED');
 return null;
}
module.exports={sceneEvidence,sceneFailure,visualAttackEvidence,manifestHash};
