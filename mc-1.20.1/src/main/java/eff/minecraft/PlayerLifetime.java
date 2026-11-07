package eff.minecraft;

import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Player;

/** Scoped to EFF's integrated arena. No global player immunity and no post-death repair. */
public final class PlayerLifetime {
  private static final PlayerLifetimeRegistry<Player> CLAIMS = new PlayerLifetimeRegistry<>();
  private PlayerLifetime() {}

  /** Instrumented execution observations, never a replacement or additional tick. */
  public static void observeWorldTick(Object object, int boundary) {
    if (!System.getProperty("eff.manualCombat", "").isBlank() && object instanceof ServerPlayer player)
      CLAIMS.observeTickBoundary(player, boundary);
  }

  /** Records the already-computed branch value; never calls the predicate again. */
  public static void observeWorldDecision(boolean result, Object object, int decision) {
    if (!System.getProperty("eff.manualCombat", "").isBlank() && object instanceof ServerPlayer player)
      CLAIMS.observeTickDecision(player, decision, result);
  }

  public static void claim(ServerPlayer player, Object owner, PlayerLifetimeRegistry.Bounds bounds) {
    if (bounds == null || !bounds.contains(player.getX(), player.getY(), player.getZ()))
      throw new IllegalStateException("PLAYER_SPATIAL_ADMISSION_OUTSIDE_ARENA");
    Float health = ProjectionProbe.storedHealth(player);
    boolean arenaDimension = player.level().dimension().equals(EffArena.DIM);
    boolean originalIndexed = ProjectionProbe.serverEntityById(player.level(), player.getId()) == player;
    boolean publicUuidIndexed = player.serverLevel().getEntity(player.getUUID()) == player;
    Boolean dead = ProjectionProbe.rawDead(player);
    String removalReason = ProjectionProbe.rawRemovalReason(player);
    boolean healthy = health != null && Float.isFinite(health) && health > 0;
    if (!arenaDimension || !originalIndexed || !publicUuidIndexed || !healthy
        || !Boolean.FALSE.equals(dead) || !"null".equals(removalReason)) {
      // Diagnose the failed admission before throwing; never register or repair it.
      var state = Jsons.obj("arenaDimension", arenaDimension,
          "actualDimension", player.level().dimension().location().toString(),
          "originalIndexed", originalIndexed, "rawHealthReadable", health != null,
          "publicUuidIndexed", publicUuidIndexed,
          "rawHealthFinite", health != null && Float.isFinite(health),
          "rawHealth", health != null && Float.isFinite(health) ? health : 0,
          "rawDeadReadable", dead != null, "rawDead", Boolean.TRUE.equals(dead),
          "rawRemovalReason", removalReason, "entityId", player.getId(),
          "playerIdentity", System.identityHashCode(player), "admitted", false);
      state.add("registration", ProjectionProbe.registrationDiagnostic(player.level(), player));
      state.add("lifecycle", ProjectionProbe.lifecycleDiagnostic(player));
      BootstrapDiagnostics.state("player-claim-rejected", state);
      throw new IllegalStateException("PLAYER_LIFETIME_ORIGINAL_NOT_HEALTHY_INDEXED:"
          + "dimension=" + arenaDimension + ",indexed=" + originalIndexed
          + ",publicUuidIndexed=" + publicUuidIndexed
          + ",health=" + healthy + ",dead=" + dead + ",removal=" + removalReason);
    }
    CLAIMS.claim(player, player.getUUID(), player.level().dimension(), owner, bounds);
  }

  public static void updateBounds(ServerPlayer player, Object owner, PlayerLifetimeRegistry.Bounds bounds) {
    CLAIMS.updateBounds(player, player.getUUID(), owner, bounds);
  }

  public static boolean allowsPosition(Object object, double x, double y, double z) {
    return object instanceof Player player && CLAIMS.positionAllowed(player, player.getUUID(), x, y, z);
  }

  public static void release(ServerPlayer player, Object owner) {
    CLAIMS.release(player, player.getUUID(), owner);
  }

  public static boolean active(Object object) {
    if (!(object instanceof Player player) || player.level() == null) return false;
    return CLAIMS.active(player, player.getUUID(), player.level().dimension(), player.level().isClientSide,
        () -> ProjectionProbe.clientEntityById(player.level(), player.getId()) == player);
  }

  public static Object key(Object object) {
    return object instanceof Player player ? player.getUUID() : null;
  }

  /** Read actual registration and raw state; a claimed but lost/dead player is not drawable success. */
  public static boolean current(Object object) {
    if (!(object instanceof Player player) || !active(player)) return false;
    Object registered = player.level().isClientSide
        ? ProjectionProbe.clientEntityById(player.level(), player.getId())
        : ProjectionProbe.serverEntityById(player.level(), player.getId());
    Float health = ProjectionProbe.storedHealth(player);
    return registered == player && health != null && Float.isFinite(health) && health > 0
        && Boolean.FALSE.equals(ProjectionProbe.rawDead(player))
        && "null".equals(ProjectionProbe.rawRemovalReason(player)) && player.deathTime == 0
        && allowsPosition(player, player.getX(), player.getY(), player.getZ());
  }

