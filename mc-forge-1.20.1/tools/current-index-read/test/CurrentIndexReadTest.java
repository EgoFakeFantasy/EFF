import eff.minecraft.ProjectionProbe;
import it.unimi.dsi.fastutil.ints.*;
import it.unimi.dsi.fastutil.objects.*;
import java.util.*;
import java.lang.reflect.Field;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.entity.EntityLookup;

/** Actual ProjectionProbe source + actual fastutil; MC declarations are fixtures. */
public final class CurrentIndexReadTest {
  static int checks;
  static void check(boolean ok,String why){checks++;if(!ok)throw new AssertionError(why);}
  static class HiddenIntMap extends AbstractInt2ObjectMap<Object> {
    Map<Integer,Object> delegate;
    HiddenIntMap(Map<Integer,Object> map){delegate=map;}
    public Object get(int id){return null;}
    public int size(){return 0;}
    public ObjectSet<Int2ObjectMap.Entry<Object>> int2ObjectEntrySet(){return ObjectSets.emptySet();}
  }
  static class HiddenUuidMap extends AbstractMap<UUID,Object> {
    Map<UUID,Object> delegate;
    HiddenUuidMap(Map<UUID,Object> map){delegate=map;}
    public Set<Map.Entry<UUID,Object>> entrySet(){return Collections.emptySet();}
  }
  static class UnreviewedMap extends Int2ObjectOpenHashMap<Object>{}
  static Object read(Object o,String name)throws Exception{Field f=o.getClass().getDeclaredField(name);f.setAccessible(true);return f.get(o);}
  static void write(Object o,String name,Object value)throws Exception{Field f=o.getClass().getDeclaredField(name);f.setAccessible(true);f.set(o,value);}
  static Entity add(EntityLookup index,net.minecraft.world.level.Level level,int id){
    Entity e=new Entity();e.id=id;e.level=level;index.byId.put(id,e);index.byUuid.put(e.uuid,e);return e;
  }
  public static void main(String[] args)throws Exception {
    for(boolean linked:new boolean[]{false,true}){
      ServerLevel level=new ServerLevel();EntityLookup lookup=level.entityManager.visibleEntityStorage;
      Int2ObjectMap<Object> actual=linked?new Int2ObjectLinkedOpenHashMap<>():new Int2ObjectOpenHashMap<>();lookup.byId=actual;
      Entity e=add(lookup,level,19);
      check(ProjectionProbe.serverEntityById(level,19)==e,"exact actual map "+linked);
      lookup.byId=new HiddenIntMap(actual);lookup.byUuid=new HiddenUuidMap(lookup.byUuid);
      check(lookup.byId.get(19)==null,"virtual wrapper hides actual entry");
      check(ProjectionProbe.serverEntityById(level,19)==e,"current delegate establishes both indexes "+linked);
      check(ProjectionProbe.clientEntityById(level,19)==null,"wrong level side rejected");
      actual.remove(19);check(ProjectionProbe.serverEntityById(level,19)==null,"real removal never resurrected");
      actual.put(19,e);e.id=20;check(ProjectionProbe.serverEntityById(level,19)==null,"wrong raw id rejected");
      e.id=19;e.level=new ServerLevel();check(ProjectionProbe.serverEntityById(level,19)==null,"wrong raw level rejected");e.level=level;
      Map<UUID,Object> uuidActual=((HiddenUuidMap)lookup.byUuid).delegate;
      uuidActual.put(e.uuid,new Entity());check(ProjectionProbe.serverEntityById(level,19)==null,"UUID identity mismatch rejected");uuidActual.put(e.uuid,e);
      lookup.byUuid=new TreeMap<>();lookup.byUuid.put(e.uuid,e);check(ProjectionProbe.serverEntityById(level,19)==null,"unknown UUID shape rejected");lookup.byUuid=uuidActual;
      HiddenIntMap cycle=new HiddenIntMap(null);cycle.delegate=cycle;lookup.byId=cycle;
      check(ProjectionProbe.serverEntityById(level,19)==null,"delegate cycle terminates");
      lookup.byId=actual;for(int i=0;i<4;i++)lookup.byId=new HiddenIntMap(lookup.byId);
      check(ProjectionProbe.serverEntityById(level,19)==e,"four links admitted");
      lookup.byId=new HiddenIntMap(lookup.byId);check(ProjectionProbe.serverEntityById(level,19)==null,"five links rejected");
      lookup.byId=actual;int n=(int)read(actual,"n"),mask=(int)read(actual,"mask");
      int[] keys=(int[])read(actual,"key");Object[] values=(Object[])read(actual,"value");
      int hash=19*0x9E3779B9,slot=(hash^(hash>>>16))&mask;
      actual.clear();keys[(slot+1)&mask]=19;values[(slot+1)&mask]=e;write(actual,"size",1);
      check(ProjectionProbe.serverEntityById(level,19)==null,"stale matching slot beyond empty probe rejected");
      actual.clear();actual.put(19,e);write(actual,"mask",mask-1);
      check(ProjectionProbe.serverEntityById(level,19)==null,"invalid mask rejected");write(actual,"mask",mask);
      write(actual,"size",0);check(ProjectionProbe.serverEntityById(level,19)==null,"zero size with leftover entry rejected");write(actual,"size",1);
      lookup.byId=new Int2ObjectOpenHashMap<>();check(ProjectionProbe.serverEntityById(level,19)==null,"current replacement ignores old populated container");
      lookup.byId=actual;actual.clear();Entity zero=add(lookup,level,0);
      check(ProjectionProbe.serverEntityById(level,0)==zero,"real zero-key slot accepted");
      write(actual,"containsNullKey",false);check(ProjectionProbe.serverEntityById(level,0)==null,"stale zero value without null-key membership rejected");
      lookup.byId=new UnreviewedMap();add(lookup,level,19);
      check(ProjectionProbe.serverEntityById(level,19)==null,"unreviewed fastutil subclass rejected");
    }
    ClientLevel client=new ClientLevel();Entity original=add(client.entityStorage.entityStorage,client,7);
    check(ProjectionProbe.clientEntityById(client,7)==original,"client path actual fields");
    client.entityStorage.entityStorage.byId=new HiddenIntMap(client.entityStorage.entityStorage.byId);
    check(ProjectionProbe.clientEntityById(client,7)==original,"client wrapper path");
    check(ProjectionProbe.clientEntityById(null,7)==null,"null level");
    check(ProjectionProbe.serverEntityById(new Object(),7)==null,"unknown level");
    System.out.println("CURRENT_INDEX_READ_OK checks="+checks+" actualProjectionProbe=true actualFastutil=true syntheticMC=true noAgent=true noMC=true");
  }
}
