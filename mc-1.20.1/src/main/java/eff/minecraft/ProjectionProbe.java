package eff.minecraft;

import com.google.gson.JsonObject;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.phys.Vec3;

/**
 * Sample authoritative world state on the server thread, before any repair can erase the evidence.
 */
public final class ProjectionProbe {
  private static final RawHealthProbe.Reader RAW_HEALTH = new RawHealthProbe.Reader(
      net.minecraft.world.entity.Entity.class, LivingEntity.class,
      net.minecraft.network.syncher.SynchedEntityData.class,
      net.minecraft.network.syncher.EntityDataAccessor.class,
      net.minecraft.network.syncher.SynchedEntityData.DataItem.class);
  public static JsonObject inspect(LivingEntity entity, ServerLevel level, Vec3 anchor) {
    String uuid = "";
    if (entity != null) {
      try {
        uuid = entity.getUUID().toString();
        float health = entity.getHealth();
        RawHealthProbe.Observation rawObservation = storedHealthObservation(entity);
        Float storedHealth = rawObservation.value();
        Boolean storedDead = rawDead(entity);
        boolean finiteHealth = Float.isFinite(health);
        boolean finitePosition =
            Double.isFinite(entity.getX())
                && Double.isFinite(entity.getY())
                && Double.isFinite(entity.getZ());
        var uuidLookup = level.getEntity(entity.getUUID());
        var idLookup = level.getEntity(entity.getId());
        boolean sameLevel = entity.level() == level;
        boolean uuidRegistered = uuidLookup == entity;
        boolean idRegistered = idLookup == entity;
        boolean registered = sameLevel && uuidRegistered && idRegistered;
        if (entity instanceof ServerPlayer player)
          registered &= level.getServer().getPlayerList().getPlayer(player.getUUID()) == player;
        JsonObject result = Jsons.obj(
            "uuid",
            uuid,
            "alive",
            entity.isAlive(),
            "removed",
            entity.isRemoved(),
            "dying",
            entity.isDeadOrDying() || entity.deathTime > 0 || Boolean.TRUE.equals(storedDead),
            "rawDeadReadable", storedDead != null,
            "rawDead", Boolean.TRUE.equals(storedDead),
            "finiteHealth",
            finiteHealth,
            "health",
            finiteHealth ? health : 0,
            "rawHealthReadable", storedHealth != null && Float.isFinite(storedHealth),
            "rawHealth", storedHealth != null && Float.isFinite(storedHealth) ? storedHealth : 0,
            "registered",
            registered,
            "sameLevel", sameLevel,
            "uuidRegistered", uuidRegistered,
            "idRegistered", idRegistered,
            "entityId", entity.getId(),
            "uuidLookupClass", uuidLookup == null ? "null" : uuidLookup.getClass().getName(),
            "idLookupClass", idLookup == null ? "null" : idLookup.getClass().getName(),
            "deathTime",
            Math.max(0, entity.deathTime),
            "finitePosition",
            finitePosition,
            "inBounds",
            finitePosition && entity.position().distanceToSqr(anchor) <= 256D * 256D);
        if(storedHealth==null||!Float.isFinite(storedHealth))
          result.addProperty("rawHealthDiagnostic",storedHealth==null?rawObservation.diagnostic():"NON_FINITE_RAW_VALUE");
        return result;
      } catch (RuntimeException invalidObservation) {
        // A poisoned getter is a failed observation, never evidence that the projection is healthy.
      }
    }
    return Jsons.obj(
        "uuid", uuid,
        "alive", false,
        "removed", true,
        "dying", true,
        "finiteHealth", false,
        "health", 0,
        "registered", false,
        "deathTime", 0,
        "finitePosition", false,
        "inBounds", false);
  }

  public static boolean healthy(LivingEntity entity, ServerLevel level, Vec3 anchor) {
    return healthy(inspect(entity, level, anchor), true);
  }

  public static boolean healthyPlayer(ServerPlayer player, ServerLevel level, Vec3 anchor) {
    return healthy(inspect(player, level, anchor), false);
  }

  private static boolean healthy(JsonObject state, boolean requireBounds) {
    return Jsons.b(state, "alive")
        && !Jsons.b(state, "removed")
        && !Jsons.b(state, "dying")
        && Jsons.b(state, "rawDeadReadable")
        && !Jsons.b(state, "rawDead")
        && Jsons.b(state, "finiteHealth")
        && Jsons.d(state, "health") > 0
        && Jsons.b(state, "rawHealthReadable")
        && Jsons.d(state, "rawHealth") > 0
        && Jsons.d(state, "rawHealth") == Jsons.d(state, "health")
        && Jsons.b(state, "registered")
        && Jsons.b(state, "finitePosition")
        && (!requireBounds || Jsons.b(state, "inBounds"));
  }

  private ProjectionProbe() {}

