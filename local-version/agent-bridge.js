"use strict";
const AgentBridge={serial:0,
 cancel(){this.serial++;if(EFFLocal.native)void EFFLocal.native.modelCancel().catch(()=>{});},
 async suggest(state,goal,risk){
  const serial=++this.serial,fallback=()=>({proposal:AgentPolicies.make(state,goal,'repression',risk),source:'规则模板',note:'固定策略经过同一仲裁器验证；它仍是一份待你确认的提案。'});
  if(!EFFLocal.native)return fallback();
  try{
   const result=await EFFLocal.native.modelPropose({snapshot:PhenomenonRuntime.checkpoint(state),goal,risk});
   if(serial!==this.serial)throw Error('CANCELLED');
   if(!result.proposal)return {...fallback(),note:'本地模型未启用或未返回有效提案，已使用规则模板。'};
   const check=PhenomenonRuntime.validateProposal(state,result.proposal,'repression');
   return check.ok?{proposal:result.proposal,source:'本地模型',note:'生成式提案；只有下方的仲裁操作会改变状态。'}:{...fallback(),note:'模型提案未通过验证，已回退规则模板。'};
  }catch(e){if(serial!==this.serial)throw Error('CANCELLED');return {...fallback(),note:'模型服务缺席、超时或输出无效，已回退规则模板。'};}
 }
};
