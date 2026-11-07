package eff.lifetime.test;

import eff.lifetime.*;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;

/** Execute real transformed bytecode; test rejection, release, ordinary objects and null semantics. */
public final class GateTest {
  public static class CallerAwareMap extends java.util.HashMap<Object,Object> {
    @Override public Object remove(Object key) {
      if (Thread.currentThread().getStackTrace()[2].getClassName().equals("eff.lifetime.FieldWriteGate"))
        throw new AssertionError("ORIGINAL_CALLER_CHANGED");
      return super.remove(key);
    }
  }
  public static class Target implements LifetimeTarget {
    public int deathTime;
    public Object removalReason;
    public boolean canUpdate = true;
    public boolean locked;
    public final Object key = java.util.UUID.randomUUID();
    public Object lifetimeKey() { return key; }
    public boolean rejectLifetimeMutation() { return locked; }
    public void setRemoved(Object reason) {
      removalReason = reason;
      // A merged hook assumes the write happened; rejection must stop this transaction first.
      deathTime = removalReason.toString().length();
    }
  }
  public static class Writer {
    public static void write(Target target, Object reason) {
      target.deathTime = 42; target.removalReason = reason; target.canUpdate = false;
    }
    public static void replace(Holder holder, java.util.Map<Object,Object> values) { holder.byUuid = values; }
    public static void clearIteration(Holder holder) { holder.iterated = null; }
    public static Object remove(java.util.Map<Object,Object> values, Object key) { return values.remove(key); }
    public static boolean removePair(java.util.Map<Object,Object> values, Object key, Object value) { return values.remove(key, value); }
    public static boolean removeUuid(java.util.Set<Object> values, Object key) { return values.remove(key); }
    public static boolean removeIntPair(it.unimi.dsi.fastutil.ints.Int2ObjectMap<Object> values, int key, Object value) { return values.remove(key, value); }
  }
  public static class Holder {
    public java.util.Map<Object,Object> byUuid = new java.util.HashMap<>();
    public java.util.Map<Object,Object> iterated;
  }
  private static void recursiveAdmissionTest() {
    class RecursiveTarget implements LifetimeTarget {
      boolean registered = true, fail;
      int queries;
      public Object lifetimeKey() { return null; }
      public boolean rejectLifetimeMutation() {
        queries++;
        if (fail) throw new IllegalStateException("predicate-failure");
        if (FieldWriteGate.rejectQuery(this)) throw new AssertionError("RECURSIVE_QUERY_NOT_DELEGATED");
        if (!FieldWriteGate.reject(this)) throw new AssertionError("NESTED_WRITE_BYPASSED_GUARD");
        return registered;
      }
    }
    var target = new RecursiveTarget();
    if (!FieldWriteGate.rejectQuery(target) || target.queries != 1)
      throw new AssertionError("REGISTERED_ADMISSION_FAILED");
    target.registered = false;
    if (FieldWriteGate.rejectQuery(target)) throw new AssertionError("ABSENT_INDEX_FABRICATED");
    target.fail = true;
    try { FieldWriteGate.rejectQuery(target); throw new AssertionError("PREDICATE_EXCEPTION_HIDDEN"); }
    catch (IllegalStateException expected) { if (!"predicate-failure".equals(expected.getMessage())) throw expected; }
    target.fail = false; target.registered = true;
    int before = target.queries;
    if (!FieldWriteGate.rejectQuery(target) || target.queries != before + 1)
      throw new AssertionError("REENTRANCY_SCOPE_NOT_RELEASED");
  }
  public static void main(String[] args) throws Exception {
    PlayerProtectionTest.run();
    recursiveAdmissionTest();
    runtimeObjectOwnershipTest();
    WorldRendererOwnershipTest.run();
    ListRemovalTest.run();
    SectionMembershipProbeTest.run();
    MapCalleeTest.run();
    ProjectionRenderRouteTest.run();
    String name = Writer.class.getName();
    byte[] bytes = Writer.class.getResourceAsStream("/" + name.replace('.', '/') + ".class").readAllBytes();
    ClassNode node = new ClassNode(); new ClassReader(bytes).accept(node, 0);
    if (FieldWriteGate.instrument(node) < 8) throw new AssertionError("FIELD_AND_CONTAINER_COVERAGE");
    ClassWriter writer = new ClassWriter(ClassWriter.COMPUTE_FRAMES); node.accept(writer);
    Class<?> transformed = new ClassLoader(GateTest.class.getClassLoader()) {
      Class<?> loadTransformed() { return defineClass(name, writer.toByteArray(), 0, writer.toByteArray().length); }
    }.loadTransformed();
    var call = transformed.getMethod("write", Target.class, Object.class);
    Target target = new Target(); target.locked = true;
    call.invoke(null, target, "removed");
    if (target.deathTime != 0 || target.removalReason != null || !target.canUpdate)
      throw new AssertionError("PREWRITE_NOT_BLOCKED");
    target.locked = false; call.invoke(null, target, "allowed");
    if (target.deathTime != 42 || !"allowed".equals(target.removalReason) || target.canUpdate)
      throw new AssertionError("RELEASE_NOT_PRESERVED");
    if (FieldWriteGate.reject(new Object())) throw new AssertionError("ORDINARY_OBJECT_BLOCKED");
    try { call.invoke(null, null, "x"); throw new AssertionError("NULL_WRITE_ACCEPTED"); }
    catch (java.lang.reflect.InvocationTargetException e) {
      if (!(e.getCause() instanceof NullPointerException)) throw e;
    }
    String targetName = Target.class.getName();
    ClassNode targetNode = new ClassNode();
    new ClassReader(Target.class.getResourceAsStream("/" + targetName.replace('.', '/') + ".class").readAllBytes()).accept(targetNode, 0);
    FieldWriteGate.instrument(targetNode);
    ClassWriter targetWriter = new ClassWriter(ClassWriter.COMPUTE_FRAMES); targetNode.accept(targetWriter);
    Class<?> guardedTarget = new ClassLoader(GateTest.class.getClassLoader()) {
      Class<?> loadTransformed() { byte[] b = targetWriter.toByteArray(); return defineClass(targetName, b, 0, b.length); }
    }.loadTransformed();
    Object guarded = guardedTarget.getConstructor().newInstance();
    guardedTarget.getField("locked").setBoolean(guarded, true);
    guardedTarget.getMethod("setRemoved", Object.class).invoke(guarded, "removed");
    if (guardedTarget.getField("removalReason").get(guarded) != null
        || guardedTarget.getField("deathTime").getInt(guarded) != 0) throw new AssertionError("PARTIAL_REMOVAL_TRANSACTION");
    guardedTarget.getField("locked").setBoolean(guarded, false);
    guardedTarget.getMethod("setRemoved", Object.class).invoke(guarded, "allowed");
    if (guardedTarget.getField("deathTime").getInt(guarded) != 7) throw new AssertionError("RELEASED_TRANSACTION_FAILED");
    target.locked = true; FieldWriteGate.remember(target);
    Holder holder = new Holder(); holder.byUuid.put("entity", target);
    Object originalMap = holder.byUuid;
    holder.iterated = holder.byUuid;
    transformed.getMethod("clearIteration", Holder.class).invoke(null, holder);
    if (holder.iterated != null || holder.byUuid != originalMap) throw new AssertionError("ITERATION_ALIAS_NOT_RELEASED");
    transformed.getMethod("replace", Holder.class, java.util.Map.class).invoke(null, holder, new java.util.HashMap<>());
    if (holder.byUuid != originalMap) throw new AssertionError("INDEX_REPLACED_WITHOUT_ORIGINAL");
    var retained = new java.util.HashMap<>(holder.byUuid);
    transformed.getMethod("replace", Holder.class, java.util.Map.class).invoke(null, holder, retained);
    if (holder.byUuid != retained) throw new AssertionError("IDENTITY_PRESERVING_REINDEX_BLOCKED");
    transformed.getMethod("remove", java.util.Map.class, Object.class).invoke(null, holder.byUuid, "entity");
    transformed.getMethod("removePair", java.util.Map.class, Object.class, Object.class).invoke(null, holder.byUuid, "entity", target);
    if (holder.byUuid.get("entity") != target) throw new AssertionError("DIRECT_MAP_REMOVAL");
    var ids = new java.util.HashSet<Object>(); ids.add(target.key);
    transformed.getMethod("removeUuid", java.util.Set.class, Object.class).invoke(null, ids, target.key);
    if (!ids.contains(target.key)) throw new AssertionError("UUID_SET_REMOVAL");
    var intMap = new it.unimi.dsi.fastutil.ints.Int2ObjectOpenHashMap<Object>(); intMap.put(3, target);
    transformed.getMethod("removeIntPair", it.unimi.dsi.fastutil.ints.Int2ObjectMap.class, int.class, Object.class).invoke(null, intMap, 3, target);
    if (intMap.get(3) != target) throw new AssertionError("PRIMITIVE_MAP_REMOVAL");
    target.locked = false;
    transformed.getMethod("remove", java.util.Map.class, Object.class).invoke(null, holder.byUuid, "entity");
    transformed.getMethod("removeUuid", java.util.Set.class, Object.class).invoke(null, ids, target.key);
    if (!holder.byUuid.isEmpty() || !ids.isEmpty()) throw new AssertionError("RELEASED_CONTAINER_REMOVAL");
    var largeOrdinary = java.util.Collections.nCopies(70000, new Object());
    if (FieldWriteGate.rejectReplacement(largeOrdinary, java.util.List.of())) throw new AssertionError("UNRELATED_LARGE_CONTAINER_BLOCKED");
    coreTickWrapperTest();
    coreTickScopeTest();
    ServiceIteratorStaticTest.run();
    RawHealthProbeTest.run();
    RendererLeaseTest.run();
    StaticArgumentIsolationTest.run();
    StaticArgumentIsolationServiceTest.run();
    superRemovalTest(transformed);
    storedRemovalQueryTest(false);
    storedRemovalQueryTest(true);
    System.out.println("FIELD_GATE_BYTECODE_TEST_OK");
  }
  private static void runtimeObjectOwnershipTest() throws Exception {
    class Renderer implements LifetimeRenderer {
      Object owner = new Object();
      public boolean lifetimeRendererOwned() { return false; }
      public Object lifetimeRendererOwner() { return owner; }
    }
    var renderer = new Renderer();
    if (!FieldWriteGate.isOwnedRuntimeObject(renderer)) throw new AssertionError("PRECLAIM_RENDERER_OWNER_IGNORED");
    var map = new java.util.HashMap<Object,Object>();map.put("renderer", renderer);
    if (!FieldWriteGate.isOwnedRuntimeObject(map)) throw new AssertionError("PRECLAIM_RENDERER_MAP_IGNORED");
    var cw = new ClassWriter(0);String name = "net/minecraft/client/renderer/entity/EntityRenderDispatcher";
    cw.visit(Opcodes.V17, Opcodes.ACC_PUBLIC, name, null, "java/lang/Object", null);
    cw.visitField(Opcodes.ACC_PUBLIC,"renderers","Ljava/util/Map;",null,null).visitEnd();
    var ctor = cw.visitMethod(Opcodes.ACC_PUBLIC,"<init>","()V",null,null);ctor.visitCode();ctor.visitVarInsn(Opcodes.ALOAD,0);
    ctor.visitMethodInsn(Opcodes.INVOKESPECIAL,"java/lang/Object","<init>","()V",false);ctor.visitInsn(Opcodes.RETURN);ctor.visitMaxs(1,1);ctor.visitEnd();cw.visitEnd();
    Class<?> dispatcherClass = new ClassLoader(GateTest.class.getClassLoader()) { Class<?> make() {byte[] b=cw.toByteArray();return defineClass(name.replace('/','.'),b,0,b.length);} }.make();
    Object dispatcher=dispatcherClass.getConstructor().newInstance();dispatcherClass.getField("renderers").set(dispatcher,map);
    if(!FieldWriteGate.isOwnedRuntimeObject(dispatcher))throw new AssertionError("PRECLAIM_DISPATCHER_IGNORED");
    renderer.owner=null;
    if(FieldWriteGate.isOwnedRuntimeObject(renderer)||FieldWriteGate.isOwnedRuntimeObject(map)||FieldWriteGate.isOwnedRuntimeObject(dispatcher))throw new AssertionError("UNOWNED_RENDERER_SERVICE_PROTECTED");
    Target target=new Target();target.locked=true;map.clear();map.put("entity",target);
    if(!FieldWriteGate.isOwnedRuntimeObject(target)||!FieldWriteGate.isOwnedRuntimeObject(map))throw new AssertionError("CLAIMED_RUNTIME_STORAGE_UNPROTECTED");
    target.locked=false;if(FieldWriteGate.isOwnedRuntimeObject(map)||FieldWriteGate.isOwnedRuntimeObject(new Object()))throw new AssertionError("UNOWNED_RUNTIME_STORAGE_PROTECTED");
  }

