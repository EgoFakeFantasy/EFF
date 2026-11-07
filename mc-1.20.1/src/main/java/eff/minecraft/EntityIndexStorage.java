package eff.minecraft;

import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.util.*;
import it.unimi.dsi.fastutil.ints.Int2ObjectOpenHashMap;
import it.unimi.dsi.fastutil.ints.Int2ObjectLinkedOpenHashMap;

/** Read only current, reviewed map storage. Never invokes a subclass's lookup,
 * scans detached slots, retains entries, or repairs an index. */
public final class EntityIndexStorage {
  // Read-only access to reviewed JDK HashMap storage, without opening java.util
  // globally and without dispatching overridable methods. No write operations.
  private static final sun.misc.Unsafe RAW = rawReader();
  private static sun.misc.Unsafe rawReader() {
    try {
      Field value = sun.misc.Unsafe.class.getDeclaredField("theUnsafe");
      if (!value.trySetAccessible()) throw new IllegalAccessException("UNSAFE_READER_UNAVAILABLE");
      return (sun.misc.Unsafe) value.get(null);
    } catch (ReflectiveOperationException error) { throw new ExceptionInInitializerError(error); }
  }
  private static long offset(Class<?> owner, String name, Class<?> type) throws ReflectiveOperationException {
    Field value = owner.getDeclaredField(name);
    if (Modifier.isStatic(value.getModifiers()) || value.getType() != type)
      throw new IllegalStateException("UNREVIEWED_HASHMAP_FIELD:" + name);
    return RAW.objectFieldOffset(value);
  }
  private static Class<?> intOwner(Object map) {
    if (map instanceof Int2ObjectLinkedOpenHashMap<?>) return Int2ObjectLinkedOpenHashMap.class;
    if (map instanceof Int2ObjectOpenHashMap<?>) return Int2ObjectOpenHashMap.class;
    return null;
  }

  private static Field field(Class<?> owner, String name) throws ReflectiveOperationException {
    Field field = owner.getDeclaredField(name);
    if (Modifier.isStatic(field.getModifiers()) || !field.trySetAccessible())
      throw new IllegalAccessException("INDEX_STORAGE_ACCESS:" + owner.getName() + ":" + name);
    return field;
  }

  public static Object backing(Object value, boolean integerIndex) throws ReflectiveOperationException {
    var seen = new IdentityHashMap<Object, Boolean>();
    for (int depth = 0; depth <= 4 && value instanceof Map<?, ?>; depth++) {
      if (seen.put(value, Boolean.TRUE) != null) return null;
      Field delegate = null;
      for (Class<?> type = value.getClass(); type != null; type = type.getSuperclass()) {
        try { delegate = field(type, "delegate"); break; }
        catch (NoSuchFieldException absent) { }
      }
      if (delegate == null)
        return (integerIndex ? intOwner(value) != null : value instanceof HashMap<?, ?>) ? value : null;
      if (depth == 4 || !Map.class.isAssignableFrom(delegate.getType())) return null;
      // A delegating subclass can inherit a completely unused HashMap table.
      // Do not mistake that empty table for the active UUID index. Conversely,
      // if both storage paths contain entries, refuse the ambiguous container.
      if (value instanceof HashMap<?, ?>
          && RAW.getInt(value, offset(HashMap.class, "size", int.class)) != 0) return null;
      Class<?> integerOwner = intOwner(value);
      if (integerOwner != null && field(integerOwner, "size").getInt(value) != 0) return null;
      value = delegate.get(value);
    }
    return null;
  }

  public static Object[] values(Object map) throws ReflectiveOperationException {
    Class<?> owner = intOwner(map);
    if (owner == null) throw new IllegalStateException("UNKNOWN_INTEGER_STORAGE");
    Object slots = field(owner, "value").get(map);
    if (!(slots instanceof Object[] values) || values.length > 1048577)
      throw new IllegalStateException("INVALID_INTEGER_VALUE_STORAGE");
    return values;
  }

