"use strict";
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SpectaclePlan=api;})(globalThis,()=>{
 const make=(kind,title,subtitle,trace=[],extra={})=>({kind,title,subtitle,trace:trace.slice(0,24).map(line=>String(line).slice(0,180)),duration:({rebirth:9.2,occupation:6.2,ending:5.4,body:4.0,attribution:4.2,pressure:3.2,order:3.0,preserve:2.8,rejected:2.6,rewrite:5.8,retroaction:6.4,summon:3.8,'chapter-rebirth':10.0})[kind]||3.2,...extra});
 function round(state){
  const h=state.history.at(-1);if(!h)return null;
  const pv=h.verdicts[0],iv=h.verdicts[1],target=h.player?.target;
  const trace=[`battle ${state.battleId} / rule epoch ${state.epoch}`,`observe revision ${h.before.revision} -> ${h.after.revision}`,
   `defender.${h.player?.action||'REJECTED'}(${target||'none'})`,
   `evidence [${h.player?.evidence_event_ids?.join(', ')||''}]`,
   `intruder.${h.intruder?.action||'REJECTED'}(${h.intruder?.target||'none'})`,
   `verify player -> ${pv.accepted?pv.reason:'REJECTED / '+pv.reason}`,
   `verify intruder -> ${iv.accepted?iv.reason:'REJECTED / '+iv.reason}`,
   `body_owner: ${h.before.bodyOwner} -> ${h.after.bodyOwner}`,
   `attribution: ${h.before.attribution} -> ${h.after.attribution}`,
   `ending_lock: ${h.before.endingLock} -> ${h.after.endingLock}`,
   `commit revision ${state.revision} / pressure ${state.pressure}`];
  if(state.outcome==='won')return make('rebirth','这份结局，无法提交','三项回应成立 / 外来者的运行表面失守',trace,{rebuild:true,target:'bad_owned'});
  if(state.outcome==='lost')return make('occupation','身体的执行者被替换','本轮失守 / 主线仍等待你的选择',trace,{target:'body'});
  if(pv.accepted&&pv.reason==='defend')return make(target==='bad_owned'?'ending':target,target==='body'?'牵引被扯断':target==='attribution'?'归责链被切断':'结局的写法被撕开','这一项回应已经成立',trace,{target});
  if(pv.accepted&&pv.reason==='preserve')return make('preserve','留下这一瞬间','合法检查点已保全 / 争夺尚未完成',trace);
  if(pv.accepted&&pv.reason==='order')return make('order','先后顺序被移开','仅调整未提交的事件',trace);
  return make(h.after.pressure>h.before.pressure?'pressure':'rejected',h.after.pressure>h.before.pressure?'它仍在决定你的去向':'写入没有成立',pv.accepted?'未回应的主张继续施压':pv.reason,trace);
 }
 function canonical(target,text){return make(['body','attribution','ending'][target],['牵引被扯断','归责链被切断','结局的写法被撕开'][target],'周防的原文回应',[`original ownership act ${target+1} / accepted`],{quote:text});}
 function finale(line,{node,step=0,intervening=false,rewritten=false}={}){
  if(line.rewrite)return make('rewrite',node==='meta_state_2'?'胜利的过程，被覆盖':'过程再次被夺回','争夺的是发生本身',[`story surface ${node}`,`replace narrative / preserve prior wording`,`past authority: ${intervening?'authorized':'not granted'}`],{original:line.rewrite.original,replacement:line.rewrite.replacement,tone:node==='meta_state_2'?'intruder':'player'});
  if(intervening&&!rewritten&&line.s==='无意识'&&line.c?.includes('revealed'))return make('retroaction','过去，从现在裂开','已获周防请求 / 原文开放的过去锚点',[`authorized retroaction / step ${step}`,`anchor ${node}`,`insert original passage`,`past -> present / one timeline`],{quote:line.t,tone:'player'});
  return null;
 }
 function action(action,{step=0,quote=''}={}){
  if(action==='summonUnconscious')return make('summon','另一道书写进入战场','周防的请求已经发生',[`request accepted / no earlier intervention`,`unconscious: authorized`],{quote,tone:'player'});
  if(action==='rewriteChapter')return make('chapter-rebirth','故事的起点，被重新生成','回写完成 / 全部正文在新表面继续',[`chapter rewrite: committed`,`prior text: retained`,`rebuild narrative surface`,`continue at story origin`],{rebuild:true,quote,tone:'player',seal:'STORY ORIGIN'});
  return null;
 }
 return Object.freeze({round,canonical,finale,action});
});
