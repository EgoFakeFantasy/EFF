'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../..');
const java=path.resolve(root,'../output/eff-mc1201-tools/jdk/jdk-17.0.20.1+1/bin');
const gson=path.join(root,'output/eff-local-native-20261104/forge-client/libraries/com/google/code/gson/gson/2.10.1/gson-2.10.1.jar');
const out=fs.mkdtempSync(path.join(root,'output/eff-local-native-20261104/manual-operation-test-'));
const source=path.join(root,'mc-1.20.1/src/main/java/eff/minecraft/lab/AttackTraceBridge.java');
function run(tool,args){
 const r=cp.spawnSync(path.join(java,tool+'.exe'),args,{encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:1024*1024});
 fs.appendFileSync(path.join(out,'test.log'),(r.stdout||'')+(r.stderr||''));
 if(r.error)throw r.error;if(r.status!==0)throw Error((r.stderr||r.stdout||'').slice(-3000));return r.stdout.trim();
}
const probe=path.join(root,'mc-1.20.1/src/main/java/eff/minecraft/client/Pig2EngagementProbe.java');
run('javac',['-J-Xmx128m','-encoding','UTF-8','-cp',gson,'-d',out,source,path.join(__dirname,'ManualTraceTest.java'),path.join(__dirname,'ManualBurstTest.java'),
 probe,path.join(__dirname,'Pig2ObservationTest.java'),path.join(__dirname,'fixtures/kakiku/pig2mod/entity/Pig2.java')]);
const results=[];
for(const profile of ['','unknown','pig2','foreverlove'])results.push({profile,result:run('java',[
 '-Xmx96m','-Xverify:all','-Deff.manualCombat='+profile,'-cp',out+path.delimiter+gson,'ManualTraceTest'])});
for(const profile of ['','unknown','pig2','foreverlove'])results.push({profile,result:run('java',[
 '-Xmx96m','-Xverify:all','-Deff.manualCombat='+profile,'-cp',out+path.delimiter+gson,'ManualBurstTest'])});
results.push({profile:'synthetic-stage',result:run('java',['-Xmx96m','-Xverify:all','-cp',out+path.delimiter+gson,'eff.minecraft.client.Pig2ObservationTest'])});
const receipt={passed:true,sourceSHA256:crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),
 probeSHA256:crypto.createHash('sha256').update(fs.readFileSync(probe)).digest('hex'),results,
 scope:'Actual production observer positive/negative fixtures; no Minecraft or opponent execution; no combat acceptance'};
fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2));
console.log(JSON.stringify({receipt:path.join(out,'receipt.json'),results}));
