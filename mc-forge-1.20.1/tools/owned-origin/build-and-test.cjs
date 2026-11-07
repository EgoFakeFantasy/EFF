'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const repo=path.resolve(__dirname,'../../..'),privateRoot=path.join(repo,'output/eff-local-native-20261104');
const jdk=path.resolve(repo,'../output/eff-mc1201-tools/jdk/jdk-17.0.20.1+1/bin');
const baseReceipt=process.argv[4]?JSON.parse(fs.readFileSync(path.resolve(process.argv[4]),'utf8')):null;
const original=baseReceipt?baseReceipt.patched:path.join(privateRoot,'video-foreverlove-v38/payload/libraries/cpw/mods/modlauncher/10.0.9/modlauncher-10.0.9.jar');
const eff=process.argv[2]?path.resolve(process.argv[2]):path.join(repo,'mc-forge-1.20.1/build/libs/eff-minecraft-forge-1.20.1-0.6.1+mc1.20.1-forge.jar');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const originalSHA256=hash(original),effSHA256=hash(eff);
if(baseReceipt){
 if(baseReceipt.originalSHA256!=='a9b3dcde1434d02702a251ef1d0671dbc90250b349778e1c27151d86c2a4aa81'
    ||hash(baseReceipt.original)!==baseReceipt.originalSHA256||originalSHA256!==baseReceipt.patchedSHA256
    ||!baseReceipt.mechanism.includes('canonical-plugin-registry'))throw Error('REVIEWED_MODLAUNCHER_CHAIN_MISMATCH');
}else if(originalSHA256!=='24179fb024b4fb515bd906d9944e21a1d032c6e8ba5ee4f9977c5a5fe4868c63')throw Error('REVIEWED_MODLAUNCHER_PIN_MISMATCH');
console.log(JSON.stringify({originalSHA256,effSHA256}));
if(process.argv[3]&&effSHA256!==process.argv[3])throw Error('OWNED_JAR_PIN_MISMATCH');
const out=fs.mkdtempSync(path.join(privateRoot,'owned-origin-offline-')),classes=path.join(out,'classes');fs.mkdirSync(classes);
const frozenEff=path.join(out,'authenticated-eff.jar');fs.copyFileSync(eff,frozenEff,fs.constants.COPYFILE_EXCL);
if(hash(frozenEff)!==effSHA256)throw Error('INPUT_CHANGED_DURING_COPY');
const asm=['asm','asm-tree'].map(n=>path.join(privateRoot,'forge-client/libraries/org/ow2/asm',n,'9.9.1',n+'-9.9.1.jar'));
const gate=path.join(repo,'mc-forge-1.20.1/build/runtime/eff-lifetime-gate.jar'),gateSHA256=hash(gate);
const gson=path.join(privateRoot,'forge-client/libraries/com/google/code/gson/gson/2.10.1/gson-2.10.1.jar');
const classpath=[classes,...asm,gate,original,gson].join(path.delimiter),log=path.join(out,'build-and-test.log');
const mc=path.join(privateRoot,'video-foreverlove-v38/payload/libraries/net/minecraftforge/forge/1.20.1-47.4.20/forge-1.20.1-47.4.20-client.jar');
const mcBase=path.join(privateRoot,'video-foreverlove-v38/payload/libraries/net/minecraft/client/1.20.1-20230612.114412/client-1.20.1-20230612.114412-srg.jar');
function run(name,args){let r=cp.spawnSync(path.join(jdk,name+'.exe'),args,{windowsHide:true,encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024});fs.appendFileSync(log,JSON.stringify({name,args,status:r.status})+'\n'+(r.stdout||'')+(r.stderr||''));if(r.status!==0)throw Error('STEP_FAILED\n'+r.stdout+r.stderr);return r.stdout+r.stderr;}
run('javac',['-cp',classpath,'-d',classes,path.join(__dirname,'src/OwnedOriginPatch.java')]);
const audit=run('java',['-Xverify:all','-cp',classpath,'OwnedOriginPatch','prepare',frozenEff,out,mcBase,mc]);
run('javac',['-d',classes,path.join(__dirname,'src/cpw/mods/modlauncher/EffOwnedOrigin.java'),path.join(out,'EffOwnedOriginCatalog.java')]);
const built=path.join(out,'modlauncher-10.0.9.jar');
const details=run('java',['-Xverify:all','-cp',classpath,'OwnedOriginPatch','patch',original,frozenEff,classes,built,mcBase,mc]);
run('javac',['-cp',classpath,'-d',classes,path.join(__dirname,'test/OwnedArenaAudit.java')]);
const arenaAudit=run('java',['-Xverify:all','-cp',classpath,'OwnedArenaAudit',frozenEff,built,mcBase,mc]);
if(hash(gate)!==gateSHA256)throw Error('ARENA_AUDIT_GATE_CHANGED');
run('javac',['-cp',classpath,'-d',classes,path.join(__dirname,'test/OwnedOriginTest.java')]);
const specimen=path.join(privateRoot,'specimens/foreverlove-2.2-public.jar');
const test=run('java',['-Xverify:all','-cp',[classes,...asm,gate,built,gson].join(path.delimiter),'OwnedOriginTest',built,frozenEff,mc,specimen]);
const patchedSHA256=hash(built),target=path.join(privateRoot,'defensive-libraries/modlauncher',patchedSHA256);fs.mkdirSync(target,{recursive:true});
const patched=path.join(target,'modlauncher-10.0.9.jar');if(!fs.existsSync(patched))fs.copyFileSync(built,patched,fs.constants.COPYFILE_EXCL);
if(hash(patched)!==patchedSHA256||hash(original)!==originalSHA256||hash(eff)!==effSHA256)throw Error('SOURCE_OR_RESULT_CHANGED');
const manifest=path.join(out,'owned-manifest.txt');
const receipt={schema:1,mechanism:'explicit-authenticated-owned-origin-final-boundary',original,originalSHA256,patched,patchedSHA256,eff,effSHA256,frozenEff,manifest,log,audit,details,test,opponentModified:false,hostSecurityModified:false,javaAgentAdded:false,mcExecuted:false,opponentNativeExecuted:false,installed:false,scope:fs.readFileSync(manifest,'utf8'),limitation:'Only explicit owned classes at initial ModLauncher final boundary. Not all EFF, no MC exemption. Later JVM instrumentation/native redefinition or memory writes can bypass this boundary. Offline callback test is not a claim of full original sample execution.'};
receipt.arenaAudit={test:arenaAudit,gate,gateSHA256,scope:'Exact EFF arena and Placement; separate source/canonical pins preserve the reviewed syncNPCs pre-removal gate.'};
fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(receipt,null,2));
