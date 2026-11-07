'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{randomBytes}=require('node:crypto');
const {cleanEnv}=require('./launch-policy.cjs'),{boundedHostLog}=require('./bounded-host-log.cjs');
async function launchStory(host,directory,epoch){
 if(host.externalStory!==true||host.lowIntegrity!==true||!host.integrityHelper||!path.isAbsolute(host.env?.EFF_STORY_RUNTIME||''))throw Error('STORY_LOW_BOUNDARY_REQUIRED');
 const saveRoot=path.join(host.cwd,'eff-external-story');fs.mkdirSync(saveRoot,{recursive:true});
 const key=randomBytes(32).toString('hex');
 const child=spawn(host.integrityHelper,['--low-integrity-host',saveRoot,process.execPath,'--max-old-space-size=96',path.join(__dirname,'story-service.cjs'),host.env.EFF_STORY_RUNTIME,saveRoot],{cwd:host.cwd,env:{...cleanEnv(),EFF_STORY_RPC_KEY:key},stdio:['ignore','pipe','pipe'],windowsHide:true});
 const log=boundedHostLog(path.join(directory,`story-${epoch}.log`),{maxBytes:65536});log.on('error',()=>{});child.stderr.pipe(log,{end:false});child.on('close',()=>log.end());
 try{
  const port=await new Promise((resolve,reject)=>{
   let buffered='',done=false;const timer=setTimeout(()=>finish(Error('STORY_START_TIMEOUT')),15000);
   function finish(error,value){if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(value);}
   child.on('error',()=>finish(Error('STORY_START_FAILED')));child.on('exit',()=>finish(Error('STORY_EXITED')));
   child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{if(done)return;buffered+=chunk;if(buffered.length>1024)return finish(Error('STORY_START_BUDGET'));if(!buffered.includes('\n'))return;try{const r=JSON.parse(buffered.trim());if(Object.keys(r).join(',')!=='storyPort'||!Number.isInteger(r.storyPort)||r.storyPort<1||r.storyPort>65535)throw Error();finish(null,r.storyPort);}catch{finish(Error('STORY_START_PROTOCOL'));}});
  });
  return {child,env:{EFF_STORY_ENDPOINT:`http://127.0.0.1:${port}`,EFF_STORY_LEASE:key}};
 }catch(e){child.kill();throw e;}
}
module.exports={launchStory};
