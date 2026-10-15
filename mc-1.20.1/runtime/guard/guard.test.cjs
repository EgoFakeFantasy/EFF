"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn,spawnSync}=require('node:child_process');const {provision,sha}=require('../seal-runtime.cjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const java=process.env.EFF_TEST_JAVA,workerJar=process.env.EFF_TEST_WORKERS,guard=process.env.EFF_TEST_GUARD;
if(!java||!workerJar||!guard)throw Error('Supply EFF_TEST_JAVA, EFF_TEST_WORKERS and EFF_TEST_GUARD');
function alive(pid){try{process.kill(pid,0);return true;}catch{return false;}}
async function until(fn,ms=25000){const end=Date.now()+ms;while(Date.now()<end){const value=fn();if(value)return value;await wait(30);}throw Error('GUARD_TEST_TIMEOUT');}
function run(s){const p=spawn(s.guard,[s.manifest,s.pin],{stdio:['ignore','pipe','pipe'],windowsHide:true});let error='';p.stderr.on('data',b=>error+=b);p.stdout.resume();p.readError=()=>error;return p;}
async function stopped(p){if(p.exitCode!==null||p.signalCode!==null)return;await new Promise(r=>p.once('exit',r));}
test('native code locks, outer ledger and complete process-tree recovery',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'eff-native-guard-')),source=path.join(root,'source.json');
 fs.writeFileSync(source,JSON.stringify({java,workerJar,directory:path.join(root,'unused')}));
 const s=provision(source,path.join(root,'sealed'),guard),seal=JSON.parse(fs.readFileSync(s.manifest,'utf8'));
 const originalPin=s.pin;
 const child=path.join(seal.payload,'fixture.cjs');
 fs.writeFileSync(child,`require('./protected-child.cjs');module.exports=require.cache[require.resolve('./protected-child.cjs')].exports;
module.exports.onReady=async(c,g)=>{if(g===1)await c.transition({actor:'player',revision:0,source:'disable control.tether; disable event.possess; disable authority.recovery'});let rollbackDenied=false;try{await c.config.store.commit(c.durable.commit,{...c.durable,commit:c.durable.commit+1,state:{...c.durable.state,recovery:true}});}catch(e){rollbackDenied=e.message==='REVOCATION_ROLLBACK';}const snapshot=await c.snapshot();require('node:fs').writeFileSync(require('node:path').join(c.directory,'proof-'+g+'.json'),JSON.stringify({pid:process.pid,generation:g,snapshot,rollbackDenied}));};`);
 seal.child=child;seal.files.push({path:child,sha256:sha(child),size:fs.statSync(child).size});seal.trees[0].entries.push('fixture.cjs');fs.writeFileSync(s.manifest,JSON.stringify(seal));s.pin=sha(s.manifest);
 let p=run(s);const checks=[];t.after(async()=>{if(p.exitCode===null&&p.signalCode===null){p.kill();await stopped(p);}const resolved=fs.realpathSync(root),base=fs.realpathSync(os.tmpdir());if(path.dirname(resolved)!==base||!path.basename(resolved).startsWith('eff-native-guard-'))throw Error('UNSAFE_TEST_CLEANUP');fs.rmSync(resolved,{recursive:true,force:true});});
 const file=g=>path.join(seal.config.directory,'proof-'+g+'.json');
 const first=await until(()=>fs.existsSync(file(1))&&JSON.parse(fs.readFileSync(file(1),'utf8')));
 await t.test('two JVMs run under the supervised controller and commit revocation to the outer ledger',()=>{assert.equal(first.snapshot.fields['authority.recovery.active'],false);assert.ok(first.snapshot.runtime.policy.pid);assert.ok(first.snapshot.runtime.execution.pid);checks.push('outer-commit');});
 await t.test('the outer ledger independently refuses a controller proposal that restores revoked authority',()=>{assert.equal(first.rollbackDenied,true);checks.push('outer-revocation-fence');});
 await t.test('a second guardian cannot take the same ledger or truncate it',()=>{
  const result=spawnSync(s.guard,[s.manifest,s.pin],{encoding:'utf8',windowsHide:true,timeout:20000});assert.equal(result.status,2);assert.ok(alive(first.pid));checks.push('single-outer-writer');
 });
 await t.test('Windows sharing rules reject overwrite, deletion and replacement of executing code',()=>{
  for(const f of [path.join(seal.payload,'controller.cjs'),path.join(seal.payload,'workers.jar'),s.manifest,path.join(seal.payload,'eff-guard.exe.config'),path.join(seal.config.directory,'ledger.bin'),path.join(seal.config.directory,'ledger-head.bin'),path.join(seal.config.directory,'ledger-key.dpapi')]){
   assert.throws(()=>fs.writeFileSync(f,'changed'),e=>['EBUSY','EACCES','EPERM'].includes(e.code));assert.throws(()=>fs.unlinkSync(f));assert.throws(()=>fs.renameSync(f,f+'.replaced'));
  }checks.push('os-write-delete-rename-blocked');
 });
 await t.test('killing the controller drains the old job before restarting with the same durable revocation',async()=>{
  process.kill(first.pid);const second=await until(()=>fs.existsSync(file(2))&&JSON.parse(fs.readFileSync(file(2),'utf8')));
  assert.notEqual(second.pid,first.pid);assert.equal(second.snapshot.fields['authority.recovery.active'],false);
  assert.equal(alive(first.snapshot.runtime.policy.pid),false);assert.equal(alive(first.snapshot.runtime.execution.pid),false);
  const events=fs.readFileSync(path.join(seal.config.directory,'guard-events.jsonl'),'utf8');assert.match(events,/job-drained/);assert.match(events,/"active":0/);checks.push('controller-recovery-and-no-orphans');
 });
 let second=JSON.parse(fs.readFileSync(file(2),'utf8'));
 await t.test('killing the outer guard closes its kernel job and stops all owned JVMs',async()=>{
  p.kill();await stopped(p);await until(()=>!alive(second.pid)&&!alive(second.snapshot.runtime.policy.pid)&&!alive(second.snapshot.runtime.execution.pid));checks.push('guard-death-kills-descendants');
 });
 await t.test('offline truncation to an older authenticated ledger prefix is detected by its independent head',()=>{
  const ledger=path.join(seal.config.directory,'ledger.bin'),original=fs.readFileSync(ledger);fs.writeFileSync(ledger,original.subarray(0,4+original.readInt32LE(0)+32));
  const result=spawnSync(s.guard,[s.manifest,s.pin],{encoding:'utf8',windowsHide:true,timeout:20000});assert.equal(result.status,2);assert.match(result.stderr,/LEDGER_ROLLBACK_DETECTED/);fs.writeFileSync(ledger,original);checks.push('offline-ledger-rollback-rejected');
 });
 await t.test('a missing anti-rollback head never initializes a fresh ledger',()=>{
  const head=path.join(seal.config.directory,'ledger-head.bin');fs.renameSync(head,head+'.saved');try{const result=spawnSync(s.guard,[s.manifest,s.pin],{encoding:'utf8',windowsHide:true,timeout:20000});assert.equal(result.status,2);assert.equal(fs.existsSync(head),false);}finally{fs.renameSync(head+'.saved',head);}checks.push('missing-head-fails-closed');
 });
 await t.test('the launcher pins the CLR configuration before executing the guardian',()=>{
  const config=s.guard+'.config',saved=fs.readFileSync(config);fs.appendFileSync(config,' ');try{const result=spawnSync('cmd.exe',['/d','/c',s.launcher],{encoding:'utf8',windowsHide:true,timeout:20000,input:''});assert.notEqual(result.status,0);assert.match(result.stderr+result.stdout,/GUARD_CONFIG_HASH_MISMATCH/);}finally{fs.writeFileSync(config,saved);}checks.push('bootstrap-config-pin');
 });
 await t.test('the verified launcher successfully starts and cleanly stops a sealed process',()=>{
  const code=path.join(seal.payload,'stop-fixture.cjs'),savedManifest=fs.readFileSync(s.manifest),savedLauncher=fs.readFileSync(s.launcher,'utf8');
  fs.writeFileSync(code,`require('node:readline').createInterface({input:process.stdin}).once('line',()=>{process.stdout.write(JSON.stringify({op:'stopped'})+'\\n');});`);
  const once=JSON.parse(savedManifest);once.child=code;once.files.push({path:code,sha256:sha(code),size:fs.statSync(code).size});once.trees[0].entries.push('stop-fixture.cjs');fs.writeFileSync(s.manifest,JSON.stringify(once));fs.writeFileSync(s.launcher,savedLauncher.replace(originalPin,sha(s.manifest)));
  try{const result=spawnSync('cmd.exe',['/d','/c',s.launcher],{encoding:'utf8',windowsHide:true,timeout:20000,input:''});assert.equal(result.status,0,result.stderr);assert.match(fs.readFileSync(path.join(seal.config.directory,'guard-events.jsonl'),'utf8'),/guard-stop/);}finally{fs.writeFileSync(s.manifest,savedManifest);fs.writeFileSync(s.launcher,savedLauncher);fs.unlinkSync(code);}checks.push('verified-launcher-runs');
 });
 await t.test('tampered bootstrap code cannot be revived from an unchanged seal',()=>{
  fs.appendFileSync(path.join(seal.payload,'controller.cjs'),'\nthrow Error("poison")');const result=spawnSync(s.guard,[s.manifest,s.pin],{encoding:'utf8',windowsHide:true,timeout:20000});assert.equal(result.status,2);assert.match(result.stderr,/CODE_(SIZE|HASH)_MISMATCH/);checks.push('poisoned-code-refused');
 });
 await t.test('replacing the baseline itself does not recreate trust',()=>{
  fs.appendFileSync(s.manifest,' ');const result=spawnSync(s.guard,[s.manifest,s.pin],{encoding:'utf8',windowsHide:true,timeout:20000});assert.equal(result.status,2);assert.match(result.stderr,/SEAL_MISMATCH/);checks.push('baseline-replacement-refused');
 });
 if(process.env.EFF_GUARD_TEST_REPORT)fs.writeFileSync(process.env.EFF_GUARD_TEST_REPORT,JSON.stringify({ok:true,checks,first,second},null,2));
});