  public static Object byId(Object map, int id) throws ReflectiveOperationException {
    Class<?> owner = intOwner(map);
    if (owner == null) throw new IllegalStateException("UNKNOWN_INTEGER_STORAGE");
    Object keyObject = field(owner, "key").get(map);
    Object[] values = values(map);
    if (!(keyObject instanceof int[] keys)) throw new IllegalStateException("INVALID_INTEGER_KEYS");
    int n = field(owner, "n").getInt(map), mask = field(owner, "mask").getInt(map);
    int size = field(owner, "size").getInt(map);
    boolean containsZero = field(owner, "containsNullKey").getBoolean(map);
    if (n < 2 || n > 1048576 || (n & (n - 1)) != 0 || mask != n - 1
        || keys.length != n + 1 || values.length != n + 1 || size < 0 || size > n)
      throw new IllegalStateException("INVALID_INTEGER_STORAGE");
    if (size == 0) return null;
    if (id == 0) return containsZero && keys[n] == 0 ? values[n] : null;
    int hash = id * 0x9E3779B9, slot = (hash ^ (hash >>> 16)) & mask;
    for (int inspected = 0; inspected < n; inspected++, slot = (slot + 1) & mask) {
      int key = keys[slot];
      if (key == 0) return null;
      if (key == id) return values[slot];
    }
    throw new IllegalStateException("UNTERMINATED_INTEGER_PROBE");
  }

  public static Object byUUID(Object map, UUID uuid) throws ReflectiveOperationException {
    if (!(map instanceof HashMap<?, ?>) || uuid == null)
      throw new IllegalStateException("UNKNOWN_UUID_STORAGE");
    Class<?> nodeClass = Class.forName("java.util.HashMap$Node", false, null);
    Class<?> tableClass = java.lang.reflect.Array.newInstance(nodeClass, 0).getClass();
    long tableOffset = offset(HashMap.class, "table", tableClass);
    long sizeOffset = offset(HashMap.class, "size", int.class);
    long changeOffset = offset(HashMap.class, "modCount", int.class);
    int changes = RAW.getInt(map, changeOffset);
    Object table = RAW.getObject(map, tableOffset);
    int size = RAW.getInt(map, sizeOffset);
    if (size < 0) throw new IllegalStateException("INVALID_UUID_SIZE");
    if (table == null) {
      if (size == 0) return null;
      throw new IllegalStateException("MISSING_UUID_TABLE");
    }
    if (!(table instanceof Object[] buckets) || buckets.length < 1
        || buckets.length > 1048576 || (buckets.length & (buckets.length - 1)) != 0)
      throw new IllegalStateException("INVALID_UUID_TABLE");
    long hashOffset = offset(nodeClass, "hash", int.class), keyOffset = offset(nodeClass, "key", Object.class);
    long valueOffset = offset(nodeClass, "value", Object.class), nextOffset = offset(nodeClass, "next", nodeClass);
    int hash = uuid.hashCode(); hash ^= hash >>> 16;
    Object node = buckets[hash & (buckets.length - 1)];
    Object found = null;
    var seen = new IdentityHashMap<Object, Boolean>();
    for (int count = 0; node != null; count++) {
      if (count >= 65536 || !nodeClass.isInstance(node) || seen.put(node, Boolean.TRUE) != null)
        throw new IllegalStateException("INVALID_UUID_CHAIN");
      if (RAW.getInt(node, hashOffset) == hash && uuid.equals(RAW.getObject(node, keyOffset))) {
        found = RAW.getObject(node, valueOffset); break;
      }
      node = RAW.getObject(node, nextOffset);
    }
    if (changes != RAW.getInt(map, changeOffset) || table != RAW.getObject(map, tableOffset)
        || size != RAW.getInt(map, sizeOffset)) throw new IllegalStateException("UUID_INDEX_CHANGED_DURING_READ");
    return found;
  }

  /** Only live ArrayList slots, never an overridden contains/get or unused tail capacity. */
  public static boolean arrayListContainsOriginal(Object list, Object original) throws ReflectiveOperationException {
    if (!(list instanceof ArrayList<?>)) throw new IllegalStateException("UNREVIEWED_MEMBER_LIST");
    long arrayOffset = offset(ArrayList.class, "elementData", Object[].class);
    long sizeOffset = offset(ArrayList.class, "size", int.class);
    long changesOffset = offset(AbstractList.class, "modCount", int.class);
    int changes = RAW.getInt(list, changesOffset), size = RAW.getInt(list, sizeOffset);
    Object data = RAW.getObject(list, arrayOffset);
    if (!(data instanceof Object[] values) || size < 0 || size > values.length || size > 65536)
      throw new IllegalStateException("INVALID_MEMBER_LIST");
    boolean found = false;
    for (int i = 0; i < size; i++) if (values[i] == original) { found = true; break; }
    if (changes != RAW.getInt(list, changesOffset) || size != RAW.getInt(list, sizeOffset)
        || data != RAW.getObject(list, arrayOffset)) throw new IllegalStateException("MEMBER_LIST_CHANGED_DURING_READ");
    return found;
  }

