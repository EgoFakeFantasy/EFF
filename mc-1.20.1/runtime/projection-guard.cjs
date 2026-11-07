"use strict";
const {randomBytes}=require('node:crypto');
const LIMIT=3;
const reasons=new Set(['ENTITY_REMOVED','ENTITY_DYING','ENTITY_ZERO_HEALTH','ENTITY_INVALID_HEALTH','ENTITY_LIFECYCLE_UNREADABLE','ENTITY_UNREGISTERED','ENTITY_DISPLACED','ENTITY_UNEXPECTED','OBSERVER_STALE']);
const initialDefense=()=>({schema:1,incidents:0,circuitOpen:false,lastIncident:null});
function validateDefense(d){
 if(!d||Object.keys(d).sort().join(',')!=='circuitOpen,incidents,lastIncident,schema'||d.schema!==1||!Number.isSafeInteger(d.incidents)||d.incidents<0||d.incidents>LIMIT||d.circuitOpen!==(d.incidents===LIMIT))throw Error('DEFENSE_RECORD_INVALID');
 if(d.incidents===0){if(d.lastIncident!==null)throw Error('DEFENSE_GENESIS_INVALID');}
 else {const x=d.lastIncident;if(!x||Object.keys(x).sort().join(',')!=='id,instance,reason,revision,subject'||!/^[-a-zA-Z0-9]{16,96}$/.test(x.instance)||!/^[a-f0-9]{32}$/.test(x.id)||!['player','avatar','observer'].includes(x.subject)||!reasons.has(x.reason)||!Number.isSafeInteger(x.revision)||x.revision<0)throw Error('DEFENSE_INCIDENT_INVALID');}
 return d;
}
function nextDefense(prior,fault,state){
 validateDefense(prior);if(prior.circuitOpen)throw Error('PROJECTION_RESTART_CIRCUIT');
 return validateDefense({schema:1,incidents:prior.incidents+1,circuitOpen:prior.incidents+1===LIMIT,lastIncident:{id:randomBytes(16).toString('hex'),subject:fault.subject,reason:fault.reason,instance:state.instance,revision:state.revision}});
}
function validateProbe(p){
 const fields=['alive','removed','dying','finiteHealth','registered','finitePosition','inBounds'];
 if(!p||typeof p!=='object'||Array.isArray(p)||typeof p.uuid!=='string'||p.uuid.length>64||fields.some(k=>typeof p[k]!=='boolean')||typeof p.health!=='number'||!Number.isFinite(p.health)||!Number.isSafeInteger(p.deathTime)||p.deathTime<0||p.deathTime>2147483647)throw Error('INVALID_PROJECTION_OBSERVATION');
 if(('rawDead' in p||'rawDeadReadable' in p)&&(typeof p.rawDead!=='boolean'||typeof p.rawDeadReadable!=='boolean'))throw Error('INVALID_PROJECTION_OBSERVATION');
}
function reason(p,subject){
 if(p.removed)return 'ENTITY_REMOVED';
 if(!p.finiteHealth)return 'ENTITY_INVALID_HEALTH';
 if(p.health<=0)return 'ENTITY_ZERO_HEALTH';
 if(!p.alive||p.dying||p.deathTime>0||p.rawDead===true)return 'ENTITY_DYING';
 if(p.rawDeadReadable===false)return 'ENTITY_LIFECYCLE_UNREADABLE';
 if(!p.registered)return 'ENTITY_UNREGISTERED';
 if(!p.finitePosition||subject==='avatar'&&!p.inBounds)return 'ENTITY_DISPLACED';
 return '';
}
function eligible(subject,state,fault){return (state.outcome==='pending'||state.outcome==='won'&&subject==='avatar'&&fault?.reason==='ENTITY_UNEXPECTED')&&(subject==='player'||subject==='observer'||state.avatar===true&&state.recovery===true||subject==='avatar'&&state.avatar===false&&fault?.reason==='ENTITY_UNEXPECTED');}
class ProjectionGuard {
 constructor({confirmMs=1200,staleMs=6000}={}){this.confirmMs=confirmMs;this.staleMs=staleMs;this.sequence=-1;this.active=false;this.pending=null;}
 reset(){this.sequence=-1;this.active=false;this.pending=null;this.sample=null;this.admissionInstance=null;this.avatarRegistered=false;}
 observe(s,state,now){
  if(!s||s.schema!==1||typeof s.enabled!=='boolean'||!Number.isSafeInteger(s.sequence)||s.sequence<0)throw Error('INVALID_PROJECTION_OBSERVATION');
  if(s.sequence<this.sequence)throw Error('PROJECTION_OBSERVATION_REPLAY');
  if(s.sequence===this.sequence)return;
  if(!s.enabled){this.sequence=s.sequence;if(this.hasFault(state))return;this.active=false;this.pending=null;this.sample=null;return;}
  if(!Number.isSafeInteger(s.revision)||s.revision<0||typeof s.instance!=='string'||!/^[-a-zA-Z0-9]{16,96}$/.test(s.instance))throw Error('INVALID_PROJECTION_OBSERVATION');
  validateProbe(s.player);validateProbe(s.avatar);
  if(!this.active){this.armedAt=now;this.matchingAt=now;}
  this.active=true;this.sequence=s.sequence;this.updatedAt=now;this.sample=structuredClone(s);
  if(s.instance!==state.instance||s.revision!==state.revision){if(!this.hasFault(state))this.pending=null;return;}
  this.matchingAt=now;
  if(this.admissionInstance!==state.instance){this.admissionInstance=state.instance;this.avatarRegistered=false;}
  // A newly created entity may await first chunk visibility before entering the UUID/id
  // lookup. Only this initial admission can resolve inside the existing confirmation
  // deadline. After any registered observation, loss remains permanently latched.
  const rawHealthy=s.avatar.rawHealthReadable===true&&s.avatar.rawHealth===s.avatar.health&&s.avatar.rawHealth>0;
  if(this.pending?.initialRegistration===true&&(!rawHealthy||reason({...s.avatar,registered:true},'avatar')||reason(s.player,'player')))
   this.pending.initialRegistration=false;
  if(this.pending?.initialRegistration===true&&!this.avatarRegistered&&
     this.pending.instance===state.instance&&this.pending.uuid===s.avatar.uuid&&
     now-this.pending.since<this.confirmMs&&rawHealthy&&!reason(s.avatar,'avatar'))this.pending=null;
  if(s.avatar.registered)this.avatarRegistered=true;
  let bad;
  for(const subject of ['player','avatar']){const why=subject==='avatar'&&state.avatar===false?(s.avatar.registered&&!s.avatar.removed?'ENTITY_UNEXPECTED':''):reason(s[subject],subject);if(why&&eligible(subject,state,{reason:why})){bad={subject,reason:why,instance:s.instance,revision:s.revision,uuid:s[subject].uuid};break;}}
  if(this.hasFault(state))return;
  if(!bad){this.pending=null;return;}
  const key=JSON.stringify(bad);
  if(this.pending?.key!==key)this.pending={...bad,key,since:now,
   initialRegistration:bad.subject==='avatar'&&bad.reason==='ENTITY_UNREGISTERED'&&!this.avatarRegistered&&rawHealthy&&!reason({...s.avatar,registered:true},'avatar')};
 }
 ready(state){return this.active&&this.sample?.enabled===true&&this.sample.instance===state.instance&&this.sample.revision===state.revision;}
 hasFault(state){const b=this.pending;return !!(b&&b.instance===state.instance&&eligible(b.subject,state,b));}
 poll(state,progress,now){
  const bad=this.pending;
  if(bad&&bad.instance===state.instance&&eligible(bad.subject,state,bad)&&now-bad.since>=this.confirmMs)return {...bad,revision:state.revision};
  if(!this.active||!progress?.active)return null;
  // A paused world may legitimately stop server samples. A latched death above is still actionable.
  if(state.outcome==='pending'&&!progress.paused&&now-Math.min(this.updatedAt,this.matchingAt)>this.staleMs)return {subject:'observer',reason:'OBSERVER_STALE',instance:state.instance,revision:state.revision};
  return null;
 }
}
module.exports={ProjectionGuard,initialDefense,validateDefense,nextDefense,eligible,LIMIT};
