'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {prepare}=require('../tools/prepare-runtime-kit.cjs');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function fixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'eff-kit-test-')),kit=path.join(dir,'kit'),libs=path.join(dir,'libraries');
 const write=(p,s)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,s);return p};
 const original=write(path.join(libs,'loader.jar'),'original-library');
 const jvm=write(path.join(dir,'jdk/bin/server/jvm.dll'),'fixture-not-a-real-jvm');
 const m={schema:1,version:'0.8.0',jvmSHA256:sha(jvm),mod:'mod.jar',story:'story.zip',workers:'workers.jar',gate:'eff-lifetime-gate.jar',agent:'eff-owned-argument-agent.jar',bootstrap:'eff-owned-origin-bootstrap.jar',native:'eff-native-hidden-boundary.dll',files:[],libraries:[{relativePath:'loader.jar',path:'patched.jar',originalSHA256:sha(original)}]};
 for(const name of [m.mod,m.story,m.workers,m.gate,m.agent,m.bootstrap,m.native,'patched.jar']){const p=write(path.join(kit,name),'synthetic-fixture-'+name);m.files.push({path:name,sha256:sha(p),bytes:fs.statSync(p).size})}
 const cfg={java:path.join(dir,'jdk/bin/java.exe'),host:{loader:'forge',distribution:'production',command:path.join(dir,'jdk/bin/java.exe'),env:{},libraryDirectory:libs,modJar:path.join(dir,'old.jar'),storyBundle:path.join(dir,'old.zip'),args:['-cp',original,'-p',original,'-DlibraryDirectory='+libs,'--launchTarget','forgeclient','--fml.forgeVersion','47.4.20']}};
 const source=write(path.join(dir,'source.json'),JSON.stringify(cfg)),out=path.join(dir,'new.json');
 write(path.join(kit,'manifest.json'),JSON.stringify(m));return{dir,kit,libs,original,jvm,m,cfg,source,out};
}
const options={skip:process.platform!=='win32'||process.arch!=='x64'};
test('kit prepares a new configuration without launching or changing source libraries',options,()=>{
 const f=fixture(),before=fs.readFileSync(f.source),original=fs.readFileSync(f.original);
 assert.equal(prepare(f.source,f.kit,f.out).launched,false);
 assert.deepEqual(fs.readFileSync(f.source),before);assert.deepEqual(fs.readFileSync(f.original),original);
 const cfg=JSON.parse(fs.readFileSync(f.out));assert.equal(cfg.host.startupAgent.mechanism,'owned-native-transform-boundary-v2');
 assert.equal(cfg.host.args.filter(a=>a.startsWith('-javaagent:')).length,1);
 assert.equal(cfg.host.libraryOverrides[0].originalSHA256,sha(f.original));
 assert.throws(()=>prepare(f.source,f.kit,f.out),/OUTPUT_ALREADY_EXISTS/);
});
test('tampered component and mismatched JVM refuse configuration publication',options,()=>{
 const f=fixture();fs.appendFileSync(path.join(f.kit,f.m.agent),'tampered');
 assert.throws(()=>prepare(f.source,f.kit,f.out),/KIT_FILE_CHANGED/);assert.equal(fs.existsSync(f.out),false);
 const g=fixture();fs.appendFileSync(g.jvm,'changed');
 assert.throws(()=>prepare(g.source,g.kit,g.out),/PINNED_JVM_REQUIRED/);assert.equal(fs.existsSync(g.out),false);
});
test('existing agent and kit traversal cannot be silently incorporated',options,()=>{
 const f=fixture();f.cfg.host.args.unshift('-javaagent:unreviewed.jar');fs.writeFileSync(f.source,JSON.stringify(f.cfg));
 assert.throws(()=>prepare(f.source,f.kit,f.out),/CLEAN_LAUNCH_REQUIRED/);
 const g=fixture();g.m.files[0].path='../outside.jar';fs.writeFileSync(path.join(g.kit,'manifest.json'),JSON.stringify(g.m));
 assert.throws(()=>prepare(g.source,g.kit,g.out),/KIT_RELATIVE_PATH/);assert.equal(fs.existsSync(g.out),false);
});
