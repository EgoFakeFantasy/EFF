"use strict";
// Explicit disposable lab only: no third-party JAR is bundled or modified.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {provision,sha}=require('../seal-runtime.cjs');
const [source,destination,binary,opponent,expected]=process.argv.slice(2);
if(!expected||!/^[a-f0-9]{64}$/.test(expected)||sha(opponent)!==expected)throw Error('OPPONENT_HASH_REQUIRED');
const cfg=JSON.parse(fs.readFileSync(source,'utf8'));cfg.researchLab=true;
cfg.host.researchMods=[{path:path.resolve(opponent),sha256:expected}];
cfg.host.args=cfg.host.args.filter(x=>!/^-[D]eff\.(entityGuardSelftest|entityGuardCase|guardedSelftest|pig2Lab)=/.test(x));
cfg.host.args.splice(cfg.host.args.indexOf('-cp'),0,'-Deff.pig2Lab=true');
const input=path.resolve(destination)+'-input.json';fs.writeFileSync(input,JSON.stringify(cfg),{flag:'wx'});
let sealed;try{sealed=provision(input,destination,binary);}finally{fs.unlinkSync(input);}
const manifest=JSON.parse(fs.readFileSync(sealed.manifest,'utf8')),game=manifest.config.host.cwd,authority=manifest.config.directory;
const events=()=>{const p=path.join(authority,'guard-events.jsonl');return fs.existsSync(p)?fs.readFileSync(p,'utf8').trim().split('\n').filter(Boolean).map(x=>JSON.parse(x)):[];};
const proofs=()=>{const dir=path.join(game,'entity-guard-proof');return fs.existsSync(dir)?fs.readdirSync(dir).filter(x=>x.endsWith('.json')).map(x=>JSON.parse(fs.readFileSync(path.join(dir,x),'utf8'))):[];};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const launcher=spawn('cmd.exe',['/d','/c',sealed.launcher],{stdio:['ignore','pipe','pipe'],windowsHide:true});launcher.stdout.resume();let stderr='';launcher.stderr.on('data',b=>stderr+=b);
(async()=>{const result={schema:1,opponentSHA256:expected,modelInferenceVerified:false,stockOpponent:true};
 try{
  const end=Date.now()+210000;
  while(Date.now()<end){
   const records=proofs(),ev=events();
   if(records.some(x=>x.check==='failure')){result.status='native-lab-failure';break;}
   if(ev.some(x=>x.type==='stopped')||launcher.exitCode!==null||launcher.signalCode!==null){result.status='guard-stopped';break;}
   if(records.some(x=>x.check==='observation-window-complete')){result.status='observation-window-complete';break;}
   if(ev.filter(x=>x.type==='controller-start').length>=4){result.status='recovery-window-limit';break;}
   await wait(250);
  }
  result.status||='timeout';result.proofs=proofs();result.events=events();
  result.opponentSpawned=result.proofs.some(x=>x.check==='opponent-spawned');
  result.observedRecovery=result.proofs.some(x=>x.check==='ready'&&x.guardGeneration>1);
  result.combatVictoryVerified=false;
 }catch(e){result.error=e.stack;process.exitCode=1;}
 finally{
  const pid=events().find(x=>x.type==='guard-ready')?.detail.pid;
  if(pid)try{process.kill(pid);}catch{}
  await Promise.race([new Promise(r=>launcher.once('exit',r)),wait(5000)]);
  result.events=events();result.stderr=stderr;
  fs.writeFileSync(path.join(destination,'pig2-native-result.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({status:result.status,opponentSpawned:result.opponentSpawned,observedRecovery:result.observedRecovery,error:result.error}));
 }
})();