  /** Diagnostic read of the actual DataItem value, separate from getHealth/DataItem.getValue.
   * Still an in-process observation, not a claim that arbitrary native code cannot forge it.
   */
  public static Float storedHealth(LivingEntity entity) {
    return storedHealthObservation(entity).value();
  }

  public static Boolean matchesHealthSlot(Object accessor) {
    return RAW_HEALTH.matchesHealthSlot(accessor);
  }

  /** Current storage only: no registration cache, repair, or replacement entity. */
  public static net.minecraft.world.entity.Entity clientEntityById(Object level, int id) {
    return currentEntityById(level, id, false);
  }

  public static net.minecraft.world.entity.Entity serverEntityById(Object level, int id) {
    return currentEntityById(level, id, true);
  }

  /** Enumerate current storage, never the lifetime claim registry or an earlier frame.
   * A removed entry cannot be recreated by this read-only view. */
  public static java.util.List<net.minecraft.world.entity.Entity> currentClientProjections(Object level) {
    var result = new java.util.ArrayList<net.minecraft.world.entity.Entity>();
    if (level == null) return result;
    try {
      ClassLoader loader = net.minecraft.world.level.Level.class.getClassLoader();
      Class<?> lc = Class.forName("net.minecraft.client.multiplayer.ClientLevel", false, loader);
      Class<?> mc = Class.forName("net.minecraft.world.level.entity.TransientEntitySectionManager", false, loader);
      Class<?> ec = Class.forName("net.minecraft.world.level.entity.EntityLookup", false, loader);
      Object manager = declaredIndexField(lc, "entityStorage", "f_171631_").get(level);
      Object lookup = declaredIndexField(mc, "entityStorage", "f_157637_").get(manager);
      Object backing = currentMapBacking(declaredIndexField(ec, "byId", "f_156807_").get(lookup), true);
      if (backing == null) return result;
      Object slots = EntityIndexStorage.values(backing);
      if (!(slots instanceof Object[] values) || values.length > 65537) return result;
      var seen = new java.util.IdentityHashMap<Object, Boolean>();
      for (Object value : values) if (value instanceof EffProjection entity
          && seen.put(value, Boolean.TRUE) == null && clientEntityById(level, entity.getId()) == entity
          && entity.rejectLifetimeMutation()) result.add(entity);
    } catch (ReflectiveOperationException | RuntimeException | LinkageError unavailable) {
      result.clear();
    }
    return result;
  }

  public static String rawRemovalReason(net.minecraft.world.entity.Entity entity) {
    try { return String.valueOf(declaredIndexField(net.minecraft.world.entity.Entity.class,
        "removalReason", "f_146795_").get(entity)); }
    catch (ReflectiveOperationException | RuntimeException unavailable) { return "UNAVAILABLE"; }
  }

  /** Null means unobservable; callers must not draw a cached healthy substitute. */
  public static Boolean rawDead(LivingEntity entity) {
    try { return declaredIndexField(LivingEntity.class, "dead", "f_20890_").getBoolean(entity); }
    catch (ReflectiveOperationException | RuntimeException | LinkageError unavailable) { return null; }
  }

  /** Sample stored geometry separately from hookable getters. Never repair coordinates or bounds. */
  public static JsonObject spatialDiagnostic(net.minecraft.world.entity.Entity entity) {
    JsonObject result = Jsons.obj("rawReadable", false, "publicReadable", false);
    try {
      Object position = declaredIndexField(net.minecraft.world.entity.Entity.class, "position", "f_19825_").get(entity);
      Object box = declaredIndexField(net.minecraft.world.entity.Entity.class, "bb", "f_19828_").get(entity);
      if (!(position instanceof net.minecraft.world.phys.Vec3 p) || !(box instanceof net.minecraft.world.phys.AABB b))
        throw new IllegalStateException("SPATIAL_STORAGE_TYPE");
      result.add("storedPosition", vectorDiagnostic(p.x, p.y, p.z));
      result.add("storedBoundsMin", vectorDiagnostic(b.minX, b.minY, b.minZ));
      result.add("storedBoundsMax", vectorDiagnostic(b.maxX, b.maxY, b.maxZ));
      Object block = declaredIndexField(net.minecraft.world.entity.Entity.class, "blockPosition", "f_19826_").get(entity);
      Object chunk = declaredIndexField(net.minecraft.world.entity.Entity.class, "chunkPosition", "f_185933_").get(entity);
      if (!(block instanceof net.minecraft.core.BlockPos bp) || !(chunk instanceof net.minecraft.world.level.ChunkPos cp))
        throw new IllegalStateException("SPATIAL_CACHE_TYPE");
      result.add("storedBlockPosition", vectorDiagnostic(bp.getX(), bp.getY(), bp.getZ()));
      result.add("storedChunkPosition", Jsons.obj("x", cp.x, "z", cp.z));
      result.addProperty("cacheMatchesPosition", bp.equals(net.minecraft.core.BlockPos.containing(p))
          && cp.x == (bp.getX() >> 4) && cp.z == (bp.getZ() >> 4));
      result.addProperty("rawReadable", true);
    } catch (ReflectiveOperationException | RuntimeException | LinkageError error) {
      result.addProperty("rawError", error.toString());
    }
    try {
      result.add("publicPosition", vectorDiagnostic(entity.getX(), entity.getY(), entity.getZ()));
      var bp = entity.blockPosition();
      result.add("publicBlockPosition", vectorDiagnostic(bp.getX(), bp.getY(), bp.getZ()));
      var b = entity.getBoundingBoxForCulling();
      result.add("cullingBoundsMin", vectorDiagnostic(b.minX, b.minY, b.minZ));
      result.add("cullingBoundsMax", vectorDiagnostic(b.maxX, b.maxY, b.maxZ));
      result.addProperty("publicReadable", true);
    } catch (RuntimeException | LinkageError error) {
      result.addProperty("publicError", error.toString());
    }
    return result;
  }