  private static void superRemovalTest(Class<?> caller) throws Exception {
    String name = CallerAwareMap.class.getName(); ClassNode node = new ClassNode();
    new ClassReader(CallerAwareMap.class.getResourceAsStream("/" + name.replace('.', '/') + ".class").readAllBytes()).accept(node, 0);
    FieldWriteGate.instrument(node); ClassWriter writer = new ClassWriter(ClassWriter.COMPUTE_FRAMES); node.accept(writer);
    Class<?> type = new ClassLoader(GateTest.class.getClassLoader()) {
      Class<?> transformed() { byte[] bytes = writer.toByteArray(); return defineClass(name, bytes, 0, bytes.length); }
    }.transformed();
    @SuppressWarnings("unchecked") var map = (java.util.Map<Object,Object>)type.getConstructor().newInstance();
    Object value = new Object(); map.put("ordinary", value);
    caller.getMethod("remove", java.util.Map.class, Object.class).invoke(null, map, "ordinary");
    if (map.containsKey("ordinary")) throw new AssertionError("SUPER_REMOVE_OR_CALLER_SEMANTICS_CHANGED");
    Target target = new Target(); target.locked = true; map.put("protected", target);
    if (map.remove("protected") != null || map.get("protected") != target) throw new AssertionError("SUPER_REMOVAL_NOT_GUARDED");
    target.locked = false;
    if (map.remove("protected") != target) throw new AssertionError("SUPER_RELEASE_NOT_PRESERVED");
  }

