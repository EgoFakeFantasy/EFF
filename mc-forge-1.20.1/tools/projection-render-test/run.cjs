const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const out = fs.mkdtempSync(path.join(__dirname, 'run-'));
const javaHome = process.env.JAVA_HOME || path.resolve(__dirname,'../../../../output/eff-mc1201-tools/jdk/jdk-17.0.20.1+1');
const gson = path.join(root,'output/eff-local-native-20261104/forge-client/libraries/com/google/code/gson/gson/2.10/gson-2.10.jar');
const sources = {
'com/mojang/blaze3d/vertex/PoseStack.java': `package com.mojang.blaze3d.vertex; public class PoseStack { public int depth; public double x,y,z; public void pushPose(){depth++;} public void popPose(){depth--;} public void translate(double x,double y,double z){this.x=x;this.y=y;this.z=z;} }`,
'net/minecraft/world/entity/Entity.java': `package net.minecraft.world.entity; public class Entity { public Object world; public int id; public Entity(Object w,int i){world=w;id=i;} public Object level(){return world;} public int getId(){return id;} }`,
'eff/minecraft/EffProjection.java': `package eff.minecraft; public class EffProjection extends net.minecraft.world.entity.Entity { public boolean claimed=true; public Boolean dead=false; public int deathTime; public Float health=20f; public String removal="null"; public EffProjection(Object w,int i){super(w,i);} public boolean rejectLifetimeMutation(){return claimed;} }`,
'eff/minecraft/ProjectionProbe.java': `package eff.minecraft; import net.minecraft.world.entity.Entity; import net.minecraft.client.multiplayer.ClientLevel; public final class ProjectionProbe { public static Boolean rawDead(EffProjection p){return p.dead;} public static Float storedHealth(EffProjection p){return p.health;} public static Entity clientEntityById(Object w,int id){return ((ClientLevel)w).index.get(id);} public static String rawRemovalReason(Entity e){return ((EffProjection)e).removal;} public static java.util.List<Entity> currentClientProjections(ClientLevel w){var r=new java.util.ArrayList<Entity>(); for(Entity e:w.index.values())if(e instanceof EffProjection)r.add(e);return r;} }`,
'net/minecraft/client/multiplayer/ClientLevel.java': `package net.minecraft.client.multiplayer; import net.minecraft.world.entity.Entity; public class ClientLevel { public final java.util.Map<Integer,Entity> index=new java.util.HashMap<>(); public Iterable<Entity> visible=java.util.List.of(); public Iterable<Entity> entitiesForRendering(){return visible;} }`,
'net/minecraft/client/renderer/MultiBufferSource.java': `package net.minecraft.client.renderer; public interface MultiBufferSource {}`,
'net/minecraft/client/renderer/culling/Frustum.java': `package net.minecraft.client.renderer.culling; public class Frustum { public boolean visible=true; }`,
'net/minecraft/client/renderer/entity/EntityRenderDispatcher.java': `package net.minecraft.client.renderer.entity; import net.minecraft.world.entity.Entity; import net.minecraft.client.renderer.culling.Frustum; import com.mojang.blaze3d.vertex.PoseStack; import net.minecraft.client.renderer.MultiBufferSource; public class EntityRenderDispatcher { public int shouldCalls,drawCalls; public boolean result; public boolean shouldRender(Entity e,Frustum f,double x,double y,double z){shouldCalls++;return result;} public void render(Entity e,double x,double y,double z,float yaw,float tick,PoseStack p,MultiBufferSource b,int light){drawCalls++;} }`,
'eff/minecraft/client/EffProjectionRenderer.java': `package eff.minecraft.client; import eff.minecraft.EffProjection; import net.minecraft.client.renderer.culling.Frustum; import com.mojang.blaze3d.vertex.PoseStack; import net.minecraft.client.renderer.MultiBufferSource; public class EffProjectionRenderer { public int drawCalls; public EffProjection last; public boolean throwDraw; public boolean shouldRender(EffProjection p,Frustum f,double x,double y,double z){return f.visible;} public Offset getRenderOffset(EffProjection p,float t){return new Offset();} public void render(EffProjection e,float y,float t,PoseStack p,MultiBufferSource b,int l){if(throwDraw)throw new IllegalStateException("DRAW_FAILURE");drawCalls++;last=e;} public static class Offset {public double x,y,z;} }`,
'eff/minecraft/client/BoundaryTest.java': `package eff.minecraft.client;
import java.util.*; import eff.minecraft.*; import net.minecraft.client.multiplayer.*; import net.minecraft.world.entity.*; import net.minecraft.client.renderer.entity.*; import net.minecraft.client.renderer.culling.*; import com.mojang.blaze3d.vertex.*;
public class BoundaryTest {
 static int checks;
 static void check(boolean b,String m){checks++;if(!b)throw new AssertionError(m);}
 static List<Entity> list(Iterable<Entity> x){var r=new ArrayList<Entity>();x.forEach(r::add);return r;}
 static void draw(EntityRenderDispatcher d,Entity e,PoseStack p){ProjectionRenderBoundary.render(d,e,1,2,3,0,0,p,null,10);}
 public static void main(String[] args){
  var w=new ClientLevel();var p=new EffProjection(w,7);w.index.put(7,p);var ordinary=new Entity(w,8);w.visible=List.of(ordinary);var r=new EffProjectionRenderer();ProjectionRenderBoundary.registered(r);var d=new EntityRenderDispatcher();var f=new Frustum();var pose=new PoseStack();
  check(list(ProjectionRenderBoundary.entities(w)).equals(List.of(ordinary,p)),"FILTERED_ENUMERATION_ORIGINAL");
  w.visible=List.of(p,p,ordinary);check(list(ProjectionRenderBoundary.entities(w)).equals(List.of(p,ordinary)),"IDENTITY_DEDUPLICATION");
  w.visible=List.of(ordinary);check(ProjectionRenderBoundary.shouldRender(d,p,f,0,0,0),"CLAIMED_DISPATCH_FILTER_BYPASSED");check(d.shouldCalls==0,"NO_FOREIGN_SHOULD_CALL");draw(d,p,pose);check(r.drawCalls==1&&r.last==p&&d.drawCalls==0,"CLAIMED_ORIGINAL_DRAW_ONLY");check(ProjectionRenderBoundary.drawCount(p)==1&&ProjectionRenderBoundary.lastDrawNanos(p)>0,"DRAW_RECEIPT");check(pose.depth==0&&pose.x==1&&pose.y==2&&pose.z==3,"NORMAL_POSE_COORDINATES");
  f.visible=false;check(!ProjectionRenderBoundary.shouldRender(d,p,f,0,0,0),"FRUSTUM_FALSE_PRESERVED");f.visible=true;
  d.result=true;check(ProjectionRenderBoundary.shouldRender(d,ordinary,f,0,0,0)&&d.shouldCalls==1,"ORDINARY_SHOULD_PASSTHROUGH");draw(d,ordinary,pose);check(d.drawCalls==1,"ORDINARY_DRAW_PASSTHROUGH");
  w.index.remove(7);check(!list(ProjectionRenderBoundary.entities(w)).contains(p),"MISSING_NOT_ADDED");check(!ProjectionRenderBoundary.shouldRender(d,p,f,0,0,0),"MISSING_NO_RENDER");draw(d,p,pose);check(r.drawCalls==1,"MISSING_NO_DRAW");
  var replacement=new Entity(w,7);w.index.put(7,replacement);check(!ProjectionRenderBoundary.current(p),"SAME_ID_REPLACEMENT_REJECTED");draw(d,p,pose);check(r.drawCalls==1,"REPLACED_ORIGINAL_NO_DRAW");
  w.index.put(7,p);p.removal="KILLED";check(!ProjectionRenderBoundary.current(p),"RAW_REMOVED_REJECTED");draw(d,p,pose);check(r.drawCalls==1&&!list(ProjectionRenderBoundary.entities(w)).contains(p),"REMOVED_NOT_DRAWN_ADDED");p.removal="null";
  for(Float health:new Float[]{0f,-1f,Float.NaN,Float.POSITIVE_INFINITY,null}){p.health=health;check(!ProjectionRenderBoundary.current(p),"RAW_BAD_HEALTH");draw(d,p,pose);check(r.drawCalls==1,"BAD_HEALTH_NOT_DRAWN");}p.health=20f;
  p.deathTime=1;check(!ProjectionRenderBoundary.current(p),"DEATH_TIME_REJECTED");p.deathTime=0;
   p.dead=true;draw(d,p,pose);check(!ProjectionRenderBoundary.current(p)&&r.drawCalls==1,"RAW_DEAD_WITH_HEALTH20_NOT_DRAWN");p.dead=null;check(!ProjectionRenderBoundary.current(p),"UNOBSERVABLE_DEAD_NOT_DRAWN");p.dead=false;
  r.throwDraw=true;try{draw(d,p,pose);throw new AssertionError("DRAW_EXCEPTION_SWALLOWED");}catch(IllegalStateException expected){}check(pose.depth==0,"POSE_RESTORED_ON_FAILURE");check(ProjectionRenderBoundary.drawCount(p)==1,"FAILURE_NO_DRAW_RECEIPT");
  ProjectionRenderBoundary.registered(null);check(!ProjectionRenderBoundary.shouldRender(d,p,f,0,0,0),"NO_RENDERER_REJECTED");
  System.out.println("PROJECTION_RENDER_BOUNDARY_OK checks="+checks+" actualProductionSource=true minecraft=false");
 }
}`
};
const files=[];
for(const [name,source] of Object.entries(sources)){const target=path.join(out,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,source);files.push(target);}
const actualSource=path.join(root,'mc-1.20.1/src/main/java/eff/minecraft/client/ProjectionRenderBoundary.java');
const digest=()=>crypto.createHash('sha256').update(fs.readFileSync(actualSource)).digest('hex');
const sourceSha256=digest();
files.push(actualSource);
files.push(path.join(root,'mc-1.20.1/src/main/java/eff/minecraft/Jsons.java'));
const classes=path.join(out,'classes');fs.mkdirSync(classes);
function run(exe,args){const result=cp.spawnSync(path.join(javaHome,'bin',exe+'.exe'),args,{encoding:'utf8',maxBuffer:4*1024*1024});process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);return result.stdout;}
run('javac',['-encoding','UTF-8','-cp',gson,'-d',classes,...files]);
const result=run('java',['-Xverify:all','-Xmx128m','-cp',classes+path.delimiter+gson,'eff.minecraft.client.BoundaryTest']);
if(digest()!==sourceSha256)throw new Error('Production source changed during test; rerun required');
fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify({passed:true,actualProductionSource:true,sourceSha256,minecraft:false,result,scope:'Java stub tests; does not prove live rendering or attack survival'},null,2));
console.log('Receipt: '+path.join(out,'receipt.json'));