  public static boolean rejectOperation(Object object, String operation) {
    if (!active(object)) return false;
    operationRejected(object, operation);
    return true;
  }

  /** Preserve pre-operation rejection; diagnostic failures never authorize damage. */
  public static boolean rejectDamage(Object object, String operation, Object source, float amount) {
    if (!active(object)) return false;
    operationRejected(object, operation);
    if (eff.minecraft.lab.AttackTraceBridge.manualDamageEnabled()) {
      try {
        var details = diagnosticState((Player) object, false);
        details.addProperty("sourceClass", source == null ? "null" : source.getClass().getName());
        details.addProperty("sourceObjectIdentity", source == null ? 0 : System.identityHashCode(source));
        // Do not invoke getters overridden by an arbitrary mod's DamageSource subclass
        // merely to generate a receipt. Class/identity and raw amount remain available.
        if (source != null && source.getClass() == net.minecraft.world.damagesource.DamageSource.class) {
          var damage = (net.minecraft.world.damagesource.DamageSource) source;
          String type = damage.getMsgId();
          details.addProperty("publicDamageType", type == null ? "null" : type.substring(0, Math.min(type.length(), 128)));
          addSource(details, "direct", damage.getDirectEntity());
          addSource(details, "causing", damage.getEntity());
        } else details.addProperty("sourceGettersNotInvoked", true);
        eff.minecraft.lab.AttackTraceBridge.manualDamageRejected(object, operation, amount, details);
      } catch (RuntimeException | LinkageError unavailable) {
        eff.minecraft.lab.AttackTraceBridge.manualDamageRejected(object, operation, amount,
            Jsons.obj("observationUnavailable", true, "errorType", unavailable.getClass().getName()));
      }
    }
    return true;
  }

  private static void addSource(com.google.gson.JsonObject details, String prefix,
      net.minecraft.world.entity.Entity source) {
    details.addProperty(prefix + "Class", source == null ? "null" : source.getClass().getName());
    details.addProperty(prefix + "ObjectIdentity", source == null ? 0 : System.identityHashCode(source));
  }

