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
  public static JsonObject inspect(LivingEntity entity, ServerLevel level, Vec3 anchor) {
    String uuid = "";
    if (entity != null) {
      try {
        uuid = entity.getUUID().toString();
        float health = entity.getHealth();
        boolean finiteHealth = Float.isFinite(health);
        boolean finitePosition =
            Double.isFinite(entity.getX())
                && Double.isFinite(entity.getY())
                && Double.isFinite(entity.getZ());
        boolean registered =
            entity.level() == level
                && level.getEntity(entity.getUUID()) == entity
                && level.getEntity(entity.getId()) == entity;
        if (entity instanceof ServerPlayer player)
          registered &= level.getServer().getPlayerList().getPlayer(player.getUUID()) == player;
        return Jsons.obj(
            "uuid",
            uuid,
            "alive",
            entity.isAlive(),
            "removed",
            entity.isRemoved(),
            "dying",
            entity.isDeadOrDying() || entity.deathTime > 0,
            "finiteHealth",
            finiteHealth,
            "health",
            finiteHealth ? health : 0,
            "registered",
            registered,
            "deathTime",
            Math.max(0, entity.deathTime),
            "finitePosition",
            finitePosition,
            "inBounds",
            finitePosition && entity.position().distanceToSqr(anchor) <= 256D * 256D);
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
        && Jsons.b(state, "finiteHealth")
        && Jsons.d(state, "health") > 0
        && Jsons.b(state, "registered")
        && Jsons.b(state, "finitePosition")
        && (!requireBounds || Jsons.b(state, "inBounds"));
  }

  private ProjectionProbe() {}
}
