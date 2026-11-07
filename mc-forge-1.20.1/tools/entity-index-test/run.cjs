const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../..');
const javaHome=process.env.JAVA_HOME||path.resolve(root,'../output/eff-mc1201-tools/jdk/jdk-17.0.20.1+1');
const fastutil=process.env.EFF_FASTUTIL_JAR||path.join(root,'output/eff-local-native-20261104/forge-client/libraries/it/unimi/dsi/fastutil/8.5.9/fastutil-8.5.9.jar');
const production=path.join(root,'mc-1.20.1/src/main/java/eff/minecraft/EntityIndexStorage.java');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const sourceSha256=hash(production),fastutilSha256=hash(fastutil);
const out=fs.mkdtempSync(path.join(__dirname,'run-'));
const test=path.join(out,'EntityIndexStorageTest.java');
fs.writeFileSync(test,`import eff.minecraft.EntityIndexStorage;
import java.util.*;
import it.unimi.dsi.fastutil.ints.*;
import it.unimi.dsi.fastutil.objects.*;

public final class EntityIndexStorageTest {
 static class TickBase {
  private Int2ObjectMap<Object> active=new Int2ObjectOpenHashMap<>(),passive=new Int2ObjectOpenHashMap<>(),iterated;
  void seed(Object target){active.put(19,target);}
 }
 static final class TickWrapper extends TickBase {
  private TickBase delegate;
  public Int2ObjectMap<Object> active=new Int2ObjectOpenHashMap<>(); // Shadow must not replace base field.
  TickWrapper(TickBase delegate){this.delegate=delegate;}
  void forEach(java.util.function.Consumer<Object> ignored){throw new AssertionError("FOREIGN_ITERATOR_CALLED");}
 }
 @SuppressWarnings("unchecked") static void tickGraph() {
  Object target=new Object();TickBase actual=new TickBase();actual.seed(target);
  TickWrapper wrapper=new TickWrapper(actual);wrapper.active.put(19,"shadow");
  Map<String,Object> report=EntityIndexStorage.tickListDiagnostic(wrapper,TickBase.class,19,target);
  var nodes=(List<Map<String,Object>>)report.get("nodes");
  check(nodes.size()==2&&!Boolean.TRUE.equals(report.get("truncated")),"bounded delegate graph");
  var outer=(List<Map<String,Object>>)nodes.get(0).get("maps");var inner=(List<Map<String,Object>>)nodes.get(1).get("maps");
  check(Boolean.FALSE.equals(outer.get(0).get("containsOriginal")),"unused inherited storage remains labelled absent");
  check(Boolean.TRUE.equals(inner.get(0).get("containsOriginal")),"actual delegated original recorded");
  check(Boolean.TRUE.equals(inner.get(2).get("nullMap")),"null iterated map is not corruption");
  wrapper.delegate=wrapper;
  report=EntityIndexStorage.tickListDiagnostic(wrapper,TickBase.class,19,target);
  check(((List<?>)report.get("nodes")).size()==1,"cycle bounded without invoking iterator");
  TickBase chain=actual;for(int i=0;i<7;i++)chain=new TickWrapper(chain);
  report=EntityIndexStorage.tickListDiagnostic(chain,TickBase.class,19,target);
  check(Boolean.TRUE.equals(report.get("truncated"))&&((List<?>)report.get("nodes")).size()==5,"depth cap explicit");
  check(Boolean.FALSE.equals(EntityIndexStorage.tickListDiagnostic(new Object(),TickBase.class,19,target).get("readable")),"wrong root refused");
  actual.active.remove(19);
  report=EntityIndexStorage.tickListDiagnostic(actual,TickBase.class,19,target);
  nodes=(List<Map<String,Object>>)report.get("nodes");inner=(List<Map<String,Object>>)nodes.get(0).get("maps");
  check(Boolean.TRUE.equals(inner.get(0).get("entryAbsent")),"removed original never retained or restored");
 }
 static int checks;
 static void check(boolean value,String label){checks++;if(!value)throw new AssertionError(label);}
 interface Checked {void run() throws Exception;}
 static void rejected(Checked action,String label)throws Exception{boolean bad=false;try{action.run();}catch(ReflectiveOperationException|IllegalStateException expected){bad=true;}check(bad,label);}
 static final class HiddenOpen extends Int2ObjectOpenHashMap<Object> {
  public int[] key={19};public Object[] value={"shadow"};public int n=-5,mask=-1,size=99;public boolean containsNullKey=true;
  public Object get(int id){return null;}
  public ObjectCollection<Object> values(){return ObjectSets.emptySet();}
  void rawPut(int id,Object value){super.put(id,value);}void rawRemove(int id){super.remove(id);}
 }
 static final class HiddenLinked extends Int2ObjectLinkedOpenHashMap<Object> {
  public int[] key={19};public Object[] value={"shadow"};public int n=-5,mask=-1,size=99;public boolean containsNullKey=true;
  public Object get(int id){return null;}
  public ObjectCollection<Object> values(){return ObjectSets.emptySet();}
  void rawPut(int id,Object value){super.put(id,value);}void rawRemove(int id){super.remove(id);}
 }
 static final class HiddenUuid extends HashMap<UUID,Object> {
  public Object[] table={"shadow"};public int size=-99,modCount=123;
  public Object get(Object key){return null;}public Collection<Object> values(){return List.of();}
  public Set<Map.Entry<UUID,Object>> entrySet(){return Set.of();}
  void rawPut(UUID id,Object value){super.put(id,value);}void rawRemove(UUID id){super.remove(id);}
 }
 static final class Wrapper extends AbstractMap<Object,Object> {
  Map<?,?> delegate;Wrapper(Map<?,?> value){delegate=value;}
  public Set<Map.Entry<Object,Object>> entrySet(){return Set.of();}
  public Object get(Object key){return null;}
 }
 static final class UntypedWrapper extends AbstractMap<Object,Object> {
  Object delegate;UntypedWrapper(Object value){delegate=value;}
  public Set<Map.Entry<Object,Object>> entrySet(){return Set.of();}
 }
 static final class InheritedDelegate extends HashMap<UUID,Object> {
  Map<UUID,Object> delegate;InheritedDelegate(Map<UUID,Object> value){delegate=value;}
  public Object get(Object key){return delegate.get(key);}
  public Object put(UUID key,Object value){return delegate.put(key,value);}
  public Object remove(Object key){return delegate.remove(key);}
  void ambiguousPut(UUID key,Object value){super.put(key,value);}
 }
 static Object baseField(Object object,Class<?> owner,String field)throws Exception{var f=owner.getDeclaredField(field);f.setAccessible(true);return f.get(object);}
 static void intTests(boolean linked)throws Exception{
  Int2ObjectMap<Object> map=linked?new HiddenLinked():new HiddenOpen();Object target=new Object(),zero=new Object();
  Class<?> owner=linked?Int2ObjectLinkedOpenHashMap.class:Int2ObjectOpenHashMap.class;
  check(EntityIndexStorage.backing(map,true)==map,"subclass backing "+linked);
  check(EntityIndexStorage.byId(map,19)==null,"empty int "+linked);
  if(linked){((HiddenLinked)map).rawPut(19,target);((HiddenLinked)map).rawPut(0,zero);}else{((HiddenOpen)map).rawPut(19,target);((HiddenOpen)map).rawPut(0,zero);}
  check(map.get(19)==null&&map.values().isEmpty(),"virtual filtered int "+linked);
  check(EntityIndexStorage.byId(map,19)==target,"read original superclass int storage "+linked);
  check(EntityIndexStorage.byId(map,0)==zero,"zero id "+linked);
  check(EntityIndexStorage.values(map)==baseField(map,owner,"value"),"ignore shadow value "+linked);
  Wrapper wrapper=new Wrapper(new Wrapper(map));Object actual=EntityIndexStorage.backing(wrapper,true);
  check(actual==map&&EntityIndexStorage.byId(actual,19)==target,"bounded current delegates "+linked);
  if(linked){((HiddenLinked)map).rawRemove(19);((HiddenLinked)map).rawRemove(0);}else{((HiddenOpen)map).rawRemove(19);((HiddenOpen)map).rawRemove(0);}
  check(EntityIndexStorage.byId(map,19)==null&&EntityIndexStorage.byId(map,0)==null,"real deletion absent "+linked);
  check(EntityIndexStorage.byId(map,777)==null,"missing id "+linked);
  // Detached matching slot is not evidence of a registered key. The true probe
  // chain starts at an empty slot and must stop there, not scan all values.
  int[] keys=(int[])baseField(map,owner,"key");Object[] values=(Object[])baseField(map,owner,"value");
  int mask=(Integer)baseField(map,owner,"mask"),hash=23*0x9E3779B9,slot=(hash^(hash>>>16))&mask,detached=(slot+1)&mask;
  keys[detached]=23;values[detached]=target;var size=owner.getDeclaredField("size");size.setAccessible(true);size.setInt(map,1);
  check(EntityIndexStorage.byId(map,23)==null,"detached stale slot rejected "+linked);
 }
 public static void main(String[] args)throws Exception{
  check(!HashMap.class.getDeclaredField("table").trySetAccessible(),"java.util is not globally opened");
  intTests(false);intTests(true);
  UUID key=UUID.fromString("993c3b83-62ac-415f-bd82-78bcf47341e7");Object target=new Object();
  HiddenUuid map=new HiddenUuid();check(EntityIndexStorage.byUUID(map,key)==null,"empty uuid");map.rawPut(key,target);
  check(map.get(key)==null&&map.values().isEmpty()&&map.entrySet().isEmpty(),"uuid virtual views filtered");
  check(EntityIndexStorage.backing(map,false)==map&&EntityIndexStorage.byUUID(map,key)==target,"uuid original superclass table despite shadows");
  Wrapper wrapper=new Wrapper(map);check(EntityIndexStorage.byUUID(EntityIndexStorage.backing(wrapper,false),key)==target,"uuid wrapped current storage");
  map.rawRemove(key);check(EntityIndexStorage.byUUID(map,key)==null,"uuid real deletion absent");
  LinkedHashMap<UUID,Object> linked=new LinkedHashMap<>();linked.put(key,target);check(EntityIndexStorage.byUUID(linked,key)==target,"linked hashmap base node storage");
  HashMap<UUID,Object> actualIndex=new HashMap<>();InheritedDelegate delegating=new InheritedDelegate(actualIndex);
  delegating.put(key,target);
  check(delegating.get(key)==target&&EntityIndexStorage.byUUID(delegating,key)==null,"reproduce unused inherited table false absence");
  check(EntityIndexStorage.backing(delegating,false)==actualIndex,"prefer current explicit delegate to empty superclass table");
  check(EntityIndexStorage.byUUID(EntityIndexStorage.backing(delegating,false),key)==target,"read original UUID object through delegating subclass");
  delegating.remove(key);
  check(EntityIndexStorage.byUUID(EntityIndexStorage.backing(delegating,false),key)==null,"real delegate deletion stays absent, no cache or reinsert");
  HashMap<UUID,Object> nextIndex=new HashMap<>();Object next=new Object();nextIndex.put(key,next);delegating.delegate=nextIndex;
  check(EntityIndexStorage.byUUID(EntityIndexStorage.backing(delegating,false),key)==next,"delegate replacement observed, no retained backing");
  delegating.ambiguousPut(key,target);check(EntityIndexStorage.backing(delegating,false)==null,"two populated storage routes refused");
  InheritedDelegate inheritedCycle=new InheritedDelegate(null);inheritedCycle.delegate=inheritedCycle;
  check(EntityIndexStorage.backing(inheritedCycle,false)==null,"inherited delegate cycle refused");
  check(EntityIndexStorage.backing(new InheritedDelegate(null),false)==null,"null delegate does not fall back to inherited table");
  // Same UUID hash, enough capacity/entries for HashMap tree bins; Node.next must
  // still find the actual value without invoking a subclass lookup.
  HashMap<UUID,Object> tree=new HashMap<>(64);Object[] expected=new Object[16];
  for(int i=0;i<16;i++){expected[i]=new Object();tree.put(new UUID(i,i),expected[i]);}
  for(int i=0;i<16;i++)check(EntityIndexStorage.byUUID(tree,new UUID(i,i))==expected[i],"uuid collision/tree node "+i);
  tree.remove(new UUID(7,7));check(EntityIndexStorage.byUUID(tree,new UUID(7,7))==null,"tree real deletion absent");
  Wrapper cycle=new Wrapper(null);cycle.delegate=cycle;check(EntityIndexStorage.backing(cycle,true)==null,"delegate cycle fail closed");
  Map<?,?> deep=new Int2ObjectOpenHashMap<>();for(int i=0;i<5;i++)deep=new Wrapper(deep);check(EntityIndexStorage.backing(deep,true)==null,"delegate depth fail closed");
  check(EntityIndexStorage.backing(new UntypedWrapper(map),false)==null,"untyped delegate fail closed");
  check(EntityIndexStorage.backing(new TreeMap<>(),false)==null,"unknown map shape fail closed");
  check(EntityIndexStorage.backing(new HashMap<>(),true)==null,"wrong integer family fail closed");
  check(EntityIndexStorage.backing(null,true)==null,"null backing");
  rejected(()->EntityIndexStorage.byId(new HashMap<>(),3),"unknown raw integer rejected");
  rejected(()->EntityIndexStorage.byUUID(new TreeMap<>(),key),"unknown raw uuid rejected");
  rejected(()->EntityIndexStorage.byUUID(map,null),"null uuid rejected");
  tickGraph();
  System.out.println("ENTITY_INDEX_STORAGE_OK checks="+checks+" productionSource=true realFastutil=true javaUtilOpened=false minecraft=false tickGraph=true");
 }
}
`);
const classes=path.join(out,'classes');fs.mkdirSync(classes);
function run(exe,args){const r=cp.spawnSync(path.join(javaHome,'bin',exe+'.exe'),args,{encoding:'utf8',maxBuffer:2*1024*1024});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');if(r.error)throw r.error;if(r.status!==0)throw Error(exe+' exit '+r.status);return r.stdout;}
run('javac',['-encoding','UTF-8','-cp',fastutil,'-d',classes,production,test]);
const result=run('java',['-Xverify:all','-Xmx128m','-cp',classes+path.delimiter+fastutil,'EntityIndexStorageTest']);
if(hash(production)!==sourceSha256)throw Error('Production source changed during validation; rerun required');
fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify({passed:true,sourceSha256,fastutilSha256,javaUtilOpened:false,minecraft:false,result,scope:'Actual storage reader with actual fastutil; synthetic maps only, not live MC acceptance'},null,2));
console.log('Receipt: '+path.join(out,'receipt.json'));
