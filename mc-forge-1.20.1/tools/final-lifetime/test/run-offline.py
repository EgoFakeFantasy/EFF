from pathlib import Path
import tempfile,subprocess,sys,os
repo=Path(__file__).resolve().parents[4]
root=Path(tempfile.mkdtemp(prefix='final-lifetime-offline-',dir=repo/'output/eff-local-native-20261104'))
sources={
'eff/minecraft/PlayerLifetime.java':'package eff.minecraft; public final class PlayerLifetime {public static boolean rejectOperation(Object target,String operation){return target instanceof net.minecraft.world.entity.player.Player p && p.owned;} public static boolean rejectDamage(Object target,String operation,Object source,float amount){return rejectOperation(target,operation);}}',
'net/minecraft/world/damagesource/DamageSource.java':'package net.minecraft.world.damagesource; public class DamageSource {}',
'net/minecraft/world/entity/player/Player.java':'''package net.minecraft.world.entity.player; public class Player extends net.minecraft.world.entity.LivingEntity {public int calls; public boolean hurt(net.minecraft.world.damagesource.DamageSource source,float damage){calls++;return true;} public void die(net.minecraft.world.damagesource.DamageSource source){calls++;} public void kill(){calls++;} public void setHealth(float health){calls++;rawHealth=health;} public void remove(net.minecraft.world.entity.Entity.RemovalReason reason){calls++;} }''',
'net/minecraft/world/phys/AABB.java':'package net.minecraft.world.phys; public final class AABB {}',
'net/minecraft/world/level/entity/EntityAccess.java':'package net.minecraft.world.level.entity; public interface EntityAccess {}',
'net/minecraft/world/entity/Entity.java':'''package net.minecraft.world.entity; import net.minecraft.world.phys.AABB; public class Entity implements net.minecraft.world.level.entity.EntityAccess { public boolean owned; public boolean admitted; public net.minecraft.world.level.entity.EntityLookup index; public AABB bb=new AABB(); private RemovalReason removalReason; public enum RemovalReason {KILLED} public final boolean isRemoved(){return true;} public final AABB getBoundingBox(){return new AABB();} }''',
'net/minecraft/world/entity/LivingEntity.java':'''package net.minecraft.world.entity; public class LivingEntity extends Entity {public float rawHealth=20; public float getHealth(){return 0;} public boolean isAlive(){return false;} public boolean isDeadOrDying(){return true;} }''',
'eff/lifetime/FieldWriteGate.java':'''package eff.lifetime; public final class FieldWriteGate {private static final ThreadLocal<java.util.IdentityHashMap<Object,Boolean>> ACTIVE=ThreadLocal.withInitial(java.util.IdentityHashMap::new); public static boolean reject(Object target){return ACTIVE.get().containsKey(target)||rejectQuery(target);} public static boolean rejectQuery(Object target){if(!(target instanceof net.minecraft.world.entity.Entity e))return false; var active=ACTIVE.get(); if(active.put(e,true)!=null)return false; try {if(e.index!=null&&!e.admitted){if(e.index.getEntity(12)!=e)return false;e.admitted=true;}return e.owned;}finally{active.remove(e);if(active.isEmpty())ACTIVE.remove();}}}''',
'eff/minecraft/ProjectionProbe.java':'''package eff.minecraft; public final class ProjectionProbe {public static Float storedHealth(net.minecraft.world.entity.LivingEntity e){return e.rawHealth;} public static net.minecraft.world.entity.Entity clientEntityById(Object object,int id){var level=(net.minecraft.client.multiplayer.ClientLevel)object;return (net.minecraft.world.entity.Entity)level.index.byId.get(id);}}''',
'net/minecraft/client/multiplayer/ClientLevel.java':'''package net.minecraft.client.multiplayer; public class ClientLevel {public final net.minecraft.world.level.entity.EntityLookup index=new net.minecraft.world.level.entity.EntityLookup(); public net.minecraft.world.entity.Entity getEntity(int id){return null;}}''',
'it/unimi/dsi/fastutil/ints/Int2ObjectMap.java':'''package it.unimi.dsi.fastutil.ints; public interface Int2ObjectMap<V> extends java.util.Map<Integer,V> {V get(int key);}''',
'it/unimi/dsi/fastutil/ints/FakeMap.java':'''package it.unimi.dsi.fastutil.ints; public class FakeMap<V> extends java.util.HashMap<Integer,V> implements Int2ObjectMap<V> {public V get(int key){return super.get(key);}}''',
'net/minecraft/world/level/entity/EntityLookup.java':'''package net.minecraft.world.level.entity; import java.util.*; public class EntityLookup {public boolean hide=true; public Map<UUID,EntityAccess> byUuid=new HashMap<>(); public it.unimi.dsi.fastutil.ints.Int2ObjectMap<EntityAccess> byId=new it.unimi.dsi.fastutil.ints.FakeMap<>(); public EntityAccess getEntity(UUID id){return hide?null:byUuid.get(id);} public EntityAccess getEntity(int id){return hide?null:byId.get(id);} }''',
}
sources['net/minecraft/server/level/ServerLevel.java']=sources['net/minecraft/client/multiplayer/ClientLevel.java'].replace('client.multiplayer','server.level').replace('ClientLevel','ServerLevel')
sources['net/minecraft/server/level/ServerLevel.java']=sources['net/minecraft/server/level/ServerLevel.java'][:-1]+'''public final java.util.Map<Integer,net.minecraft.world.entity.Entity> parts=new java.util.HashMap<>(); public int interactionBodyCalls; public net.minecraft.world.entity.Entity getEntityOrPart(int id){interactionBodyCalls++;return parts.get(id);}}'''
sources['eff/minecraft/ProjectionProbe.java']=sources['eff/minecraft/ProjectionProbe.java'].replace('public static net.minecraft.world.entity.Entity clientEntityById',
    'public static net.minecraft.world.entity.Entity serverEntityById(Object object,int id){var level=(net.minecraft.server.level.ServerLevel)object;return (net.minecraft.world.entity.Entity)level.index.byId.get(id);} public static net.minecraft.world.entity.Entity clientEntityById')