  /** Read-only sampled game state, explicitly not an independent JVM trust root. */
  public static com.google.gson.JsonObject diagnosticState(Player player) {
    return diagnosticState(player, true);
  }
  private static com.google.gson.JsonObject diagnosticState(Player player, boolean scheduler) {
    var out = Jsons.obj("scope", "in-process-public-gameplay-state", "readable", false);
    try {
      var abilities = player.getAbilities();
      out.addProperty("side", player.level().isClientSide ? "client" : "server");
      out.addProperty("difficulty", ((Enum<?>) player.level().getDifficulty()).name());
      out.addProperty("creative", player.isCreative());
      out.addProperty("spectator", player.isSpectator());
      out.addProperty("publicInvulnerable", player.isInvulnerable());
      out.addProperty("abilityInvulnerable", abilities.invulnerable);
      out.addProperty("abilityInstabuild", abilities.instabuild);
      // Flight can be granted independently of creative mode. Record it so
      // vertical motion is not mistaken for a normal jump or a stalled tick.
      out.addProperty("abilityMayfly", abilities.mayfly);
      out.addProperty("abilityFlying", abilities.flying);
      out.addProperty("naturalRegeneration", player.level().getGameRules()
          .getBoolean(net.minecraft.world.level.GameRules.RULE_NATURAL_REGENERATION));
      // These observations diagnose a live-but-inert player. A health/index
      // receipt alone does not establish that the original player still ticks.
      out.addProperty("tickCount", player.tickCount);
      out.addProperty("onGround", player.onGround());
      out.addProperty("passenger", player.isPassenger());
      out.addProperty("noPhysics", player.noPhysics);
      out.addProperty("noGravity", player.isNoGravity());
      out.addProperty("velocityX", Double.toString(player.getDeltaMovement().x));
      out.addProperty("velocityY", Double.toString(player.getDeltaMovement().y));
      out.addProperty("velocityZ", Double.toString(player.getDeltaMovement().z));
      var publicBox = player.getBoundingBox();
      out.add("publicBoundingBox", boxDiagnostic(publicBox));
      // Resolve base storage explicitly; a virtual getter can disagree after interference.
      try {
        java.lang.reflect.Field field;
        try { field = net.minecraft.world.entity.Entity.class.getDeclaredField("bb"); }
        catch (NoSuchFieldException named) { field = net.minecraft.world.entity.Entity.class.getDeclaredField("f_19828_"); }
        if (!field.trySetAccessible()) throw new IllegalAccessException("BOUNDING_BOX_NOT_ACCESSIBLE");
        Object raw = field.get(player);
        out.addProperty("boundingBoxIdentityMatches", raw == publicBox);
        if (raw instanceof net.minecraft.world.phys.AABB box) out.add("storedBoundingBox", boxDiagnostic(box));
        else out.addProperty("storedBoundingBoxError", "NULL_OR_WRONG_TYPE");
      } catch (ReflectiveOperationException | RuntimeException unavailable) {
        out.addProperty("storedBoundingBoxError", unavailable.getClass().getName());
      }
      if (player instanceof ServerPlayer server) {
        out.addProperty("serverGameMode", server.gameMode.getGameModeForPlayer().getName());
        // Only the explicitly armed local combat diagnostic inspects scheduler storage.
        if (scheduler && !System.getProperty("eff.manualCombat", "").isBlank()) {
          long[] boundaries = CLAIMS.tickBoundaries(player);
          out.add("serverTickBoundaries", Jsons.obj("diagnosticOnly", true,
              "dispatchEntry", boundaries[0], "nonPassengerEntry", boundaries[1],
              "beforeVanillaCounterWrite", boundaries[2], "beforeGuardDispatch", boundaries[3],
              "afterGuardDispatch", boundaries[4], "completionProven", false));
          long[] decisions=CLAIMS.tickDecisions(player);
          var decisionState=Jsons.obj("diagnosticOnly",true,"predicateReevaluated",false);
          String[] decisionNames={"initialRemoved","shouldDiscard","chunkEntityTicking","vehicleRemoved","vehicleHasPassenger","finalRemoved"};
          for(int i=0;i<decisionNames.length;i++)decisionState.add(decisionNames[i],
              Jsons.obj("falseCount",decisions[i*2],"trueCount",decisions[i*2+1]));
          out.add("serverTickDecisions",decisionState);
          try {
            java.lang.reflect.Field ticks;
            try { ticks=net.minecraft.server.level.ServerLevel.class.getDeclaredField("entityTickList"); }
            catch(NoSuchFieldException named) { ticks=net.minecraft.server.level.ServerLevel.class.getDeclaredField("f_143243_"); }
            if(!ticks.trySetAccessible())throw new IllegalAccessException("WORLD_TICK_LIST_ACCESS");
            out.add("serverTickStorage",Jsons.GSON.toJsonTree(EntityIndexStorage.tickListDiagnostic(
                ticks.get(server.serverLevel()),net.minecraft.world.level.entity.EntityTickList.class,server.getId(),server)));
          } catch(ReflectiveOperationException|RuntimeException|LinkageError unavailable) {
            out.add("serverTickStorage",Jsons.obj("readable",false,"error",unavailable.getClass().getName()));
          }
          try {
            var flag=net.minecraft.world.entity.Entity.class.getDeclaredField("canUpdate");
            if(flag.getType()!=boolean.class||!flag.trySetAccessible())throw new IllegalAccessException("CAN_UPDATE_ACCESS");
            out.addProperty("storedCanUpdate",flag.getBoolean(server));
          }catch(ReflectiveOperationException|RuntimeException unavailable){out.addProperty("storedCanUpdateError",unavailable.getClass().getName());}
        }
      }
      out.addProperty("readable", true);
    } catch (RuntimeException | LinkageError unavailable) {
      out.addProperty("errorType", unavailable.getClass().getName());
    }
    return out;
  }

  private static com.google.gson.JsonObject boxDiagnostic(net.minecraft.world.phys.AABB box) {
    if (box == null) return Jsons.obj("readable", false);
    return Jsons.obj("readable", true, "minX", Double.toString(box.minX), "minY", Double.toString(box.minY),
        "minZ", Double.toString(box.minZ), "maxX", Double.toString(box.maxX),
        "maxY", Double.toString(box.maxY), "maxZ", Double.toString(box.maxZ));
  }

  public static boolean rejectHealthDataWrite(Object object, Object accessor) {
    if (!active(object)) return false;
    Boolean healthSlot = ProjectionProbe.matchesHealthSlot(accessor);
    if (Boolean.FALSE.equals(healthSlot)) return false;
    operationRejected(object, healthSlot == null
        ? "player:health-slot-unreadable" : "player:health-data-write");
    return true;
  }

  public static void operationRejected(Object object, String operation) {
    if (object instanceof Player player) {
      CLAIMS.rejected(player, player.getUUID());
      // Diagnostics stay separate from opponent-specific engagement receipts.
      eff.minecraft.lab.AttackTraceBridge.lifetimeOperationRejected(player, operation);
    }
  }

  public static void booleanWriteRejected(Object object, String field, boolean value) {
    if (object instanceof Player player) {
      CLAIMS.rejected(player, player.getUUID());
      eff.minecraft.lab.AttackTraceBridge.protectedWriteRejected(player, field, value);
    }
  }

  public static long deniedOperations(Object object) {
    return object instanceof Player player ? CLAIMS.denied(player, player.getUUID()) : 0;
  }
}
