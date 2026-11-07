'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../..');
const source=path.join(root,'mc-1.20.1/src/main/java/eff/minecraft/client/EntityGuardSelfTest.java');
const text=fs.readFileSync(source,'utf8');
const from=text.indexOf('      JsonObject serverSnapshot = manualServerState;');
const to=text.indexOf('      for (var element : clients)',from);
if(from<0||to<from)throw Error('PRODUCTION_SAMPLE_BLOCK_MISSING');
const block=text.slice(from,to);
if((block.match(/= manualServerState;/g)||[]).length!==1||block.includes('manualServerAt'))throw Error('NON_ATOMIC_SAMPLE_BLOCK');
const out=fs.mkdtempSync(path.join(__dirname,'run-'));
const java=path.resolve(root,'../output/eff-mc1201-tools/jdk/jdk-17.0.20.1+1/bin');
const gson=path.join(root,'output/eff-local-native-20261104/forge-client/libraries/com/google/code/gson/gson/2.10.1/gson-2.10.1.jar');
const fixture=path.join(out,'ManualSnapshotPublicationTest.java');
fs.writeFileSync(fixture,`import com.google.gson.JsonObject;
import eff.minecraft.Jsons;
import java.util.concurrent.CountDownLatch;
public class ManualSnapshotPublicationTest {
 static volatile JsonObject manualServerState;
 record Read(JsonObject state,long age,boolean failed){}
 static Read read(){
${block}
  return new Read(serverSnapshot,serverAgeMs,structural);
 }
 static void check(boolean b,String why){if(!b)throw new AssertionError(why);}
 static JsonObject state(int generation,boolean failed){return Jsons.obj("generation",generation,
  "entities",generation,"failed",failed,"sampledAtNanos",System.nanoTime());}
 public static void main(String[] args)throws Exception{
  Read pending=read();check(pending.state()==null&&pending.age()==-1,"pending must remain explicit");
  long oldClientNow=System.nanoTime();
  CountDownLatch published=new CountDownLatch(1);
  Thread writer=new Thread(()->{try{Thread.sleep(5);}catch(InterruptedException e){throw new RuntimeException(e);}
   manualServerState=state(1,false);published.countDown();});writer.start();published.await();writer.join();
  check((oldClientNow-manualServerState.get("sampledAtNanos").getAsLong())/1_000_000L<0,"reproduce old negative age");
  Read current=read();check(current.age()>=0&&current.state().get("generation").getAsInt()==1,"actual production read uses later clock");
  manualServerState=state(2,true);check(read().failed(),"failure must not disappear");
  Thread concurrent=new Thread(()->{for(int i=3;i<20003;i++)manualServerState=state(i,(i&1)!=0);});
  concurrent.start();int reads=0;
  do{Read r=read();int g=r.state().get("generation").getAsInt();
   check(r.age()>=0,"published sample cannot come from the future");
   check(r.state().get("entities").getAsInt()==g,"state belongs to one publication");
   check(r.failed()==r.state().get("failed").getAsBoolean(),"verdict and recorded state must agree");reads++;
  }while(concurrent.isAlive()||reads<20000);
  concurrent.join();System.out.println("MANUAL_SNAPSHOT_PUBLICATION_OK productionBlock=true reads="+reads+" minecraft=false");
 }
}
`);
function run(exe,args){const r=cp.spawnSync(path.join(java,exe+'.exe'),args,{encoding:'utf8',windowsHide:true,maxBuffer:1024*1024});fs.appendFileSync(path.join(out,'test.log'),(r.stdout||'')+(r.stderr||''));if(r.error)throw r.error;if(r.status!==0)throw Error((r.stderr||'').slice(-2500));return r.stdout;}
const classes=path.join(out,'classes');fs.mkdirSync(classes);
run('javac',['-encoding','UTF-8','-cp',gson,'-d',classes,fixture,path.join(root,'mc-1.20.1/src/main/java/eff/minecraft/Jsons.java')]);
const result=run('java',['-Xverify:all','-Xmx96m','-cp',classes+path.delimiter+gson,'ManualSnapshotPublicationTest']);
const receipt={passed:true,sourceSHA256:crypto.createHash('sha256').update(text).digest('hex'),result,
 scope:'Extracted production publication-read block with real Gson and concurrent writers; not live Minecraft acceptance'};
fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({receipt:path.join(out,'receipt.json'),result}));
