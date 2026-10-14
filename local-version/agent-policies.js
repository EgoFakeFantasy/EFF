"use strict";
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AgentPolicies=api;})(globalThis,()=>{
 const goals=Object.freeze({body:{name:'夺回身体执行权',event:'evt-001',action:'REQUEST_AUTHORITY_REVIEW',reason:'BODY_OWNERSHIP_UNRESOLVED',explain:'牵引已经发生，但外来者没有得到决定身体去向的资格。核验执行权，不替你定义整个人。'},attribution:{name:'拒绝强加的罪责',event:'evt-002',action:'CHALLENGE_PRECONDITION',reason:'ATTRIBUTION_UNSUPPORTED',explain:'区分眼前的见闻与他者强加的归责。拒绝指认，不等于抹掉发生过的遭遇。'},bad_owned:{name:'拒绝强写的结局',event:'evt-003',action:'CHALLENGE_PRECONDITION',reason:'ENDING_PRECONDITION_UNMET',explain:'结局请求尚未提交，可以质疑它的成立条件；不能把改一句显示文字当作已经逃脱。'}});
 function make(s,goal,agent='repression',risk='low'){const g=goals[goal];if(!Object.hasOwn(goals,goal))throw Error('UNKNOWN_GOAL');return {schema_version:1,agent,battle_id:s.battleId,observed_revision:s.revision,action:agent==='intruder'?'CHALLENGE_PRECONDITION':g.action,target:goal,evidence_event_ids:[g.event],reason_code:agent==='intruder'?'UNANSWERED_CLAIM':g.reason,risk_level:risk};}
 function intruder(s){const targets=[...s.queue];return make(s,targets[s.rng%targets.length]||'bad_owned','intruder');}
 function preserve(s){return {schema_version:1,agent:'repression',battle_id:s.battleId,observed_revision:s.revision,action:'PRESERVE_CHECKPOINT',target:'checkpoint',evidence_event_ids:[],reason_code:'PRESERVE_VALID_STATE',risk_level:'low'};}
 function order(s,actor,a,b,risk='low'){return {schema_version:1,agent:actor,battle_id:s.battleId,observed_revision:s.revision,action:'PROPOSE_EVENT_ORDER',target:'queue',evidence_event_ids:[],reason_code:'ORDER_PENDING_EVENTS',risk_level:risk,order:[a,b]};}
 function candidates(s,actor,{goal='body',risk='low'}={}){
  if(!['repression','intruder'].includes(actor)||!['low','medium'].includes(risk))throw Error('INVALID_AGENT_REQUEST');
  if(s.outcome!=='pending')return [];
  const list=s.queue.map(t=>({id:(actor==='repression'?'defend_':'press_')+t,label:actor==='repression'?goals[t].name:'维持'+goals[t].name+'的对立主张',proposal:make(s,t,actor,risk)}));
  if(actor==='repression'&&!s.preserved)list.push({id:'preserve',label:'保全当前合法检查点，消耗一轮且不完成回应',proposal:preserve(s)});
  if(s.queue.length>1){const [a,b]=s.queue;list.push({id:'order_'+b+'_'+a,label:'将未提交的 '+b+' 排在 '+a+' 前面，消耗一轮且不解决争夺',proposal:order(s,actor,b,a,risk)});}
  // Candidate order is public and stable, not the opponent's access to a private goal.
  return list;
 }
 const reasons={INVALID_SCHEMA:'格式或字段不属于规则语言',INVALID_AGENT:'代理没有这一侧的授权',WRONG_BATTLE:'提案来自另一场争夺',STALE_REVISION:'你观察的版本已经过期',ACTION_NOT_ALLOWED:'该动作不在五种规则内',UNKNOWN_EVIDENCE:'引用的事件不存在',PRECONDITION_UNPROVEN:'证据不能证明这个前提',EVIDENCE_TARGET_MISMATCH:'证据指向了别的争夺对象',ALREADY_RESOLVED:'这一对象已经完成回应',EVENT_ALREADY_COMMITTED:'只能调整尚未提交的事件',UNEXPECTED_ORDER:'该动作不能携带事件排序',BATTLE_FINISHED:'本次实验已经结束',defend:'对应现象得到回应',pressure:'未回应的主张继续施压',preserve:'检查点已保留，争夺尚未完成',order:'待提交事件的顺序已调整',retry:'重试消耗一轮预算',concede:'玩家明确承认本轮失守'};
 return Object.freeze({goals,make,intruder,preserve,order,candidates,reasons});
});
