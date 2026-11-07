'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../../..'),out=fs.mkdtempSync(path.join(root,'output/eff-local-native-20261104/manual-journal-test-'));
const jdk=path.resolve(root,'../output/eff-mc1201-tools/jdk/jdk-17.0.20.1+1/bin');
for(const [exe,args]of [['javac',['-d',out,path.join(root,'mc-1.20.1/src/main/java/eff/minecraft/client/ManualTraceJournal.java'),path.join(__dirname,'JournalTest.java')]],['java',['-Xverify:all','-cp',out,'eff.minecraft.client.JournalTest',path.join(out,'journal')]]]){
 const r=cp.spawnSync(path.join(jdk,exe+'.exe'),args,{windowsHide:true,encoding:'utf8',timeout:30000});
 fs.appendFileSync(path.join(out,'test.log'),r.stdout+r.stderr);if(r.status!==0)throw Error(r.stderr||r.error||'TEST_FAILED');console.log(r.stdout.trim());
}
console.log(out);
