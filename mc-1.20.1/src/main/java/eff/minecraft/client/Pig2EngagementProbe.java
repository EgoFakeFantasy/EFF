package eff.minecraft.client;

import com.google.gson.JsonObject;
import java.lang.reflect.Field;

/**
 * Read-only observations for the audited Pig2 2.8.3 class shape. Call on the server thread. Private
 * fields are evidence of intent/stage, not proof that an attack entry executed. This probe neither
 * invokes opponent methods nor alters opponent fields or accessibility policy.
 */
final class Pig2EngagementProbe {
  private Pig2EngagementProbe() {}

  static JsonObject observe(Object opponent, Object originalProjection) {
    return observe(opponent, originalProjection, java.util.List.of(), java.util.List.of());
  }

  static JsonObject observe(Object opponent, Object originalProjection,
      java.util.List<?> originals, java.util.List<String> identities) {
    JsonObject result = new JsonObject();
    result.addProperty("advancedAttackObserved", false);
    result.addProperty("status", "advancedAttackNotVerified");
    result.addProperty("evidenceKind", "read-only-private-field-snapshot");
    result.addProperty("auditedVersion", "pig2-1.20.1-2.8.3");
    result.addProperty("observationAvailable", false);
    if (opponent == null || originalProjection == null) {
      result.addProperty("reason", "opponent-or-original-projection-missing");
      return result;
    }
    Class<?> type = opponent.getClass();
    result.addProperty("opponentClass", type.getName());
    if (!"kakiku.pig2mod.entity.Pig2".equals(type.getName())) {
      result.addProperty("reason", "unrecognized-opponent-class");
      return result;
    }
    try {
      Object enemy = read(type, opponent, "mEnemy1st");
      Object attackingEnemy = read(type, opponent, "mAttackingEnemy");
      Object stage = read(type, opponent, "mAttackLevel");
      Object counter = read(type, opponent, "mTickCounterLevel3");
      if (!(stage instanceof Enum<?> level) || !(counter instanceof Integer count)) {
        result.addProperty("reason", "audited-field-shape-changed");
        return result;
      }
      result.addProperty("enemyMatchesOriginal", enemy == originalProjection);
      result.addProperty("attackingEnemyMatchesOriginal", attackingEnemy == originalProjection);
      result.addProperty("enemyFrozenIdentity", frozenIdentity(enemy, originals, identities));
      result.addProperty("attackingEnemyFrozenIdentity", frozenIdentity(attackingEnemy, originals, identities));
      result.addProperty("attackLevel", level.name());
      result.addProperty("level3TickCounter", count);
      result.addProperty("globalFightPhase", String.valueOf(read(type, null, "gMaxFightPhase")));
      result.addProperty("globalFightStartedAt", ((Number) read(type, null, "gStartFightingTime")).longValue());
      result.addProperty("globalFightLastAt", ((Number) read(type, null, "gLastFightingTime")).longValue());
      result.addProperty("globalKilledAllServerEnemies", (Boolean) read(type, null, "gKilledAllServerEnemies"));
      result.addProperty("observationAvailable", true);
      result.addProperty("reason", "stage-and-target-do-not-prove-attack-entry-execution");
    } catch (ReflectiveOperationException | RuntimeException | LinkageError error) {
      result.addProperty("reason", "field-observation-unavailable");
      result.addProperty("errorType", error.getClass().getName());
    }
    return result;
  }

  private static String frozenIdentity(Object value, java.util.List<?> originals, java.util.List<String> identities) {
    if (value != null && originals.size() == identities.size())
      for (int i = 0; i < originals.size(); i++) if (value == originals.get(i)) return identities.get(i);
    return "unmatched";
  }

  private static Object read(Class<?> type, Object opponent, String name)
      throws ReflectiveOperationException {
    Field field = type.getDeclaredField(name);
    if (!field.trySetAccessible()) throw new IllegalAccessException(name);
    return field.get(opponent);
  }
}
