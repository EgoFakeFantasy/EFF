'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {baselineIdentity,checkBaseline}=require('./baseline-identity.cjs');
test('unchanged config paths do not hide replacement code or added class files',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'eff-baseline-'));t.after(()=>{const resolved=fs.realpathSync(root),base=fs.realpathSync(os.tmpdir());if(path.dirname(resolved)!==base||!path.basename(resolved).startsWith('eff-baseline-'))throw Error('UNSAFE_TEST_CLEANUP');fs.rmSync(resolved,{recursive:true,force:true});});
 const put=(p,s)=>{const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,s);return f;};
 const java=put('jdk/bin/java.exe','java'),workerJar=put('workers.jar','workers'),guard=put('guard.exe','guard');
 const lib=put('jdk/lib/modules','modules'),conf=put('jdk/conf/security','security'),cls=put('classes/Example.class','class');
 const mapping=put('mapping.json','map'),native=put('native/runtime.dll','native'),source=put('source.json',JSON.stringify({java,workerJar,host:{command:java,args:['-cp',path.dirname(cls),'-p',lib,'-Djava.library.path='+path.dirname(native)],modRefmap:mapping,env:{MOD_CLASSES:'eff%%'+path.dirname(cls)}}}));
 const initial=baselineIdentity(source,guard);assert.equal(initial,baselineIdentity(source,guard));
 for(const f of [java,workerJar,guard,lib,conf,cls,mapping,native]){const saved=fs.readFileSync(f);fs.writeFileSync(f,Buffer.concat([saved,Buffer.from('changed')]));assert.notEqual(initial,baselineIdentity(source,guard),f);fs.writeFileSync(f,saved);}
 put('classes/Added.class','added');assert.notEqual(initial,baselineIdentity(source,guard));
});
test('freshness, exact artifacts, run identity and Low boundary are mandatory',()=>{
 const id='a'.repeat(64),now=100000,good={ok:true,oldWholeJobDrained:true,runtimeIdentitySHA256:id,baselineRunId:'12345678-1234-1234-1234-123456789abc',startedAtUnixMs:90000,finishedAtUnixMs:95000,lowIntegrityHost:true};
 assert.equal(checkBaseline(good,id,{now,maxAgeMs:10000}).ready,true);
 for(const change of [{finishedAtUnixMs:89999},{finishedAtUnixMs:100001},{finishedAtUnixMs:1},{runtimeIdentitySHA256:'b'.repeat(64)},{baselineRunId:''},{lowIntegrityHost:false},{ok:false}])assert.equal(checkBaseline({...good,...change},id,{now,maxAgeMs:10000}).ready,false);
});
