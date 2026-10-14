"use strict";
const AgentBridge={serial:0,
 cancel(){this.serial++;if(EFFLocal.native)void EFFLocal.native.modelCancel().catch(()=>{});},
 fallback(state,goal,risk,includePlayer=true,note='MODEL_DISABLED'){
  const side=(actor,proposal)=>({actor,proposal,source:'rule-template',reason:note,model:'',elapsedMs:0,tokens:0,
   explanation:actor==='repression'?AgentPolicies.goals[goal].explain:'按固定种子维持尚未回应的主张。'});
  return {battleId:state.battleId,revision:state.revision,
   player:includePlayer?side('repression',AgentPolicies.make(state,goal,'repression',risk)):null,
   intruder:side('intruder',AgentPolicies.intruder(state))};
 },
 async plan(state,goal,risk,includePlayer=true){
  const serial=++this.serial,fallback=this.fallback(state,goal,risk,includePlayer);
  if(!EFFLocal.native?.modelPlan)return fallback;
  let result;
  try{result=await EFFLocal.native.modelPlan({snapshot:PhenomenonRuntime.checkpoint(state),goal,risk,includePlayer});}
  catch{result={error:'MODEL_SERVICE_UNAVAILABLE'};}
  if(serial!==this.serial)throw Error('CANCELLED');
  if(!result||result.battleId!==state.battleId||result.revision!==state.revision)return this.fallback(state,goal,risk,includePlayer,result?.error||'INVALID_PLAN');
  for(const [key,actor] of [['player','repression'],['intruder','intruder']]){
   if(key==='player'&&!includePlayer)continue;
   const side=result[key],check=PhenomenonRuntime.validateProposal(state,side?.proposal,actor);
   if(!check.ok||side.actor!==actor||!['local-model','rule-template'].includes(side.source)||typeof side.explanation!=='string'||side.explanation.length>240){result[key]=fallback[key];result[key].reason='INVALID_PLAN';}
  }
  return result;
 }
};
