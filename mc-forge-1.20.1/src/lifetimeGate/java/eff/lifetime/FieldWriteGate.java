package eff.lifetime;

import java.util.EnumSet;
import java.util.Set;
import java.util.Map;
import java.util.Collection;
import java.util.WeakHashMap;
import java.lang.ref.WeakReference;
import cpw.mods.modlauncher.serviceapi.ILaunchPluginService;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.Type;
import org.objectweb.asm.tree.*;

/** Operation-based, caller-independent pre-write checks. Never repairs a completed write.
 * Only ModLauncher-transformed PUTFIELD instructions are covered. Reflection, Unsafe,
 * JNI, later retransformation and replacement of this service remain outside this boundary.
 */
public final class FieldWriteGate implements ILaunchPluginService {
  private static final Map<Object, WeakReference<LifetimeTarget>> KEYS = new WeakHashMap<>();
  private static final ThreadLocal<java.util.IdentityHashMap<Object, Boolean>> EVALUATING =
      ThreadLocal.withInitial(java.util.IdentityHashMap::new);
  private static final Set<String> CONTAINERS = Set.of("Lnet/minecraft/util/ClassInstanceMultiMap;",
      "Lnet/minecraft/world/level/entity/EntityLookup;", "Lnet/minecraft/world/level/entity/LevelEntityGetter;");
  private static final Set<String> INDEX_FIELDS = Set.of("byId", "f_156807_", "byUuid", "f_156808_",
      "knownUuids", "f_157491_", "active", "f_156903_");
  private static boolean containerField(FieldInsnNode field) {
    // Ownership-bearing indices only. Transient iteration aliases MUST be clearable.
    return CONTAINERS.contains(field.desc) || INDEX_FIELDS.contains(field.name)
        && Set.of("Ljava/util/Map;", "Ljava/util/Set;", "Lit/unimi/dsi/fastutil/ints/Int2ObjectMap;").contains(field.desc);
  }
  private static final Set<String> FIELDS = Set.of(
      "removalReason", "f_146795_", "deathTime", "f_20919_", "dead", "f_20890_", "canUpdate",
      "position", "f_19825_", "blockPosition", "f_19826_", "chunkPosition", "f_185933_",
      "deltaMovement", "f_19827_", "stuckSpeedMultiplier", "f_19865_", "bb", "f_19828_",
      "tickCount", "f_19797_",
      "uuid", "f_19820_", "id", "f_19848_");
  private static boolean spatialValueField(FieldInsnNode field) {
    return Set.of("position", "f_19825_", "deltaMovement", "f_19827_", "stuckSpeedMultiplier", "f_19865_")
        .contains(field.name) && field.desc.equals("Lnet/minecraft/world/phys/Vec3;")
        || Set.of("bb", "f_19828_").contains(field.name) && field.desc.equals("Lnet/minecraft/world/phys/AABB;")
        || Set.of("blockPosition", "f_19826_").contains(field.name) && field.desc.equals("Lnet/minecraft/core/BlockPos;")
        || Set.of("chunkPosition", "f_185933_").contains(field.name) && field.desc.equals("Lnet/minecraft/world/level/ChunkPos;");
  }
  private static boolean rendererField(FieldInsnNode field) {
    return field.owner.equals("net/minecraft/client/renderer/entity/EntityRenderDispatcher")
        && field.desc.equals("Ljava/util/Map;")
        && (field.name.equals("renderers") || field.name.equals("f_114362_"));
  }
  private static boolean clientScreenField(FieldInsnNode field) {
    return Set.of("screen", "f_91080_").contains(field.name)
        && field.desc.equals("Lnet/minecraft/client/gui/screens/Screen;");
  }
  private static boolean clientScreenSetter(ClassNode node, MethodNode method) {
    return node.name.equals("net/minecraft/client/Minecraft")
        && Set.of("setScreen", "m_91152_", "forceSetScreen", "m_91346_").contains(method.name)
        && method.desc.equals("(Lnet/minecraft/client/gui/screens/Screen;)V");
  }
  private static Object claimedClientPlayer(Object client) {
    if (client == null) return null;
    try {
      Class<?> base = spatialBase(client, "net.minecraft.client.Minecraft");
      Object player = spatialField(base, "player", "f_91074_", "net.minecraft.client.player.LocalPlayer").get(client);
      return rejectQuery(player) ? player : null;
    } catch (ReflectiveOperationException | RuntimeException | LinkageError unavailable) { return null; }
  }
  /** While a player is claimed, screen changes use Minecraft's normal setter API.
   * This denies direct stores, never closes a screen after it has been installed. */
  public static boolean rejectClientScreenWrite(Object client) {
    Object player = claimedClientPlayer(client);
    if (!(player instanceof LifetimeTarget target)) return false;
    target.lifetimeOperationRejected("client:direct-screen-write");
    return true;
  }
  public static boolean rejectDeclaredClientScreenWrite(Object client, Class<?> symbolicOwner, String name, String descriptor) {
    if (client == null) return false;
    for (Class<?> owner = symbolicOwner; owner != null; owner = owner.getSuperclass()) {
      for (var field : owner.getDeclaredFields()) {
        if (!field.getName().equals(name) || !field.getType().descriptorString().equals(descriptor)) continue;
        return !java.lang.reflect.Modifier.isStatic(field.getModifiers())
            && owner.getName().equals("net.minecraft.client.Minecraft") && rejectClientScreenWrite(client);
      }
    }
    return false;
  }
  private static long deniedRendererWrites;
  public static synchronized long deniedRendererWrites() { return deniedRendererWrites; }
  public static boolean rejectRendererReplacement(Object before, Object after) {
    if (before == after || !(before instanceof Map<?, ?> original)) return false;
    for (var entry : original.entrySet()) {
      if (!(entry.getValue() instanceof LifetimeRenderer renderer) || !renderer.lifetimeRendererOwned()) continue;
      Object replacement = after instanceof Map<?, ?> next ? next.get(entry.getKey()) : null;
      if (replacement == renderer) continue;
      // A legitimate provider/resource reload has the same opaque owner. Other entries
      // are unrestricted; never classify a writer by its mod name or call stack.
      if (replacement instanceof LifetimeRenderer next
          && renderer.lifetimeRendererOwner() != null
          && next.lifetimeRendererOwner() == renderer.lifetimeRendererOwner()) continue;
      synchronized (FieldWriteGate.class) { deniedRendererWrites++; }
      return true;
    }
    return false;
  }
  @Override public String name() { return "eff_lifetime_field_gate"; }
  /** Ownership of runtime storage, including renderer services before an entity claim.
   * Reads only actual contents; never populates an index or repairs an object header. */
  public static boolean isOwnedRuntimeObject(Object target) {
    if (target instanceof LifetimeTarget) return reject(target);
    if (target instanceof LifetimeRenderer renderer) return renderer.lifetimeRendererOwner() != null;
    if (target instanceof Map<?, ?> values) return carriesRuntimeOwner(values);
    if (target == null) return false;
    if (claimedClientPlayer(target) != null) return true;
    for (Class<?> owner = target.getClass(); owner != null; owner = owner.getSuperclass()) {
      if (owner.getName().equals("net.minecraft.client.renderer.LevelRenderer")) {
        // The world render loop owns the dispatch point before EntityRenderDispatcher.
        // Follow the reviewed declaring field, never a subclass's shadow or a mod name.
        // A lease already exists when an owned renderer is registered, before entity claim.
        for (String name : new String[] {"entityRenderDispatcher", "f_109463_"}) {
          try {
            var field = owner.getDeclaredField(name);
            if (java.lang.reflect.Modifier.isStatic(field.getModifiers())
                || !field.getType().getName().equals("net.minecraft.client.renderer.entity.EntityRenderDispatcher")
                || !field.trySetAccessible()) continue;
            return isOwnedRuntimeObject(field.get(target));
          } catch (NoSuchFieldException missingMapping) {
            // Only named/SRG fields from the reviewed game version are considered.
          } catch (IllegalAccessException inaccessible) { return false; }
        }
      }
      if (!owner.getName().equals("net.minecraft.client.renderer.entity.EntityRenderDispatcher")) continue;
      for (String name : new String[] {"renderers", "f_114362_"}) {
        try {
          var field = owner.getDeclaredField(name);
          if (java.lang.reflect.Modifier.isStatic(field.getModifiers())
              || field.getType() != Map.class || !field.trySetAccessible()) continue;
          Object stored = field.get(target);
          return stored instanceof Map<?, ?> map && carriesRuntimeOwner(map);
        } catch (NoSuchFieldException missingMapping) {
          // Only the reviewed declaring field and mappings are considered.
        } catch (IllegalAccessException inaccessible) { return false; }
      }
    }
    return false;
  }
  private static boolean carriesRuntimeOwner(Map<?, ?> map) {
    int remaining = 65536;
    for (Object value : map.values()) {
      if (--remaining < 0) return false;
      if (value instanceof LifetimeTarget && reject(value)) return true;
      // The original renderer's opaque owner exists at construction, before claim.
      if (value instanceof LifetimeRenderer renderer && renderer.lifetimeRendererOwner() != null) return true;
    }
    return false;
  }
  @Override public EnumSet<Phase> handlesClass(Type type, boolean empty) {
    return empty || type.getInternalName().startsWith("eff/lifetime/")
        ? EnumSet.noneOf(Phase.class) : EnumSet.of(Phase.AFTER);
  }
  public static boolean reject(Object target) {
    return evaluate(target, false);
  }
  public static boolean rejectQuery(Object target) {
    return evaluate(target, true);
  }
  private static boolean evaluate(Object target, boolean query) {
    if (!(target instanceof LifetimeTarget guarded)) return false;
    var evaluating = EVALUATING.get();
    // Initial client admission itself queries the actual index. Let that recursive query
    // execute normally; never invent a registration or cache a replacement object.
    // A callback reached during that query must not use the same recursion allowance
    // to mutate the object. Only recursive reads continue; nested writes fail closed.
    if (evaluating.containsKey(target)) return !query;
    evaluating.put(target, Boolean.TRUE);
    try {
      if (!guarded.rejectLifetimeMutation()) return false;
      Object key = guarded.lifetimeKey();
      if (key != null) synchronized (KEYS) { KEYS.put(key, new WeakReference<>(guarded)); }
      return true;
    } finally {
      evaluating.remove(target);
      if (evaluating.isEmpty()) EVALUATING.remove();
    }
  }
  public static void remember(Object target) { reject(target); }
  /** Called at a real pre-write instruction, never by read/admission probes. */
  public static boolean rejectOperation(Object target, String operation) {
    if (!reject(target)) return false;
    if (((LifetimeTarget) target).lifetimeAllowsMovement()
        && Set.of("field-write:position", "field-write:deltaMovement", "field-write:stuckSpeedMultiplier",
            "field-write:bb", "field-write:f_19825_", "field-write:f_19827_", "field-write:f_19865_",
            "field-write:f_19828_", "field-write:blockPosition", "field-write:f_19826_",
            "field-write:chunkPosition", "field-write:f_185933_").contains(operation)) return false;
    if (Set.of("field-write:position", "field-write:removalReason", "field-write:dead",
        "field-write:f_20890_", "field-write:deathTime", "field-write:f_20919_").contains(operation))
      ((LifetimeTarget) target).lifetimeOperationRejected(operation);
    return true;
  }
  /** Called at the write site after symbolic owner resolution, never in a VM define callback. */
  public static boolean rejectDeclaredOperation(Object target, Class<?> symbolicOwner,
      String name, String descriptor, String operation) {
    if (target == null) return false;
    for (Class<?> owner = symbolicOwner; owner != null; owner = owner.getSuperclass()) {
      for (var field : owner.getDeclaredFields()) {
        if (!field.getName().equals(name) || !field.getType().descriptorString().equals(descriptor)) continue;
        if (java.lang.reflect.Modifier.isStatic(field.getModifiers())) return false;
        boolean lifecycle = name.equals("dead") || name.equals("f_20890_")
            || name.equals("deathTime") || name.equals("f_20919_");
        String declaration = lifecycle ? "net.minecraft.world.entity.LivingEntity" : "net.minecraft.world.entity.Entity";
        return owner.getName().equals(declaration) && rejectOperation(target, operation);
      }
    }
    // Preserve the original write's JVM linkage error rather than inventing a field.
    return false;
  }
  /** Check absolute coordinates before a setter can query chunks or send a teleport.
   * This is a lease check, not a repair of position, indexes or collision state. */
  public static boolean rejectPositionOperation(Object target, double x, double y, double z) {
    if (!reject(target)) return false;
    LifetimeTarget owner = (LifetimeTarget) target;
    boolean valid = owner.lifetimeAllowsMovement() && Double.isFinite(x) && Double.isFinite(y)
        && Double.isFinite(z) && owner.lifetimeAllowsPosition(x, y, z);
    if (!valid) owner.lifetimeOperationRejected("invalid-motion:position-entry");
    return !valid;
  }
  /** Value-aware spatial gate. Preserve legal movement; do not repair a stored bad value. */
  public static boolean rejectSpatialValue(Object target, Object value, String operation) {
    if (!reject(target)) return false;
    if (!((LifetimeTarget) target).lifetimeAllowsMovement()) return true;
    if (Set.of("field-write:blockPosition", "field-write:f_19826_", "field-write:chunkPosition", "field-write:f_185933_").contains(operation)) {
      boolean valid = spatialCacheMatches(target, value,
          operation.equals("field-write:chunkPosition") || operation.equals("field-write:f_185933_"));
      if (!valid) ((LifetimeTarget) target).lifetimeOperationRejected("invalid-motion:" + operation);
      return !valid;
    }
    boolean box = operation.equals("field-write:bb") || operation.equals("field-write:f_19828_");
    String type = box ? "net.minecraft.world.phys.AABB" : "net.minecraft.world.phys.Vec3";
    boolean valid = false;
    if (value != null) try {
      Class<?> base = value.getClass();
      while (base != null && !base.getName().equals(type)) base = base.getSuperclass();
      if (base != null) {
        String[] names = box ? new String[]{"minX", "minY", "minZ", "maxX", "maxY", "maxZ"} : new String[]{"x", "y", "z"};
        String[] mapped = box ? new String[]{"f_82288_", "f_82289_", "f_82290_", "f_82291_", "f_82292_", "f_82293_"}
            : new String[]{"f_82479_", "f_82480_", "f_82481_"};
        double[] values = new double[names.length]; valid = true;
        for (int i = 0; i < names.length; i++) {
          java.lang.reflect.Field field;
          try { field = base.getDeclaredField(names[i]); }
          catch (NoSuchFieldException missingNamed) { field = base.getDeclaredField(mapped[i]); }
          if (field.getType() != double.class || java.lang.reflect.Modifier.isStatic(field.getModifiers()) || !field.trySetAccessible()) { valid = false; break; }
          values[i] = field.getDouble(value);
          if (!Double.isFinite(values[i])) { valid = false; break; }
        }
        if (box && valid) {
          // Claimed moving targets are arena players. Keep normal standing/crouching/
          // swimming boxes, but never feed a gigantic or displaced box to collision scans.
          // Do not compare with the previous position: vanilla move updates the box first.
          double width = values[3] - values[0], height = values[4] - values[1], depth = values[5] - values[2];
          valid = width > 0 && width <= 4 && height > 0 && height <= 8 && depth > 0 && depth <= 4
              && ((LifetimeTarget) target).lifetimeAllowsPosition(values[0] + width / 2, values[1], values[2] + depth / 2);
        }
        if (!box && valid && (operation.equals("field-write:position") || operation.equals("field-write:f_19825_")))
          valid = ((LifetimeTarget) target).lifetimeAllowsPosition(values[0], values[1], values[2]);
      }
    } catch (ReflectiveOperationException | RuntimeException | LinkageError unavailable) { valid = false; }
    if (!valid) ((LifetimeTarget) target).lifetimeOperationRejected("invalid-motion:" + operation);
    return !valid;
  }
  /** Cache writes follow position writes in Entity.setPosRaw. Compare against current
   * stored position, not the caller's rejected input or a previous-tick snapshot. */
  private static boolean spatialCacheMatches(Object target, Object cache, boolean chunk) {
    if (cache == null) return false;
    try {
      Class<?> entity = spatialBase(target, "net.minecraft.world.entity.Entity");
      var positionField = spatialField(entity, "position", "f_19825_", "net.minecraft.world.phys.Vec3");
      Object position = positionField.get(target);
      Class<?> vector = spatialBase(position, "net.minecraft.world.phys.Vec3");
      String[] names = {"x", "y", "z"}, mapped = {"f_82479_", "f_82480_", "f_82481_"};
      int[] block = new int[3];
      for (int i = 0; i < 3; i++) {
        double coordinate = spatialField(vector, names[i], mapped[i], "double").getDouble(position);
        double floor = Math.floor(coordinate);
        if (!Double.isFinite(floor) || floor < Integer.MIN_VALUE || floor > Integer.MAX_VALUE) return false;
        block[i] = (int) floor;
      }
      // Resolve reviewed base storage, never subclass shadow fields or virtual getters.
      if (!chunk) spatialBase(cache, "net.minecraft.core.BlockPos");
      Class<?> base = spatialBase(cache, chunk ? "net.minecraft.world.level.ChunkPos" : "net.minecraft.core.Vec3i");
      String[] cacheNames = chunk ? new String[]{"x", "z"} : names;
      String[] cacheMapped = chunk ? new String[]{"f_45578_", "f_45579_"} : new String[]{"f_123285_", "f_123286_", "f_123289_"};
      for (int i = 0; i < cacheNames.length; i++) {
        int expected = chunk ? block[i == 0 ? 0 : 2] >> 4 : block[i];
        if (spatialField(base, cacheNames[i], cacheMapped[i], "int").getInt(cache) != expected) return false;
      }
      return true;
    } catch (ReflectiveOperationException | RuntimeException | LinkageError unavailable) { return false; }
  }
  private static Class<?> spatialBase(Object value, String name) throws NoSuchFieldException {
    for (Class<?> base = value == null ? null : value.getClass(); base != null; base = base.getSuperclass())
      if (base.getName().equals(name)) return base;
    throw new NoSuchFieldException("SPATIAL_BASE_UNAVAILABLE:" + name);
  }
  private static java.lang.reflect.Field spatialField(Class<?> owner, String named, String mapped, String type)
      throws ReflectiveOperationException {
    java.lang.reflect.Field field;
    try { field = owner.getDeclaredField(named); }
    catch (NoSuchFieldException missingNamed) { field = owner.getDeclaredField(mapped); }
    if (!field.getType().getName().equals(type) || java.lang.reflect.Modifier.isStatic(field.getModifiers()) || !field.trySetAccessible())
      throw new IllegalAccessException("SPATIAL_FIELD_UNAVAILABLE:" + named);
    return field;
  }
  public static boolean rejectDeclaredSpatialValue(Object target, Object value, Class<?> symbolicOwner,
      String name, String descriptor, String operation) {
    if (target == null) return false;
    for (Class<?> owner = symbolicOwner; owner != null; owner = owner.getSuperclass()) {
      for (var field : owner.getDeclaredFields()) {
        if (!field.getName().equals(name) || !field.getType().descriptorString().equals(descriptor)) continue;
        return !java.lang.reflect.Modifier.isStatic(field.getModifiers())
            && owner.getName().equals("net.minecraft.world.entity.Entity") && rejectSpatialValue(target, value, operation);
      }
    }
    return false;
  }
  public static boolean rejectDeclaredTickWrite(Object target, int value, Class<?> symbolicOwner, String name) {
    if (target == null) return false;
    for (Class<?> owner = symbolicOwner; owner != null; owner = owner.getSuperclass()) {
      for (var field : owner.getDeclaredFields()) {
        if (!field.getName().equals(name)) continue;
        if (field.getType() != int.class || java.lang.reflect.Modifier.isStatic(field.getModifiers())
            || !owner.getName().equals("net.minecraft.world.entity.Entity")) return false;
        if (!reject(target) || !((LifetimeTarget) target).lifetimeAllowsMovement()) return false;
        boolean regression = true;
        try {
          if (field.trySetAccessible()) {
            int before = field.getInt(target);
            regression = value < before && !(before == Integer.MAX_VALUE && value == Integer.MIN_VALUE);
          }
        } catch (IllegalAccessException | RuntimeException unavailable) { regression = true; }
        if (regression) ((LifetimeTarget) target).lifetimeOperationRejected("player:tick-count-regression");
        return regression;
      }
    }
    return false;
  }
  /** Reject only a death pose before the callee changes synced data. No pose reset. */
  public static boolean rejectDyingPose(Object target, Object pose) {
    if (!(pose instanceof Enum<?> value) || !value.getDeclaringClass().getName().equals("net.minecraft.world.entity.Pose")
        || !value.name().equals("DYING") || !reject(target)) return false;
    ((LifetimeTarget) target).lifetimeOperationRejected("lifecycle:dying-pose");
    return true;
  }
  public static boolean rejectBooleanWrite(Object target, boolean value, String field) {
    if (!reject(target)) return false;
    ((LifetimeTarget)target).lifetimeBooleanWriteRejected(field, value);
    return true;
  }
  public static boolean rejectKey(Object key) {
    if (!(key instanceof java.util.UUID)) return false;
    LifetimeTarget target;
    synchronized (KEYS) { var reference = KEYS.get(key); target = reference == null ? null : reference.get(); }
    return target != null && reject(target);
  }
  private static Iterable<?> entries(Object value) {
    if (value instanceof LifetimeContainer container) return container.lifetimeEntries();
    if (value instanceof Map<?,?> map) return map.values();
    return value instanceof Iterable<?> iterable ? iterable : java.util.List.of();
  }
  public static boolean rejectReplacement(Object before, Object after) {
    if (before == after || before == null) return false;
    int budget = 65536;
    boolean protectedFound = false;
    try {
      for (Object value : entries(before)) {
        // Never reject an unrelated large container merely because inspection reached its budget.
        // Protection is bounded to entries visited; this is explicitly not an arbitrary heap guard.
        if (--budget < 0) return false;
        if (!reject(value) && !rejectKey(value)) continue;
        protectedFound = true;
        boolean retained = false;
        for (Object replacement : entries(after)) {
          if (--budget < 0) return true;
          if (replacement == value) { retained = true; break; }
        }
        if (!retained) return true;
      }
      return false;
    } catch (RuntimeException invalidContainer) { return protectedFound; }
  }
  public static boolean rejectMapRemoval(Map<?,?> map, Object key) {
    // A default return value, an absent key, or a query is never a write receipt.
    if (!map.containsKey(key)) return false;
    Object target = map.get(key);
    if (!reject(target)) return false;
    ((LifetimeTarget) target).lifetimeOperationRejected("map-remove-present");
    return true;
  }
  public static boolean rejectIntMapRemoval(Map<?,?> map, int key) { return rejectMapRemoval(map, key); }
  public static boolean rejectMapClear(Map<?,?> map) {
    // Deny the transaction before any entry is removed. Once claims are released,
    // the original clear still runs, including its ordinary null/empty semantics.
    for (Object value : map.values()) if (reject(value)) return true;
    return false;
  }
  public static boolean rejectCollectionRemoval(Collection<?> values, Object value) {
    if (values == null) throw new NullPointerException();
    if (!reject(value)) return rejectKey(value);
    int budget = 65536;
    for (Object present : values) {
      if (--budget < 0) break;
      if (present == value) {
        ((LifetimeTarget) value).lifetimeOperationRejected("collection-remove-present"); break;
      }
    }
    return true;
  }
  public static boolean rejectListIndexRemoval(java.util.List<?> values, int index) {
    Object value = values.get(index); // Keep ordinary null and invalid-index exceptions.
    return rejectCollectionRemoval(values, value);
  }
  @Override public int processClassWithFlags(Phase phase, ClassNode node, Type type, String reason) {
    return instrument(node) > 0 ? ComputeFlags.COMPUTE_FRAMES : ComputeFlags.NO_REWRITE;
  }
  public static int instrument(ClassNode node) {
    int count = anchorCoreTick(node) + guardStoredStateReads(node) + routeProjectionRenderCalls(node)
        + routeProjectionRenderEvents(node) + PlayerOperationTransform.instrument(node);
    if (node.name.equals("eff/minecraft/EffProjection") && !node.interfaces.contains("eff/lifetime/LifetimeTarget")) {
      node.interfaces.add("eff/lifetime/LifetimeTarget");
      count++;
    }
    if (node.name.equals("eff/minecraft/client/EffProjectionRenderer")
        && !node.interfaces.contains("eff/lifetime/LifetimeRenderer")) {
      node.interfaces.add("eff/lifetime/LifetimeRenderer"); count++;
    }
    if ((node.name.equals("net/minecraft/world/level/entity/EntityLookup")
        || node.name.equals("net/minecraft/world/level/entity/LevelEntityGetterAdapter"))
        && !node.interfaces.contains("eff/lifetime/LifetimeContainer")) {
      MethodNode view = node.methods.stream().filter(m -> m.desc.equals("()Ljava/lang/Iterable;")
          && (m.access & Opcodes.ACC_STATIC) == 0).findFirst().orElseThrow();
      node.interfaces.add("eff/lifetime/LifetimeContainer");
      MethodNode expose = new MethodNode(Opcodes.ACC_PUBLIC | Opcodes.ACC_SYNTHETIC,
          "lifetimeEntries", "()Ljava/lang/Iterable;", null, null);
      expose.instructions.add(new VarInsnNode(Opcodes.ALOAD, 0));
      expose.instructions.add(new MethodInsnNode(Opcodes.INVOKEVIRTUAL, node.name, view.name, view.desc, false));
      expose.instructions.add(new InsnNode(Opcodes.ARETURN)); node.methods.add(expose); count++;
    }
    for (MethodNode method : node.methods) {
      // A constructor can have an uninitialized receiver; never pass it to a static helper.
      if (method.name.equals("<init>")) continue;
      if (node.name.equals("eff/minecraft/EffProjection") && method.name.equals("claimLifetime")) {
        for (AbstractInsnNode insn : method.instructions.toArray()) if (insn.getOpcode() == Opcodes.RETURN) {
          InsnList registration = new InsnList(); registration.add(new VarInsnNode(Opcodes.ALOAD, 0));
          registration.add(new MethodInsnNode(Opcodes.INVOKESTATIC, "eff/lifetime/FieldWriteGate", "remember", "(Ljava/lang/Object;)V", false));
          method.instructions.insertBefore(insn, registration); count++;
        }
      }
      // A rejected field write alone is not transactional: merged callbacks may dereference
      // the unassigned removal reason. Reject the entire lifecycle operation before callbacks.
      // Vanilla operation names only, irrespective of which transformer added a callback.
      if ((method.access & (Opcodes.ACC_STATIC | Opcodes.ACC_ABSTRACT | Opcodes.ACC_NATIVE)) == 0
          && (method.name.equals("setRemoved") || method.name.equals("m_142467_"))
          && Type.getReturnType(method.desc).getSort() == Type.VOID) {
        LabelNode allowed = new LabelNode();
        InsnList head = new InsnList();
        head.add(new VarInsnNode(Opcodes.ALOAD, 0));
        head.add(new MethodInsnNode(Opcodes.INVOKESTATIC, "eff/lifetime/FieldWriteGate",
            "reject", "(Ljava/lang/Object;)Z", false));
        head.add(new JumpInsnNode(Opcodes.IFEQ, allowed));
        head.add(new InsnNode(Opcodes.RETURN)); head.add(allowed);
        method.instructions.insert(head); count++;
      }
      for (AbstractInsnNode insn : method.instructions.toArray()) {
        if (insn instanceof FieldInsnNode field && field.getOpcode() == Opcodes.PUTFIELD
            && clientScreenField(field) && !clientScreenSetter(node, method)) {
          LabelNode allowed = new LabelNode(), end = new LabelNode(); InsnList guard = new InsnList();
          guard.add(new InsnNode(Opcodes.DUP2)); guard.add(new InsnNode(Opcodes.POP));
          guard.add(new LdcInsnNode(Type.getObjectType(field.owner))); guard.add(new LdcInsnNode(field.name)); guard.add(new LdcInsnNode(field.desc));
          guard.add(new MethodInsnNode(Opcodes.INVOKESTATIC, "eff/lifetime/FieldWriteGate", "rejectDeclaredClientScreenWrite", "(Ljava/lang/Object;Ljava/lang/Class;Ljava/lang/String;Ljava/lang/String;)Z", false));
          guard.add(new JumpInsnNode(Opcodes.IFEQ, allowed)); guard.add(new InsnNode(Opcodes.POP2));
          guard.add(new JumpInsnNode(Opcodes.GOTO, end)); guard.add(allowed);
          method.instructions.insertBefore(field, guard); method.instructions.insert(field, end); count++; continue;
        }
        if (insn instanceof MethodInsnNode call && call.getOpcode() != Opcodes.INVOKESTATIC && call.name.equals("remove")) {
          boolean intMap = call.owner.startsWith("it/unimi/dsi/fastutil/ints/Int2Object");
          boolean map = intMap || Set.of("java/util/Map", "java/util/HashMap", "java/util/LinkedHashMap").contains(call.owner);
          if (map && (call.desc.equals("(Ljava/lang/Object;)Ljava/lang/Object;") || call.desc.equals("(I)Ljava/lang/Object;"))) {
            boolean primitive = call.desc.startsWith("(I)");
            LabelNode allowed = new LabelNode(), end = new LabelNode(); InsnList check = new InsnList();
            check.add(new InsnNode(Opcodes.DUP2));
            check.add(new MethodInsnNode(Opcodes.INVOKESTATIC, "eff/lifetime/FieldWriteGate",
                primitive ? "rejectIntMapRemoval" : "rejectMapRemoval", primitive ? "(Ljava/util/Map;I)Z"
                    : "(Ljava/util/Map;Ljava/lang/Object;)Z", false));
            check.add(new JumpInsnNode(Opcodes.IFEQ, allowed)); check.add(new InsnNode(Opcodes.POP2));
            check.add(new InsnNode(Opcodes.ACONST_NULL)); check.add(new JumpInsnNode(Opcodes.GOTO, end)); check.add(allowed);
            // Preserve the original receiver, opcode (including invokespecial), and caller stack.
            method.instructions.insertBefore(call, check); method.instructions.insert(call, end); count++; continue;
          }
          if (map && (call.desc.equals("(ILjava/lang/Object;)Z") || call.desc.equals("(Ljava/lang/Object;Ljava/lang/Object;)Z"))) {
            LabelNode allowed = new LabelNode(), end = new LabelNode(); InsnList check = new InsnList();
            check.add(new InsnNode(Opcodes.DUP));
            check.add(new MethodInsnNode(Opcodes.INVOKESTATIC, "eff/lifetime/FieldWriteGate", "reject", "(Ljava/lang/Object;)Z", false));
            check.add(new JumpInsnNode(Opcodes.IFEQ, allowed));
            check.add(new InsnNode(Opcodes.POP2)); check.add(new InsnNode(Opcodes.POP));
            check.add(new InsnNode(Opcodes.ICONST_0)); check.add(new JumpInsnNode(Opcodes.GOTO, end)); check.add(allowed);
            method.instructions.insertBefore(call, check); method.instructions.insert(call, end); count++; continue;
          }
          boolean list = Set.of("java/util/List", "java/util/ArrayList", "java/util/LinkedList").contains(call.owner);
          if (list && call.desc.equals("(I)Ljava/lang/Object;")) {
            LabelNode allowed = new LabelNode(), end = new LabelNode(); InsnList check = new InsnList();
            check.add(new InsnNode(Opcodes.DUP2));
            check.add(new MethodInsnNode(Opcodes.INVOKESTATIC, "eff/lifetime/FieldWriteGate",
                "rejectListIndexRemoval", "(Ljava/util/List;I)Z", false));
            check.add(new JumpInsnNode(Opcodes.IFEQ, allowed)); check.add(new InsnNode(Opcodes.POP2));
            check.add(new InsnNode(Opcodes.ACONST_NULL)); check.add(new JumpInsnNode(Opcodes.GOTO, end)); check.add(allowed);
            method.instructions.insertBefore(call, check); method.instructions.insert(call, end); count++; continue;
          }
          if ((list || Set.of("java/util/Set", "java/util/Collection", "java/util/HashSet", "java/util/LinkedHashSet").contains(call.owner))
              && call.desc.equals("(Ljava/lang/Object;)Z")) {
            LabelNode allowed = new LabelNode(), end = new LabelNode(); InsnList check = new InsnList();
            check.add(new InsnNode(Opcodes.DUP2));
            check.add(new MethodInsnNode(Opcodes.INVOKESTATIC, "eff/lifetime/FieldWriteGate",
                "rejectCollectionRemoval", "(Ljava/util/Collection;Ljava/lang/Object;)Z", false));
            check.add(new JumpInsnNode(Opcodes.IFEQ, allowed)); check.add(new InsnNode(Opcodes.POP2));
            check.add(new InsnNode(Opcodes.ICONST_0)); check.add(new JumpInsnNode(Opcodes.GOTO, end)); check.add(allowed);
            method.instructions.insertBefore(call, check); method.instructions.insert(call, end); count++; continue;
          }
        }
        if (!(insn instanceof FieldInsnNode field) || field.getOpcode() != Opcodes.PUTFIELD
            || (!FIELDS.contains(field.name) && !containerField(field) && !rendererField(field)) || Type.getType(field.desc).getSize() != 1) continue;
        // [receiver, value] -> [receiver, value, receiver]. Every selected field is category 1.
        LabelNode allowed = new LabelNode(), end = new LabelNode();
        InsnList before = new InsnList();
        before.add(new InsnNode(Opcodes.DUP2));
        if (containerField(field) || rendererField(field)) {
          before.add(new InsnNode(Opcodes.SWAP));
          before.add(new FieldInsnNode(Opcodes.GETFIELD, field.owner, field.name, field.desc));
          before.add(new InsnNode(Opcodes.SWAP));
          before.add(new MethodInsnNode(Opcodes.INVOKESTATIC, "eff/lifetime/FieldWriteGate",
              rendererField(field) ? "rejectRendererReplacement" : "rejectReplacement", "(Ljava/lang/Object;Ljava/lang/Object;)Z", false));
        } else if (Set.of("tickCount", "f_19797_").contains(field.name) && field.desc.equals("I")) {
          before.add(new LdcInsnNode(Type.getObjectType(field.owner))); before.add(new LdcInsnNode(field.name));
          before.add(new MethodInsnNode(Opcodes.INVOKESTATIC, "eff/lifetime/FieldWriteGate", "rejectDeclaredTickWrite",
              "(Ljava/lang/Object;ILjava/lang/Class;Ljava/lang/String;)Z", false));
        } else if (spatialValueField(field)) {
          before.add(new LdcInsnNode(Type.getObjectType(field.owner)));
          before.add(new LdcInsnNode(field.name)); before.add(new LdcInsnNode(field.desc));
          before.add(new LdcInsnNode("field-write:" + field.name));
          before.add(new MethodInsnNode(Opcodes.INVOKESTATIC, "eff/lifetime/FieldWriteGate",
              "rejectDeclaredSpatialValue", "(Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Class;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)Z", false));
        } else if (field.desc.equals("Z")) {
          before.add(new LdcInsnNode(field.name));
          before.add(new MethodInsnNode(Opcodes.INVOKESTATIC, "eff/lifetime/FieldWriteGate",
              "rejectBooleanWrite", "(Ljava/lang/Object;ZLjava/lang/String;)Z", false));
        } else {
          before.add(new InsnNode(Opcodes.POP));
          before.add(new LdcInsnNode("field-write:" + field.name));
          before.add(new MethodInsnNode(Opcodes.INVOKESTATIC, "eff/lifetime/FieldWriteGate",
              "rejectOperation", "(Ljava/lang/Object;Ljava/lang/String;)Z", false));
        }
        before.add(new JumpInsnNode(Opcodes.IFEQ, allowed));
        before.add(new InsnNode(Opcodes.POP2));
        before.add(new JumpInsnNode(Opcodes.GOTO, end));
        before.add(allowed);
        method.instructions.insertBefore(field, before);
        method.instructions.insert(field, end);
        count++;
      }
    }
    return count;
  }

