from pathlib import Path
import subprocess,tempfile
repo=Path(__file__).resolve().parents[4]
base=repo/'output/eff-local-native-20261104'
out=Path(tempfile.mkdtemp(prefix='current-index-read-',dir=base))
jdk=repo.parent/'output/eff-mc1201-tools/jdk/jdk-17.0.20.1+1/bin'
fastutil=base/'forge-client/libraries/it/unimi/dsi/fastutil/8.5.9/fastutil-8.5.9.jar'
gson=base/'forge-client/libraries/com/google/code/gson/gson/2.10.1/gson-2.10.1.jar'
sources={
'net/minecraft/world/level/Level.java':'package net.minecraft.world.level; public class Level {}',
'net/minecraft/world/entity/Entity.java':"""package net.minecraft.world.entity;
public class Entity {public int id;public java.util.UUID uuid=java.util.UUID.randomUUID(); public net.minecraft.world.level.Level level;
 public int getId(){throw new AssertionError("VIRTUAL_ID_USED");} public net.minecraft.world.level.Level level(){throw new AssertionError("VIRTUAL_LEVEL_USED");}
 public java.util.UUID getUUID(){return uuid;} public double getX(){return 0;} public double getY(){return 0;} public double getZ(){return 0;}
 public boolean isAlive(){return true;} public boolean isRemoved(){return false;} public Object getType(){return null;} public net.minecraft.world.phys.Vec3 position(){return new net.minecraft.world.phys.Vec3();}}
""",
'net/minecraft/world/entity/LivingEntity.java':'package net.minecraft.world.entity; public class LivingEntity extends Entity {public int deathTime;public float getHealth(){return 20;} public boolean isDeadOrDying(){return false;}}',
'net/minecraft/server/level/ServerPlayer.java':'package net.minecraft.server.level; public class ServerPlayer extends net.minecraft.world.entity.LivingEntity {}',
'net/minecraft/server/level/ServerLevel.java':"""package net.minecraft.server.level; public class ServerLevel extends net.minecraft.world.level.Level {
 public net.minecraft.world.level.entity.PersistentEntitySectionManager entityManager=new net.minecraft.world.level.entity.PersistentEntitySectionManager();
 public net.minecraft.world.entity.Entity getEntity(int id){return null;} public net.minecraft.world.entity.Entity getEntity(java.util.UUID id){return null;}
 public ServerLevel getServer(){return this;} public ServerLevel getPlayerList(){return this;} public ServerPlayer getPlayer(java.util.UUID id){return null;}}
""",
'net/minecraft/client/multiplayer/ClientLevel.java':'package net.minecraft.client.multiplayer; public class ClientLevel extends net.minecraft.world.level.Level {public net.minecraft.world.level.entity.TransientEntitySectionManager entityStorage=new net.minecraft.world.level.entity.TransientEntitySectionManager();}',
'net/minecraft/world/level/entity/PersistentEntitySectionManager.java':'package net.minecraft.world.level.entity; public class PersistentEntitySectionManager {public EntityLookup visibleEntityStorage=new EntityLookup();}',
'net/minecraft/world/level/entity/TransientEntitySectionManager.java':'package net.minecraft.world.level.entity; public class TransientEntitySectionManager {public EntityLookup entityStorage=new EntityLookup();}',
'net/minecraft/world/level/entity/EntityLookup.java':'package net.minecraft.world.level.entity; public class EntityLookup {public it.unimi.dsi.fastutil.ints.Int2ObjectMap<Object> byId=new it.unimi.dsi.fastutil.ints.Int2ObjectOpenHashMap<>();public java.util.Map<java.util.UUID,Object> byUuid=new java.util.HashMap<>();}',
'net/minecraft/world/phys/Vec3.java':'package net.minecraft.world.phys; public class Vec3 {public double distanceToSqr(Vec3 v){return 0;}}',
'net/minecraft/network/syncher/SynchedEntityData.java':'package net.minecraft.network.syncher; public class SynchedEntityData {public static class DataItem{}}',
'net/minecraft/network/syncher/EntityDataAccessor.java':'package net.minecraft.network.syncher; public class EntityDataAccessor {}',
'eff/minecraft/RawHealthProbe.java':'package eff.minecraft; public class RawHealthProbe {public record Observation(Float value,String diagnostic){} public static class Reader {public Reader(Class<?>... types){} public Observation observe(Object value){return new Observation(20F,"");}}}',
'eff/minecraft/Jsons.java':'package eff.minecraft; public class Jsons {public static com.google.gson.JsonObject obj(Object... v){return new com.google.gson.JsonObject();}public static boolean b(com.google.gson.JsonObject o,String k){return false;}public static double d(com.google.gson.JsonObject o,String k){return 0;}}'
}
for name,text in sources.items():
 p=out/'src'/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text,encoding='utf8')
cp=str(fastutil)+';'+str(gson)
def run(args):
 r=subprocess.run(list(map(str,args)),capture_output=True,text=True)
 with (out/'test.log').open('a',encoding='utf8') as f:f.write(r.stdout+r.stderr)
 print(r.stdout+r.stderr)
 if r.returncode:raise SystemExit(r.returncode)
run([jdk/'javac.exe','-proc:none','-cp',cp,'-d',out/'classes',*list((out/'src').rglob('*.java')),repo/'mc-1.20.1/src/main/java/eff/minecraft/ProjectionProbe.java',Path(__file__).parent/'CurrentIndexReadTest.java'])
run([jdk/'java.exe','-Xverify:all','-Xmx192m','-cp',str(out/'classes')+';'+cp,'CurrentIndexReadTest'])
print('EVIDENCE',out)
