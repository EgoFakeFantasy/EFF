'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {baselineIdentity,checkBaseline}=require('./baseline-identity.cjs');
test('unchanged config paths do not hide replacement code or added class files',t=>{
 // Retain fixtures with the rest of the evidence; this workflow has no cleanup phase.
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'eff-baseline-'));
 const put=(p,s)=>{const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,s);return f;};
 const java=put('jdk/bin/java.exe','java'),workerJar=put('workers.jar','workers'),guard=put('guard.exe','guard'),probe=put('WindowProbe.exe','probe');
 const lib=put('jdk/lib/modules','modules'),conf=put('jdk/conf/security','security'),cls=put('classes/Example.class','class');
 const mapping=put('mapping.json','map'),native=put('native/runtime.dll','native'),source=put('source.json',JSON.stringify({java,workerJar,host:{command:java,args:['-cp',path.dirname(cls),'-p',lib,'-Djava.library.path='+path.dirname(native)],modRefmap:mapping,env:{MOD_CLASSES:'eff%%'+path.dirname(cls)}}}));
 const initial=baselineIdentity(source,guard);assert.equal(initial,baselineIdentity(source,guard));
 for(const f of [java,workerJar,guard,probe,lib,conf,cls,mapping,native]){const saved=fs.readFileSync(f);fs.writeFileSync(f,Buffer.concat([saved,Buffer.from('changed')]));assert.notEqual(initial,baselineIdentity(source,guard),f);fs.writeFileSync(f,saved);}
 put('classes/Added.class','added');assert.notEqual(initial,baselineIdentity(source,guard));
 const installed=put('production/libraries/forge.jar','forge'),mod=put('production/eff.jar','eff'),story=put('production/story.zip','story');
 const config=JSON.parse(fs.readFileSync(source,'utf8'));Object.assign(config.host,{distribution:'production',libraryDirectory:path.dirname(installed),modJar:mod,storyBundle:story});fs.writeFileSync(source,JSON.stringify(config));
 const production=baselineIdentity(source,guard);
 for(const f of [installed,mod,story]){const saved=fs.readFileSync(f);fs.writeFileSync(f,'tampered');assert.notEqual(production,baselineIdentity(source,guard),f);fs.writeFileSync(f,saved);}
});
test('freshness, exact artifacts, run identity and Low boundary are mandatory',()=>{
 const id='a'.repeat(64),now=100000,good={ok:true,oldWholeJobDrained:true,runtimeIdentitySHA256:id,baselineRunId:'12345678-1234-1234-1234-123456789abc',startedAtUnixMs:90000,finishedAtUnixMs:95000,lowIntegrityHost:true};
 assert.equal(checkBaseline(good,id,{now,maxAgeMs:10000,requireContinuous:false}).ready,true);
 assert.equal(checkBaseline(good,id,{now,maxAgeMs:10000}).reason,'REVIEWED_CONTINUOUS_BASELINE_REQUIRED');
 for(const change of [{finishedAtUnixMs:89999},{finishedAtUnixMs:100001},{finishedAtUnixMs:1},{runtimeIdentitySHA256:'b'.repeat(64)},{baselineRunId:''},{lowIntegrityHost:false},{ok:false}])assert.equal(checkBaseline({...good,...change},id,{now,maxAgeMs:10000,requireContinuous:false}).ready,false);
});
