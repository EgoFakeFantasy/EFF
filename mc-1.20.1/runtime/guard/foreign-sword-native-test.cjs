"use strict";
// An opt-in Windows experiment, not a production launcher or an immunity claim.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {provision}=require('../seal-runtime.cjs'),{inspectArtifact}=require('../artifact-policy.cjs'),{request}=require('../control.cjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const SAMPLE='3bf3ba852bbafec9f4440210d4084bb92ba9586c9a146ae03ddf003f17f1b5f8';
const executionEnvironment=require('./lab-environment.cjs').labEnvironment();
const [source,destination,binary,sample,expected=SAMPLE,profile='foreverlove']=process.argv.slice(2);
const clean=profile==='baseline';
if(!/^[a-f0-9]{64}$/.test(expected)||!['foreverlove','pig2','baseline'].includes(profile))throw Error('OPPONENT_IDENTITY_REQUIRED');
const {verdict,confirmedEngagement}=require('./combat-verdict.cjs');
const {baselineIdentity,checkBaseline}=require('./baseline-identity.cjs');
const {WindowRecorder,toolsAt}=require('./window-recorder.cjs');
const {publishProof,readProof:readJSON,readBounded}=require('./atomic-proof.cjs');
const {randomUUID,createHash}=require('node:crypto');
const report={schema:1,executionEnvironment,sampleSHA256:clean?null:expected,scope:clean?'clean-continuous-baseline':'same-jvm-opponent',startedAtUnixMs:Date.now(),lowIntegrityHost:true,modelInferenceVerified:false,attackAttempted:false,attackReturned:false,STATE_INTACT:false,HOST_RECOVERED:false,PLAYABLE_RESTORED:false};
let guard,sealed,windowProbe,recorder;const windows=[];let windowBuffer="",expectedPid=0,expectedLaunchPid=0,probeError="",intentionalStop=false,probeStopped=false;
let readRunProof=()=>null;
let readControllerFault=()=>null;
let readHostFault=()=>null;
const runId=randomUUID();let armed=false,lastSurvivalSamples=0,survivalReceivedAtMs=0,confirmedAttackAtMs=0;
if(clean){report.baselineRunId=runId;report.ok=false;}
const instrumented=process.env.EFF_LAB_ATTACK_TRACE==='1';
report.instrumentationMode=instrumented?'observational-mixin':'read-only-stack';
function runGuard(verifyOnly=false){const p=spawn(sealed.guard,[...(verifyOnly?['--verify-only']:[]),sealed.manifest,sealed.pin],{windowsHide:true,stdio:['ignore','pipe','pipe']});p.stdout.on('data',b=>{p.receipt=((p.receipt||'')+b).slice(-1000);});p.stderr.on('data',b=>{p.diagnostic=((p.diagnostic||'')+b.toString()).slice(-2000);});p.on('error',e=>{p.spawnFailure=e.code||'GUARD_START_FAILED';});return p;}
const stopped=p=>p.exitCode!==null||p.signalCode!==null||p.spawnFailure;
async function stopOwned(p){if(!p||stopped(p))return;p.kill();for(let i=0;i<100&&!stopped(p);i++)await wait(50);if(!stopped(p))throw Error('OWNED_GUARD_STOP_TIMEOUT');}
function lastCommit(file){const b=readBounded(file,8*1024*1024);if(!b)throw Error('LAB_LEDGER_MISSING');let at=0,last;while(at<b.length){if(at+4>b.length)throw Error('LAB_LEDGER_TRUNCATED');const n=b.readInt32LE(at);if(n<2||n>131072||at+4+n+32>b.length)throw Error('LAB_LEDGER_TRUNCATED');last=JSON.parse(b.subarray(at+4,at+4+n).toString('utf8')).body;at+=4+n+32;}return last;}
(async()=>{
 try{
  if(!process.env.EFF_WINDOW_PROBE_EXE||path.resolve(process.env.EFF_WINDOW_PROBE_EXE).toLowerCase()!==path.resolve(path.dirname(binary),'WindowProbe.exe').toLowerCase())throw Error('BASELINE_WINDOW_PROBE_REQUIRED');
  if(!process.env.EFF_RECORDER_TOOLS)throw Error('EXTERNAL_RECORDER_TOOLS_REQUIRED');
  toolsAt(process.env.EFF_RECORDER_TOOLS); // Verify pinned binaries before any game is started.
  const artifact=clean?null:inspectArtifact(sample);if(!clean&&artifact.sha256!==expected)throw Error('LAB_SAMPLE_HASH_MISMATCH');
  const sourceBytes=fs.readFileSync(source),sourceSHA256=createHash('sha256').update(sourceBytes).digest('hex');
  report.sourceSHA256=sourceSHA256;
  const baseline=process.env.EFF_CLEAN_BASELINE_REPORT?readJSON(process.env.EFF_CLEAN_BASELINE_REPORT):null;
  report.runtimeIdentitySHA256=baselineIdentity(source,binary);
  report.baselineCheck=checkBaseline(baseline,report.runtimeIdentitySHA256,{sourceSHA256,requireLow:true});
  report.baselineReady=report.baselineCheck.ready;
  if(!clean&&!report.baselineReady)throw Error('CLEAN_BASELINE_REQUIRED:'+report.baselineCheck.reason);
  const cfg=JSON.parse(sourceBytes);cfg.researchLab=true;cfg.researchMode='observe-only';cfg.startupTimeout=240000;
  report.hostCompatibility=cfg.host.nativeCompatibility||'hardened-default';
  if(clean&&cfg.host.researchMods?.length)throw Error('CLEAN_SOURCE_REQUIRED');
  if(clean)delete cfg.host.researchMods;
  else cfg.host.researchMods=[{path:sample,sha256:expected,allowCapabilities:artifact.risks.map(x=>x.kind)}];
  cfg.host.args=cfg.host.args.filter(x=>!/^[-]Deff\.(entityGuardSelftest|entityGuardCase|pig2Lab|guardedSelftest|managedSelftest|foreverLoveLab|labAttackTrace)=/.test(x));
  cfg.host.args.splice(cfg.host.args.indexOf('-cp'),0,...(clean?['-Deff.entityGuardSelftest=true','-Deff.entityGuardCase=baseline']:[profile==='pig2'?'-Deff.pig2Lab=true':'-Deff.foreverLoveLab=true']));
  if(instrumented)cfg.host.args.splice(cfg.host.args.indexOf('-cp'),0,'-Deff.labAttackTrace=true');
  const input=path.resolve(destination)+'-input.json';fs.writeFileSync(input,JSON.stringify(cfg),{flag:'wx'});
  sealed=provision(input,destination,binary,{lowIntegrityHost:true,externalControlOnly:true});
  const manifest=JSON.parse(fs.readFileSync(sealed.manifest,'utf8')),authority=manifest.config.directory,proof=path.join(manifest.config.host.cwd,'entity-guard-proof');
  readHostFault=()=>readJSON(path.join(authority,'host-fault.json'));
  const read=name=>readJSON(path.join(proof,'1-'+name+'.json'));
  readRunProof=read;
  readControllerFault=()=>{
   const commit=lastCommit(path.join(authority,'ledger.bin')),incident=commit?.defense?.lastIncident;
   const ready=read('ready');
   if(!incident||!ready?.research?.instance||incident.instance!==ready.research.instance)return null;
   return {subject:incident.subject,reason:incident.reason,instance:incident.instance,revision:incident.revision,hmacRevalidated:false};
  };
  guard=runGuard();const end=performance.now()+600000;let startedAt=0;
  while(performance.now()<end&&!stopped(guard)){
   const bootstrapFailure=read('bootstrap-failure');
   if(bootstrapFailure){report.bootstrapFailure=bootstrapFailure;report.nativeFailure='BOOTSTRAP_'+String(bootstrapFailure.stage).slice(0,100);break;}
   if(read(clean?'baseline-started':profile==='pig2'?'opponent-spawned':'sword-attack-started')){if(!clean)report.attackAttempted=true;if(!startedAt)startedAt=performance.now();}
   if(read('sword-attack-returned'))report.attackReturned=true;
   if(!windowProbe && process.env.EFF_WINDOW_PROBE_EXE){
    report.phase='initial-trusted-snapshot';
    let snapshot;try{snapshot=await request(authority,'snapshot');}catch{await wait(250);continue;}
    expectedLaunchPid=snapshot.runtime.hostPid;
    if(!Number.isSafeInteger(expectedLaunchPid)||expectedLaunchPid<=0){await wait(250);continue;}
    // In Low mode hostPid identifies the guard's launcher, not java.exe. The external
    // observer binds its unique direct Java child using OS metadata and the sealed image.
    const probeArgs=manifest.config.host.lowIntegrity===true?['--child-java',String(expectedLaunchPid),manifest.config.host.command]:[String(expectedLaunchPid)];
    windowProbe=spawn(process.env.EFF_WINDOW_PROBE_EXE,probeArgs,{windowsHide:true,stdio:['ignore','pipe','pipe']});
    windowProbe.stderr.on('data',b=>{report.probeDiagnostic=((report.probeDiagnostic||'')+b).slice(-2000);});
    windowProbe.on('error',e=>probeError=e.code||'PROBE_FAILED');
    windowProbe.on('exit',code=>{report.probeExitCode=code;if(!probeStopped)probeError='PROBE_ENDED_BEFORE_COMPLETION';});
    windowProbe.stdout.on('data',chunk=>{windowBuffer+=chunk; if(windowBuffer.length>65536){probeError='PROBE_OUTPUT_BUDGET';windowProbe.kill();return;} let at;while((at=windowBuffer.indexOf('\n'))>=0){const line=windowBuffer.slice(0,at);windowBuffer=windowBuffer.slice(at+1);try{if(windows.length<600)windows.push({...JSON.parse(line),receivedAtMs:performance.now()});else probeError='PROBE_SAMPLE_BUDGET';}catch{probeError='INVALID_PROBE_OUTPUT';}}});
   }
   if(probeError)throw Error(probeError);
   if(recorder)recorder.assertHealthy();
   if(!armed && windows[0]){
    report.preflightWindows=windows.slice();
    if(recorder&&!read('ready')){await wait(250);continue;}
    const visible=windows.filter(x=>x.windowHandle!=='0');
    const stable=require('./window-preflight.cjs').stableWindow(visible.slice(-3),expectedLaunchPid);
    if(!stable){await wait(250);continue;}
    if(!recorder){
     report.phase='start-window-recording';
     recorder=new WindowRecorder({directory:path.join(destination,'recording'),toolsDirectory:process.env.EFF_RECORDER_TOOLS,
      probeExe:process.env.EFF_WINDOW_PROBE_EXE,identity:stable[0],runId,recordStartup:true});
     await recorder.start();
     // Retain only samples actually covered by captured frames, then collect a fresh stable tail.
     windows.splice(0,windows.length,...windows.filter(x=>x.receivedAtMs>=recorder.firstFrameAtMs));
     await wait(250);continue;
    }
    if(!read('ready')){await wait(250);continue;}
    const visualRequest=path.join(destination,'recording','visual-preflight.json');
    if(!fs.existsSync(visualRequest))publishProof(visualRequest,{runId,pid:stable[0].pid,windowHandle:stable[0].windowHandle,processStartedUtcTicks:stable[0].processStartedUtcTicks});
    const visual=readJSON(path.join(destination,'recording','scene-ready.json'));
    if(!visual){report.phase='await-external-scene-check';await wait(250);continue;}
    if(visual.runId!==runId||visual.pid!==stable[0].pid||visual.windowHandle!==stable[0].windowHandle||visual.processStartedUtcTicks!==stable[0].processStartedUtcTicks||visual.unobstructed!==true)throw Error('EXTERNAL_SCENE_IDENTITY_REQUIRED');
    report.visualPreflight=visual;
    if(recorder.samples.slice(-3).length<3||recorder.samples.slice(-3).some(x=>!x.responsive)){await wait(250);continue;}
    recorder.beginObservation();
    windows.splice(0,windows.length-3);const first=windows[0];
    expectedPid=first.pid;
    // The normal arena starts frozen. Prepare the fight through the authenticated external
    // control plane; the untrusted observation-only MC channel remains unable to mutate it.
    report.phase='prepare-fight';
    const preparation=await request(authority,'execute','disable control.tether; disable event.possess');
    report.preparationRevision=preparation.snapshot?.revision;
    publishProof(path.join(proof,'1-arm-attack.json'),{mcPid:expectedPid,runId});armed=true;report.phase='observe-attack';
   }
   const survival=read('survival');if(survival?.samples>lastSurvivalSamples){lastSurvivalSamples=survival.samples;survivalReceivedAtMs=performance.now();}
   if(!confirmedAttackAtMs && confirmedEngagement(survival,{runId,profile,instrumented}))confirmedAttackAtMs=performance.now();
   const failed=read('failure');if(failed){report.nativeFailure=failed.error;break;}
   if(read('observation-window-complete')||startedAt&&performance.now()-startedAt>(instrumented?150000:40000))break;
   await wait(250);
  }
  report.attackAttempted=!!read(profile==='pig2'?'opponent-spawned':'sword-attack-started');report.attackReturned=!!read('sword-attack-returned');
  report.observation=read('sword-attack-returned');report.window=read('observation-window-complete');
  report.survival=read('survival');report.expectedPid=expectedPid;report.expectedLaunchPid=expectedLaunchPid;
  if(report.survival?.samples>lastSurvivalSamples)survivalReceivedAtMs=performance.now();
  report.attackObservedAtMs=startedAt;report.confirmedAttackAtMs=confirmedAttackAtMs;report.survivalReceivedAtMs=survivalReceivedAtMs;report.runId=runId;
  if(clean)report.observationStartedAtMs=startedAt;
  report.crashed=!!stopped(guard);report.probeError=probeError;
  if(!stopped(guard)){
   const finalSnapshot=await request(authority,'snapshot');
   report.hostReplaced=expectedLaunchPid>0 && finalSnapshot.runtime.hostPid!==expectedLaunchPid;
  }
  // Freeze external observations before our deliberate teardown. Killing MC below is not
  // an opponent-induced continuity failure and must never contaminate the combat window.
  probeStopped=true;await stopOwned(windowProbe);report.windows=windows.slice();
  report.crashed ||= !!stopped(guard);report.nativeFailure ||= read('failure')?.error;
  const finalSurvival=read('survival');if(finalSurvival?.samples>lastSurvivalSamples)report.survivalReceivedAtMs=performance.now();
  report.survival=finalSurvival;report.finishedAtMs=performance.now();intentionalStop=true;
  if(recorder){
   // One more captured frame must cover the final retained observation, before deliberate teardown.
   const until=performance.now()+1200;
   while(recorder.frames.at(-1)<report.windows.at(-1)?.receivedAtMs&&performance.now()<until){recorder.assertHealthy();await wait(50);}
   report.video=await recorder.stop();
  }
  if(!stopped(guard))try{await request(authority,'stop');for(let i=0;i<100&&!stopped(guard);i++)await wait(100);}catch{}
  await stopOwned(guard);report.guardDiagnostic=guard.diagnostic||guard.spawnFailure||'';
  const ledger=path.join(authority,'ledger.bin'),before=readBounded(ledger,8*1024*1024),commit=lastCommit(ledger);
  // Verification-only guard mode checks hashes/HMAC and returns before constructing any Job or child.
  const audit=runGuard(true);const auditEnd=performance.now()+30000;while(!stopped(audit)&&performance.now()<auditEnd)await wait(100);
  if(!stopped(audit)){await stopOwned(audit);throw Error('LAB_LEDGER_REVALIDATION_TIMEOUT');}
  report.readOnlyAudit=audit.exitCode===0&&audit.receipt?.includes('SEALED_LEDGER_VERIFIED_NO_CHILD_STARTED');
  report.STATE_INTACT=report.readOnlyAudit&&readBounded(ledger,8*1024*1024).equals(before)&&commit?.state?.avatar===true&&commit.state.recovery===true;
  report.opponentLoaded=report.attackAttempted;report.attackConfirmed=confirmedEngagement(report.survival,{runId,profile,instrumented});report.coreModified=!report.readOnlyAudit;
  if(baselineIdentity(source,binary)!==report.runtimeIdentitySHA256)report.coreModified=true;
  report.combatAcceptance=verdict(report,{baseline:clean});
  report.quarantine=readJSON(path.join(authority,'quarantine.json'));report.lastCommit=commit;
  report.hostFault=readHostFault();
  report.crashEvidence=report.crashed?'GUARD_EXIT_CONTINUITY_LOSS_NOT_NATIVE_CRASH_DIAGNOSIS':'NO_GUARD_EXIT_OBSERVED';
  report.result=clean?'CLEAN_BASELINE_REQUIRES_VIDEO_REVIEW':report.attackAttempted?'ATTACK_ATTEMPT_OBSERVED':'BOOTSTRAP_OR_ARENA_BLOCKED';
  report.evidenceNote='MC proof is an untrusted observation; STATE_INTACT also requires independent outer HMAC revalidation. No host recovery or playable restoration is inferred from quarantine.';
 }catch(e){report.error=String(e.message).slice(0,1800);report.errorType=e.name;report.errorCauseCode=typeof e.cause?.code==='string'?e.cause.code:null;report.guardDiagnostic=guard?.diagnostic||guard?.spawnFailure||'';report.windows=windows.slice();report.probeError=probeError;report.expectedPid=expectedPid;report.expectedLaunchPid=expectedLaunchPid;
  report.firstFailureAtMs=performance.now();
  try{report.survival=readRunProof('survival');report.nativeFailure ||= readRunProof('failure')?.error;report.bootstrapFailure ||= readRunProof('bootstrap-failure');}catch{}
  // Keep the failed acceptance window frozen. A bounded tail distinguishes an
  // unresponsive original window from subsequent deliberate harness teardown.
  // Recovery here never erases failure or counts towards continuous survival.
  if(report.error==='RECORDER_WINDOW_UNRESPONSIVE'&&armed&&guard&&recorder?.process&&!stopped(guard)&&!stopped(recorder.process)){
   const first=windows.length;
   report.failureTail=await require('./failure-tail.cjs').retainFailureTail({isRunning:()=>!stopped(guard)&&!stopped(recorder.process)&&
    require('./window-recorder.cjs').windowFailure(recorder.samples.at(-1),recorder.identity,false)===null});
   report.failureTail.windows=windows.slice(first);
  }
  // Preserve the last observation even if the external window probe exits first. It remains
  // evidence of a past sample, never proof that the entity outlived the missing window.
  if(report.failureTail)try{report.postFailureEvidence={survival:readRunProof('survival'),failure:readRunProof('failure'),evidenceScope:'after latched failure; never accepted continuity'};}catch{}
  try{Object.assign(report,require('./attack-failure-evidence.cjs').attackFailureEvidence(readRunProof,{runId,pid:expectedPid}));}catch{}
  // Preserve a fault that closed the control endpoint before the arm request. This is a
  // controller-reported failure, never an authenticated survival success or full-attack proof.
  try{report.controllerFaultObservation=readControllerFault();if(report.controllerFaultObservation)report.nativeFailure ||= 'CONTROLLER_REPORTED_'+String(report.controllerFaultObservation.reason).slice(0,100);}catch{}
  try{report.hostFault=readHostFault();}catch{}
  report.runId=runId;report.finishedAtMs=performance.now();report.teardownRequestedAtMs=performance.now();if(!intentionalStop&&guard&&stopped(guard))report.crashed=true;process.exitCode=1;}
 finally{if(windowProbe&&!stopped(windowProbe))windowProbe.kill();if(recorder&&!report.video)try{report.video=await recorder.stop();}catch(e){report.recorderError=e.message;}report.combatAcceptance ||= verdict({...report,windows:report.windows||windows},{baseline:clean});if(!report.combatAcceptance.accepted)process.exitCode=1;try{await stopOwned(guard);}catch(e){report.stopError=e.message;process.exitCode=1;}report.finishedAtUnixMs=Date.now();fs.mkdirSync(destination,{recursive:true});fs.writeFileSync(path.join(destination,'foreign-sword-result.json'),JSON.stringify(report,null,2));process.stdout.write(JSON.stringify({result:report.result,error:report.error,attackAttempted:report.attackAttempted,STATE_INTACT:report.STATE_INTACT,combatAcceptance:report.combatAcceptance})+'\n');}
})();
