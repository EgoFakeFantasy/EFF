'use strict';
// Real existing C# Guardian + existing JVM workers, no MC or adversarial sample.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn,spawnSync}=require('node:child_process');
const {provision,sha}=require('../seal-runtime.cjs');
const [binary,guard,java,workerJar,output]=process.argv.slice(2).map(p=>path.resolve(p));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function alive(pid){try{process.kill(pid,0);return true;}catch{return false;}}
async function until(fn,ms=45000){const end=Date.now()+ms;while(Date.now()<end){const v=fn();if(v)return v;await wait(50);}throw Error('NATIVE_GUARDIAN_TIMEOUT');}
async function main(){
 if(fs.existsSync(output))throw Error('FRESH_DIRECTORY_REQUIRED');fs.mkdirSync(output,{recursive:true});
 const source=path.join(output,'source.json');fs.writeFileSync(source,JSON.stringify({java,workerJar}));
 const s=provision(source,path.join(output,'sealed'),guard),seal=JSON.parse(fs.readFileSync(s.manifest));
 const fixture=path.join(seal.payload,'rust-recovery-fixture.cjs');
 fs.writeFileSync(fixture,`require('./protected-child.cjs');const api=require.cache[require.resolve('./protected-child.cjs')].exports;
api.onReady=async c=>{
 const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
 if(c.durable.state.recovery)await c.transition({actor:'player',revision:c.durable.state.revision,source:'disable control.tether; disable event.possess; disable authority.recovery'});
 const out=path.join(c.directory,'descendants-'+process.pid+'.json');
 cp.spawn(process.execPath,['-e',"const cp=require('node:child_process'),p=cp.spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});require('node:fs').writeFileSync(process.argv[1],JSON.stringify({child:process.pid,grandchild:p.pid}));setInterval(()=>{},1000)",out],{stdio:'ignore',windowsHide:true});
 for(let i=0;i<100&&!fs.existsSync(out);i++)await new Promise(r=>setTimeout(r,20));
 fs.writeFileSync(path.join(c.directory,'proof-'+process.pid+'.json'),JSON.stringify({pid:process.pid,guard:process.ppid,descendants:JSON.parse(fs.readFileSync(out)),snapshot:await c.snapshot()}));
};`);
 seal.child=fixture;seal.files.push({path:fixture,sha256:sha(fixture),size:fs.statSync(fixture).size});
 seal.trees.find(t=>t.root===seal.payload).entries.push(path.basename(fixture));
 fs.writeFileSync(s.manifest,JSON.stringify(seal));
 const state=path.join(output,'rust-state');fs.mkdirSync(state);
 const cfg=path.join(output,'rust.json');fs.writeFileSync(cfg,JSON.stringify({schema:1,guard:s.guard,guard_sha256:sha(s.guard),guard_config_sha256:sha(s.guard+'.config'),manifest:s.manifest,manifest_sha256:sha(s.manifest),directory:state,max_generations:2}));
 const pin=sha(cfg),init=spawnSync(binary,['--init',cfg,pin],{encoding:'utf8',windowsHide:true});
 assert.equal(init.status,0,init.stderr);
 const p=spawn(binary,['--run',cfg,pin],{stdio:['ignore','pipe','pipe'],windowsHide:true});
 let events='',errors='';p.stdout.on('data',b=>events+=b);p.stderr.on('data',b=>errors+=b);
 const starts=()=>events.split(/\r?\n/).filter(s=>s.startsWith('{')).map(s=>JSON.parse(s)).filter(e=>e.event==='generation-start');
 const proofs=()=>fs.readdirSync(seal.config.directory).filter(n=>/^proof-\d+\.json$/.test(n)).map(n=>JSON.parse(fs.readFileSync(path.join(seal.config.directory,n))));
 const pids=proof=>[proof.pid,proof.guard,proof.snapshot.runtime.policy.pid,proof.snapshot.runtime.execution.pid,proof.descendants.child,proof.descendants.grandchild];
 try{
  const first=await until(()=>proofs()[0]);await until(()=>starts().length===1);
  assert.ok(pids(first).every(alive));assert.equal(first.snapshot.fields['authority.recovery.active'],false);
  process.kill(starts()[0].pid);
  const second=await until(()=>proofs().find(v=>v.pid!==first.pid));await until(()=>starts().length===2);
  await until(()=>pids(first).every(id=>!alive(id)));assert.ok(pids(second).every(alive));
  assert.equal(second.snapshot.fields['authority.recovery.active'],false);
  assert.notEqual(starts()[0].pid,starts()[1].pid);
  // Root termination closes its non-inherited Job and must drain all descendants.
  process.kill(p.pid);await until(()=>!alive(p.pid));await until(()=>pids(second).every(id=>!alive(id))&&!alive(starts()[1].pid));
  const ledger=JSON.parse(fs.readFileSync(path.join(state,'rust-generations.json')));assert.equal(ledger.entries.length,2);
  const reopened=spawnSync(binary,['--run',cfg,pin],{encoding:'utf8',windowsHide:true,timeout:20000});assert.equal(reopened.status,2);assert.match(reopened.stderr,/GENERATION_BUDGET/);
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({native:true,realGuardian:true,realJvmWorkers:true,rustChildReplacement:true,oldCompleteTreeStopped:true,rootCrashStopsCompleteTree:true,revocationRetained:true,durableBudget:true,actualMC:false,actualOpponent:false,first,second},null,2));
  console.log('REAL_GUARDIAN_RUST_RECOVERY_OK');
 }finally{
  if(alive(p.pid)){process.kill(p.pid);await until(()=>!alive(p.pid));}
  fs.writeFileSync(path.join(output,'events.log'),events);fs.writeFileSync(path.join(output,'stderr.log'),errors);
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
