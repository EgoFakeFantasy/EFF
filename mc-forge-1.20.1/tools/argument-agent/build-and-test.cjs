'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const repo=path.resolve(__dirname,'../../..'),privateRoot=path.join(repo,'output/eff-local-native-20261104');
const jdk=path.resolve(repo,'../output/eff-mc1201-tools/jdk/jdk-17.0.20.1+1'),out=fs.mkdtempSync(path.join(privateRoot,'argument-agent-offline-'));
const asmNames=['asm','asm-tree','asm-analysis','asm-commons'];
const asm=asmNames.map(n=>path.join(privateRoot,'forge-client/libraries/org/ow2/asm',n,'9.9.1',n+'-9.9.1.jar'));
for(const p of [path.join(jdk,'bin/javac.exe'),...asm])if(!fs.existsSync(p))throw Error('MISSING_EXISTING_DEPENDENCY:'+p);
const raw=path.join(out,'raw'),build=path.join(out,'build'),test=path.join(out,'test');for(const p of [raw,build,test])fs.mkdirSync(p);
const log=path.join(out,'build-and-test.log');
function run(exe,args,timeout=60000){const result=cp.spawnSync(exe,args,{windowsHide:true,encoding:'utf8',timeout,maxBuffer:8*1024*1024});fs.appendFileSync(log,JSON.stringify({exe,args,status:result.status,signal:result.signal})+'\n'+(result.stdout||'')+(result.stderr||''));if(result.status!==0)throw Error('STEP_FAILED:'+exe+'\n'+result.stdout+result.stderr);return result.stdout+result.stderr;}
function sources(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?sources(path.join(dir,e.name)):e.name.endsWith('.java')?[path.join(dir,e.name)]:[]);}
const javac=path.join(jdk,'bin/javac.exe'),java=path.join(jdk,'bin/java.exe');
run(javac,['-cp',asm.join(path.delimiter),'-d',raw,...sources(path.join(__dirname,'src')),path.join(repo,'mc-forge-1.20.1/src/lifetimeGate/java/eff/lifetime/StaticArgumentIsolation.java')]);
run(javac,['-cp',asm.join(path.delimiter),'-d',build,path.join(__dirname,'build/Relocate.java')]);
run(javac,['-cp',[raw,...asm].join(path.delimiter),'-d',build,path.join(__dirname,'build/MetadataWriterTest.java')]);
run(java,['-Xverify:all','-cp',[build,raw,...asm].join(path.delimiter),'eff.argumentagent.MetadataWriterTest']);
const emptyPatch=path.join(out,'empty-test-patch');fs.mkdirSync(emptyPatch);
run(java,['-Xverify:all','--patch-module=java.base='+emptyPatch,'-cp',[build,raw,...asm].join(path.delimiter),'eff.argumentagent.MetadataWriterTest','expect-patch-refusal']);
const agent=path.join(out,'eff-argument-isolation-agent.jar');run(java,['-cp',[build,...asm].join(path.delimiter),'Relocate',raw,agent,...asm.slice(0,3)]);
run(javac,['-d',test,...sources(path.join(__dirname,'test'))]);
const manifest=path.join(out,'control-manifest.mf');fs.writeFileSync(manifest,'Manifest-Version: 1.0\nPremain-Class: proof.ControlAgent\nCan-Redefine-Classes: true\nCan-Retransform-Classes: true\n\n',{flag:'wx'});
const control=path.join(out,'test-control-agent.jar');run(path.join(jdk,'bin/jar.exe'),['-J-Djava.io.tmpdir='+out,'--create','--file',control,'--manifest',manifest,'-C',test,'proof/ControlAgent.class']);
const gxx='C:\\msys64\\mingw64\\bin\\g++.exe';let native=null;
if(fs.existsSync(gxx)&&!process.argv.includes('--no-native')){native=path.join(out,'synthetic-jvmti-redefine.dll');run(gxx,['-shared','-O2','-static-libgcc','-static-libstdc++','-I'+path.join(jdk,'include'),'-I'+path.join(jdk,'include/win32'),path.join(__dirname,'test/redefine_fixture.cpp'),'-o',native]);}
const args=['-Xverify:all','-Xmx192m','-XX:ActiveProcessorCount=2','-javaagent:'+agent,'-javaagent:'+control,'-cp',test,'proof.AgentBoundaryTest',...(native?[native]:[])];
const result=run(java,args);
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const receipt={schema:1,agent,sha256:hash(agent),nativeFixture:native,nativeFixtureSha256:native?hash(native):null,java,args,log,productionIntegrated:false,mcExecuted:false,opponentExecuted:false};
fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(receipt,null,2));console.log(result);
