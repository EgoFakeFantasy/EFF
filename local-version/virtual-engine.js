"use strict";
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./phenomenon-runtime.js'));else root.VirtualEngine=factory(root.PhenomenonRuntime);})(globalThis,Runtime=>{
 function instantiate(checkpoint,generation=1){
  if(!Number.isSafeInteger(generation)||generation<1||generation>32)throw Error('INVALID_GENERATION');
  const state=Runtime.replay(checkpoint);
  return Object.freeze({id:state.battleId+'/instance-'+generation,generation,ruleset:state.epoch,state});
 }
 function replace(instance,checkpoint){
  const next=instantiate(checkpoint,instance.generation+1);
  if(next.state.battleId!==instance.state.battleId||next.state.revision!==instance.state.revision||JSON.stringify(Runtime.summary(next.state))!==JSON.stringify(Runtime.summary(instance.state)))throw Error('INSTANCE_STATE_MISMATCH');
  return next;
 }
 return Object.freeze({instantiate,replace});
});
