'use strict';
// Finite API-prevention test, explicitly not a native/JNI or third-party-mod victory.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {provision}=require('../seal-runtime.cjs'),{request}=require('../control.cjs'),{stableWindow}=require('./window-preflight.cjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const [source,destination,binary]=process.argv.slice(2);let guard,probe,probeError='',armed=false,stopping=false;const windows=[],report={ok:false,scope:'finite-entity-api-prevention',opponentTest:false};
async function stop(p){if(!p||p.exitCode!==null||p.signalCode!==null)return;p.kill();await Promise.race([new Promise(r=>p.once('exit',r)),wait(5000)]);}
(async()=>{try{
 const cfg=JSON.parse(fs.readFileSync(source,'utf8'));assert.ok(!cfg.host.researchMods?.length,'CLEAN_ONLY');
 cfg.host.args=cfg.host.args.filter(x=>!/^[-]Deff\.(entityGuardSelftest|entityGuardCase|pig2Lab|foreverLoveLab|guardedSelftest|managedSelftest|labAttackTrace|lifetimeSelftest)=/.test(x));
 cfg.host.args.splice(cfg.host.args.indexOf('-cp'),0,'-Deff.lifetimeSelftest=true');
 const input=path.resolve(destination)+'-input.json';fs.writeFileSync(input,JSON.stringify(cfg),{flag:'wx'});
 let sealed;try{sealed=provision(input,destination,binary,{lowIntegrityHost:true});}finally{fs.unlinkSync(input);}
 const m=JSON.parse(fs.readFileSync(sealed.manifest)),game=m.config.host.cwd,authority=m.config.directory;
 const read=name=>{const f=path.join(game,name+'.json');return fs.existsSync(f)?JSON.parse(fs.readFileSync(f)):null;};
 guard=spawn(sealed.guard,[sealed.manifest,sealed.pin],{windowsHide:true,stdio:['ignore','ignore','pipe']});let diagnostic='';guard.stderr.on('data',b=>diagnostic=(diagnostic+b).slice(-2000));
 const end=performance.now()+240000;let launchPid=0,buffer='';
 while(performance.now()<end){
  const failure=path.join(game,'entity-guard-proof','1-bootstrap-failure.json');
  if(fs.existsSync(failure)){const detail=JSON.parse(fs.readFileSync(failure));throw Error('BOOTSTRAP:'+detail.stage+':'+detail.message);}
  if(guard.exitCode!==null||guard.signalCode!==null)throw Error('GUARD_EXIT:'+diagnostic);
  if(probeError)throw Error(probeError);
  if(read('lifetime-ready')&&!probe){
   launchPid=(await request(authority,'snapshot')).runtime.hostPid;
   probe=spawn(path.join(path.dirname(binary),'WindowProbe.exe'),['--child-java',String(launchPid),m.config.host.command],{windowsHide:true,stdio:['ignore','pipe','ignore']});
   probe.on('error',()=>probeError='PROBE_START');probe.on('exit',()=>{if(!stopping)probeError='PROBE_EXIT';});
   probe.stdout.on('data',b=>{buffer+=b;if(buffer.length>65536){probeError='PROBE_BUDGET';return;}let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);try{windows.push(JSON.parse(line));if(windows.length>180)probeError='PROBE_BUDGET';}catch{probeError='PROBE_JSON';}}});
  }
  if(!armed&&windows.length){const stable=stableWindow(windows,launchPid);if(stable){report.preflightWindows=windows.slice();windows.splice(0,windows.length-3);fs.writeFileSync(path.join(game,'lifetime-arm.json'),'{}',{flag:'wx'});armed=true;}}
  const result=read('lifetime-result');if(result){report.native=result;assert.equal(result.ok,true,result.error);assert.equal(result.sameObject,true);assert.ok(result.samples>=100&&result.elapsedMs>=31000&&result.maxGapMs<=2000);assert.equal(result.legalErasurePreserved,true);
   assert.ok(windows.length>=31);const first=windows[0];assert.equal(first.pid,result.mcPid);
   assert.ok(windows.every(w=>w.alive&&w.responsive&&w.windowPresent&&w.pid===first.pid&&w.launchPid===launchPid&&w.windowHandle===first.windowHandle&&w.processStartedUtcTicks===first.processStartedUtcTicks));
   assert.ok(windows.at(-1).atMs-first.atMs>=30000);for(let i=1;i<windows.length;i++)assert.ok(windows[i].atMs-windows[i-1].atMs<=2000);
   const snapshot=await request(authority,'snapshot');assert.equal(snapshot.runtime.hostPid,launchPid);assert.equal(snapshot.runtime.defense.incidents,0);assert.equal(snapshot.outcome,'won');report.ok=true;break;
  }
  await wait(200);
 }
 if(!report.ok)throw Error('LIFETIME_NATIVE_TIMEOUT');
 }catch(e){report.error=e.stack;process.exitCode=1;}finally{stopping=true;await stop(probe);await stop(guard);report.windows=windows;fs.mkdirSync(destination,{recursive:true});fs.writeFileSync(path.join(destination,'lifetime-native-result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({ok:report.ok,error:report.error,scope:report.scope}));}
})();