  /** Repair existing normal-world render call sites only. The receiver remains on
   * the operand stack and becomes the first static argument. No method/class is
   * restored, no entity is added, and an absent original call is not fabricated.
   * This narrowly idempotent pass may also run at an authenticated final boundary.
   */
  public static int routeProjectionRenderCalls(ClassNode node) {
    if (!node.name.equals("net/minecraft/client/renderer/LevelRenderer")) return 0;
    String level = "net/minecraft/client/multiplayer/ClientLevel";
    String dispatcher = "net/minecraft/client/renderer/entity/EntityRenderDispatcher";
    String entity = "Lnet/minecraft/world/entity/Entity;";
    String frustum = "Lnet/minecraft/client/renderer/culling/Frustum;";
    String render = "(" + entity + "DDDFFLcom/mojang/blaze3d/vertex/PoseStack;"
        + "Lnet/minecraft/client/renderer/MultiBufferSource;I)V";
    int changed = 0;
    for (MethodNode method : node.methods) for (AbstractInsnNode instruction : method.instructions.toArray()) {
      if (!(instruction instanceof MethodInsnNode call)
          || call.getOpcode() != Opcodes.INVOKEVIRTUAL || call.itf) continue;
      String target = null;
      if (call.owner.equals(level) && call.desc.equals("()Ljava/lang/Iterable;")
          && Set.of("entitiesForRendering", "m_104735_").contains(call.name)) target = "entities";
      else if (call.owner.equals(dispatcher) && call.desc.equals("(" + entity + frustum + "DDD)Z")
          && Set.of("shouldRender", "m_114397_").contains(call.name)) target = "shouldRender";
      else if (call.owner.equals(dispatcher) && call.desc.equals(render)
          && Set.of("render", "m_114384_").contains(call.name)) target = "render";
      if (target == null) continue;
      String descriptor = "(L" + call.owner + ";" + call.desc.substring(1);
      method.instructions.set(call, new MethodInsnNode(Opcodes.INVOKESTATIC,
          "eff/minecraft/client/ProjectionRenderBoundary", target, descriptor, false));
      changed++;
    }
    return changed;
  }

