'use strict';
// A manual playground launcher. Never runs the automated combat harness or judges victory.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {provision}=require('../seal-runtime.cjs'),{inspectArtifact}=require('../artifact-policy.cjs');
const {request}=require('../control.cjs');
const {interactiveJvmArgs}=require('./manual-jvm-options.cjs');
const {readManualPreflight}=require('./manual-preparation-diagnostics.cjs');
const [source,destination,binary,sample,expected,profile]=process.argv.slice(2);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 if(!['foreverlove','pig2'].includes(profile)||!/^[a-f0-9]{64}$/.test(expected||''))throw Error('MANUAL_PROFILE_AND_HASH_REQUIRED');
 const artifact=inspectArtifact(sample);if(artifact.sha256!==expected)throw Error('SAMPLE_HASH_MISMATCH');
 const cfg=JSON.parse(fs.readFileSync(source,'utf8'));
  cfg.host.args=interactiveJvmArgs(cfg.host.args);
 cfg.researchLab=true;cfg.researchMode='observe-only';cfg.startupTimeout=240000;
 cfg.manualEvidenceRetention=true;
 cfg.host.researchMods=[{path:path.resolve(sample),sha256:expected,allowCapabilities:artifact.risks.map(x=>x.kind)}];
 cfg.host.args=cfg.host.args.filter(x=>!/^[-]Deff\.(entityGuardSelftest|entityGuardCase|pig2Lab|foreverLoveLab|labAttackTrace|guardedSelftest|managedSelftest|lifetimeSelftest|selftest|researchSelftest|manualCombat)=/.test(x));
 cfg.host.args.splice(cfg.host.args.indexOf('-cp'),0,'-Deff.manualCombat='+profile);
 // The full courtyard includes a distant shard anchor. Two chunks can omit it
 // before combat; establish the complete original client roster at four chunks.
 cfg.host.args=cfg.host.args.filter(x=>!x.startsWith('-Deff.renderDistance='));
 cfg.host.args.splice(cfg.host.args.indexOf('-cp'),0,'-Deff.renderDistance=4');
 const input=path.resolve(destination)+'-input.json';
 fs.writeFileSync(input,JSON.stringify(cfg,null,2),{flag:'wx'});
 const sealed=provision(input,destination,binary,{lowIntegrityHost:true,externalControlOnly:true});
 const manifest=JSON.parse(fs.readFileSync(sealed.manifest,'utf8'));
 const log=fs.openSync(path.join(destination,'manual-guard.log'),'wx');
 const guard=spawn(sealed.guard,[sealed.manifest,sealed.pin],{detached:true,windowsHide:true,stdio:['ignore',log,log]});
 await new Promise((resolve,reject)=>{guard.once('spawn',resolve);guard.once('error',reject);});
 guard.unref();fs.closeSync(log);
 fs.writeFileSync(path.join(destination,'manual-launch-receipt.json'),JSON.stringify({profile,guardPid:guard.pid,manifestFile:sealed.manifest,
  automaticAttack:false,automaticVerdict:false,automaticHarnessTeardown:false,startedAtUnixMs:Date.now()},null,2),{flag:'wx'});
 let prepared=false;
 const readyFile=path.join(manifest.config.host.cwd,'manual-combat-ready.json');
 const boundFile=path.join(manifest.config.host.cwd,'manual-scene-bound.json');
 const traceFile=path.join(manifest.config.host.cwd,'manual-scene-trace.jsonl');
 const end=Date.now()+240000;
 while(Date.now()<end){
   // A recorded pre-world host exit is terminal for this candidate. Do not wait
   // for a readiness timeout or launch a replacement to hide startup failure.
   const faultFile=path.join(manifest.config.directory,'host-fault.json');
   if(fs.existsSync(faultFile)){
    const fault=JSON.parse(fs.readFileSync(faultFile,'utf8'));
    if(fault.reason==='process-exited'&&fault.initialized===false)
     throw Error('MANUAL_HOST_EXITED_BEFORE_READY:'+String(fault.hostExitCode));
   }
  if(!prepared)try{
   const result=await request(manifest.config.directory,'execute','disable control.tether; disable event.possess');
   prepared=Number.isSafeInteger(result.snapshot?.revision);
  }catch{}
   for(const problem of ['manual-combat-error.json','manual-observer-error.json','manual-first-structural-loss.json','manual-runtime-fault.json'])
   if(fs.existsSync(path.join(manifest.config.host.cwd,problem)))throw Error('MANUAL_BASELINE_NOT_READY:'+problem);
  if(prepared&&fs.existsSync(readyFile)&&fs.existsSync(boundFile)&&fs.existsSync(traceFile)){
   const ready=JSON.parse(fs.readFileSync(readyFile,'utf8'));
   const bound=JSON.parse(fs.readFileSync(boundFile,'utf8'));
   if(bound.pid!==ready.pid||bound.count!==ready.sceneEntities.length+1||bound.originalsFrozen!==true)
    throw Error('MANUAL_SCENE_BINDING_MISMATCH');
   const size=fs.statSync(traceFile).size,tail=Buffer.alloc(Math.min(size,262144));
   const fd=fs.openSync(traceFile,'r');try{fs.readSync(fd,tail,0,tail.length,size-tail.length);}finally{fs.closeSync(fd);}
   const rows=tail.toString('utf8').split('\n');
   let baseline=null;try{baseline=JSON.parse(rows.at(-2));}catch{}
   if(!baseline||baseline.pid!==ready.pid||baseline.structuralFailureLatched!==false
       ||baseline.server?.failed!==false||baseline.serverAgeMs<0||baseline.serverAgeMs>5000
        ||baseline.client?.length!==bound.count||baseline.server?.entities?.length!==bound.count
        ||!(baseline.renderRoute?.candidates>0&&baseline.renderRoute?.frustum>0&&baseline.renderRoute?.dispatch>0)
        ||!baseline.client.some(entity=>entity.ownedDrawReturns>0)){await wait(1000);continue;}
    // New render-event builds must prove the actual callback boundary is reached.
    // Older immutable recordings without this diagnostic remain readable.
    if(baseline.client.some(entity=>entity.renderEvents)
        &&!baseline.client.some(entity=>entity.ownedDrawReturns>0&&entity.renderEvents?.callbacks>0)){
      await wait(1000);continue;
    }
    const originalPlayers=baseline.client.filter(entity=>entity.entityClass==='net.minecraft.client.player.LocalPlayer');
    if(originalPlayers.length!==1||originalPlayers[0].lifetimeClaimed!==true)
      throw Error('MANUAL_ORIGINAL_PLAYER_NOT_PROTECTED');
   console.log(JSON.stringify({status:'READY_FOR_USER',profile,pid:ready.pid,targetUUID:ready.targetUUID,
    sceneEntityCount:ready.sceneEntities?.length,observedOriginalCount:bound.count,
    attackAttempted:ready.attackAttempted,readyFile,boundFile}));return;
  }
  await wait(1000);
 }
 console.error('MANUAL_PREFLIGHT_DIAGNOSTIC '+JSON.stringify(readManualPreflight(manifest.config.host.cwd)));
 throw Error('MANUAL_PREPARATION_TIMEOUT_GAME_NOT_AUTOMATICALLY_CLOSED');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
