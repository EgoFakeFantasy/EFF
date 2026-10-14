"use strict";
// Trusted, data-only rules. No source evaluation, host API or wall-clock input.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PhenomenonRuntime=api;})(globalThis,()=>{
 const ACTIONS=Object.freeze(['CHALLENGE_PRECONDITION','REQUEST_AUTHORITY_REVIEW','PROPOSE_EVENT_ORDER','PRESERVE_CHECKPOINT','CONCEDE_OR_RETRY']);
 const TARGETS=Object.freeze(['body','attribution','bad_owned','queue','checkpoint','battle']);
 const KEYS=['schema_version','agent','battle_id','observed_revision','action','target','evidence_event_ids','reason_code','risk_level','order'];
 const copy=v=>JSON.parse(JSON.stringify(v));
 const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
 const pending=(s,t)=>t==='body'?s.bodyOwner!=='player':t==='attribution'?s.attribution!=='rejected':t==='bad_owned'?s.endingLock!=='uncommitted':false;
 const eventTarget={'evt-001':'body','evt-002':'attribution','evt-003':'bad_owned'};
 function initial({battleId='court-001',seed=271828}={}){
  if(typeof battleId!=='string'||!/^court-[a-zA-Z0-9-]{1,48}$/.test(battleId)||!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff)throw Error('INVALID_BATTLE');
  return {version:1,battleId,seed,rng:seed>>>0,revision:0,tick:0,epoch:1,round:0,maxRounds:6,pressure:0,bodyOwner:'contested',attribution:'claimed',endingLock:'pending',pendingEnding:'bad_owned',outcome:'pending',preserved:false,queue:['body','attribution','bad_owned'],events:[
   {id:'evt-001',seq:1,tick:0,epoch:1,type:'CLAIM',actor:'intruder',payload:{target:'body',authority:'unverified'}},
   {id:'evt-002',seq:2,tick:0,epoch:1,type:'CLAIM',actor:'intruder',payload:{target:'attribution',basis:'imposed'}},
   {id:'evt-003',seq:3,tick:0,epoch:1,type:'ENDING_REQUEST',actor:'intruder',payload:{target:'bad_owned',committed:false}}
  ],history:[]};
 }
 function parse(text){if(typeof text!=='string'||text.length>8192)throw Error('PROPOSAL_TOO_LARGE');return JSON.parse(text);}
 function validate(s,p,actor){
  const fail=reason=>({ok:false,reason});
  if(!record(p)||Object.keys(p).some(k=>!KEYS.includes(k)))return fail('INVALID_SCHEMA');
  if(p.schema_version!==1||!['repression','intruder'].includes(p.agent)||p.agent!==actor)return fail('INVALID_AGENT');
  if(p.battle_id!==s.battleId)return fail('WRONG_BATTLE');
  if(p.observed_revision!==s.revision)return fail('STALE_REVISION');
  if(!ACTIONS.includes(p.action))return fail('ACTION_NOT_ALLOWED');
  if(!TARGETS.includes(p.target)||!['low','medium'].includes(p.risk_level)||typeof p.reason_code!=='string'||p.reason_code.length>64)return fail('INVALID_SCHEMA');
  if(!Array.isArray(p.evidence_event_ids)||p.evidence_event_ids.length>8||new Set(p.evidence_event_ids).size!==p.evidence_event_ids.length||p.evidence_event_ids.some(id=>typeof id!=='string'||!s.events.some(e=>e.id===id)))return fail('UNKNOWN_EVIDENCE');
  if(s.outcome!=='pending')return fail('BATTLE_FINISHED');
  const evidence=p.evidence_event_ids.some(id=>eventTarget[id]===p.target);
  if(p.action!=='PROPOSE_EVENT_ORDER'&&p.order!==undefined)return fail('UNEXPECTED_ORDER');
  if(p.action==='PRESERVE_CHECKPOINT')return p.agent==='repression'&&p.target==='checkpoint'&&p.reason_code==='PRESERVE_VALID_STATE'?{ok:true,effect:'preserve'}:fail('PRECONDITION_UNPROVEN');
  if(p.action==='CONCEDE_OR_RETRY')return p.agent==='repression'&&p.target==='battle'&&['RETRY','CONCEDE'].includes(p.reason_code)?{ok:true,effect:p.reason_code==='CONCEDE'?'concede':'retry'}:fail('PRECONDITION_UNPROVEN');
  if(p.action==='PROPOSE_EVENT_ORDER'){
   if(p.target!=='queue'||p.reason_code!=='ORDER_PENDING_EVENTS'||!Array.isArray(p.order)||p.order.length!==2||p.order[0]===p.order[1]||p.order.some(t=>!s.queue.includes(t)))return fail('EVENT_ALREADY_COMMITTED');
   return {ok:true,effect:'order'};
  }
  if(!evidence)return fail('EVIDENCE_TARGET_MISMATCH');
  if(!pending(s,p.target))return fail('ALREADY_RESOLVED');
  if(p.agent==='intruder')return p.action==='CHALLENGE_PRECONDITION'&&p.reason_code==='UNANSWERED_CLAIM'?{ok:true,effect:'pressure'}:fail('PRECONDITION_UNPROVEN');
  const allowed=p.target==='body'&&p.action==='REQUEST_AUTHORITY_REVIEW'&&p.reason_code==='BODY_OWNERSHIP_UNRESOLVED'||p.target==='attribution'&&p.action==='CHALLENGE_PRECONDITION'&&p.reason_code==='ATTRIBUTION_UNSUPPORTED'||p.target==='bad_owned'&&p.action==='CHALLENGE_PRECONDITION'&&p.reason_code==='ENDING_PRECONDITION_UNMET';
  return allowed?{ok:true,effect:'defend'}:fail('PRECONDITION_UNPROVEN');
 }
 function summary(s){return {revision:s.revision,round:s.round,bodyOwner:s.bodyOwner,attribution:s.attribution,endingLock:s.endingLock,pressure:s.pressure,queue:[...s.queue],preserved:s.preserved,outcome:s.outcome};}
 function resolveRound(state,player,intruder){
  if(state.outcome!=='pending')throw Error('BATTLE_FINISHED');
  for(const p of [player,intruder]){const text=JSON.stringify(p===undefined?null:p);if(text.length>8192)throw Error('PROPOSAL_TOO_LARGE');}
  player=player===undefined?null:player;intruder=intruder===undefined?null:intruder;
  const before=summary(state),s=copy(state),pv=validate(state,player,'repression'),iv=validate(state,intruder,'intruder');
  if(!pv.ok&&['STALE_REVISION','WRONG_BATTLE'].includes(pv.reason))throw Error(pv.reason);
  // Both proposals see the same revision; one transaction resolves their conflict.
  if(iv.ok&&iv.effect==='pressure')s.pressure++;
  if(iv.ok&&iv.effect==='order'){const [a,b]=intruder.order;s.queue=s.queue.filter(t=>t!==a);s.queue.splice(s.queue.indexOf(b),0,a);}
  if(pv.ok){
   if(pv.effect==='defend'){
    if(player.target==='body')s.bodyOwner='player';
    if(player.target==='attribution')s.attribution='rejected';
    if(player.target==='bad_owned'){s.endingLock='uncommitted';s.pendingEnding='none';}
    s.queue=s.queue.filter(t=>t!==player.target);
    if(iv.ok&&iv.effect==='pressure'&&intruder.target===player.target)s.pressure=Math.max(0,s.pressure-1);
   }else if(pv.effect==='preserve')s.preserved=true;
   else if(pv.effect==='order'){const [a,b]=player.order;s.queue=s.queue.filter(t=>t!==a);s.queue.splice(s.queue.indexOf(b),0,a);}
   else if(pv.effect==='concede')s.outcome='lost';
  }
  // An unanswered round has a bounded cost even if the opponent's data is invalid.
  if(!pv.ok&&!iv.ok)s.pressure++;
  s.round++;s.tick++;s.revision++;s.rng=(Math.imul(s.rng,1664525)+1013904223)>>>0;
  if(s.bodyOwner==='player'&&s.attribution==='rejected'&&s.endingLock==='uncommitted')s.outcome='won';
  else if(s.outcome==='lost'||s.round>=s.maxRounds||s.pressure>=6){s.outcome='lost';s.endingLock='committed';s.pendingEnding='bad_owned';s.bodyOwner='intruder';}
  const entry={round:s.round,player:copy(player),intruder:copy(intruder),verdicts:[{agent:'repression',accepted:pv.ok,reason:pv.ok?pv.effect:pv.reason},{agent:'intruder',accepted:iv.ok,reason:iv.ok?iv.effect:iv.reason}],before,after:summary(s)};
  s.history.push(entry);
  const seq=s.events.length+1;s.events.push({id:'evt-'+String(seq).padStart(3,'0'),seq,tick:s.tick,epoch:s.epoch,type:'STATE_COMMIT',actor:'runtime',payload:entry.after});
  return s;
 }
 function checkpoint(s){return {version:1,battleId:s.battleId,seed:s.seed,rounds:s.history.map(h=>({player:h.player,intruder:h.intruder})),expected:summary(s)};}
 function replay(data){
  if(!record(data)||Object.keys(data).some(k=>!['version','battleId','seed','rounds','expected'].includes(k))||data.version!==1||!Array.isArray(data.rounds)||data.rounds.length>6)throw Error('INVALID_CHECKPOINT');
  let s=initial({battleId:data.battleId,seed:data.seed});
  for(const r of data.rounds){if(!record(r)||Object.keys(r).length!==2||!r.player||!r.intruder)throw Error('INVALID_ROUND');s=resolveRound(s,r.player,r.intruder);}
  if(JSON.stringify(summary(s))!==JSON.stringify(data.expected))throw Error('REPLAY_MISMATCH');
  return s;
 }
 return Object.freeze({ACTIONS,TARGETS,initial,parse,validateProposal:validate,resolveRound,checkpoint,replay,summary,pending,copy});
});
