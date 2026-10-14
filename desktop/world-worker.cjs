"use strict";
// Fixed trusted module. Messages are bounded data; no source strings are evaluated.
const World=require('../local-version/world-runtime.js');let state;
process.parentPort.on('message',event=>{
 const {id,operation,config,contract,dt,input}=event.data||{};
 try{
  let result;
  if(operation==='init'){if(state)throw Error('WORLD_ALREADY_STARTED');state=World.create(config);result=World.frame(state);}
  else if(!state)throw Error('WORLD_NOT_STARTED');
  else if(operation==='sync')result=World.sync(state,contract);
  else if(operation==='tick')result=World.step(state,dt,input);
  else if(operation==='snapshot')result=World.frame(state);
  else throw Error('WORLD_OPERATION_NOT_ALLOWED');
  process.parentPort.postMessage({id,ok:true,frame:result});
 }catch(error){process.parentPort.postMessage({id,ok:false,error:String(error.message).slice(0,100)});}
});