  private static void storedRemovalQueryTest(boolean mapped) throws Exception {
    String entity = "net/minecraft/world/entity/Entity", reason = entity + "$RemovalReason";
    String methodName = mapped ? "m_213877_" : "isRemoved";
    String fieldName = mapped ? "f_146795_" : "removalReason";
    ClassWriter c = new ClassWriter(ClassWriter.COMPUTE_FRAMES);
    c.visit(Opcodes.V17, Opcodes.ACC_PUBLIC, entity, null, "java/lang/Object", new String[]{"eff/lifetime/LifetimeTarget"});
    c.visitField(Opcodes.ACC_PUBLIC, "locked", "Z", null, null).visitEnd();
    c.visitField(Opcodes.ACC_PUBLIC, fieldName, "L" + reason + ";", null, null).visitEnd();
    var ctor = c.visitMethod(Opcodes.ACC_PUBLIC, "<init>", "()V", null, null);
    ctor.visitCode(); ctor.visitVarInsn(Opcodes.ALOAD, 0); ctor.visitMethodInsn(Opcodes.INVOKESPECIAL, "java/lang/Object", "<init>", "()V", false);
    ctor.visitInsn(Opcodes.RETURN); ctor.visitMaxs(0, 0); ctor.visitEnd();
    var locked = c.visitMethod(Opcodes.ACC_PUBLIC, "rejectLifetimeMutation", "()Z", null, null);
    locked.visitCode(); locked.visitVarInsn(Opcodes.ALOAD, 0); locked.visitFieldInsn(Opcodes.GETFIELD, entity, "locked", "Z");
    locked.visitInsn(Opcodes.IRETURN); locked.visitMaxs(0, 0); locked.visitEnd();
    // Simulate a query override falsely reporting removal, without changing the real field.
    var query = c.visitMethod(Opcodes.ACC_PUBLIC | Opcodes.ACC_FINAL, methodName, "()Z", null, null);
    query.visitCode(); query.visitInsn(Opcodes.ICONST_1); query.visitInsn(Opcodes.IRETURN); query.visitMaxs(0, 0); query.visitEnd(); c.visitEnd();
    ClassNode node = new ClassNode(); new ClassReader(c.toByteArray()).accept(node, 0);
    FieldWriteGate.instrument(node);
    ClassWriter result = new ClassWriter(ClassWriter.COMPUTE_FRAMES); node.accept(result);
    ClassWriter r = new ClassWriter(ClassWriter.COMPUTE_FRAMES);
    r.visit(Opcodes.V17, Opcodes.ACC_PUBLIC, reason, null, "java/lang/Object", null);
    var rc = r.visitMethod(Opcodes.ACC_PUBLIC, "<init>", "()V", null, null);
    rc.visitCode(); rc.visitVarInsn(Opcodes.ALOAD, 0); rc.visitMethodInsn(Opcodes.INVOKESPECIAL, "java/lang/Object", "<init>", "()V", false);
    rc.visitInsn(Opcodes.RETURN); rc.visitMaxs(0, 0); rc.visitEnd(); r.visitEnd();
    var fixtures = java.util.Map.of(entity.replace('/', '.'), result.toByteArray(), reason.replace('/', '.'), r.toByteArray());
    ClassLoader loader = new ClassLoader(GateTest.class.getClassLoader()) {
      @Override protected Class<?> loadClass(String name, boolean resolve) throws ClassNotFoundException {
        if (!fixtures.containsKey(name)) return super.loadClass(name, resolve);
        Class<?> value = findLoadedClass(name);
        if (value == null) { byte[] b = fixtures.get(name); value = defineClass(name, b, 0, b.length); }
        if (resolve) resolveClass(value); return value;
      }
    };
    Class<?> type = loader.loadClass(entity.replace('/', '.'));
    Object instance = type.getConstructor().newInstance();
    type.getField("locked").setBoolean(instance, true);
    if ((boolean)type.getMethod(methodName).invoke(instance)) throw new AssertionError("STORED_REMOVAL_QUERY_NOT_GUARDED");
    Object actualReason = loader.loadClass(reason.replace('/', '.')).getConstructor().newInstance();
    type.getField(fieldName).set(instance, actualReason);
    if (!(boolean)type.getMethod(methodName).invoke(instance)) throw new AssertionError("REAL_REMOVAL_CONCEALED");
    type.getField(fieldName).set(instance, null); type.getField("locked").setBoolean(instance, false);
    if (!(boolean)type.getMethod(methodName).invoke(instance)) throw new AssertionError("ORDINARY_QUERY_CHANGED");
    node.methods.removeIf(m -> m.name.equals(methodName));
    try { FieldWriteGate.instrument(node); throw new AssertionError("MISSING_QUERY_SILENTLY_ACCEPTED"); }
    catch (IllegalStateException expected) {
      if (!expected.getMessage().startsWith("LIFETIME_QUERY_MAPPING_MISMATCH:")) throw expected;
    }
  }

