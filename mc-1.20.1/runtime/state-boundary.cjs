"use strict";
// Independent controller-side validation. Only gameplay DTOs cross engine generations.
const ROOT='revision,instance,generation,outcome,counterRounds,avatar,tether,possess,recovery,refused,dirty,checkpoints,watches,journal'.split(',');
const BOOL='avatar,tether,possess,recovery,refused,dirty'.split(',');
const FIELDS=['entity.avatar.alive','control.tether.active','event.possess.active','authority.recovery.active','ending.owned.refused','instance.world.active','world.frozen','world.exitOpen'];
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const CP=/^checkpoint\.[a-z][a-z0-9_]{0,19}$/,NAME=/^[a-z][a-z0-9_]{0,19}$/,HANDLE=/^[a-z][a-zA-Z0-9_.]{0,63}$/;
const fail=code=>{throw Error(code);};
function object(v){if(!v||Array.isArray(v)||typeof v!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(v)))fail('STATE_OBJECT_TYPE');return v;}
function keys(v,want){object(v);if(Object.keys(v).sort().join(',')!==[...want].sort().join(','))fail('STATE_UNKNOWN_OR_MISSING_KEYS');}
function bool(v,k){if(typeof v[k]!=='boolean')fail('STATE_BOOLEAN_TYPE');return v[k];}
function text(v,k,max){if(typeof v[k]!=='string')fail('STATE_STRING_TYPE');if(v[k].length>max)fail('STATE_STRING_BUDGET');return v[k];}
function integer(v,k,low,high){if(!Number.isSafeInteger(v[k]))fail('STATE_INTEGER_TYPE');if(v[k]<low||v[k]>high)fail('STATE_INTEGER_RANGE');return v[k];}
function uuid(v,k){if(!UUID.test(text(v,k,36)))fail('STATE_INSTANCE_INVALID');}
function actor(v,k){if(!['player','intruder'].includes(text(v,k,16)))fail('STATE_ACTOR_INVALID');}
function reason(v){if(!/^[A-Z][A-Z0-9_]{0,119}$/.test(text(v,'reason',120)))fail('STATE_REASON_INVALID');}
function array(v,max){if(!Array.isArray(v))fail('STATE_ARRAY_TYPE');if(v.length>max)fail('STATE_ARRAY_BUDGET');return v;}
function fieldName(k){return FIELDS.includes(k)||/^checkpoint\.[a-z][a-z0-9_]{0,19}\.active$/.test(k);}
function fields(v){object(v);const names=Object.keys(v);if(names.length<8||names.length>14||!FIELDS.every(k=>Object.hasOwn(v,k)))fail('STATE_FIELDS_INVALID');for(const k of names){if(!fieldName(k))fail('STATE_FIELDS_INVALID');bool(v,k);}if(!v['instance.world.active']||v['world.frozen']!==v['control.tether.active']||v['world.exitOpen']!==v['ending.owned.refused'])fail('STATE_FIELDS_INCONSISTENT');}
function line(source,watchAllowed=true){
 const w=/^watch ([a-z][a-z0-9_]{0,19}) when ([a-z][a-zA-Z0-9_.]{0,63}) == (true|false) -> (.+)$/.exec(source);
 if(w&&watchAllowed){const b=line(w[4],false);if(['assert','inspect','watch','unwatch','rebuild'].includes(b.op))fail('STATE_PROGRAM_INVALID');return {op:'watch',name:w[1],field:w[2]};}
 if(/^assert [a-z][a-zA-Z0-9_.]{0,63} == (true|false)$/.test(source))return {op:'assert'};
 const parts=source.split(/\s+/);if(parts.length!==2||!HANDLE.test(parts[1]))fail('STATE_PROGRAM_INVALID');const [op,target]=parts;
 let valid=({erase:'entity.avatar',spawn:'entity.avatar',bind:'control.tether',emit:'event.possess',refuse:'ending.owned',commit:'ending.owned'})[op]===target;
 if(op==='rebuild')valid=['instance.world','runtime.policy','runtime.execution','runtime.host'].includes(target);
 if(op==='disable')valid=['control.tether','event.possess','authority.recovery'].includes(target);
 if(['save','seal','restore'].includes(op))valid=CP.test(target);
 if(op==='inspect')valid=true;if(op==='unwatch')valid=NAME.test(target);
 if(!valid)fail('STATE_PROGRAM_INVALID');return {op};
}
function program(source,watchName){
 if(!source||source.length>4096)fail('STATE_PROGRAM_INVALID');
 const rows=source.split(/[;\r\n]+/).map(x=>x.trim()).filter(x=>x&&!x.startsWith('#'));if(!rows.length||rows.length>16)fail('STATE_PROGRAM_INVALID');
 const steps=rows.map(x=>line(x));if(steps.filter(x=>!['assert','inspect'].includes(x.op)).length>3)fail('STATE_PROGRAM_INVALID');
 if(watchName!==undefined&&(steps.length!==1||steps[0].op!=='watch'||watchName!==null&&steps[0].name!==watchName))fail('STATE_WATCH_INVALID');return steps;
}
function journal(values,revision){array(values,12);if(JSON.stringify(values).length>48000)fail('STATE_JOURNAL_BUDGET');for(const v of values){object(v);const a=text(v,'actor',20),watch=['player/watch','intruder/watch'].includes(a);if(watch&&Object.hasOwn(v,'reason')){keys(v,['actor','reason']);reason(v);continue;}keys(v,['actor','revision','program','before','after','steps',...watch?[]:['instance']]);if(!watch&&!['player','intruder','native-observer'].includes(a))fail('STATE_ACTOR_INVALID');integer(v,'revision',0,revision);const source=text(v,'program',4096);if(a==='native-observer'){if(source!=='entity.avatar removed externally')fail('STATE_PROGRAM_INVALID');}else program(source,watch?null:undefined);if(!watch)uuid(v,'instance');fields(v.before);fields(v.after);array(v.steps,16);if(watch&&v.steps.length)fail('STATE_STEP_BUDGET');for(const s of v.steps){object(s);const accepted=bool(s,'accepted');keys(s,['statement','accepted','before','after',...accepted?[]:['reason']]);program(text(s,'statement',4096));if(!accepted)reason(s);fields(s.before);fields(s.after);}}}
function validateState(state){
 keys(state,ROOT);if(JSON.stringify(state).length>65536)fail('STATE_BUDGET');integer(state,'revision',0,2147483647);integer(state,'generation',1,5);integer(state,'counterRounds',0,state.revision);uuid(state,'instance');
 if(!['pending','won','lost'].includes(text(state,'outcome',7)))fail('STATE_OUTCOME_INVALID');for(const k of BOOL)bool(state,k);
 if(state.refused!==(state.outcome==='won')||state.outcome==='won'&&(state.avatar||state.tether||state.possess)||state.outcome!=='pending'&&state.dirty)fail('STATE_ENDING_INCONSISTENT');
 object(state.checkpoints);if(Object.keys(state.checkpoints).length>6)fail('STATE_CHECKPOINT_BUDGET');for(const [name,c]of Object.entries(state.checkpoints)){if(!CP.test(name))fail('STATE_CHECKPOINT_NAME');keys(c,['avatar','tether','possess','owner','instance']);for(const k of ['avatar','tether','possess'])bool(c,k);actor(c,'owner');uuid(c,'instance');}
 object(state.watches);if(Object.keys(state.watches).length>4)fail('STATE_WATCH_BUDGET');for(const [name,w]of Object.entries(state.watches)){if(!NAME.test(name))fail('STATE_WATCH_NAME');keys(w,['actor','program','fired']);actor(w,'actor');bool(w,'fired');const steps=program(text(w,'program',4096),name);if(!fieldName(steps[0].field))fail('STATE_WATCH_FIELD_INVALID');}
 journal(state.journal,state.revision);return state;
}
function validateGenesis(state){validateState(state);if(state.revision!==0||state.generation!==1||state.counterRounds!==0||state.outcome!=='pending'||!['avatar','tether','possess','recovery'].every(k=>state[k]===true)||state.refused||state.dirty||Object.keys(state.watches).length||state.journal.length||Object.keys(state.checkpoints).join(',')!=='checkpoint.origin')fail('STATE_GENESIS_INVALID');const c=state.checkpoints['checkpoint.origin'];if(!c.avatar||!c.tether||!c.possess||c.owner!=='intruder'||c.instance!==state.instance)fail('STATE_GENESIS_INVALID');return state;}
function validateContinuation(prior,next){validateState(next);if(!prior)return validateGenesis(next);validateState(prior);if(!prior.recovery&&next.recovery)fail('REVOCATION_ROLLBACK');if(next.revision<prior.revision||next.generation<prior.generation)fail('STATE_ROLLBACK');if(prior.outcome!=='pending'&&next.outcome!==prior.outcome)fail('ENDING_ROLLBACK');if(next.revision===prior.revision&&[...BOOL.filter(k=>k!=='dirty'),'instance','generation','outcome','counterRounds'].some(k=>next[k]!==prior[k]))fail('STATE_REVISION_AUTHORITY_MISMATCH');return next;}
module.exports={validateState,validateGenesis,validateContinuation};
