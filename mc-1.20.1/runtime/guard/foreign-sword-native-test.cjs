"use strict";
// An opt-in disposable-VM experiment, not a production launcher or an immunity claim.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {provision}=require('../seal-runtime.cjs'),{inspectArtifact}=require('../artifact-policy.cjs'),{request}=require('../control.cjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const SAMPLE='3bf3ba852bbafec9f4440210d4084bb92ba9586c9a146ae03ddf003f17f1b5f8';
if(process.platform!=='win32'||process.env.EFF_DISPOSABLE_VM_LAB!=='1')throw Error('DISPOSABLE_WINDOWS_VM_REQUIRED');
const [source,destination,binary,sample]=process.argv.slice(2);
const report={schema:1,sampleSHA256:SAMPLE,modelInferenceVerified:false,attackAttempted:false,attackReturned:false,STATE_INTACT:false,HOST_RECOVERED:false,PLAYABLE_RESTORED:false};
let guard,sealed;
function runGuard(){const p=spawn(sealed.guard,[sealed.manifest,sealed.pin],{windowsHide:true,stdio:['ignore','pipe','pipe']});p.stdout.resume();p.stderr.on('data',b=>{p.diagnostic=((p.diagnostic||'')+b.toString()).slice(-2000);});p.on('error',e=>{p.spawnFailure=e.code||'GUARD_START_FAILED';});return p;}
const stopped=p=>p.exitCode!==null||p.signalCode!==null||p.spawnFailure;
async function stopOwned(p){if(!p||stopped(p))return;p.kill();for(let i=0;i<100&&!stopped(p);i++)await wait(50);if(!stopped(p))throw Error('OWNED_GUARD_STOP_TIMEOUT');}
function readJSON(file){if(!fs.existsSync(file))return null;if(fs.statSync(file).size>131072)throw Error('LAB_PROOF_BUDGET');return JSON.parse(fs.readFileSync(file,'utf8'));}
function lastCommit(file){const b=fs.readFileSync(file);if(b.length>8*1024*1024)throw Error('LAB_LEDGER_BUDGET');let at=0,last;while(at<b.length){if(at+4>b.length)throw Error('LAB_LEDGER_TRUNCATED');const n=b.readInt32LE(at);if(n<2||n>131072||at+4+n+32>b.length)throw Error('LAB_LEDGER_TRUNCATED');last=JSON.parse(b.subarray(at+4,at+4+n).toString('utf8')).body;at+=4+n+32;}return last;}
(async()=>{
 try{
  const artifact=inspectArtifact(sample);if(artifact.sha256!==SAMPLE)throw Error('LAB_SAMPLE_HASH_MISMATCH');
  const cfg=JSON.parse(fs.readFileSync(source,'utf8'));cfg.researchLab=true;cfg.researchMode='observe-only';cfg.startupTimeout=240000;
  cfg.host.researchMods=[{path:sample,sha256:SAMPLE,allowCapabilities:artifact.risks.map(x=>x.kind)}];
  cfg.host.args=cfg.host.args.filter(x=>!/^[-]Deff\.(entityGuardSelftest|entityGuardCase|pig2Lab|guardedSelftest|managedSelftest|foreverLoveLab)=/.test(x));
  cfg.host.args.splice(cfg.host.args.indexOf('-cp'),0,'-Deff.foreverLoveLab=true');
  const input=path.resolve(destination)+'-input.json';fs.writeFileSync(input,JSON.stringify(cfg),{flag:'wx'});
  try{sealed=provision(input,destination,binary,{lowIntegrityHost:true,externalControlOnly:true});}finally{fs.unlinkSync(input);}
  const manifest=JSON.parse(fs.readFileSync(sealed.manifest,'utf8')),authority=manifest.config.directory,proof=path.join(manifest.config.host.cwd,'entity-guard-proof');
  const read=name=>readJSON(path.join(proof,'1-'+name+'.json'));
  guard=runGuard();const end=performance.now()+600000;let startedAt=0;
  while(performance.now()<end&&!stopped(guard)){
   if(read('sword-attack-started')){report.attackAttempted=true;if(!startedAt)startedAt=performance.now();}
   if(read('sword-attack-returned'))report.attackReturned=true;
   const failed=read('failure');if(failed){report.nativeFailure=failed.error;break;}
   if(read('observation-window-complete')||startedAt&&performance.now()-startedAt>35000)break;
   await wait(250);
  }
  report.attackAttempted=!!read('sword-attack-started');report.attackReturned=!!read('sword-attack-returned');
  report.observation=read('sword-attack-returned');report.window=read('observation-window-complete');
  if(!stopped(guard))try{await request(authority,'stop');for(let i=0;i<100&&!stopped(guard);i++)await wait(100);}catch{}
  await stopOwned(guard);report.guardDiagnostic=guard.diagnostic||guard.spawnFailure||'';
  const ledger=path.join(authority,'ledger.bin'),before=fs.readFileSync(ledger),commit=lastCommit(ledger);
  // A one-shot lab restart verifies the pinned files and HMAC ledger, then quarantines BEFORE
  // starting a worker or MC. It must not silently load the sample a second time.
  const audit=runGuard();const auditEnd=performance.now()+30000;while(!stopped(audit)&&performance.now()<auditEnd)await wait(100);
  if(!stopped(audit)){await stopOwned(audit);throw Error('LAB_LEDGER_REVALIDATION_TIMEOUT');}
  report.STATE_INTACT=audit.exitCode===0&&fs.readFileSync(ledger).equals(before)&&commit?.state?.avatar===true&&commit.state.recovery===true;
  report.quarantine=readJSON(path.join(authority,'quarantine.json'));report.lastCommit=commit;
  report.result=report.attackAttempted?'ATTACK_ATTEMPT_OBSERVED':'BOOTSTRAP_OR_ARENA_BLOCKED';
  report.evidenceNote='MC proof is an untrusted observation; STATE_INTACT also requires independent outer HMAC revalidation. No host recovery or playable restoration is inferred from quarantine.';
 }catch(e){report.error=String(e.message).slice(0,1800);process.exitCode=1;}
 finally{try{await stopOwned(guard);}catch(e){report.stopError=e.message;process.exitCode=1;}fs.mkdirSync(destination,{recursive:true});fs.writeFileSync(path.join(destination,'foreign-sword-result.json'),JSON.stringify(report,null,2));process.stdout.write(JSON.stringify({result:report.result,error:report.error,attackAttempted:report.attackAttempted,STATE_INTACT:report.STATE_INTACT})+'\n');}
})();
