package proof;
import eff.ownedboot.InstanceWriteGuard;
import java.util.*;
import java.lang.reflect.*;
import net.minecraft.world.level.entity.*;
import sun.misc.Unsafe;
/** Synthetic policy check only: production helper at bootstrap, no MC or opponent. */
public final class IndexLeasePolicyTest {
 static int checks;
 static boolean integrated;
 static final class Entry implements eff.lifetime.LifetimeTarget,EntityAccess {boolean active=true;public boolean rejectLifetimeMutation(){return active;}}
 public static final class Other {public Map<Object,Object> byUuid;}
 static class HidingMap extends AbstractMap<Object,Object> {
  Map<Object,Object> delegate;
  HidingMap(Map<Object,Object> value){delegate=value;}
  public Set<Map.Entry<Object,Object>> entrySet(){return Collections.emptySet();}
  public Object get(Object key){return null;}
 }
 static void check(boolean ok,String message){checks++;if(!ok)throw new AssertionError(message);}
 static void guardedSet(Field field,Object receiver,Object next)throws Exception {
  field.setAccessible(true);if(integrated||!InstanceWriteGuard.denyField(field,receiver))field.set(receiver,next);
 }
 public static void main(String[] args)throws Exception {
  integrated=args.length>0&&args[0].equals("--installed-agent");
  if(integrated){Class.forName("eff.lifetime.FieldWriteGate");Class.forName("eff.lifetime.LifetimeTarget");}
  else InstanceWriteGuard.install(value -> value instanceof Entry entry && entry.active);
  Field uf=Unsafe.class.getDeclaredField("theUnsafe");uf.setAccessible(true);Unsafe unsafe=(Unsafe)uf.get(null);
  Entry original=new Entry();Map<Object,Object> values=new HashMap<>();values.put("original",original);
  EntityLookup lookup=new EntityLookup(values);Field uuid=EntityLookup.class.getField("byUuid"),id=EntityLookup.class.getField("byId");
  check(InstanceWriteGuard.denyField(uuid,lookup),"owned map representation leased");
  Map<Object,Object> filtered=new HidingMap(values);guardedSet(uuid,lookup,filtered);
  check(lookup.byUuid==values&&lookup.byUuid.get("original")==original,"filter view rejected before write");
  guardedSet(uuid,lookup,new HashMap<>(values));check(lookup.byUuid==values,"same values do not authorize replacing final representation");
  guardedSet(uuid,lookup,values);check(lookup.byUuid==values,"same-object assignment safely unchanged");
  lookup.byId.put(19,original);check(InstanceWriteGuard.denyField(id,lookup),"primitive id index leased");
  long offset=unsafe.objectFieldOffset(id),width=unsafe.arrayIndexScale(Object[].class);
  if(integrated){
   byte[] bytes;try(var in=IndexLeasePolicyTest.class.getResourceAsStream("HiddenIndexWriter.class")){bytes=in.readAllBytes();}
   var lookupHidden=java.lang.invoke.MethodHandles.lookup().defineHiddenClass(bytes,true);
   check(lookupHidden.lookupClass().isHidden(),"real hidden reference writer");
   var write=lookupHidden.findStatic(lookupHidden.lookupClass(),"write",java.lang.invoke.MethodType.methodType(void.class,Object.class,Field.class,Object.class,Unsafe.class));
   try{write.invoke(lookup,uuid,filtered,unsafe);}catch(Throwable error){throw new AssertionError("HIDDEN_INDEX_WRITER",error);}
   check(lookup.byUuid==values,"actual hidden Field.set and Unsafe denied");
   check(!unsafe.compareAndSwapObject(lookup,unsafe.objectFieldOffset(uuid),values,filtered)&&lookup.byUuid==values,"actual index CAS returns false without replacing");
  }
  check(InstanceWriteGuard.denyUnsafe(lookup,offset,width),"exact reference span");
  check(InstanceWriteGuard.denyUnsafe(lookup,offset+1,1),"partial overlapping reference span");
  check(!InstanceWriteGuard.denyUnsafe(lookup,1000000,4),"unrelated address not blanket blocked");
  check(!InstanceWriteGuard.denyUnsafe(lookup,-1,4)&&!InstanceWriteGuard.denyUnsafe(lookup,Long.MAX_VALUE,4),"invalid ranges unchanged");
  PersistentEntitySectionManager manager=new PersistentEntitySectionManager(lookup);
  check(InstanceWriteGuard.denyField(PersistentEntitySectionManager.class.getField("visibleEntityStorage"),manager),"manager traverses actual lookup");
  check(InstanceWriteGuard.denyField(PersistentEntitySectionManager.class.getField("entityGetter"),manager),"getter traverses actual lookup");
  check(!InstanceWriteGuard.denyField(PersistentEntitySectionManager.class.getField("f_157496_"),manager),"wrong descriptor not selected");
  TransientEntitySectionManager client=new TransientEntitySectionManager(lookup);
  check(InstanceWriteGuard.denyField(TransientEntitySectionManager.class.getField("entityStorage"),client),"client index leased");
  check(InstanceWriteGuard.denyField(TransientEntitySectionManager.class.getField("entityGetter"),client),"client getter leased");
  EntityLookup empty=new EntityLookup(new HashMap<>());
  check(!InstanceWriteGuard.denyField(uuid,empty),"empty/constructor state writable");
  empty.byUuid.put("ordinary",new Object());check(!InstanceWriteGuard.denyField(uuid,empty),"unowned contents writable");
  EntityLookup prewrapped=new EntityLookup(filtered);
  check(InstanceWriteGuard.denyField(uuid,prewrapped),"actual typed delegate prevents hidden ownership from reopening writes");
  check(prewrapped.byUuid.get("original")==null,"preclaim existing filter remains unrepaired");
  HidingMap cycle=new HidingMap(null);cycle.delegate=cycle;
  check(!InstanceWriteGuard.denyField(uuid,new EntityLookup(cycle)),"typed delegate cycles terminate without claiming ownership");
  Map<Object,Object> deep=values;for(int i=0;i<10;i++)deep=new HidingMap(deep);
  check(!InstanceWriteGuard.denyField(uuid,new EntityLookup(deep)),"delegate depth bound does not inspect unreachable owner");
  Map<Object,Object> budgetLimited=new HidingMap(values){
   public Collection<Object> values(){return Collections.nCopies(65536,new Object());}
  };
  check(!InstanceWriteGuard.denyField(uuid,new EntityLookup(budgetLimited)),"entry budget bounds filtered delegate exploration");
  Map<Object,Object> current=new HashMap<>();current.put("original",original);EntityLookup cleared=new EntityLookup(current);
  check(InstanceWriteGuard.denyField(uuid,cleared),"current contents initially leased");
  current.clear();check(!InstanceWriteGuard.denyField(uuid,cleared),"clearing actual current storage releases lease without cached owners");
  Map<Object,Object> afterClear=new HashMap<>();guardedSet(uuid,cleared,afterClear);
  check(cleared.byUuid==afterClear,"cleared storage replacement executes");
  EntityTickList ticks=new EntityTickList();ticks.active.put(19,original);
  for(String name:List.of("active","passive","iterated"))check(!InstanceWriteGuard.denyField(EntityTickList.class.getField(name),ticks),"tick alias writable:"+name);
  Field active=EntityTickList.class.getField("active");Object previous=ticks.active;
  guardedSet(active,ticks,ticks.passive);check(ticks.active==ticks.passive,"legitimate tick-list Field.set swap executes");
  if(integrated)check(unsafe.compareAndSwapObject(ticks,unsafe.objectFieldOffset(active),ticks.active,previous)&&ticks.active==previous,"legitimate tick-list CAS executes");
  Other other=new Other();other.byUuid=values;check(!InstanceWriteGuard.denyField(Other.class.getField("byUuid"),other),"same field name unrelated owner writable");
  check(!InstanceWriteGuard.denyField(EntityLookup.class.getField("f_156808_"),lookup),"static field excluded");
  String name=EntityLookup.class.getName();byte[] bytes;
  try(var in=EntityLookup.class.getResourceAsStream("EntityLookup.class")){bytes=in.readAllBytes();}
  ClassLoader foreign=new ClassLoader(IndexLeasePolicyTest.class.getClassLoader()){
   protected Class<?> loadClass(String requested,boolean resolve)throws ClassNotFoundException {
    if(!requested.equals(name))return super.loadClass(requested,resolve);
    synchronized(getClassLoadingLock(requested)){Class<?> found=findLoadedClass(requested);if(found==null)found=defineClass(requested,bytes,0,bytes.length);if(resolve)resolveClass(found);return found;}
   }
  };
  Class<?> wrong=foreign.loadClass(name);Object foreignLookup=wrong.getConstructor(Map.class).newInstance(values);
  check(!InstanceWriteGuard.denyField(wrong.getField("byUuid"),foreignLookup),"foreign declaration loader cannot claim authenticated entry");
  original.active=false;
  check(!InstanceWriteGuard.denyField(uuid,lookup)&&!InstanceWriteGuard.denyUnsafe(lookup,offset,width),"released contents writable");
  Map<Object,Object> replacement=new HashMap<>();guardedSet(uuid,lookup,replacement);check(lookup.byUuid==replacement,"released replacement executes");
  System.out.println("INDEX_LEASE_POLICY_OK checks="+checks+" actualBootstrapHelper=true syntheticPredicate="+!integrated+" realAgent="+integrated+" noMC=true preclaimFilterRemains=true");
 }
}