  private static JsonObject vectorDiagnostic(double x, double y, double z) {
    // Strings preserve NaN/infinity evidence without producing invalid JSON.
    return Jsons.obj("x", Double.toString(x), "y", Double.toString(y), "z", Double.toString(z),
        "finite", Double.isFinite(x) && Double.isFinite(y) && Double.isFinite(z));
  }

  /** Read-only lifecycle evidence. Raw storage and public answers stay separate: neither
   * a healthy data item nor a renderer returning proves the original entity still functions. */
  public static JsonObject lifecycleDiagnostic(net.minecraft.world.entity.Entity entity) {
    JsonObject result = Jsons.obj("rawReadable", false, "publicReadable", false,
        "combatPassed", false, "scope", "sampled-state-not-functional-survival");
    if (!(entity instanceof LivingEntity living)) return result;
    try {
      int deathTime = declaredIndexField(LivingEntity.class, "deathTime", "f_20919_").getInt(living);
      int hurtTime = declaredIndexField(LivingEntity.class, "hurtTime", "f_20916_").getInt(living);
      boolean dead = declaredIndexField(LivingEntity.class, "dead", "f_20890_").getBoolean(living);
      result.addProperty("rawDeathTime", deathTime);
      result.addProperty("rawHurtTime", hurtTime);
      result.addProperty("rawDead", dead);
      result.addProperty("rawReadable", true);
      // Hurt tint alone is ordinary gameplay, not a death verdict.
      result.addProperty("deathStateObserved", dead || deathTime != 0);
    } catch (ReflectiveOperationException | RuntimeException | LinkageError unavailable) {
      result.addProperty("rawError", unavailable.toString());
    }
    try {
      float health = living.getHealth();
      result.addProperty("publicHealthFinite", Float.isFinite(health));
      if (Float.isFinite(health)) result.addProperty("publicHealth", health);
      result.addProperty("publicAlive", living.isAlive());
      result.addProperty("publicDying", living.isDeadOrDying());
      result.addProperty("publicRemoved", living.isRemoved());
      result.addProperty("publicPose", ((Enum<?>) living.getPose()).name());
      result.addProperty("publicReadable", true);
    } catch (RuntimeException | LinkageError unavailable) {
      result.addProperty("publicError", unavailable.toString());
    }
    if (entity instanceof net.minecraft.world.entity.decoration.ArmorStand) {
      JsonObject poses = Jsons.obj("readable", false);
      try {
        String[] names = {"headPose", "bodyPose", "leftArmPose", "rightArmPose", "leftLegPose", "rightLegPose"};
        String[] mapped = {"f_31542_", "f_31543_", "f_31544_", "f_31545_", "f_31525_", "f_31526_"};
        for (int i = 0; i < names.length; i++) {
          Object rotation = declaredIndexField(net.minecraft.world.entity.decoration.ArmorStand.class,
              names[i], mapped[i]).get(entity);
          Class<?> owner = net.minecraft.core.Rotations.class;
          float x = declaredIndexField(owner, "x", "f_123146_").getFloat(rotation);
          float y = declaredIndexField(owner, "y", "f_123147_").getFloat(rotation);
          float z = declaredIndexField(owner, "z", "f_123148_").getFloat(rotation);
          if (!Float.isFinite(x) || !Float.isFinite(y) || !Float.isFinite(z))
            throw new IllegalStateException("NON_FINITE_ARMOR_POSE:" + names[i]);
          poses.add(names[i], Jsons.obj("x", x, "y", y, "z", z));
        }
        poses.addProperty("readable", true);
      } catch (ReflectiveOperationException | RuntimeException | LinkageError unavailable) {
        poses.addProperty("error", unavailable.toString());
      }
      result.add("storedArmorPoses", poses);
    }
    return result;
  }