  /** Keep the Forge callback active, with scoped transform ownership enforced by the helper. */
  public static int routeProjectionRenderEvents(ClassNode node) {
    if (!node.name.equals("net/minecraft/client/renderer/entity/LivingEntityRenderer")) return 0;
    int changed = 0;
    for (MethodNode method : node.methods) for (AbstractInsnNode insn : method.instructions.toArray()) {
      if (!(insn instanceof MethodInsnNode call) || call.getOpcode() != Opcodes.INVOKEINTERFACE
          || !call.owner.equals("net/minecraftforge/eventbus/api/IEventBus") || !call.name.equals("post")
          || !call.desc.equals("(Lnet/minecraftforge/eventbus/api/Event;)Z")) continue;
      method.instructions.set(call, new MethodInsnNode(Opcodes.INVOKESTATIC,
          "eff/minecraft/client/ProjectionRenderEvents", "post",
          "(Lnet/minecraftforge/eventbus/api/IEventBus;Lnet/minecraftforge/eventbus/api/Event;)Z", false));
      changed++;
    }
    return changed;
  }

  /** Final bytecode wrapper: even a legitimate early return still reaches our core callback.
   * An exception or a genuinely blocked tick does not produce synthetic progress.
   */
  private static int anchorCoreTick(ClassNode node) {
    boolean client = node.name.equals("net/minecraft/client/Minecraft");
    boolean server = node.name.equals("net/minecraft/server/MinecraftServer");
    if (!client && !server) return 0;
    String bodyName = "eff$lifetime$" + (client ? "client" : "server") + "TickBody";
    if (node.methods.stream().anyMatch(m -> m.name.equals(bodyName))) return 0;
    String descriptor = client ? "()V" : "(Ljava/util/function/BooleanSupplier;)V";
    MethodNode body = node.methods.stream().filter(m -> m.desc.equals(descriptor)
        && (client ? m.name.equals("tick") || m.name.equals("m_91398_")
            : m.name.equals("tickServer") || m.name.equals("m_5705_"))).findFirst().orElseThrow();
    MethodNode wrapper = new MethodNode(body.access, body.name, body.desc, body.signature,
        body.exceptions == null ? null : body.exceptions.toArray(String[]::new));
    wrapper.visibleAnnotations = body.visibleAnnotations; wrapper.invisibleAnnotations = body.invisibleAnnotations;
    body.visibleAnnotations = null; body.invisibleAnnotations = null;
    body.name = bodyName;
    body.access = (body.access & ~(Opcodes.ACC_PUBLIC | Opcodes.ACC_PROTECTED)) | Opcodes.ACC_PRIVATE | Opcodes.ACC_SYNTHETIC;
    LabelNode start = new LabelNode(), end = new LabelNode(), failure = new LabelNode();
    wrapper.instructions.add(new InsnNode(client ? Opcodes.ICONST_1 : Opcodes.ICONST_0));
    wrapper.instructions.add(new MethodInsnNode(Opcodes.INVOKESTATIC,
        "eff/minecraft/CoreTickScope", "enter", "(Z)V", false));
    wrapper.instructions.add(start);
    wrapper.instructions.add(new VarInsnNode(Opcodes.ALOAD, 0));
    if (server) wrapper.instructions.add(new VarInsnNode(Opcodes.ALOAD, 1));
    wrapper.instructions.add(new MethodInsnNode(Opcodes.INVOKESPECIAL, node.name, bodyName, descriptor, false));
    if (server) wrapper.instructions.add(new VarInsnNode(Opcodes.ALOAD, 0));
    wrapper.instructions.add(new MethodInsnNode(Opcodes.INVOKESTATIC,
        client ? "eff/minecraft/client/EffClient" : "eff/minecraft/EffServer",
        client ? "coreTick" : "tick", client ? "()V" : "(Lnet/minecraft/server/MinecraftServer;)V", false));
    wrapper.instructions.add(end);
    wrapper.instructions.add(new InsnNode(client ? Opcodes.ICONST_1 : Opcodes.ICONST_0));
    wrapper.instructions.add(new MethodInsnNode(Opcodes.INVOKESTATIC,
        "eff/minecraft/CoreTickScope", "exit", "(Z)V", false));
    wrapper.instructions.add(new InsnNode(Opcodes.RETURN));
    wrapper.instructions.add(failure);
    // Keep the original throwable on the stack while clearing the dispatch scope.
    wrapper.instructions.add(new InsnNode(client ? Opcodes.ICONST_1 : Opcodes.ICONST_0));
    wrapper.instructions.add(new MethodInsnNode(Opcodes.INVOKESTATIC,
        "eff/minecraft/CoreTickScope", "exit", "(Z)V", false));
    wrapper.instructions.add(new InsnNode(Opcodes.ATHROW));
    wrapper.tryCatchBlocks.add(new TryCatchBlockNode(start, end, failure, null));
    node.methods.add(wrapper);
    return 1;
  }

