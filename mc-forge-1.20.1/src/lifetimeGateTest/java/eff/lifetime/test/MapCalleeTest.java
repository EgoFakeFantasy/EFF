package eff.lifetime.test;

import eff.finalgate.FinalLifetimeTransform;
import eff.lifetime.LifetimeTarget;
import it.unimi.dsi.fastutil.ints.Int2ObjectMap;
import java.lang.invoke.*;

/** Actual fastutil classes and a hidden caller: protection must live at the callee. */
final class MapCalleeTest {
  public static final class HiddenCaller {
    public static Object remove(Int2ObjectMap<?> map, int key) { return map.remove(key); }
    public static void clear(Int2ObjectMap<?> map) { map.clear(); }
  }
  public static final class Target implements LifetimeTarget {
    boolean owned = true;
    int receipts;
    public void lifetimeOperationRejected(String operation) {
      if (!"map-remove-present".equals(operation)) throw new AssertionError("UNEXPECTED_OPERATION");
      receipts++;
    }
    public boolean rejectLifetimeMutation() { return owned; }
    public Object lifetimeKey() { return null; }
  }
  static void run() throws Exception {
    byte[] caller = HiddenCaller.class.getResourceAsStream("/" + HiddenCaller.class.getName().replace('.', '/') + ".class").readAllBytes();
    var hidden = MethodHandles.lookup().defineHiddenClass(caller, true, MethodHandles.Lookup.ClassOption.NESTMATE);
    if (!hidden.lookupClass().isHidden()) throw new AssertionError("REAL_HIDDEN_CALLER_REQUIRED");
    var remove = hidden.findStatic(hidden.lookupClass(), "remove", MethodType.methodType(Object.class, Int2ObjectMap.class, int.class));
    var clear = hidden.findStatic(hidden.lookupClass(), "clear", MethodType.methodType(void.class, Int2ObjectMap.class));
    for (String simple : new String[]{"Int2ObjectLinkedOpenHashMap", "Int2ObjectOpenHashMap"}) {
      String name = "it.unimi.dsi.fastutil.ints." + simple;
      ClassLoader loader = new ClassLoader(MapCalleeTest.class.getClassLoader()) {
        @Override protected Class<?> loadClass(String requested, boolean resolve) throws ClassNotFoundException {
          if (!requested.equals(name) && !requested.startsWith(name + "$")) return super.loadClass(requested, resolve);
          synchronized (getClassLoadingLock(requested)) {
            Class<?> found = findLoadedClass(requested);
            if (found == null) try (var in = getParent().getResourceAsStream(requested.replace('.', '/') + ".class")) {
              if (in == null) throw new ClassNotFoundException(requested);
              byte[] bytes = in.readAllBytes();
              if (requested.equals(name)) {
                var changed = FinalLifetimeTransform.transform(bytes);
                if (changed.methods() != 2) throw new AssertionError("MAP_CALLEE_SHAPE");
                bytes = changed.bytes();
              }
              found = defineClass(requested, bytes, 0, bytes.length);
            } catch (java.io.IOException e) { throw new ClassNotFoundException(requested, e); }
            if (resolve) resolveClass(found); return found;
          }
        }
      };
      @SuppressWarnings("unchecked") Int2ObjectMap<Object> map = (Int2ObjectMap<Object>) loader.loadClass(name).getConstructor().newInstance();
      Target target = new Target(); Object ordinary = new Object(); map.put(7, target); map.put(8, ordinary);
      try {
        if (remove.invoke(map, 7) != null || map.get(7) != target) throw new AssertionError("HIDDEN_REMOVAL_NOT_PREVENTED");
        if (target.receipts != 1) throw new AssertionError("MISSING_ACTUAL_REMOVAL_RECEIPT");
        if (remove.invoke(map, 8) != ordinary || map.containsKey(8)) throw new AssertionError("UNOWNED_REMOVAL_CHANGED");
        clear.invoke(map);
        if (map.get(7) != target) throw new AssertionError("HIDDEN_CLEAR_NOT_PREVENTED");
        target.owned = false;
        if (remove.invoke(map, 7) != target || map.containsKey(7)) throw new AssertionError("RELEASED_REMOVAL_BLOCKED");
        map.put(8, ordinary); clear.invoke(map);
        if (!map.isEmpty()) throw new AssertionError("ORDINARY_CLEAR_BLOCKED");
        target.owned = true; map.defaultReturnValue(target);
        int before = target.receipts;
        if (remove.invoke(map, 999) != target) throw new AssertionError("ABSENT_KEY_DEFAULT_VALUE_CHANGED");
        eff.lifetime.FieldWriteGate.rejectQuery(target);
        eff.lifetime.FieldWriteGate.remember(target);
        if (target.receipts != before) throw new AssertionError("ABSENCE_OR_QUERY_COUNTED_AS_WRITE");
      } catch (Throwable error) { throw new AssertionError("MAP_CALLEE_HIDDEN_TEST:" + simple, error); }
    }
    System.out.println("REAL_FASTUTIL_HIDDEN_CALLER_PREWRITE_OK");
  }
}