  /** Separate absence from an unreadable index; public getters are not registration proof. */
  public static JsonObject registrationDiagnostic(Object level, net.minecraft.world.entity.Entity entity) {
    JsonObject result = Jsons.obj("readable", false);
    try {
      boolean server = level instanceof ServerLevel;
      ClassLoader loader = net.minecraft.world.level.Level.class.getClassLoader();
      Class<?> lc = Class.forName(server ? "net.minecraft.server.level.ServerLevel" : "net.minecraft.client.multiplayer.ClientLevel", false, loader);
      Class<?> mc = Class.forName("net.minecraft.world.level.entity." + (server ? "PersistentEntitySectionManager" : "TransientEntitySectionManager"), false, loader);
      Class<?> ec = Class.forName("net.minecraft.world.level.entity.EntityLookup", false, loader);
      var mf = declaredIndexField(lc, server ? "entityManager" : "entityStorage", server ? "f_143244_" : "f_171631_");
      var lf = declaredIndexField(mc, server ? "visibleEntityStorage" : "entityStorage", server ? "f_157494_" : "f_157637_");
      var idf = declaredIndexField(ec, "byId", "f_156807_");
      var uf = declaredIndexField(ec, "byUuid", "f_156808_");
      Object manager = mf.get(level), lookup = lf.get(manager), ids = idf.get(lookup), uuids = uf.get(lookup);
      result.addProperty("idMapClass", ids == null ? "null" : ids.getClass().getName());
      result.addProperty("uuidMapClass", uuids == null ? "null" : uuids.getClass().getName());
      Object ib = currentMapBacking(ids, true), ub = currentMapBacking(uuids, false);
      result.addProperty("idBackingClass", ib == null ? "null" : ib.getClass().getName());
      result.addProperty("uuidBackingClass", ub == null ? "null" : ub.getClass().getName());
      if (ib == null || !(ub instanceof java.util.Map<?, ?> map)) throw new IllegalStateException("UNKNOWN_INDEX_SHAPE");
      Object byId = currentFastutilEntry(ib, entity.getId()), byUuid = EntityIndexStorage.byUUID(ub, entity.getUUID());
      if (mf.get(level) != manager || lf.get(manager) != lookup || idf.get(lookup) != ids || uf.get(lookup) != uuids)
        throw new IllegalStateException("INDEX_CHANGED_DURING_SAMPLE");
      result.addProperty("readable", true);
      result.addProperty("idOriginal", byId == entity);
      result.addProperty("uuidOriginal", byUuid == entity);
      result.addProperty("idAbsent", byId == null);
      result.addProperty("uuidAbsent", byUuid == null);
      result.addProperty("sameLevel", entity.level() == level);
      diagnosticIdentity(result, "idEntry", byId); diagnosticIdentity(result, "uuidEntry", byUuid);
    } catch (ReflectiveOperationException | RuntimeException | LinkageError failure) {
      result.addProperty("error", failure.getClass().getName());
      result.addProperty("detail", failure.getMessage());
    }
    return result;
  }

  /** Observe the public interaction lookup separately from retained backing maps. Never repairs it. */
  public static JsonObject publicIndexDiagnostic(Object level, net.minecraft.world.entity.Entity original) {
    JsonObject out = Jsons.obj("scope", "public-interaction-lookup-not-trust-root", "readable", false);
    try {
      var world = (net.minecraft.world.level.Level) level;
      Object byId = world.getEntity(original.getId());
      out.addProperty("side", world.isClientSide ? "client" : "server");
      out.addProperty("idOriginal", byId == original);
      out.addProperty("idAbsent", byId == null);
      diagnosticIdentity(out, "idEntry", byId);
      if (world instanceof ServerLevel server) {
        Object byUuid = server.getEntity(original.getUUID());
        Object interaction = server.getEntityOrPart(original.getId());
        out.addProperty("uuidOriginal", byUuid == original);
        out.addProperty("interactionOriginal", interaction == original);
        out.addProperty("uuidAbsent", byUuid == null);
        out.addProperty("interactionAbsent", interaction == null);
        diagnosticIdentity(out, "uuidEntry", byUuid);
        diagnosticIdentity(out, "interactionEntry", interaction);
      }
      out.addProperty("readable", true);
    } catch (RuntimeException | LinkageError unavailable) {
      out.addProperty("errorType", unavailable.getClass().getName());
    }
    return out;
  }