  /** Bounded read-only graph, not an assertion that a wrapper actually iterates its maps.
   * Reads base fields and typed list delegates; never calls foreign forEach/get/iterator. */
  public static Map<String,Object> tickListDiagnostic(Object root, Class<?> base, int id, Object original) {
    Map<String,Object> result = new LinkedHashMap<>();
    result.put("scope", "stored-tick-list-graph-not-execution-proof");
    result.put("readable", false); result.put("truncated", false);
    List<Map<String,Object>> nodes = new ArrayList<>(); result.put("nodes", nodes);
    if (root == null || base == null || !base.isInstance(root)) { result.put("error", "ROOT_TYPE"); return result; }
    List<Object> pending = new ArrayList<>(); List<Integer> depths = new ArrayList<>();
    IdentityHashMap<Object,Integer> identities = new IdentityHashMap<>();
    pending.add(root); depths.add(0); identities.put(root,0);
    String[][] slots = {{"active","f_156903_"},{"passive","f_156904_"},{"iterated","f_156905_"}};
    for (int index=0; index<pending.size() && index<8; index++) {
      Object list=pending.get(index); int depth=depths.get(index);
      Map<String,Object> node=new LinkedHashMap<>();nodes.add(node);
      node.put("index",index);node.put("class",list.getClass().getName());node.put("identity",System.identityHashCode(list));
      List<Map<String,Object>> maps=new ArrayList<>(),edges=new ArrayList<>();node.put("maps",maps);node.put("delegates",edges);
      for(String[] names:slots) {
        Map<String,Object> observation=new LinkedHashMap<>();observation.put("slot",names[0]);maps.add(observation);
        try {
          Field slot;try{slot=field(base,names[0]);}catch(NoSuchFieldException missing){slot=field(base,names[1]);}
          Object map=slot.get(list);observation.put("mapClass",map==null?"null":map.getClass().getName());
          observation.put("mapIdentity",System.identityHashCode(map));
          if(map==null){observation.put("nullMap",true);continue;}
          Object storage=backing(map,true);
          if(storage==null){observation.put("error","UNREVIEWED_OR_AMBIGUOUS_STORAGE");continue;}
          observation.put("storageClass",storage.getClass().getName());observation.put("storageIdentity",System.identityHashCode(storage));
          Object entry=byId(storage,id);observation.put("containsOriginal",entry==original);
          observation.put("entryAbsent",entry==null);observation.put("entryIdentity",System.identityHashCode(entry));
          observation.put("readable",true);
        }catch(ReflectiveOperationException|RuntimeException|LinkageError unavailable){observation.put("error",unavailable.getClass().getName());}
      }
      int classes=0,fields=0;
      for(Class<?> type=list.getClass();type!=null&&base.isAssignableFrom(type);type=type.getSuperclass()) {
        if(++classes>16){result.put("truncated",true);break;}
        for(Field candidate:type.getDeclaredFields()) {
          if(++fields>64){result.put("truncated",true);break;}
          if(Modifier.isStatic(candidate.getModifiers())||!base.isAssignableFrom(candidate.getType()))continue;
          Map<String,Object> edge=new LinkedHashMap<>();edges.add(edge);
          edge.put("declaringClass",type.getName());edge.put("field",candidate.getName());
          try {
            if(!candidate.trySetAccessible())throw new IllegalAccessException("TICK_DELEGATE_ACCESS");
            Object delegate=candidate.get(list);edge.put("identity",System.identityHashCode(delegate));
            if(delegate==null){edge.put("nullDelegate",true);continue;}
            Integer seen=identities.get(delegate);
            if(seen!=null){edge.put("node",seen);edge.put("alreadySeen",true);continue;}
            if(depth>=4||pending.size()>=8){result.put("truncated",true);edge.put("unexplored",true);continue;}
            int next=pending.size();identities.put(delegate,next);pending.add(delegate);depths.add(depth+1);edge.put("node",next);
          }catch(ReflectiveOperationException|RuntimeException|LinkageError unavailable){edge.put("error",unavailable.getClass().getName());}
        }
        if(fields>64)break;
      }
    }
    result.put("readable",true);return result;
  }

  private EntityIndexStorage() { }
}
