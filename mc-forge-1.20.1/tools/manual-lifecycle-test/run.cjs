'use strict';
// Executes exact extracted production methods against controlled Java field layouts.
// This tests the observer, not Minecraft or the opponent's actual attack.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../..'),out=fs.mkdtempSync(path.join(__dirname,'run-'));
const jdk=path.resolve(root,'../output/eff-mc1201-tools/jdk/jdk-17.0.20.1+1/bin');
const gson=path.join(root,'output/eff-local-native-20261104/forge-client/libraries/com/google/code/gson/gson/2.10/gson-2.10.jar');
const probePath=path.join(root,'mc-1.20.1/src/main/java/eff/minecraft/ProjectionProbe.java');
const observerPath=path.join(root,'mc-1.20.1/src/main/java/eff/minecraft/client/EntityGuardSelfTest.java');
const digest=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const hashes={[probePath]:digest(probePath),[observerPath]:digest(observerPath)};
function method(file,marker){const s=fs.readFileSync(file,'utf8'),a=s.indexOf(marker),b=s.indexOf('\n  }',a);if(a<0||b<0)throw Error('METHOD_NOT_FOUND:'+marker);return s.slice(a,b+4);}
const diagnostic=method(probePath,'  public static JsonObject lifecycleDiagnostic(');
const field=method(probePath,'  private static java.lang.reflect.Field declaredIndexField(');
const state=method(observerPath,'  private static JsonObject manualObjectState(');
const results=[];
for(const mapped of [false,true]){
 const dir=path.join(out,mapped?'srg':'named');fs.mkdirSync(dir);const files=[];
 const names={deathTime:'f_20919_',hurtTime:'f_20916_',dead:'f_20890_',headPose:'f_31542_',bodyPose:'f_31543_',leftArmPose:'f_31544_',rightArmPose:'f_31545_',leftLegPose:'f_31525_',rightLegPose:'f_31526_',x:'f_123146_',y:'f_123147_',z:'f_123148_'};
 const n=k=>mapped?names[k]:k;
 const sources={
 'net/minecraft/world/entity/Entity.java':`package net.minecraft.world.entity; public class Entity { public int id=20; public java.util.UUID uuid=java.util.UUID.randomUUID(); public String removal="null"; public boolean indexed=true,readable=true; public int getId(){return id;} public java.util.UUID getUUID(){return uuid;} }`,
 'net/minecraft/world/entity/LivingEntity.java':`package net.minecraft.world.entity; public class LivingEntity extends Entity { public int ${n('deathTime')},${n('hurtTime')}; private boolean ${n('dead')}; public Float raw=20f; public float answer=20f; public boolean alive=true,dying=false,removed=false,throwGetter; public enum Pose {STANDING,SLEEPING} public Pose pose=Pose.STANDING; public float getHealth(){if(throwGetter)throw new IllegalStateException("poisoned getter");return answer;} public boolean isAlive(){return alive;} public boolean isDeadOrDying(){return dying;} public boolean isRemoved(){return removed;} public Pose getPose(){return pose;} public void setDead(boolean v){${n('dead')}=v;} public void setDeath(int v){${n('deathTime')}=v;} public void setHurt(int v){${n('hurtTime')}=v;} }`,
 'net/minecraft/core/Rotations.java':`package net.minecraft.core; public class Rotations { private float ${n('x')},${n('y')},${n('z')}; public Rotations(float a,float b,float c){${n('x')}=a;${n('y')}=b;${n('z')}=c;} }`,
 'net/minecraft/world/entity/decoration/ArmorStand.java':`package net.minecraft.world.entity.decoration; import net.minecraft.core.Rotations; public class ArmorStand extends net.minecraft.world.entity.LivingEntity { ${['headPose','bodyPose','leftArmPose','rightArmPose','leftLegPose','rightLegPose'].map(k=>'private Rotations '+n(k)+'=new Rotations(0,0,0);').join(' ')} public void body(float value){${n('bodyPose')}=new Rotations(value,0,0);} }`,
 'eff/minecraft/ProjectionProbe.java':`package eff.minecraft; import com.google.gson.JsonObject; import net.minecraft.world.entity.*; public class ProjectionProbe { ${diagnostic}\n${field}\n public static JsonObject registrationDiagnostic(Object l,Entity e){return Jsons.obj("readable",e.readable,"idOriginal",e.indexed,"uuidOriginal",e.indexed,"sameLevel",true);} public static String rawRemovalReason(Entity e){return e.removal;} public static Float storedHealth(LivingEntity e){return e.raw;} }`,
 'eff/minecraft/client/EntityGuardSelfTest.java':`package eff.minecraft.client; import com.google.gson.JsonObject; import eff.minecraft.*; import net.minecraft.world.entity.*; public class EntityGuardSelfTest { ${state}\n public static JsonObject observe(Entity e,String identity){return manualObjectState(e,new Object(),identity);} }`,
 'LifecycleTest.java':`import eff.minecraft.*; import eff.minecraft.client.*; import net.minecraft.world.entity.*; import net.minecraft.world.entity.decoration.*; import com.google.gson.*;
 public class LifecycleTest {
 static int checks; static void check(boolean v,String message){checks++;if(!v)throw new AssertionError(message);}
 static JsonObject read(LivingEntity e){return EntityGuardSelfTest.observe(e,e.id+":"+e.uuid);}
 static void failure(JsonObject r,String c){check(Jsons.b(r,"structuralFailure"),c);check(Jsons.s(r,"classification").equals(c),"classification:"+r);check(!Jsons.b(r,"combatPassed"),"never pass");}
 public static void main(String[] args){
 var e=new ArmorStand();var r=read(e);check(!Jsons.b(r,"structuralFailure"),"baseline");check(Jsons.s(r,"classification").equals("CHECKED_FIELDS_CONSISTENT_NOT_SURVIVAL_PROOF"),"bounded claim");check(!Jsons.b(r,"combatPassed"),"baseline not victory");
 e.setDead(true);failure(read(e),"LIFECYCLE_BROKEN");check(e.raw==20f&&Jsons.b(ProjectionProbe.lifecycleDiagnostic(e),"rawDead"),"no health or death repair");e.setDead(false);
 e.setDeath(8);failure(read(e),"LIFECYCLE_BROKEN");check(ProjectionProbe.lifecycleDiagnostic(e).get("rawDeathTime").getAsInt()==8,"no death reset");e.setDeath(0);
 e.setHurt(10);r=read(e);check(!Jsons.b(r,"structuralFailure"),"ordinary damage tint not death");check(r.getAsJsonObject("lifecycle").get("rawHurtTime").getAsInt()==10,"hurt retained");
 e.answer=0;failure(read(e),"PUBLIC_STATE_MISMATCH");check(e.raw==20f&&e.answer==0,"no getter/data mutation");e.answer=20;
 e.alive=false;failure(read(e),"PUBLIC_STATE_MISMATCH");e.alive=true;e.dying=true;failure(read(e),"PUBLIC_STATE_MISMATCH");e.dying=false;e.removed=true;failure(read(e),"PUBLIC_STATE_MISMATCH");e.removed=false;
 e.answer=Float.NaN;failure(read(e),"PUBLIC_STATE_MISMATCH");e.answer=20;e.throwGetter=true;failure(read(e),"OBSERVATION_UNAVAILABLE");e.throwGetter=false;
 e.raw=0f;failure(read(e),"LIFECYCLE_BROKEN");e.raw=Float.NaN;failure(read(e),"LIFECYCLE_BROKEN");e.raw=null;failure(read(e),"OBSERVATION_UNAVAILABLE");e.raw=20f;
 e.removal="KILLED";failure(read(e),"LIFECYCLE_BROKEN");e.removal="null";e.indexed=false;failure(read(e),"REGISTRATION_BROKEN");e.indexed=true;e.readable=false;failure(read(e),"OBSERVATION_UNAVAILABLE");e.readable=true;
 failure(EntityGuardSelfTest.observe(e,"other"),"IDENTITY_BROKEN");
 e.body(90);r=read(e);check(r.getAsJsonObject("lifecycle").getAsJsonObject("storedArmorPoses").getAsJsonObject("bodyPose").get("x").getAsFloat()==90,"tilt observed without reset");check(!Jsons.b(r,"combatPassed"),"pose not proof");e.body(Float.NaN);failure(read(e),"OBSERVATION_UNAVAILABLE");
 var shadow=new Shadow();shadow.setDead(true);failure(read(shadow),"LIFECYCLE_BROKEN");check(!shadow.${n('dead')},"shadow ignored");
 System.out.println("LIFECYCLE_OBSERVER_OK checks="+checks+" layout=${mapped?'srg':'named'} minecraft=false");
 }
 static class Shadow extends ArmorStand {public boolean ${n('dead')};public int ${n('deathTime')};}
 }`
 };
 for(const [name,source]of Object.entries(sources)){const f=path.join(dir,name);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,source);files.push(f);}
 files.push(path.join(root,'mc-1.20.1/src/main/java/eff/minecraft/Jsons.java'));
 const classes=path.join(dir,'classes');fs.mkdirSync(classes);
 function run(exe,args){const r=cp.spawnSync(path.join(jdk,exe+'.exe'),args,{windowsHide:true,encoding:'utf8',timeout:60000});if(r.status!==0)throw Error(r.stdout+r.stderr);return r.stdout;}
 run('javac',['-encoding','UTF-8','-cp',gson,'-d',classes,...files]);
 const result=run('java',['-Xverify:all','-cp',classes+path.delimiter+gson,'LifecycleTest']);results.push(result.trim());console.log(result.trim());
}
for(const [f,h]of Object.entries(hashes))if(digest(f)!==h)throw Error('SOURCE_CHANGED');
const receipt=path.join(out,'receipt.json');fs.writeFileSync(receipt,JSON.stringify({passed:true,exactExtractedProductionMethods:true,hashes,results,minecraftExecuted:false,combatPassed:false,scope:'Observer fixtures only; no live attack verdict'},null,2));console.log(receipt);
