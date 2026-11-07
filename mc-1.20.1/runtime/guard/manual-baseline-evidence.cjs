'use strict';
// Read-only evidence validation. No game input, repair, process control or combat verdict.
const {identity,windowFailure}=require('./window-recorder.cjs');
function requireEvidence(condition,code){if(!condition)throw Error(code);}
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const uuid=s=>typeof s==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(s);
function videoInterval(video,timeline,pid){
 requireEvidence(video&&video.error===null&&video.decoded===true&&video.mediaDecoded===true,'BASELINE_VIDEO_INVALID');
 const target=identity(video);
 requireEvidence(target.pid===pid,'BASELINE_VIDEO_PID');
 const c=video.clock;
 requireEvidence(c&&c.schema===1&&c.source==='gdigrab-frame-time-and-recorder-wall-clock'
  &&finite(c.epochOffsetUnixMs)&&c.epochOffsetUnixMs>0&&c.maximumWallClockDriftMs===250
  &&finite(c.captureStartedAtUnixMs)&&finite(c.captureEndedAtUnixMs),'BASELINE_VIDEO_CLOCK_MISSING');
 requireEvidence(timeline?.clock&&JSON.stringify(timeline.clock)===JSON.stringify(c),'BASELINE_TIMELINE_CLOCK_MISMATCH');
 const frames=timeline.frames;
 requireEvidence(Array.isArray(frames)&&frames.length>=2&&frames.length<=4000
  &&frames.length===video.captureFrames&&frames.length===video.frameCount,'BASELINE_CAPTURE_FRAME_COUNT');
 for(let i=0;i<frames.length;i++)requireEvidence(finite(frames[i])&&frames[i]>=0
  &&(!i||frames[i]>frames[i-1]&&frames[i]-frames[i-1]<=1000),'BASELINE_CAPTURE_FRAME_GAP');
 const start=c.captureStartedAtUnixMs,end=c.captureEndedAtUnixMs;
 requireEvidence(Math.abs(start-c.epochOffsetUnixMs-frames[0])<1
  &&Math.abs(end-c.epochOffsetUnixMs-frames.at(-1))<1
  &&finite(video.startedAtMs)&&finite(video.endedAtMs)
  &&Math.abs(video.startedAtMs-frames[0])<1&&Math.abs(video.endedAtMs-frames.at(-1))<1
  &&finite(video.durationMs)&&Math.abs(end-start-video.durationMs)<=200
  &&end-start>=20000,'BASELINE_CAPTURE_CLOCK_OR_DURATION');
 const windows=timeline.windows;
 requireEvidence(Array.isArray(windows)&&windows.length>=2&&windows.length<=400,'BASELINE_WINDOW_SAMPLES');
 for(let i=0;i<windows.length;i++){
  const w=windows[i];requireEvidence(finite(w.receivedAtMs)&&!windowFailure(w,target,true),'BASELINE_ORIGINAL_WINDOW_LOST');
  if(i)requireEvidence(w.receivedAtMs>windows[i-1].receivedAtMs,'BASELINE_WINDOW_CLOCK');
  if(i&&w.receivedAtMs>=frames[0]&&windows[i-1].receivedAtMs<=frames.at(-1))
   requireEvidence(w.receivedAtMs-windows[i-1].receivedAtMs<=2000,'BASELINE_WINDOW_OBSERVATION_GAP');
 }
 const before=windows.findLast(w=>w.receivedAtMs<=frames[0]);
 requireEvidence(before&&frames[0]-before.receivedAtMs<=2000
  &&windows.at(-1).receivedAtMs>=frames.at(-1)-2000,'BASELINE_WINDOW_COVERAGE');
 return {start,end,target};
}
function reviewManualBaseline({ready,bound,recording,timeline,rows}){
 requireEvidence(ready&&bound&&Number.isSafeInteger(ready.pid)&&ready.pid>0
  &&bound.pid===ready.pid&&bound.originalsFrozen===true
  &&Number.isSafeInteger(bound.count)&&bound.count>=2&&bound.count<=32
  &&Array.isArray(ready.sceneEntities)&&ready.sceneEntities.length===bound.count-1,'BASELINE_ORIGINAL_ROSTER');
 requireEvidence(uuid(ready.manualRunId)&&recording?.manualRunId===ready.manualRunId,'BASELINE_RUN_BINDING');
 requireEvidence(recording.error===''&&recording.automaticAttack===false&&recording.automaticVerdict===false,'BASELINE_RECORDING_RESULT');
 const {start,end,target}=videoInterval(recording.video,timeline,ready.pid);
 const expected=new Map(ready.sceneEntities.map(e=>[e.uuid,e.id]));
 requireEvidence(expected.size===bound.count-1&&expected.has(ready.targetUUID)
  &&[...expected].every(([id,n])=>uuid(id)&&Number.isSafeInteger(n)),'BASELINE_READY_ROSTER_INVALID');
 requireEvidence(Array.isArray(rows)&&rows.length>=20&&rows.length<=100000,'BASELINE_TRACE_COUNT');
 const observedEntities=rows.flatMap(r=>[...(r.client||[]),...(r.server?.entities||[])]);
 const spatialRequired=observedEntities.some(e=>e.spatial!==undefined);
 const spatialCacheRequired=observedEntities.some(e=>e.spatial?.cacheMatchesPosition!==undefined);
 const pickEvidenceRequired=rows.some(r=>r.pickState!==undefined);
 const publicIndexRequired=observedEntities.some(e=>e.publicIndex!==undefined);
 const observationClockRequired=rows.some(r=>r.observationClock!==undefined);
 const vector=v=>v?.finite===true&&['x','y','z'].every(k=>typeof v[k]==='string'&&v[k].trim()!==''&&Number.isFinite(Number(v[k])));
 const references=new Map();let previousTime,previousElapsed,firstPending=false,checkedObjectSamples=0;
 let playerUUID,playerId,firstIndex=-1,lastIndex=-1;
 for(let index=0;index<rows.length;index++){
  const r=rows[index];
  if(observationClockRequired){
   const c=r.observationClock;
   requireEvidence(c?.source==='paired-at-observation-start'
    &&finite(c.readSkewMs)&&c.readSkewMs>=0&&c.readSkewMs<=25
    &&finite(c.observationSpanMs)&&c.observationSpanMs>=c.readSkewMs&&c.observationSpanMs<=500,
    'BASELINE_OBSERVATION_TIMING');
  }
  requireEvidence(r.pid===ready.pid&&finite(r.observedAtUnixMs)&&finite(r.elapsedMs)
   &&r.elapsedMs>=0&&r.structuralFailureLatched===false,'BASELINE_TRACE_IDENTITY_OR_FAILURE');
  if(previousTime!==undefined)requireEvidence(r.observedAtUnixMs>previousTime&&r.elapsedMs>previousElapsed
   &&Math.abs((r.observedAtUnixMs-previousTime)-(r.elapsedMs-previousElapsed))<=500,'BASELINE_TRACE_CLOCK');
  previousTime=r.observedAtUnixMs;previousElapsed=r.elapsedMs;
  if(r.observedAtUnixMs<=start)firstIndex=index;
  if(r.observedAtUnixMs>=end&&lastIndex<0)lastIndex=index;
  const pending=index===0&&r.samples===1&&r.elapsedMs===0&&r.serverAgeMs===-1
   &&r.serverSamplePending===true&&r.server&&Object.keys(r.server).length===0;
  if(pending)firstPending=true;
  else requireEvidence(r.serverSamplePending===false&&r.server?.failed===false
   &&finite(r.serverAgeMs)&&r.serverAgeMs>=0&&r.serverAgeMs<=5000,'BASELINE_SERVER_SAMPLE_UNAVAILABLE');
  requireEvidence(r.manualOperations?.bound===true&&r.manualOperations.runId===ready.manualRunId
   &&r.manualOperations.serverOriginals===bound.count&&r.manualOperations.clientOriginals===bound.count,'BASELINE_OPERATION_BINDING');
  for(const [side,list] of [['client',r.client],['server',r.server?.entities]]){
   if(side==='server'&&pending)continue;
   requireEvidence(Array.isArray(list)&&list.length===bound.count,'BASELINE_ROSTER_INCOMPLETE');
   const ids=new Set();
   for(const e of list){
    requireEvidence(uuid(e.uuid)&&!ids.has(e.uuid)&&Number.isSafeInteger(e.id)
     &&Number.isSafeInteger(e.objectIdentity)&&e.sameOriginalIdentity===true,'BASELINE_OBJECT_IDENTITY');ids.add(e.uuid);
    if(expected.has(e.uuid))requireEvidence(expected.get(e.uuid)===e.id,'BASELINE_READY_ID_MISMATCH');
    else{
     if(side==='client')requireEvidence(e.entityClass==='net.minecraft.client.player.LocalPlayer'
      &&e.lifetimeClaimed===true,'BASELINE_PLAYER_NOT_PROTECTED');
     playerUUID??=e.uuid;playerId??=e.id;
     requireEvidence(playerUUID===e.uuid&&playerId===e.id,'BASELINE_PLAYER_REPLACED');
    }
    const key=side+':'+e.uuid,ref=e.id+':'+e.objectIdentity;
    requireEvidence(!references.has(key)||references.get(key)===ref,'BASELINE_ORIGINAL_CHANGED');references.set(key,ref);
    const l=e.lifecycle,g=e.registration;
    requireEvidence(e.structuralFailure===false&&e.observationIncomplete===false&&e.publicStateMismatch===false
     &&e.combatPassed===false&&e.rawRemoval==='null'&&e.rawHealthReadable===true&&finite(e.rawHealth)&&e.rawHealth>0
     &&g?.readable===true&&g.idOriginal===true&&g.uuidOriginal===true&&g.sameLevel===true
     &&l?.rawReadable===true&&l.publicReadable===true&&l.rawDead===false&&l.rawDeathTime===0
     &&l.deathStateObserved===false&&l.publicAlive===true&&l.publicDying===false&&l.publicRemoved===false
     &&(!l.storedArmorPoses||l.storedArmorPoses.readable===true),'BASELINE_LIFECYCLE_OR_REGISTRATION_FAILED');
    if(publicIndexRequired){
     const p=e.publicIndex;
     requireEvidence(p?.scope==='public-interaction-lookup-not-trust-root'&&p.readable===true&&p.side===side
      &&p.idOriginal===true&&p.idAbsent===false&&p.idEntryIdentity===e.objectIdentity
      &&(side!=='server'||p.uuidOriginal===true&&p.interactionOriginal===true
       &&p.uuidAbsent===false&&p.interactionAbsent===false
       &&p.uuidEntryIdentity===e.objectIdentity&&p.interactionEntryIdentity===e.objectIdentity),'BASELINE_PUBLIC_INTERACTION_LOOKUP_FAILED');
    }
    if(spatialRequired){
     const s=e.spatial;
     requireEvidence(s?.rawReadable===true&&s.publicReadable===true
      &&['storedPosition','publicPosition','storedBoundsMin','storedBoundsMax','cullingBoundsMin','cullingBoundsMax'].every(k=>vector(s[k]))
      &&['x','y','z'].every(k=>Number(s.storedPosition[k])===Number(s.publicPosition[k])
       &&Number(s.storedBoundsMin[k])<=Number(s.storedBoundsMax[k])
       &&Number(s.cullingBoundsMin[k])<=Number(s.cullingBoundsMax[k])),'BASELINE_SPATIAL_OBSERVATION_FAILED');
     if(spatialCacheRequired){
      const b=s.storedBlockPosition,p=s.publicBlockPosition,c=s.storedChunkPosition;
      requireEvidence(s.cacheMatchesPosition===true&&vector(b)&&vector(p)
       &&['x','y','z'].every(k=>Number.isSafeInteger(Number(b[k]))&&Number(b[k])===Math.floor(Number(s.storedPosition[k]))&&Number(b[k])===Number(p[k]))
       &&Number.isSafeInteger(c?.x)&&Number.isSafeInteger(c?.z)
       &&c.x===Math.floor(Number(b.x)/16)&&c.z===Math.floor(Number(b.z)/16),'BASELINE_POSITION_CACHE_INCONSISTENT');
     }
    }
    checkedObjectSamples++;
   }
   requireEvidence([...expected.keys()].every(id=>ids.has(id))&&ids.has(playerUUID),'BASELINE_ROSTER_SUBSTITUTED');
  }
  if(pickEvidenceRequired){
   const p=r.pickState;
   requireEvidence(p&&p.observationUnavailable!==true&&Array.isArray(p.originals)
    &&p.originals.length===bound.count,'BASELINE_QUERY_OBSERVATION_INCOMPLETE');
   const seen=new Set();
   for(const q of p.originals){
    const e=r.client.find(e=>e.uuid===q.uuid);
    requireEvidence(e&&!seen.has(q.uuid)&&q.id===e.id&&q.objectIdentity===e.objectIdentity,
     'BASELINE_QUERY_ORIGINAL_MISMATCH');seen.add(q.uuid);
    requireEvidence(q.readable===true&&q.spatialQueryContainsOriginal===true
     &&q.pickable===true&&q.spectator===false&&q.attackable===true,'BASELINE_ORIGINAL_QUERY_FAILED');
    if(q.queryRoute!==undefined){
     const route=q.queryRoute;
     requireEvidence(route&&typeof route==='object'&&!route.observationDisabled&&!route.error
      &&typeof route.managerClass==='string'&&typeof route.getterClass==='string'
      &&typeof route.sectionStorageClass==='string'
      &&typeof route.getterQueryContainsOriginal==='boolean'
      &&typeof route.sectionQueryContainsOriginal==='boolean','BASELINE_QUERY_ROUTE_INCOMPLETE');
     requireEvidence(route.getterQueryContainsOriginal&&route.sectionQueryContainsOriginal,
      'BASELINE_QUERY_ROUTE_ORIGINAL_MISSING');
    }
   }
  }
 }
 requireEvidence(firstIndex>=0&&lastIndex>=0&&lastIndex>firstIndex,'BASELINE_VIDEO_NOT_BRACKETED_BY_TRACE');
 const covering=rows.slice(firstIndex,lastIndex+1);
 requireEvidence(start-covering[0].observedAtUnixMs<=2000&&covering.at(-1).observedAtUnixMs-end<=2000
  &&covering.length>=20,'BASELINE_TRACE_COVERAGE');
 for(let i=0;i<covering.length;i++){
  requireEvidence(covering[i].paused===false&&covering[i].serverSamplePending===false,'BASELINE_PAUSED_OR_PENDING');
  if(i)requireEvidence(covering[i].observedAtUnixMs-covering[i-1].observedAtUnixMs<=2000,'BASELINE_TRACE_GAP');
 }
 const firstPrimary=covering[0].client.find(e=>e.uuid===ready.targetUUID);
 const primary=covering.at(-1).client.find(e=>e.uuid===ready.targetUUID);
 requireEvidence(Number.isSafeInteger(firstPrimary.ownedDrawReturns)&&Number.isSafeInteger(primary.ownedDrawReturns)
  &&primary.ownedDrawReturns>firstPrimary.ownedDrawReturns
  &&Number.isSafeInteger(firstPrimary.renderEvents?.callbacks)&&Number.isSafeInteger(primary.renderEvents?.callbacks)
  &&primary.renderEvents.callbacks>firstPrimary.renderEvents.callbacks
  &&finite(primary.lastOwnedDrawAgeMs)&&primary.lastOwnedDrawAgeMs>=0&&primary.lastOwnedDrawAgeMs<=2000,'BASELINE_PRIMARY_NOT_DRAWN_DURING_VIDEO');
 return {scope:'time-aligned-sampled-precombat-baseline-only',baselineEvidenceConsistent:true,
  combatPassed:false,visualReviewRequired:true,automaticAttack:false,...target,manualRunId:ready.manualRunId,targetUUID:ready.targetUUID,
  captureStartedAtUnixMs:start,captureEndedAtUnixMs:end,originalCount:bound.count,playerUUID,
  snapshots:rows.length,coveringSnapshots:covering.length,checkedObjectSamples,initialServerPending:firstPending,
  spatialEvidenceChecked:spatialRequired,spatialCacheEvidenceChecked:spatialCacheRequired,pickEvidenceChecked:pickEvidenceRequired,
  publicIndexEvidenceChecked:publicIndexRequired,
  observationClockChecked:observationClockRequired,
  firstCoveringTraceAtUnixMs:covering[0].observedAtUnixMs,lastCoveringTraceAtUnixMs:covering.at(-1).observedAtUnixMs,
  primary,limitation:'Sampled in-process object evidence plus external window timeline; not continuous memory proof or attack attribution.'};
}
module.exports={reviewManualBaseline,videoInterval};

