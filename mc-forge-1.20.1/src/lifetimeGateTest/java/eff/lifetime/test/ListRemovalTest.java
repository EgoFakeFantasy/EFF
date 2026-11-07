package eff.lifetime.test;

import eff.lifetime.*;
import java.util.*;
import java.lang.reflect.*;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;

/** Real transformed call sites, including the List view used by spatial indices. */
public final class ListRemovalTest {
  public static final class Target implements LifetimeTarget {
    boolean locked = true;
    int receipts;
    public Object lifetimeKey() { return null; }
    public boolean rejectLifetimeMutation() { return locked; }
    public void lifetimeOperationRejected(String operation) {
      if (operation.equals("collection-remove-present")) receipts++;
    }
  }
  public static class CallerAwareList extends ArrayList<Object> {
    public boolean remove(Object value) {
      if (Thread.currentThread().getStackTrace()[2].getClassName().equals(FieldWriteGate.class.getName()))
        throw new AssertionError("LIST_ORIGINAL_CALLER_CHANGED");
      return super.remove(value);
    }
  }
  public static final class Writer {
    public static boolean list(List<Object> list, Object value) { return list.remove(value); }
    public static boolean array(ArrayList<Object> list, Object value) { return list.remove(value); }
    public static boolean linked(LinkedList<Object> list, Object value) { return list.remove(value); }
    public static Object index(List<Object> list, int index) { return list.remove(index); }
    public static Object arrayIndex(ArrayList<Object> list, int index) { return list.remove(index); }
  }
  public static void run() throws Exception {
    Target control = new Target(); List<Object> untouched = new ArrayList<>(); untouched.add(control);
    if (!Writer.list(untouched, control) || !untouched.isEmpty()) throw new AssertionError("LIST_CONTROL");
    String name = Writer.class.getName();
    byte[] bytes = Writer.class.getResourceAsStream("/" + name.replace('.', '/') + ".class").readAllBytes();
    ClassNode node = new ClassNode(); new ClassReader(bytes).accept(node, 0);
    FieldWriteGate.instrument(node);
    ClassWriter output = new ClassWriter(ClassWriter.COMPUTE_FRAMES); node.accept(output);
    Class<?> caller = new ClassLoader(ListRemovalTest.class.getClassLoader()) {
      Class<?> define() { byte[] b = output.toByteArray(); return defineClass(name, b, 0, b.length); }
    }.define();
    exercise(caller);
    byte[] hiddenBytes = eff.hiddenboundary.HiddenWriteTransform.apply(ListRemovalTest.class, bytes);
    Class<?> hidden = java.lang.invoke.MethodHandles.lookup().defineHiddenClass(hiddenBytes, true,
        java.lang.invoke.MethodHandles.Lookup.ClassOption.NESTMATE).lookupClass();
    if (!hidden.isHidden()) throw new AssertionError("HIDDEN_FIXTURE_NOT_HIDDEN");
    exercise(hidden);
    System.out.println("LIST_REMOVAL_TEST_OK ordinary-and-hidden definitions original identities object/index ordinary release absent null caller");
  }
  private static void exercise(Class<?> caller) throws Exception {
    for (String method : List.of("list", "array", "linked")) {
      Class<?> type = method.equals("list") ? List.class : method.equals("array") ? ArrayList.class : LinkedList.class;
      List<Object> list = method.equals("linked") ? new LinkedList<>() : new CallerAwareList();
      Target target = new Target(); Object ordinary = new Object(); list.add(target); list.add(ordinary);
      Method call = caller.getMethod(method, type, Object.class);
      if (!Boolean.FALSE.equals(call.invoke(null, list, target)) || list.size() != 2 || list.get(0) != target)
        throw new AssertionError("LIST_ORIGINAL_REMOVED:" + method + ":hidden=" + caller.isHidden());
      if (target.receipts != 1) throw new AssertionError("LIST_PRESENT_RECEIPT:" + method);
      call.invoke(null, method.equals("linked") ? new LinkedList<>() : new ArrayList<>(), target);
      if (target.receipts != 1) throw new AssertionError("LIST_ABSENT_FALSE_RECEIPT");
      if (!Boolean.TRUE.equals(call.invoke(null, list, ordinary)) || list.size() != 1)
        throw new AssertionError("LIST_ORDINARY_REMOVAL_CHANGED");
      target.locked = false;
      if (!Boolean.TRUE.equals(call.invoke(null, list, target)) || !list.isEmpty())
        throw new AssertionError("LIST_RELEASE_FAILED");
      expect(call, new Object[]{null, target}, NullPointerException.class);
    }
    for (String method : List.of("index", "arrayIndex")) {
      Class<?> type = method.equals("index") ? List.class : ArrayList.class;
      Method call = caller.getMethod(method, type, int.class);
      ArrayList<Object> list = new ArrayList<>(); Target target = new Target(); Object ordinary = new Object();
      list.add(ordinary); list.add(target);
      if (call.invoke(null, list, 1) != null || list.size() != 2 || list.get(1) != target)
        throw new AssertionError("LIST_INDEX_ORIGINAL_REMOVED");
      if (call.invoke(null, list, 0) != ordinary || list.size() != 1) throw new AssertionError("LIST_INDEX_ORDINARY");
      expect(call, new Object[]{list, -1}, IndexOutOfBoundsException.class);
      expect(call, new Object[]{null, 0}, NullPointerException.class);
      target.locked = false;
      if (call.invoke(null, list, 0) != target || !list.isEmpty()) throw new AssertionError("LIST_INDEX_RELEASE");
    }
  }
  private static void expect(Method call, Object[] args, Class<?> error) throws Exception {
    try { call.invoke(null, args); throw new AssertionError("LIST_EXPECTED_EXCEPTION:" + error); }
    catch (InvocationTargetException failure) { if (!error.isInstance(failure.getCause())) throw failure; }
  }
}