sources['eff/lifetime/FieldWriteGate.java']=sources['eff/lifetime/FieldWriteGate.java'].replace(
    'public static boolean rejectQuery(Object target){',
    'public static boolean queryFailure; public static boolean rejectQuery(Object target){if(queryFailure)throw new IllegalStateException("fixture query failure");')
sources['eff/minecraft/PlayerLifetime.java']=sources['eff/minecraft/PlayerLifetime.java'].replace('public static boolean rejectOperation',
    'public static long[] observed=new long[5], decisions=new long[12]; public static Object lastObserved; public static void observeWorldDecision(boolean result,Object target,int phase){decisions[phase*2+(result?1:0)]++;lastObserved=target;} public static void observeWorldTick(Object target,int phase){observed[phase]++;lastObserved=target;} public static boolean rejectOperation')
sources['net/minecraft/world/entity/Entity.java']=sources['net/minecraft/world/entity/Entity.java'].replace('public boolean owned;', 'public int tickCount; public boolean owned;')
sources['net/minecraft/world/entity/Entity.java']=sources['net/minecraft/world/entity/Entity.java'].replace('public boolean owned;', 'public Entity vehicle; public boolean riding; public boolean hasPassenger(Entity e){return riding;} public boolean owned;')
sources['net/minecraft/util/profiling/ProfilerFiller.java']='package net.minecraft.util.profiling; public interface ProfilerFiller {}'
sources['net/minecraft/server/level/DistanceManager.java']='package net.minecraft.server.level; public class DistanceManager {public boolean enabled=true; public int calls; public boolean m_183913_(long chunk){calls++;return enabled;}}'
sources['net/minecraft/server/level/ServerLevel.java']=sources['net/minecraft/server/level/ServerLevel.java'][:-1]+'''public boolean skipDispatch, cancelTick, skipGuard;
 public final DistanceManager distance=new DistanceManager();
 public boolean m_143342_(net.minecraft.world.entity.Entity entity){return skipDispatch;}
 public void m_46653_(java.util.function.Consumer<net.minecraft.world.entity.Entity> callback,net.minecraft.world.entity.Entity entity){if(!skipGuard)callback.accept(entity);}
 public void m_184063_(net.minecraft.util.profiling.ProfilerFiller profiler,net.minecraft.world.entity.Entity entity){
  if(entity.isRemoved())return;
  if(m_143342_(entity))return;
  if(!distance.m_183913_(0L))return;
  net.minecraft.world.entity.Entity vehicle=entity.vehicle;
  if(vehicle!=null&&!vehicle.isRemoved()&&vehicle.hasPassenger(entity))return;
  if(!entity.isRemoved())m_46653_(this::tickNonPassenger,entity);
 }
 public void tickNonPassenger(net.minecraft.world.entity.Entity entity){if(cancelTick)return;entity.tickCount++;}
}'''
for name,source in sources.items():
    p=root/'src'/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(source,encoding='utf-8')
jdk=repo.parent/'output/eff-mc1201-tools/jdk/jdk-17.0.20.1+1/bin'
dependencies=sys.argv[1:]
if not dependencies:
    libs=repo/'output/eff-local-native-20261104/forge-client/libraries'
    dependencies=[str(next(libs.rglob(pattern))) for pattern in ['asm-9.9.1.jar','asm-tree-9.9.1.jar']]
cp=';'.join(dependencies)
def run(args):
    result=subprocess.run([str(x) for x in args],capture_output=True,text=True)
    print(result.stdout,end='');print(result.stderr,end='');
    with (root/'test.log').open('a',encoding='utf-8') as f:f.write(result.stdout+result.stderr)
    if result.returncode:raise SystemExit(result.returncode)
run([jdk/'javac.exe','-d',root/'fixtures',*list((root/'src').rglob('*.java'))])
run([jdk/'javac.exe','-cp',cp,'-d',root/'classes',repo/'mc-forge-1.20.1/src/lifetimeGate/java/eff/lifetime/PlayerOperationTransform.java',repo/'mc-forge-1.20.1/tools/final-lifetime/src/eff/finalgate/FinalLifetimeTransform.java',repo/'mc-forge-1.20.1/tools/final-lifetime/src/eff/finalgate/TrustedTickTransform.java',Path(__file__).with_name('FinalLifetimeTest.java'),Path(__file__).with_name('ActualMcShapeTest.java')])
run([jdk/'java.exe','-Xverify:all','-cp',str(root/'classes')+';'+cp,'FinalLifetimeTest',root/'fixtures'])
run([jdk/'java.exe','-Xverify:all','-cp',str(root/'classes')+';'+cp,'ActualMcShapeTest',repo/'output/eff-local-native-20261104/forge-client/libraries/net/minecraft/client/1.20.1-20230612.114412/client-1.20.1-20230612.114412-srg.jar'])
run([jdk/'javac.exe','-d',root/'registry',repo/'mc-1.20.1/src/main/java/eff/minecraft/PlayerLifetimeRegistry.java',Path(__file__).with_name('TickRegistryTest.java')])
run([jdk/'java.exe','-Xverify:all','-cp',root/'registry','TickRegistryTest'])
print('EVIDENCE',root)