  private static net.minecraft.world.entity.Entity currentEntityById(Object level, int id, boolean server) {
    if (level == null) return null;
    try {
      ClassLoader loader = net.minecraft.world.level.Level.class.getClassLoader();
      Class<?> levelClass = Class.forName(server ? "net.minecraft.server.level.ServerLevel"
          : "net.minecraft.client.multiplayer.ClientLevel", false, loader);
      Class<?> managerClass = Class.forName("net.minecraft.world.level.entity."
          + (server ? "PersistentEntitySectionManager" : "TransientEntitySectionManager"), false, loader);
      Class<?> lookupClass = Class.forName("net.minecraft.world.level.entity.EntityLookup", false, loader);
      if (!levelClass.isInstance(level)) return null;
      var managerField = declaredIndexField(levelClass, server ? "entityManager" : "entityStorage",
          server ? "f_143244_" : "f_171631_");
      var lookupField = declaredIndexField(managerClass, server ? "visibleEntityStorage" : "entityStorage",
          server ? "f_157494_" : "f_157637_");
      var idField = declaredIndexField(lookupClass, "byId", "f_156807_");
      var uuidField = declaredIndexField(lookupClass, "byUuid", "f_156808_");
      if (managerField.getType() != managerClass || lookupField.getType() != lookupClass
          || idField.getType() != it.unimi.dsi.fastutil.ints.Int2ObjectMap.class
          || uuidField.getType() != java.util.Map.class) return null;
      Object manager = managerField.get(level), lookup = lookupField.get(manager);
      Object idMap = idField.get(lookup), uuidMap = uuidField.get(lookup);
      Object backing = currentMapBacking(idMap, true);
      Object candidate = currentFastutilEntry(backing, id);
      if (!(candidate instanceof net.minecraft.world.entity.Entity entity)) return null;
      Class<?> entityClass = net.minecraft.world.entity.Entity.class;
      var entityId = declaredIndexField(entityClass, "id", "f_19848_");
      var entityLevel = declaredIndexField(entityClass, "level", "f_19853_");
      var entityUuid = declaredIndexField(entityClass, "uuid", "f_19820_");
      if (entityId.getType() != int.class || entityLevel.getType() != net.minecraft.world.level.Level.class
          || entityUuid.getType() != java.util.UUID.class || entityId.getInt(entity) != id
          || entityLevel.get(entity) != level) return null;
      Object uuid = entityUuid.get(entity), uuidBacking = currentMapBacking(uuidMap, false);
      if (!(uuid instanceof java.util.UUID) || !(uuidBacking instanceof java.util.Map<?, ?> map)
          || EntityIndexStorage.byUUID(uuidBacking, (java.util.UUID) uuid) != entity) return null;
      // Reject a changed chain; never finish with a reference captured from an old index.
      if (managerField.get(level) != manager || lookupField.get(manager) != lookup
          || idField.get(lookup) != idMap || uuidField.get(lookup) != uuidMap
          || currentMapBacking(idMap, true) != backing
          || currentMapBacking(uuidMap, false) != uuidBacking
          || currentFastutilEntry(backing, id) != entity
          || EntityIndexStorage.byUUID(uuidBacking, (java.util.UUID) uuid) != entity) return null;
      return entity;
    } catch (ReflectiveOperationException | RuntimeException | LinkageError unavailable) {
      return null;
    }
  }

  private static Object currentMapBacking(Object value, boolean integerIndex)
      throws ReflectiveOperationException {
    return EntityIndexStorage.backing(value, integerIndex);
  }

  private static Object currentFastutilEntry(Object map, int id) throws ReflectiveOperationException {
    return EntityIndexStorage.byId(map, id);
  }

  private static java.lang.reflect.Field declaredIndexField(Class<?> owner, String named, String mapped)
      throws ReflectiveOperationException {
    java.lang.reflect.Field field;
    try { field = owner.getDeclaredField(mapped); }
    catch (NoSuchFieldException developmentNames) {
      try { field = owner.getDeclaredField(named); }
      catch (NoSuchFieldException absent) {
        throw new NoSuchFieldException(owner.getName() + ":" + mapped + "/" + named);
      }
    }
    if (java.lang.reflect.Modifier.isStatic(field.getModifiers()) || !field.trySetAccessible())
      throw new IllegalAccessException("CLIENT_INDEX_FIELD_UNAVAILABLE");
    return field;
  }