  private static void coreTickWrapperTest() throws Exception {
    String game = "net/minecraft/client/Minecraft", client = "eff/minecraft/client/EffClient";
    ClassWriter g = new ClassWriter(ClassWriter.COMPUTE_FRAMES);
    g.visit(Opcodes.V17, Opcodes.ACC_PUBLIC, game, null, "java/lang/Object", null);
    g.visitField(Opcodes.ACC_PUBLIC, "early", "Z", null, null).visitEnd();
    g.visitField(Opcodes.ACC_PUBLIC, "fail", "Z", null, null).visitEnd();
    var ctor = g.visitMethod(Opcodes.ACC_PUBLIC, "<init>", "()V", null, null);
    ctor.visitCode(); ctor.visitVarInsn(Opcodes.ALOAD, 0); ctor.visitMethodInsn(Opcodes.INVOKESPECIAL, "java/lang/Object", "<init>", "()V", false);
    ctor.visitInsn(Opcodes.RETURN); ctor.visitMaxs(0, 0); ctor.visitEnd();
    var tick = g.visitMethod(Opcodes.ACC_PUBLIC, "tick", "()V", null, null); tick.visitCode();
    Label normal = new Label(), noFailure = new Label();
    tick.visitVarInsn(Opcodes.ALOAD, 0); tick.visitFieldInsn(Opcodes.GETFIELD, game, "early", "Z");
    tick.visitJumpInsn(Opcodes.IFEQ, normal); tick.visitInsn(Opcodes.RETURN); tick.visitLabel(normal);
    tick.visitVarInsn(Opcodes.ALOAD, 0); tick.visitFieldInsn(Opcodes.GETFIELD, game, "fail", "Z");
    tick.visitJumpInsn(Opcodes.IFEQ, noFailure); tick.visitTypeInsn(Opcodes.NEW, "java/lang/IllegalStateException");
    tick.visitInsn(Opcodes.DUP); tick.visitMethodInsn(Opcodes.INVOKESPECIAL, "java/lang/IllegalStateException", "<init>", "()V", false);
    tick.visitInsn(Opcodes.ATHROW); tick.visitLabel(noFailure);
    tick.visitMethodInsn(Opcodes.INVOKESTATIC, client, "eventTick", "()V", false);
    tick.visitInsn(Opcodes.RETURN); tick.visitMaxs(0, 0); tick.visitEnd(); g.visitEnd();
    ClassNode gameNode = new ClassNode(); new ClassReader(g.toByteArray()).accept(gameNode, 0);
    FieldWriteGate.instrument(gameNode); FieldWriteGate.instrument(gameNode); // reapplication must not double the tick
    ClassWriter guardedGame = new ClassWriter(ClassWriter.COMPUTE_FRAMES); gameNode.accept(guardedGame);
    ClassWriter c = new ClassWriter(ClassWriter.COMPUTE_FRAMES);
    c.visit(Opcodes.V17, Opcodes.ACC_PUBLIC, client, null, "java/lang/Object", null);
    c.visitField(Opcodes.ACC_PUBLIC | Opcodes.ACC_STATIC, "calls", "I", null, null).visitEnd();
    var callback = c.visitMethod(Opcodes.ACC_PUBLIC | Opcodes.ACC_STATIC, "coreTick", "()V", null, null); callback.visitCode();
    callback.visitFieldInsn(Opcodes.GETSTATIC, client, "calls", "I"); callback.visitInsn(Opcodes.ICONST_1); callback.visitInsn(Opcodes.IADD);
    callback.visitFieldInsn(Opcodes.PUTSTATIC, client, "calls", "I"); callback.visitInsn(Opcodes.RETURN); callback.visitMaxs(0, 0); callback.visitEnd();
    var event = c.visitMethod(Opcodes.ACC_PUBLIC | Opcodes.ACC_STATIC, "eventTick", "()V", null, null);
    event.visitCode(); event.visitInsn(Opcodes.ICONST_1);
    event.visitMethodInsn(Opcodes.INVOKESTATIC, "eff/minecraft/CoreTickScope", "active", "(Z)Z", false);
    Label skip = new Label(); event.visitJumpInsn(Opcodes.IFNE, skip);
    event.visitMethodInsn(Opcodes.INVOKESTATIC, client, "coreTick", "()V", false);
    event.visitLabel(skip); event.visitInsn(Opcodes.RETURN); event.visitMaxs(0, 0); event.visitEnd(); c.visitEnd();
    var fixtures = java.util.Map.of(game.replace('/', '.'), guardedGame.toByteArray(), client.replace('/', '.'), c.toByteArray());
    ClassLoader loader = new ClassLoader(GateTest.class.getClassLoader()) {
      @Override protected Class<?> loadClass(String name, boolean resolve) throws ClassNotFoundException {
        if (!fixtures.containsKey(name)) return super.loadClass(name, resolve);
        Class<?> result = findLoadedClass(name);
        if (result == null) { byte[] b = fixtures.get(name); result = defineClass(name, b, 0, b.length); }
        if (resolve) resolveClass(result); return result;
      }
    };
    Class<?> gameClass = loader.loadClass(game.replace('/', '.')), clientClass = loader.loadClass(client.replace('/', '.'));
    Object instance = gameClass.getConstructor().newInstance();
    if (eff.minecraft.CoreTickScope.active(true)) throw new AssertionError("CLASSPATH_IS_NOT_TICK_ACTIVITY");
    // The gate is present but no wrapper is executing: the ordinary event must still work.
    clientClass.getMethod("eventTick").invoke(null);
    if (clientClass.getField("calls").getInt(null) != 1) throw new AssertionError("ABSENT_WRAPPER_LOST_EVENT");
    clientClass.getField("calls").setInt(null, 0);
    gameClass.getMethod("tick").invoke(instance);
    gameClass.getField("early").setBoolean(instance, true); gameClass.getMethod("tick").invoke(instance);
    if (clientClass.getField("calls").getInt(null) != 2) throw new AssertionError("CORE_TICK_LOST_OR_DUPLICATED");
    gameClass.getField("early").setBoolean(instance, false); gameClass.getField("fail").setBoolean(instance, true);
    try { gameClass.getMethod("tick").invoke(instance); throw new AssertionError("TICK_FAILURE_SUPPRESSED"); }
    catch (java.lang.reflect.InvocationTargetException e) { if (!(e.getCause() instanceof IllegalStateException)) throw e; }
    if (clientClass.getField("calls").getInt(null) != 2) throw new AssertionError("FAILED_TICK_FABRICATED_PROGRESS");
    if (eff.minecraft.CoreTickScope.active(true)) throw new AssertionError("THROWN_TICK_LEAKED_SCOPE");
    clientClass.getMethod("eventTick").invoke(null);
    if (clientClass.getField("calls").getInt(null) != 3) throw new AssertionError("EVENT_SUPPRESSED_AFTER_FAILURE");
  }

  private static void coreTickScopeTest() throws Exception {
    eff.minecraft.CoreTickScope.enter(true);
    eff.minecraft.CoreTickScope.enter(true);
    if (!eff.minecraft.CoreTickScope.active(true) || eff.minecraft.CoreTickScope.active(false))
      throw new AssertionError("CLIENT_SERVER_SCOPE_CONFUSED");
    java.util.concurrent.atomic.AtomicBoolean leaked = new java.util.concurrent.atomic.AtomicBoolean();
    Thread other = new Thread(() -> leaked.set(eff.minecraft.CoreTickScope.active(true)));
    other.start(); other.join();
    if (leaked.get()) throw new AssertionError("TICK_SCOPE_CROSSED_THREAD");
    eff.minecraft.CoreTickScope.exit(true);
    if (!eff.minecraft.CoreTickScope.active(true)) throw new AssertionError("NESTED_SCOPE_LOST");
    eff.minecraft.CoreTickScope.exit(true);
    if (eff.minecraft.CoreTickScope.active(true)) throw new AssertionError("SCOPE_NOT_CLEARED");
  }
}
