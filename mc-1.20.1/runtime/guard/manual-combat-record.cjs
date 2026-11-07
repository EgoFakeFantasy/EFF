'use strict';
// Records only. Never sends gameplay input, produces a combat verdict, or stops MC/Guardian.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{randomUUID}=require('node:crypto');
const {request}=require('../control.cjs');
const {WindowRecorder,toolsAt}=require('./window-recorder.cjs');
const {stableWindow}=require('./window-preflight.cjs');
const [manifestFile,directory,toolsDirectory,probeExe,durationArg,operatorArg='user']=process.argv.slice(2);
const maxSeconds=durationArg===undefined?330:Number(durationArg);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 if(!['user','assistant'].includes(operatorArg))throw Error('RECORDING_OPERATOR');
  if(!Number.isInteger(maxSeconds)||maxSeconds<5||maxSeconds>330)throw Error('RECORDING_DURATION_RANGE_5_TO_330');
 toolsAt(toolsDirectory);
 const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
 const snapshot=await request(manifest.config.directory,'snapshot');
 const launchPid=snapshot.runtime.hostPid;
 if(!Number.isSafeInteger(launchPid)||launchPid<=0)throw Error('HOST_PID_REQUIRED');
 const args=manifest.config.host.lowIntegrity===true
  ?['--child-java',String(launchPid),manifest.config.host.command]:[String(launchPid)];
 const probe=spawn(probeExe,args,{windowsHide:true,stdio:['ignore','pipe','ignore']});
 let buffer='',error='',recorder,video,manualRunId;const samples=[];
 probe.on('error',e=>error=e.code||'WINDOW_PROBE_ERROR');
 probe.stdout.on('data',b=>{buffer+=b;let at;while((at=buffer.indexOf('\n'))>=0){
  const line=buffer.slice(0,at);buffer=buffer.slice(at+1);
  try{if(samples.length<400)samples.push({...JSON.parse(line),receivedAtMs:performance.now()});}catch{error='INVALID_WINDOW_PROBE';}
 }});
 try{
  const until=Date.now()+20000;let identity;
  while(Date.now()<until&&!identity){if(error)throw Error(error);identity=stableWindow(samples.slice(-3),launchPid)?.[0];if(!identity)await wait(250);}
  if(!identity)throw Error('STABLE_ORIGINAL_WINDOW_REQUIRED');
  const ready=JSON.parse(fs.readFileSync(path.join(manifest.config.host.cwd,'manual-combat-ready.json'),'utf8'));
  const bound=JSON.parse(fs.readFileSync(path.join(manifest.config.host.cwd,'manual-scene-bound.json'),'utf8'));
  if(ready.pid!==identity.pid||bound.pid!==identity.pid||bound.originalsFrozen!==true
      ||bound.count!==ready.sceneEntities?.length+1)throw Error('RECORDER_ORIGINAL_ROSTER_REQUIRED');
  // Legacy scenes remain recordable, but absent run binding must stay explicit.
  manualRunId=typeof ready.manualRunId==='string'?ready.manualRunId:null;
  require('./manual-recording-preflight.cjs').assertManualObserverReady(manifest.config.host.cwd,identity.pid);
  recorder=new WindowRecorder({directory,toolsDirectory,probeExe,identity,runId:randomUUID()});
  await recorder.start();
  console.log(JSON.stringify({status:operatorArg==='assistant'?'RECORDING_ASSISTANT_OPERATED_SESSION':'RECORDING_USER_MANUAL_SESSION',gameplayOperator:operatorArg,pid:identity.pid,windowHandle:identity.windowHandle,
   directory,maxSeconds,manualRunId,automaticAttack:false,automaticVerdict:false}));
   const end=Date.now()+maxSeconds*1000;
  while(Date.now()<end){recorder.assertHealthy();await wait(500);}
 }catch(e){error=e.message;}
 finally{
  if(recorder)try{video=await recorder.stop();error ||= video?.error||'';}catch(e){error ||= e.message;}
  probe.kill(); // Only this read-only probe; never the game or guardian.
  if(fs.existsSync(directory))fs.writeFileSync(path.join(directory,'manual-recording-result.json'),
   JSON.stringify({scope:operatorArg+'-operated-recording-not-acceptance',gameplayOperator:operatorArg,recorderSendsGameplayInput:false,manualRunId:manualRunId??null,
    automaticAttack:false,automaticVerdict:false,error,video},null,2),{flag:'wx'});
  console.log(JSON.stringify({status:'RECORDING_FINISHED',error,gameStoppedByRecorder:false}));
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
