'use strict';
// Read-only sampled evidence. Never changes ticks, health, position, or membership.
// A clean report is not proof of continuous survival or of an attack having occurred.
function reviewPlayerFunction(rows,start,end,playerUUID){
 if(!Array.isArray(rows)||!Number.isFinite(start)||!Number.isFinite(end)||end<=start
  ||typeof playerUUID!=='string'||!playerUUID)throw Error('PLAYER_FUNCTION_INPUT');
 const covered=rows.filter(r=>r.observedAtUnixMs>=start&&r.observedAtUnixMs<=end);
 const issues=[],seen=new Set(),states=new Map();
 const add=(code,at,side,details={})=>{const key=code+':'+(side||'');if(!seen.has(key)){
  seen.add(key);issues.push({code,atUnixMs:at,side,...details});}};
 let previous,checked=0,maximumServerAgeMs=0,maximumPositionDifference=0;
 if(covered.length<20||!covered.length||covered[0].observedAtUnixMs-start>2000
  ||end-covered.at(-1).observedAtUnixMs>2000)add('INSUFFICIENT_COVERAGE',start);
 for(const r of covered){
  const at=r.observedAtUnixMs;
  if(previous!==undefined&&(at<=previous||at-previous>2000)){
   add('TRACE_CLOCK_OR_GAP',at);states.clear();
  }
  previous=at;
  if(r.paused!==false){add('PAUSED_OR_UNKNOWN',at);states.clear();continue;}
  if(!Number.isFinite(r.serverAgeMs)||r.serverAgeMs<0||r.serverSamplePending!==false){
   add('SERVER_FRESHNESS_UNKNOWN',at,'server');states.delete('server');
  }else{
   maximumServerAgeMs=Math.max(maximumServerAgeMs,r.serverAgeMs);
   if(r.serverAgeMs>5000){add('STALE_SERVER_SNAPSHOT',at,'server',{ageMs:r.serverAgeMs});states.delete('server');}
  }
  let positions={};
  for(const [side,list] of [['client',r.client],['server',r.server?.entities]]){
   const found=list?.filter(e=>e.uuid===playerUUID);
   if(found?.length!==1){add('ORIGINAL_PLAYER_MISSING_OR_DUPLICATED',at,side);states.delete(side);continue;}
   const p=found[0],tick=p.gameplay?.tickCount;
   if(p.sameOriginalIdentity!==true||!Number.isSafeInteger(p.objectIdentity))add('ORIGINAL_IDENTITY_UNPROVEN',at,side);
   if(p.structuralFailure===true||p.lifecycle?.deathStateObserved===true)add('PLAYER_STATE_FAILURE',at,side);
   if(p.spatial?.storedPosition?.finite===true){
    const v=['x','y','z'].map(k=>Number(p.spatial.storedPosition[k]));
    if(v.every(Number.isFinite))positions[side]=v;
   }
   if(side==='server'&&(!Number.isFinite(r.serverAgeMs)||r.serverAgeMs<0||r.serverAgeMs>5000||r.serverSamplePending!==false))continue;
   if(!Number.isInteger(tick)||tick<-2147483648||tick>2147483647){add('PLAYER_TICK_UNREADABLE',at,side);states.delete(side);continue;}
   checked++;
   const source=side==='server'&&Number.isFinite(r.server?.sampledAtNanos)
    ?r.server.sampledAtNanos/1e6:at-(side==='server'?r.serverAgeMs:0);
   const old=states.get(side);
   if(old&&old.identity!==p.objectIdentity){add('ORIGINAL_IDENTITY_CHANGED',at,side);states.delete(side);}
   const state=states.get(side);
   // Repeated publication of one server snapshot is not a second tick observation.
   if(state&&source<=state.lastSource)continue;
   // Signed int wrap is a valid increment; large backwards changes are not.
   const delta=state?(tick-state.tick)>>>0:0;
   if(state&&delta>=0x80000000)add('PLAYER_TICK_REGRESSION',at,side,{before:state.tick,after:tick});
   if(!state||delta!==0)states.set(side,{identity:p.objectIdentity,tick,unchangedSince:source,lastSource:source});
   else {
    state.lastSource=source;
    if(source-state.unchangedSince>=5000)add('PLAYER_TICK_STALLED',at,side,{tick,unchangedForMs:source-state.unchangedSince});
   }
  }
  // Diagnostic only: network lag/teleports can also create position disagreement.
  if(positions.client&&positions.server&&r.serverAgeMs>=0&&r.serverAgeMs<=2000)
   maximumPositionDifference=Math.max(maximumPositionDifference,Math.hypot(...positions.client.map((v,i)=>v-positions.server[i])));
 }
 return {scope:'sampled-player-function-not-survival-or-attack-proof',playerUUID,
  observations:covered.length,checkedTickSamples:checked,issues,
  noListedFailureObserved:issues.length===0,maximumServerAgeMs,maximumPositionDifference,
  combatPassed:false,visualReviewRequired:true,
  limitation:'In-process samples can be tampered with. Fresh snapshots and advancing ticks do not establish rendering, collision, input, or actual attack execution.'};
}
module.exports={reviewPlayerFunction};
