"use strict";
const BattleEventAdapter={key:'wuzhong-returner-phenomenon-lab-v1',state:null,gate:null,counter:0,observations:[],applied:false,
 available(){return EFFLocal.enabled&&EFFLocal.profile==='tech';},
 fingerprint(){return G.area==='blood'&&currentDialogScript===SCRIPTS.accuse&&Boolean(dialogChoices)?JSON.stringify([G.area,!!F.sister,!!F.parents]):null;},
 load(){if(!this.available())return;try{const v=JSON.parse(localStorage.getItem(this.key));if(v?.version!==1)return;this.counter=Number.isSafeInteger(v.counter)&&v.counter>=0&&v.counter<100000?v.counter:0;this.state=PhenomenonRuntime.replay(v.checkpoint);this.gate=typeof v.gate==='string'&&v.gate.length<100?v.gate:null;this.applied=v.applied===true;this.observations=Array.isArray(v.observations)?v.observations.slice(-24).filter(o=>Number.isSafeInteger(o.target)&&o.target>=0&&o.target<3):[];}catch{this.state=null;this.gate=null;}},
 save(){if(!this.state)return;try{localStorage.setItem(this.key,JSON.stringify({version:1,counter:this.counter,checkpoint:PhenomenonRuntime.checkpoint(this.state),gate:this.gate,applied:this.applied,observations:this.observations}));}catch{RepressionUI.status('实验检查点写入失败；请保留当前窗口。');}},
 begin(){const gate=this.fingerprint();if(!this.state||this.gate!==gate||this.applied){this.counter++;this.state=PhenomenonRuntime.initial({battleId:'court-'+this.counter,seed:(Math.imul(this.counter,1664525)+1013904223)>>>0});this.gate=gate;this.applied=false;this.observations=[];}if(gate)NarrativeTrials.checkpoint();this.save();return this.state;},
 onChoices(script){if(this.available()&&script===SCRIPTS.accuse&&RepressionUI.dom&&!this.applied)RepressionUI.show();},
 observeClaim(target){if(!this.available())return;this.observations.push({target});this.observations=this.observations.slice(-24);this.save();},
 commitOutcome(owned=false){
  if(!this.state||this.applied||!this.gate||this.fingerprint()!==this.gate||owned&&this.state.outcome!=='lost'||!owned&&this.state.outcome!=='won')return false;
  const index=dialogChoices.findIndex(c=>c.label==='不，我拒绝这一切');if(!owned&&index<0)return false;
  this.applied=true;this.save();RepressionUI.dismiss();
  if(owned)NarrativeTrials.loseCourt();else ui.dialogChoices.children[index].click();
  return true;
 },
 reset(){if(!this.available())return;RepressionUI.dismiss();this.state=null;this.gate=null;this.applied=false;this.observations=[];localStorage.removeItem(this.key);}
};
