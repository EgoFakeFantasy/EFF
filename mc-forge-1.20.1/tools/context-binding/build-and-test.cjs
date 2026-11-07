'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const repo=path.resolve(__dirname,'../../..'),privateRoot=path.join(repo,'output/eff-local-native-20261104');
const jdk=path.resolve(repo,'../output/eff-mc1201-tools/jdk/jdk-17.0.20.1+1');
const relative='net/minecraftforge/fmlearlydisplay/1.20.1-47.4.20/fmlearlydisplay-1.20.1-47.4.20.jar';
const original=process.argv[2]?path.resolve(process.argv[2]):path.join(privateRoot,'video-foreverlove-v37/payload/libraries',relative);
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const originalSHA256=hash(original);
if(originalSHA256!=='ae4f2216c029995d68a61cfb730b979eae3184e5c72ef16c375317dd8a21d7c4')throw Error('UNREVIEWED_RENDERER_SHA256');
const asm=['asm','asm-tree'].map(n=>path.join(privateRoot,'forge-client/libraries/org/ow2/asm',n,'9.9.1',n+'-9.9.1.jar'));
for(const p of [path.join(jdk,'bin/javac.exe'),...asm])if(!fs.existsSync(p))throw Error('MISSING_EXISTING_DEPENDENCY:'+p);
const out=fs.mkdtempSync(path.join(privateRoot,'context-binding-offline-')),classes=path.join(out,'classes');fs.mkdirSync(classes);
const log=path.join(out,'build-and-test.log');
function run(exe,args){const r=cp.spawnSync(exe,args,{windowsHide:true,encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024});fs.appendFileSync(log,JSON.stringify({exe,args,status:r.status})+'\n'+(r.stdout||'')+(r.stderr||''));if(r.status!==0)throw Error('STEP_FAILED\n'+r.stdout+r.stderr);return r.stdout+r.stderr;}
const java=path.join(jdk,'bin/java.exe'),classpath=[classes,...asm].join(path.delimiter);
run(path.join(jdk,'bin/javac.exe'),['-cp',asm.join(path.delimiter),'-d',classes,path.join(__dirname,'src/ContextBindingPatch.java'),path.join(__dirname,'test/ContextBindingTest.java'),path.join(__dirname,'test/org/lwjgl/glfw/GLFW.java')]);
const tests=run(java,['-Xverify:all','-cp',classpath,'ContextBindingTest']);
const candidate=path.join(out,'fmlearlydisplay-1.20.1-47.4.20.jar');
const details=run(java,['-Xverify:all','-cp',classpath,'ContextBindingPatch',original,candidate]);
const patchedSHA256=hash(candidate),destination=path.join(privateRoot,'defensive-libraries/fmlearlydisplay',patchedSHA256);
fs.mkdirSync(destination,{recursive:true});const patched=path.join(destination,path.basename(candidate));
if(fs.existsSync(patched)){if(hash(patched)!==patchedSHA256)throw Error('CONTENT_ADDRESS_COLLISION');}
else fs.copyFileSync(candidate,patched,fs.constants.COPYFILE_EXCL);
if(hash(original)!==originalSHA256)throw Error('ORIGINAL_CHANGED');
const receipt={schema:1,mechanism:'idempotent-render-context-binding',original,originalSHA256,patched,patchedSHA256,libraryRelativePath:relative,opponentModified:false,hostSecurityModified:false,javaAgentAdded:false,mcExecuted:false,nativeExecuted:false,installed:false,log,details,tests,limitation:'Only eliminates redundant same-thread same-context binding. Does not establish prevention of the observed native loader race or successful MC combat.'};
fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(receipt,null,2));
