"use strict";
const path=require('node:path'),World=require('../local-version/world-runtime.js');
const record=v=>v&&typeof v==='object'&&!Array.isArray(v);
class WorldHost{
 constructor(fork){this.fork=fork;this.child=null;this.config=null;this.frame=null;this.queue=Promise.resolve();this.calls=new Map();this.serial=0;this.closed=false;this.lifecycle=[];}
 dispatch(request){
  if(!record(request)||Buffer.byteLength(JSON.stringify(request))>65536||Object.keys(request).some(k=>!['operation','config','session','contract','dt','input','generation'].includes(k)))return Promise.reject(Error('INVALID_WORLD_REQUEST'));
  const job=this.queue.catch(()=>{}).then(()=>this.perform(request));this.queue=job;return job;
 }
 async perform(r){
  if(this.closed)throw Error('WORLD_HOST_CLOSED');
  if(r.operation==='start'){
   World.create(r.config);await this.stop();this.config=JSON.parse(JSON.stringify(r.config));return this.spawn();
  }
  if(r.operation==='dispose'){
   if(r.session&&this.config?.session!==r.session)return {ok:true,disposed:false};await this.stop();this.config=null;this.frame=null;return {ok:true,disposed:true};
  }
  if(!this.config||r.session!==this.config.session)throw Error('WORLD_SESSION_MISMATCH');
  if(r.operation==='rebuild'){
   if(!this.frame||r.generation!==this.config.generation+1)throw Error('WORLD_GENERATION_MISMATCH');
   const next={...this.config,generation:r.generation,pose:{...this.frame.avatar,tick:this.frame.tick,time:this.frame.time,anchorX:this.frame.boundary.x+30,anchorY:this.frame.boundary.y+24}};World.create(next);
   await this.stop();this.config=next;return this.spawn();
  }
  if(!this.child)throw Error('WORLD_STOPPED');
  if(r.operation==='sync'){
   const validation=World.create({...this.config,pose:{...this.frame.avatar,tick:this.frame.tick,time:this.frame.time,anchorX:this.frame.boundary.x+30,anchorY:this.frame.boundary.y+24}});World.sync(validation,r.contract);
   const receipt=await this.call({operation:'sync',contract:r.contract});this.config.contract=JSON.parse(JSON.stringify(r.contract));return receipt;
  }
  if(r.operation==='tick')return this.call({operation:'tick',dt:r.dt,input:r.input});
  if(r.operation==='snapshot')return this.call({operation:'snapshot'});
  throw Error('WORLD_OPERATION_NOT_ALLOWED');
 }
 receipt(){return {ok:true,backend:'utility-process',pid:this.child?.pid||null,frame:this.frame,lifecycle:this.lifecycle.slice(-8)};}
 async spawn(){
  const child=this.fork(path.join(__dirname,'world-worker.cjs'),[],{serviceName:'EFF World Instance',stdio:'ignore'});this.child=child;
  child.on('message',message=>{const c=this.calls.get(message.id);if(!c||c.child!==child)return;this.calls.delete(message.id);clearTimeout(c.timer);if(message.ok){this.frame=message.frame;c.resolve(this.receipt());}else c.reject(Error(message.error));});
  child.on('exit',code=>{
   this.lifecycle.push({event:'stopped',generation:this.config?.generation,code});this.lifecycle=this.lifecycle.slice(-8);
   if(this.child===child)this.child=null;
   for(const [id,c] of this.calls)if(c.child===child){clearTimeout(c.timer);c.reject(Error('WORLD_STOPPED'));this.calls.delete(id);}
  });
  child.on('error',()=>{});
  try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('WORLD_START_TIMEOUT')),5000);child.once('spawn',()=>{clearTimeout(timer);resolve();});child.once('exit',()=>{clearTimeout(timer);reject(Error('WORLD_START_FAILED'));});});}catch(error){await this.stop();throw error;}
  this.lifecycle.push({event:'started',generation:this.config.generation});try{return await this.call({operation:'init',config:this.config});}catch(error){await this.stop();throw error;}
 }
 call(message){return new Promise((resolve,reject)=>{
  const id=++this.serial,child=this.child;if(!child){reject(Error('WORLD_STOPPED'));return;}
  const timer=setTimeout(()=>{this.calls.delete(id);reject(Error('WORLD_REPLY_TIMEOUT'));},5000);this.calls.set(id,{resolve,reject,timer,child});child.postMessage({id,...message});
 });}
 async stop(){
  const child=this.child;if(!child)return;
  const exit=new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{
    try{if(child.pid)process.kill(child.pid,'SIGKILL');}catch{}
    reject(Error('WORLD_STOP_TIMEOUT'));
   },5000);
   child.once('exit',()=>{clearTimeout(timer);resolve();});
  });
  if(child.pid===undefined)child.once('spawn',()=>child.kill());
  child.kill();
  try{await exit;}finally{if(this.child===child)this.child=null;}
 }
 async close(){this.closed=true;await this.queue.catch(()=>{});await this.stop();this.config=null;this.frame=null;}
}
module.exports={WorldHost};
