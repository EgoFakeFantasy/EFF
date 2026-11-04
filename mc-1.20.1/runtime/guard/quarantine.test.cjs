"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const {provision,sha}=require('../seal-runtime.cjs');
const java=process.env.EFF_TEST_JAVA,workerJar=process.env.EFF_TEST_WORKERS,guard=process.env.EFF_TEST_GUARD;
if(!java||!workerJar||!guard)throw Error('Java worker and guard test inputs required');
const alive=p=>{try{process.kill(p,0);return true;}catch{return false;}};
test('one-shot observer admission never replays the privileged deployment after controller exit',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'eff-quarantine-')),input=path.join(root,'source.json');fs.writeFileSync(input,JSON.stringify({java,workerJar}));
 const sealed=provision(input,path.join(root,'sealed'),guard),manifest=JSON.parse(fs.readFileSync(sealed.manifest,'utf8'));
 // Explicit test provisioning only. No third-party code or target mod is loaded.
 manifest.config.host={command:process.execPath,args:['-e','setInterval(()=>{},1000)'],cwd:manifest.config.directory,env:{}};
 manifest.config.admission={schema:1,hostMutation:'disabled',quarantineOnFault:true,mods:[]};
 const fixture=path.join(manifest.payload,'one-shot.cjs');fs.writeFileSync(fixture,`const C=require('./controller.cjs').Controller;const original=C.prototype.start;C.prototype.start=async function(){try{return await original.call(this);}catch(e){require('node:fs').writeFileSync(require('node:path').join(this.directory,'start-error-'+this.config.protectedGeneration+'.json'),JSON.stringify({error:e.message,closed:this.closed,restored:this.restored,admission:this.config.admission,host:!!this.config.host}));throw e;}};require('./protected-child.cjs');const api=require.cache[require.resolve('./protected-child.cjs')].exports;api.onReady=async c=>{const s=await c.snapshot();require('node:fs').writeFileSync(require('node:path').join(c.directory,'one-shot-proof.json'),JSON.stringify(s));process.exit(17);};`);
 manifest.child=fixture;manifest.files.push({path:fixture,sha256:sha(fixture),size:fs.statSync(fixture).size});manifest.trees.find(x=>x.root===manifest.payload).entries.push('one-shot.cjs');fs.writeFileSync(sealed.manifest,JSON.stringify(manifest));
 const child=spawn(sealed.guard,[sealed.manifest,sha(sealed.manifest)],{stdio:['ignore','pipe','pipe'],windowsHide:true});child.stdout.resume();let stderr='';child.stderr.on('data',x=>stderr+=x);
 t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){child.kill();await new Promise(r=>child.once('exit',r));}const resolved=fs.realpathSync(root),base=fs.realpathSync(os.tmpdir());assert.equal(path.dirname(resolved),base);assert.match(path.basename(resolved),/^eff-quarantine-/);fs.rmSync(resolved,{recursive:true,force:true});});
 const timer=setTimeout(()=>child.kill(),20000);await new Promise(r=>child.once('exit',r));clearTimeout(timer);
 if(child.exitCode!==0){for(const file of fs.readdirSync(manifest.config.directory))if(file.endsWith('.json')||file.endsWith('.jsonl'))console.log(file,fs.readFileSync(path.join(manifest.config.directory,file),'utf8'));}
 assert.equal(child.exitCode,0,stderr);assert.equal(JSON.parse(fs.readFileSync(path.join(manifest.config.directory,'quarantine.json'),'utf8')).reason,'HOST_CAPABILITIES_QUARANTINED');
 const events=fs.readFileSync(path.join(manifest.config.directory,'guard-events.jsonl'),'utf8').trim().split('\n').map(x=>JSON.parse(x));assert.equal(events.filter(x=>x.type==='controller-start').length,2);assert.ok(events.some(x=>x.type==='guard-stop'&&x.detail.graceful===true));assert.ok(events.some(x=>x.type==='job-drained'&&x.detail.active===0));
 const proof=JSON.parse(fs.readFileSync(path.join(manifest.config.directory,'one-shot-proof.json'),'utf8'));for(const role of ['policy','execution'])assert.equal(alive(proof.runtime[role].pid),false);
 assert.equal(proof.runtime.admission.hostMutation,'disabled');assert.equal(proof.fields['authority.recovery.active'],true,'fixed story genesis remains valid');assert.ok(fs.statSync(path.join(manifest.config.directory,'ledger.bin')).size>0);
});