  /** Opt-in diagnostic only. Reads current storage; never retains/reinserts an entity or
   * contributes to healthy(). The before/after array views expose query side effects. */
  public static JsonObject indexDiagnostic(Object level, net.minecraft.world.entity.Entity target) {
    JsonObject result = new JsonObject();
    if (!Boolean.getBoolean("eff.labAttackTrace")) return result;
    diagnosticIdentity(result, "level", level);
    diagnosticIdentity(result, "original", target);
    try {
      int id = target.getId();
      result.addProperty("entityId", id);
      boolean server = level instanceof ServerLevel;
      ClassLoader loader = net.minecraft.world.level.Level.class.getClassLoader();
      Class<?> levelClass = Class.forName(server ? "net.minecraft.server.level.ServerLevel"
          : "net.minecraft.client.multiplayer.ClientLevel", false, loader);
      Class<?> managerClass = Class.forName("net.minecraft.world.level.entity."
          + (server ? "PersistentEntitySectionManager" : "TransientEntitySectionManager"), false, loader);
      Object manager = declaredIndexField(levelClass, server ? "entityManager" : "entityStorage",
          server ? "f_143244_" : "f_171631_").get(level);
      diagnosticIdentity(result, "manager", manager);
      Object lookup = declaredIndexField(managerClass, server ? "visibleEntityStorage" : "entityStorage",
          server ? "f_157494_" : "f_157637_").get(manager);
      result.add("storageLookup", lookupDiagnostic(lookup, target, id));
      if (server) {
        Object getter = declaredIndexField(managerClass, "entityGetter", "f_157496_").get(manager);
        diagnosticIdentity(result, "getter", getter);
        Class<?> adapter = Class.forName("net.minecraft.world.level.entity.LevelEntityGetterAdapter", false, loader);
        Object getterLookup = declaredIndexField(adapter, "visibleEntities", "f_156940_").get(getter);
        result.addProperty("getterUsesStorageLookup", getterLookup == lookup);
        result.add("getterLookup", lookupDiagnostic(getterLookup, target, id));
      }
    } catch (ReflectiveOperationException | RuntimeException | LinkageError failure) {
      result.addProperty("error", failure.getClass().getName() + ":" + failure.getMessage());
    }
    return result;
  }

  /** Diagnose the current spatial-query route without replacing a getter or inserting an entity. */
  public static JsonObject spatialQueryDiagnostic(Object level, net.minecraft.world.entity.Entity target) {
    JsonObject result = new JsonObject();
    if (!Boolean.getBoolean("eff.labAttackTrace") && System.getProperty("eff.manualCombat", "").isEmpty()) {
      result.addProperty("observationDisabled", true);
      return result;
    }
    try {
      boolean server = level instanceof ServerLevel;
      ClassLoader loader = net.minecraft.world.level.Level.class.getClassLoader();
      Class<?> levelClass = Class.forName(server ? "net.minecraft.server.level.ServerLevel"
          : "net.minecraft.client.multiplayer.ClientLevel", false, loader);
      Class<?> managerClass = Class.forName("net.minecraft.world.level.entity."
          + (server ? "PersistentEntitySectionManager" : "TransientEntitySectionManager"), false, loader);
      Object manager = declaredIndexField(levelClass, server ? "entityManager" : "entityStorage",
          server ? "f_143244_" : "f_171631_").get(level);
      diagnosticIdentity(result, "manager", manager);
      Object getter = declaredIndexField(managerClass, "entityGetter", server ? "f_157496_" : "f_157640_").get(manager);
      Object storage = declaredIndexField(managerClass, "sectionStorage", server ? "f_157495_" : "f_157638_").get(manager);
      diagnosticIdentity(result, "getter", getter);
      diagnosticIdentity(result, "sectionStorage", storage);
      result.add("storageChain", spatialStorageChain(storage, target));
      var box = target.getBoundingBox().inflate(0.05);
      if (getter instanceof net.minecraft.world.level.entity.LevelEntityGetter<?> query) {
        boolean[] found = {false};
        query.get(box, value -> { if (value == target) found[0] = true; });
        result.addProperty("getterQueryContainsOriginal", found[0]);
      }
      if (storage instanceof net.minecraft.world.level.entity.EntitySectionStorage<?> query) {
        boolean[] found = {false};
        query.getEntities(box, value -> {
          if (value == target) found[0] = true;
          return net.minecraft.util.AbortableIterationConsumer.Continuation.CONTINUE;
        });
        result.addProperty("sectionQueryContainsOriginal", found[0]);
      }
      Class<?> adapter = Class.forName("net.minecraft.world.level.entity.LevelEntityGetterAdapter", false, loader);
      result.addProperty("getterIsReviewedAdapter", adapter.isInstance(getter));
      if (adapter.isInstance(getter)) {
        Object getterStorage = declaredIndexField(adapter, "sectionStorage", "f_156941_").get(getter);
        diagnosticIdentity(result, "getterStorage", getterStorage);
        result.addProperty("getterUsesManagerStorage", getterStorage == storage);
      }
    } catch (ReflectiveOperationException | RuntimeException | LinkageError failure) {
      result.addProperty("error", failure.getClass().getName() + ":" + failure.getMessage());
    }
    return result;
  }