async function reviewManualFiles({runDirectory,recordingDirectory,toolsDirectory}){
 const fs=require('node:fs'),path=require('node:path');
 const {toolsAt,verifyVideo}=require('./window-recorder.cjs');
 const root=path.resolve(runDirectory),host=path.join(root,'mc-host'),capture=path.resolve(recordingDirectory);
 requireEvidence(capture.startsWith(root+path.sep),'BASELINE_RECORDING_DIRECTORY_SCOPE');
 const json=file=>JSON.parse(fs.readFileSync(file,'utf8'));
 for(const name of ['manual-observer-error.json','manual-first-structural-loss.json','manual-runtime-fault.json'])
  requireEvidence(!fs.existsSync(path.join(host,name)),'BASELINE_RECORDED_FAILURE:'+name);
 const {rows,partial,sha256}=require('./manual-trace-reader.cjs').readManualTrace(host);
 const recording=json(path.join(capture,'manual-recording-result.json'));
 const report=reviewManualBaseline({ready:json(path.join(host,'manual-combat-ready.json')),
  bound:json(path.join(host,'manual-scene-bound.json')),recording,
  timeline:json(path.join(capture,'capture-timeline.json')),rows});
 // A live handoff must not mistake story-mode invulnerability for protection.
 // Keep reviewManualBaseline available for explicitly scoped historical review.
 const gameplay=require('./player-gameplay-evidence.cjs').reviewPlayerGameplay(
  rows,report.captureStartedAtUnixMs,report.captureEndedAtUnixMs,report.playerUUID);
 // Recheck actual media rather than trusting a saved decoded=true field or a renamed file.
 const media=await verifyVideo(path.join(capture,'window.mp4'),toolsAt(toolsDirectory));
 requireEvidence(media.sha256===recording.video.sha256&&media.frameCount===recording.video.frameCount
  &&Math.abs(media.durationMs-recording.video.durationMs)<=1,'BASELINE_MEDIA_CHANGED');
 return {...report,gameplay,video:recording.video,ignoredIncompleteTrailingLine:!!partial,
  mediaReverified:true,traceSHA256:sha256};
}
module.exports.reviewManualFiles=reviewManualFiles;