  /** Preserve the vanilla data-backed meaning for opted-in entities. No cached/fixed health,
   * no write-back, no resurrection: zero/NaN in the real data store is still zero/NaN.
   */
  private static int guardStoredStateReads(ClassNode node) {
    boolean entity = node.name.equals("net/minecraft/world/entity/Entity");
    boolean living = node.name.equals("net/minecraft/world/entity/LivingEntity");
    if (!entity && !living) return 0;
    int count = 0;
    for (MethodNode method : node.methods) {
      boolean health = living && method.desc.equals("()F") && (method.name.equals("getHealth") || method.name.equals("m_21223_"));
      boolean removed = entity && method.desc.equals("()Z") && (method.name.equals("isRemoved") || method.name.equals("m_213877_"));
      if (!health && !removed) continue;
      boolean named = method.name.equals("getHealth") || method.name.equals("isRemoved");
      LabelNode ordinary = new LabelNode(); InsnList guard = new InsnList();
      guard.add(new VarInsnNode(Opcodes.ALOAD, 0));
      guard.add(new MethodInsnNode(Opcodes.INVOKESTATIC, "eff/lifetime/FieldWriteGate", "rejectQuery", "(Ljava/lang/Object;)Z", false));
      guard.add(new JumpInsnNode(Opcodes.IFEQ, ordinary)); guard.add(new VarInsnNode(Opcodes.ALOAD, 0));
      if (health) {
        guard.add(new FieldInsnNode(Opcodes.GETFIELD, "net/minecraft/world/entity/Entity", named ? "entityData" : "f_19804_", "Lnet/minecraft/network/syncher/SynchedEntityData;"));
        guard.add(new FieldInsnNode(Opcodes.GETSTATIC, node.name, named ? "DATA_HEALTH_ID" : "f_20961_", "Lnet/minecraft/network/syncher/EntityDataAccessor;"));
        guard.add(new MethodInsnNode(Opcodes.INVOKEVIRTUAL, "net/minecraft/network/syncher/SynchedEntityData", named ? "get" : "m_135370_", "(Lnet/minecraft/network/syncher/EntityDataAccessor;)Ljava/lang/Object;", false));
        guard.add(new TypeInsnNode(Opcodes.CHECKCAST, "java/lang/Float"));
        guard.add(new MethodInsnNode(Opcodes.INVOKEVIRTUAL, "java/lang/Float", "floatValue", "()F", false));
        guard.add(new InsnNode(Opcodes.FRETURN));
      } else {
        LabelNode present = new LabelNode();
        guard.add(new FieldInsnNode(Opcodes.GETFIELD, node.name, named ? "removalReason" : "f_146795_", "Lnet/minecraft/world/entity/Entity$RemovalReason;"));
        guard.add(new JumpInsnNode(Opcodes.IFNONNULL, present)); guard.add(new InsnNode(Opcodes.ICONST_0)); guard.add(new InsnNode(Opcodes.IRETURN));
        guard.add(present); guard.add(new InsnNode(Opcodes.ICONST_1)); guard.add(new InsnNode(Opcodes.IRETURN));
      }
      guard.add(ordinary); method.instructions.insert(guard); count++;
    }
    if (count != 1) throw new IllegalStateException("LIFETIME_QUERY_MAPPING_MISMATCH:" + node.name + ":" + count);
    return count;
  }
}