  private static com.google.gson.JsonArray spatialStorageChain(Object storage, net.minecraft.world.entity.Entity target) {
    var result = new com.google.gson.JsonArray();
    var seen = new java.util.IdentityHashMap<Object, Boolean>();
    Class<?> base = net.minecraft.world.level.entity.EntitySectionStorage.class;
    Object current = storage;
    for (int depth = 0; current != null && depth <= 4; depth++) {
      JsonObject entry = new JsonObject(); result.add(entry);
      diagnosticIdentity(entry, "storage", current);
      if (seen.put(current, Boolean.TRUE) != null) { entry.addProperty("cycle", true); break; }
      try {
        var fields = new com.google.gson.JsonArray();
        for (var field : base.getDeclaredFields()) if (!java.lang.reflect.Modifier.isStatic(field.getModifiers()))
          fields.add(field.getName() + ":" + field.getType().getName());
        entry.add("baseDeclaredFields", fields);
        if (current instanceof net.minecraft.world.level.entity.EntitySectionStorage<?> query) {
          long key = net.minecraft.core.SectionPos.asLong(target.blockPosition());
          entry.addProperty("sectionKey", key);
          Object section = query.getSection(key);
          diagnosticIdentity(entry, "section", section);
          if (section != null) {
            Object contents = declaredIndexField(net.minecraft.world.level.entity.EntitySection.class,
                "storage", "f_156827_").get(section);
            diagnosticIdentity(entry, "sectionContents", contents);
            Object members = declaredIndexField(net.minecraft.util.ClassInstanceMultiMap.class,
                "allInstances", "f_13529_").get(contents);
            diagnosticIdentity(entry, "members", members);
            entry.addProperty("rawMembersContainOriginal", EntityIndexStorage.arrayListContainsOriginal(members, target));
          }
        }
      } catch (ReflectiveOperationException | RuntimeException | LinkageError failure) {
        entry.addProperty("memberObservationError", failure.getClass().getName() + ":" + failure.getMessage());
      }
      try {
        java.lang.reflect.Field delegate = null;
        for (Class<?> owner = current.getClass(); owner != null; owner = owner.getSuperclass()) {
          try {
            var field = owner.getDeclaredField("delegate");
            if (!java.lang.reflect.Modifier.isStatic(field.getModifiers()) && base.isAssignableFrom(field.getType())
                && field.trySetAccessible()) { delegate = field; break; }
          } catch (NoSuchFieldException absent) { }
        }
        if (delegate == null) { entry.addProperty("leaf", true); break; }
        if (depth == 4) { entry.addProperty("depthLimit", true); break; }
        current = delegate.get(current);
      } catch (IllegalAccessException | RuntimeException failure) {
        entry.addProperty("delegateObservationError", failure.getClass().getName()); break;
      }
    }
    return result;
  }

  private static JsonObject lookupDiagnostic(Object lookup, Object original, int id)
      throws ReflectiveOperationException {
    JsonObject result = new JsonObject();
    diagnosticIdentity(result, "lookup", lookup);
    Class<?> owner = Class.forName("net.minecraft.world.level.entity.EntityLookup", false,
        net.minecraft.world.level.Level.class.getClassLoader());
    Object map = declaredIndexField(owner, "byId", "f_156807_").get(lookup);
    result.add("byId", mapDiagnostic(map, original, id, 0));
    return result;
  }

  private static JsonObject mapDiagnostic(Object value, Object original, int id, int depth) {
    JsonObject result = new JsonObject();
    diagnosticIdentity(result, "map", value);
    result.add("rawBeforeQueries", rawSlotsDiagnostic(value, original, id));
    try {
      if (value instanceof java.util.Map<?, ?> map) {
        Object boxed = map.get(Integer.valueOf(id));
        result.addProperty("boxedContains", map.containsKey(Integer.valueOf(id)));
        result.addProperty("boxedGetOriginal", boxed == original);
        diagnosticIdentity(result, "boxedGet", boxed);
      }
      if (value instanceof it.unimi.dsi.fastutil.ints.Int2ObjectMap<?> map) {
        Object primitive = map.get(id);
        result.addProperty("primitiveContains", map.containsKey(id));
        result.addProperty("primitiveGetOriginal", primitive == original);
        diagnosticIdentity(result, "primitiveGet", primitive);
      }
    } catch (RuntimeException | LinkageError failure) {
      result.addProperty("queryError", failure.getClass().getName() + ":" + failure.getMessage());
    }
    result.add("rawAfterQueries", rawSlotsDiagnostic(value, original, id));
    // Generic wrapper observation, not an opponent-specific bypass. Never follow an
    // arbitrary object graph or write through the delegate; at most four map layers.
    if (value != null && depth < 4) try {
      Object delegate = hierarchyDiagnosticField(value.getClass(), "delegate").get(value);
      if (delegate instanceof java.util.Map<?, ?> && delegate != value)
        result.add("delegate", mapDiagnostic(delegate, original, id, depth + 1));
    } catch (NoSuchFieldException absent) {
      // Ordinary fastutil maps have no delegate.
    } catch (ReflectiveOperationException | RuntimeException | LinkageError failure) {
      result.addProperty("delegateError", failure.getClass().getName() + ":" + failure.getMessage());
    }
    return result;
  }

