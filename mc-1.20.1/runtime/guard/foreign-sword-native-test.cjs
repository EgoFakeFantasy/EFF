"use strict";
// An opt-in disposable-VM experiment, not a production launcher or an immunity claim.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {provision}=require('../seal-runtime.cjs'),{inspectArtifact}=require('../artifact-policy.cjs'),{request}=require('../control.cjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const SAMPLE='3bf3ba852bbafec9f4440210d4084bb92ba9586c9a146ae03ddf003f17f1b5f8';
if(process.platform!=='win32'||process.env.EFF_DISPOSABLE_VM_LAB!=='1')throw Error('DISPOSABLE_WINDOWS_VM_REQUIRED');
const [source,destination,binary,sample,expected=SAMPLE,profile='foreverlove']=process.argv.slice(2);
if(!/^[a-f0-9]{64}$/.test(expected)||!['foreverlove','pig2'].includes(profile))throw Error('OPPONENT_IDENTITY_REQUIRED');
const {verdict,confirmedEngagement}=require('./combat-verdict.cjs');
const {baselineIdentity,checkBaseline}=require('./baseline-identity.cjs');
const {publishProof,readProof:readJSON,readBounded}=require('./atomic-proof.cjs');
const {randomUUID,createHash}=require('node:crypto');
const report={schema:1,sampleSHA256:expected,modelInferenceVerified:false,attackAttempted:false,attackReturned:false,STATE_INTACT:false,HOST_RECOVERED:false,PLAYABLE_RESTORED:false};
let guard,sealed,windowProbe;const windows=[];let windowBuffer="",expectedPid=0,probeError="",intentionalStop=false;
const runId=randomUUID();let armed=false,lastSurvivalSamples=0,survivalReceivedAtMs=0,confirmedAttackAtMs=0;
const instrumented=process.env.EFF_LAB_ATTACK_TRACE==='1';
report.instrumentationMode=instrumented?'observational-mixin':'read-only-stack';
function runGuard(){const p=spawn(sealed.guard,[sealed.manifest,sealed.pin],{windowsHide:true,stdio:['ignore','pipe','pipe']});p.stdout.resume();p.stderr.on('data',b=>{p.diagnostic=((p.diagnostic||'')+b.toString()).slice(-2000);});p.on('error',e=>{p.spawnFailure=e.code||'GUARD_START_FAILED';});return p;}
const stopped=p=>p.exitCode!==null||p.signalCode!==null||p.spawnFailure;
async function stopOwned(p){if(!p||stopped(p))return;p.kill();for(let i=0;i<100&&!stopped(p);i++)await wait(50);if(!stopped(p))throw Error('OWNED_GUARD_STOP_TIMEOUT');}
function lastCommit(file){const b=readBounded(file,8*1024*1024);if(!b)throw Error('LAB_LEDGER_MISSING');let at=0,last;while(at<b.length){if(at+4>b.length)throw Error('LAB_LEDGER_TRUNCATED');const n=b.readInt32LE(at);if(n<2||n>131072||at+4+n+32>b.length)throw Error('LAB_LEDGER_TRUNCATED');last=JSON.parse(b.subarray(at+4,at+4+n).toString('utf8')).body;at+=4+n+32;}return last;}
(async()=>{
 try{
  const artifact=inspectArtifact(sample);if(artifact.sha256!==expected)throw Error('LAB_SAMPLE_HASH_MISMATCH');
  const sourceBytes=fs.readFileSync(source),sourceSHA256=createHash('sha256').update(sourceBytes).digest('hex');
  const baseline=process.env.EFF_CLEAN_BASELINE_REPORT?readJSON(process.env.EFF_CLEAN_BASELINE_REPORT):null;
  report.runtimeIdentitySHA256=baselineIdentity(source,binary);
  report.baselineCheck=checkBaseline(baseline,report.runtimeIdentitySHA256,{sourceSHA256,requireLow:true});
  report.baselineReady=report.baselineCheck.ready;
  if(!report.baselineReady)throw Error('CLEAN_BASELINE_REQUIRED:'+report.baselineCheck.reason);
  const cfg=JSON.parse(sourceBytes);cfg.researchLab=true;cfg.researchMode='observe-only';cfg.startupTimeout=240000;
  cfg.host.researchMods=[{path:sample,sha256:expected,allowCapabilities:artifact.risks.map(x=>x.kind)}];
  cfg.host.args=cfg.host.args.filter(x=>!/^[-]Deff\.(entityGuardSelftest|entityGuardCase|pig2Lab|guardedSelftest|managedSelftest|foreverLoveLab|labAttackTrace)=/.test(x));
  cfg.host.args.splice(cfg.host.args.indexOf('-cp'),0,profile==='pig2'?'-Deff.pig2Lab=true':'-Deff.foreverLoveLab=true');
  if(instrumented)cfg.host.args.splice(cfg.host.args.indexOf('-cp'),0,'-Deff.labAttackTrace=true');
  const input=path.resolve(destination)+'-input.json';fs.writeFileSync(input,JSON.stringify(cfg),{flag:'wx'});
  try{sealed=provision(input,destination,binary,{lowIntegrityHost:true,externalControlOnly:true});}finally{fs.unlinkSync(input);}
  const manifest=JSON.parse(fs.readFileSync(sealed.manifest,'utf8')),authority=manifest.config.directory,proof=path.join(manifest.config.host.cwd,'entity-guard-proof');
  const read=name=>readJSON(path.join(proof,'1-'+name+'.json'));
  guard=runGuard();const end=performance.now()+600000;let startedAt=0;
  while(performance.now()<end&&!stopped(guard)){
   if(read(profile==='pig2'?'opponent-spawned':'sword-attack-started')){report.attackAttempted=true;if(!startedAt)startedAt=performance.now();}
   if(read('sword-attack-returned'))report.attackReturned=true;
   if(!windowProbe && read('ready') && process.env.EFF_WINDOW_PROBE_EXE){
    const snapshot=await request(authority,'snapshot');expectedPid=snapshot.runtime.hostPid;
    if(!Number.isSafeInteger(expectedPid)||expectedPid<=0)throw Error('TRUSTED_HOST_PID_REQUIRED');
    windowProbe=spawn(process.env.EFF_WINDOW_PROBE_EXE,[String(expectedPid)],{windowsHide:true,stdio:['ignore','pipe','ignore']});
    windowProbe.on('error',e=>probeError=e.code||'PROBE_FAILED');
    windowProbe.stdout.on('data',chunk=>{windowBuffer+=chunk; if(windowBuffer.length>65536){probeError='PROBE_OUTPUT_BUDGET';windowProbe.kill();return;} let at;while((at=windowBuffer.indexOf('\n'))>=0){const line=windowBuffer.slice(0,at);windowBuffer=windowBuffer.slice(at+1);try{if(windows.length<200)windows.push({...JSON.parse(line),receivedAtMs:performance.now()});else probeError='PROBE_SAMPLE_BUDGET';}catch{probeError='INVALID_PROBE_OUTPUT';}}});
   }
   if(!armed && !probeError && windows[0]?.pid===expectedPid && windows[0]?.alive===true && windows[0]?.responsive===true){
    // The normal arena starts frozen. Prepare the fight through the authenticated external
    // control plane; the untrusted observation-only MC channel remains unable to mutate it.
    const preparation=await request(authority,'execute','disable control.tether; disable event.possess');
    report.preparationRevision=preparation.snapshot?.revision;
    publishProof(path.join(proof,'1-arm-attack.json'),{mcPid:expectedPid,runId});armed=true;
   }
   const survival=read('survival');if(survival?.samples>lastSurvivalSamples){lastSurvivalSamples=survival.samples;survivalReceivedAtMs=performance.now();}
   if(!confirmedAttackAtMs && confirmedEngagement(survival,{runId,profile,instrumented}))confirmedAttackAtMs=performance.now();
   const failed=read('failure');if(failed){report.nativeFailure=failed.error;break;}
   if(read('observation-window-complete')||startedAt&&performance.now()-startedAt>(instrumented?150000:40000))break;
   await wait(250);
  }
  report.attackAttempted=!!read(profile==='pig2'?'opponent-spawned':'sword-attack-started');report.attackReturned=!!read('sword-attack-returned');
  report.observation=read('sword-attack-returned');report.window=read('observation-window-complete');
  report.survival=read('survival');report.expectedPid=expectedPid;
  if(report.survival?.samples>lastSurvivalSamples)survivalReceivedAtMs=performance.now();
  report.attackObservedAtMs=startedAt;report.confirmedAttackAtMs=confirmedAttackAtMs;report.survivalReceivedAtMs=survivalReceivedAtMs;report.runId=runId;
  report.crashed=!!stopped(guard);report.probeError=probeError;
  if(!stopped(guard)){
   const finalSnapshot=await request(authority,'snapshot');
   report.hostReplaced=expectedPid>0 && finalSnapshot.runtime.hostPid!==expectedPid;
  }
  // Freeze external observations before our deliberate teardown. Killing MC below is not
  // an opponent-induced continuity failure and must never contaminate the combat window.
  await stopOwned(windowProbe);report.windows=windows.slice();
  report.crashed ||= !!stopped(guard);report.nativeFailure ||= read('failure')?.error;
  const finalSurvival=read('survival');if(finalSurvival?.samples>lastSurvivalSamples)report.survivalReceivedAtMs=performance.now();
  report.survival=finalSurvival;report.finishedAtMs=performance.now();intentionalStop=true;
  if(!stopped(guard))try{await request(authority,'stop');for(let i=0;i<100&&!stopped(guard);i++)await wait(100);}catch{}
  await stopOwned(guard);report.guardDiagnostic=guard.diagnostic||guard.spawnFailure||'';
  const ledger=path.join(authority,'ledger.bin'),before=readBounded(ledger,8*1024*1024),commit=lastCommit(ledger);
  // A one-shot lab restart verifies the pinned files and HMAC ledger, then quarantines BEFORE
  // starting a worker or MC. It must not silently load the sample a second time.
  const audit=runGuard();const auditEnd=performance.now()+30000;while(!stopped(audit)&&performance.now()<auditEnd)await wait(100);
  if(!stopped(audit)){await stopOwned(audit);throw Error('LAB_LEDGER_REVALIDATION_TIMEOUT');}
  report.STATE_INTACT=audit.exitCode===0&&readBounded(ledger,8*1024*1024).equals(before)&&commit?.state?.avatar===true&&commit.state.recovery===true;
  report.combatAcceptance=verdict({...report,opponentLoaded:report.attackAttempted,attackConfirmed:confirmedEngagement(report.survival,{runId,profile,instrumented}),windows:report.windows,coreModified:audit.exitCode!==0});
  report.quarantine=readJSON(path.join(authority,'quarantine.json'));report.lastCommit=commit;
  report.result=report.attackAttempted?'ATTACK_ATTEMPT_OBSERVED':'BOOTSTRAP_OR_ARENA_BLOCKED';
  report.evidenceNote='MC proof is an untrusted observation; STATE_INTACT also requires independent outer HMAC revalidation. No host recovery or playable restoration is inferred from quarantine.';
 }catch(e){report.error=String(e.message).slice(0,1800);if(!intentionalStop&&guard&&stopped(guard))report.crashed=true;process.exitCode=1;}
 finally{if(windowProbe&&!stopped(windowProbe))windowProbe.kill();report.combatAcceptance ||= verdict({crashed:report.crashed,nativeFailure:report.nativeFailure,survival:report.survival,windows:report.windows||windows});if(!report.combatAcceptance.accepted)process.exitCode=1;try{await stopOwned(guard);}catch(e){report.stopError=e.message;process.exitCode=1;}fs.mkdirSync(destination,{recursive:true});fs.writeFileSync(path.join(destination,'foreign-sword-result.json'),JSON.stringify(report,null,2));process.stdout.write(JSON.stringify({result:report.result,error:report.error,attackAttempted:report.attackAttempted,STATE_INTACT:report.STATE_INTACT,combatAcceptance:report.combatAcceptance})+'\n');}
})();