  private static JsonObject rawSlotsDiagnostic(Object map, Object original, int id) {
    JsonObject result = new JsonObject();
    if (map == null) { result.addProperty("available", false); return result; }
    try {
      Object keyObject = hierarchyDiagnosticField(map.getClass(), "key").get(map);
      Object valueObject = hierarchyDiagnosticField(map.getClass(), "value").get(map);
      if (!(keyObject instanceof int[] keys) || !(valueObject instanceof Object[] values))
        throw new IllegalStateException("NOT_INT_OBJECT_BACKING_ARRAYS");
      int bound = Math.min(Math.min(keys.length, values.length), 65536);
      int keyMatches = 0, originalMatches = 0, exactMatches = 0;
      for (int i = 0; i < bound; i++) {
        if (keys[i] == id) keyMatches++;
        if (values[i] == original) originalMatches++;
        if (keys[i] == id && values[i] == original) exactMatches++;
      }
      result.addProperty("available", true);
      result.addProperty("keysIdentity", System.identityHashCode(keys));
      result.addProperty("valuesIdentity", System.identityHashCode(values));
      result.addProperty("keysLength", keys.length);
      result.addProperty("valuesLength", values.length);
      result.addProperty("scannedSlots", bound);
      result.addProperty("truncated", bound < keys.length || bound < values.length);
      result.addProperty("idKeySlots", keyMatches);
      result.addProperty("originalValueSlots", originalMatches);
      result.addProperty("exactOriginalIdSlots", exactMatches);
    } catch (ReflectiveOperationException | RuntimeException | LinkageError failure) {
      result.addProperty("available", false);
      result.addProperty("error", failure.getClass().getName() + ":" + failure.getMessage());
    }
    return result;
  }

  /** Compare the current renderer map entry with the already observed virtual result.
   * Object parameters keep client-only classes out of this shared method descriptor. */
  public static JsonObject rendererDiagnostic(Object dispatcher, net.minecraft.world.entity.Entity target,
      Object virtualRenderer) {
    JsonObject result = new JsonObject();
    if (!Boolean.getBoolean("eff.labAttackTrace")) return result;
    diagnosticIdentity(result, "dispatcher", dispatcher);
    diagnosticIdentity(result, "virtualRenderer", virtualRenderer);
    try {
      Class<?> owner = Class.forName("net.minecraft.client.renderer.entity.EntityRenderDispatcher", false,
          net.minecraft.world.level.Level.class.getClassLoader());
      Object values = declaredIndexField(owner, "renderers", "f_114362_").get(dispatcher);
      diagnosticIdentity(result, "rendererMap", values);
      if (!(values instanceof java.util.Map<?, ?> map)) throw new IllegalStateException("NO_RENDERER_MAP");
      Object type = target.getType();
      Object stored = map.get(type);
      diagnosticIdentity(result, "mapRenderer", stored);
      result.addProperty("mapContainsType", map.containsKey(type));
      result.addProperty("mapEqualsVirtualRenderer", stored == virtualRenderer);
      // A raw FIELD read followed by virtual Map.get is stated explicitly: no claim
      // that an arbitrary hostile map implementation cannot forge its return value.
      result.addProperty("readMode", "declared-renderers-field-then-map-get");
    } catch (ReflectiveOperationException | RuntimeException | LinkageError failure) {
      result.addProperty("error", failure.getClass().getName() + ":" + failure.getMessage());
    }
    return result;
  }

  private static java.lang.reflect.Field hierarchyDiagnosticField(Class<?> owner, String name)
      throws ReflectiveOperationException {
    for (Class<?> cursor = owner; cursor != null; cursor = cursor.getSuperclass()) {
      try {
        var field = cursor.getDeclaredField(name);
        if (java.lang.reflect.Modifier.isStatic(field.getModifiers()) || !field.trySetAccessible())
          throw new IllegalAccessException("DIAGNOSTIC_FIELD_UNAVAILABLE:" + name);
        return field;
      } catch (NoSuchFieldException next) { /* Inspect declared superclass storage. */ }
    }
    throw new NoSuchFieldException(name);
  }

  private static void diagnosticIdentity(JsonObject result, String prefix, Object value) {
    result.addProperty(prefix + "Class", value == null ? "null" : value.getClass().getName());
    result.addProperty(prefix + "Identity", value == null ? 0 : System.identityHashCode(value));
    if (value != null)
      result.addProperty(prefix + "LoaderIdentity", System.identityHashCode(value.getClass().getClassLoader()));
  }

  private static RawHealthProbe.Observation storedHealthObservation(LivingEntity entity) {
    // This observer must remain usable without generated accessor call sites. Read the actual
    // declared DataItem field and preserve failure evidence; never substitute a health getter.
    return RAW_HEALTH.observe(entity);
  }
}
