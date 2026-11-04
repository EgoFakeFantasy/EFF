package eff.minecraft.lab;

import com.google.gson.JsonObject;

/** Opt-in in-process observations, never a trust root against an adversarial JVM. */
public final class AttackTraceBridge {
  private static final boolean ENABLED = Boolean.getBoolean("eff.labAttackTrace");
  private static volatile Context active;

  private static final class Context {
    final Thread server;
    final String profile, uuid, runId;
    final Object target, opponent, player, stack;
    volatile int pigEntries, swordEntries, pigHeads, swordHeads, pigDispatches;
    volatile boolean pigContext, swordContext;
    volatile long firstAttackNanos;

    Context(
        Thread server,
        String profile,
        Object target,
        String uuid,
        String runId,
        Object opponent,
        Object player,
        Object stack) {
      this.server = server;
      this.profile = profile;
      this.target = target;
      this.uuid = uuid;
      this.runId = runId;
      this.opponent = opponent;
      this.player = player;
      this.stack = stack;
    }
  }

  private AttackTraceBridge() {}

  public static boolean enabled() {
    return ENABLED;
  }

  public static void watch(
      String profile,
      Object original,
      String uuid,
      String runId,
      Object opponent,
      Object player,
      Object stack) {
    if (!ENABLED) return;
    if (!("pig2".equals(profile) || "foreverlove".equals(profile))
        || original == null
        || opponent == null
        || uuid == null
        || uuid.isEmpty()
        || runId == null
        || runId.isEmpty()) throw new IllegalArgumentException("LAB_TRACE_CONTEXT");
    active =
        new Context(
            Thread.currentThread(), profile, original, uuid, runId, opponent, player, stack);
  }

  // Invoked only by the observational HEAD callback; never calls a target method.
  public static void pigLevel3Entry(Object opponent, Object target, int counterBeforeIncrement) {
    Context c = active;
    if (!ENABLED || c == null || Thread.currentThread() != c.server) return;
    c.pigContext = false;
    boolean matches =
        "pig2".equals(c.profile)
            && c.opponent == opponent
            && c.target == target
            && counterBeforeIncrement == 0;
    if (matches && c.pigHeads < Integer.MAX_VALUE) c.pigHeads++;
  }

  public static void swordEntry(Object item, Object stack, Object player, Object target) {
    Context c = active;
    if (!ENABLED || c == null || Thread.currentThread() != c.server) return;
    c.swordContext =
        "foreverlove".equals(c.profile)
            && c.opponent == item
            && c.target == target
            && c.player != null
            && c.stack != null
            && c.player == player
            && c.stack == stack;
    if (c.swordContext && c.swordHeads < Integer.MAX_VALUE) c.swordHeads++;
  }

  public static void pigLevel3Dispatch(Object opponent, Object target, int counter) {
    Context c = active;
    if (!ENABLED || c == null || Thread.currentThread() != c.server) return;
    c.pigContext =
        "pig2".equals(c.profile) && c.opponent == opponent && c.target == target && counter == 1;
    if (c.pigContext && c.pigDispatches < Integer.MAX_VALUE) c.pigDispatches++;
  }

  public static void pigLevel3Exit(Object opponent) {
    Context c = active;
    if (c != null && Thread.currentThread() == c.server && c.opponent == opponent)
      c.pigContext = false;
  }

  public static void swordExit(Object item) {
    Context c = active;
    if (c != null && Thread.currentThread() == c.server && c.opponent == item)
      c.swordContext = false;
  }

  public static void pigRemovalEffect(Object target) {
    Context c = active;
    if (!ENABLED
        || c == null
        || Thread.currentThread() != c.server
        || !c.pigContext
        || c.target != target
        || !hasCaller("kakiku.pig2mod.entity.Pig2", "tickLevel3")) return;
    if (c.firstAttackNanos == 0) c.firstAttackNanos = System.nanoTime();
    if (c.pigEntries < Integer.MAX_VALUE) c.pigEntries++;
  }

  public static void swordDeathListEffect(Object target, Object attacker) {
    Context c = active;
    if (!ENABLED
        || c == null
        || Thread.currentThread() != c.server
        || !c.swordContext
        || c.target != target
        || c.player != attacker
        || !hasCaller("com.wzz.forever_love_sword.items.ItemForeverLoveSword", "onLeftClickEntity"))
      return;
    if (c.firstAttackNanos == 0) c.firstAttackNanos = System.nanoTime();
    if (c.swordEntries < Integer.MAX_VALUE) c.swordEntries++;
  }

  private static boolean hasCaller(String owner, String method) {
    StackTraceElement[] stack = Thread.currentThread().getStackTrace();
    for (int i = 0; i < Math.min(stack.length, 512); i++)
      if (owner.equals(stack[i].getClassName()) && method.equals(stack[i].getMethodName()))
        return true;
    return false;
  }

  public static long firstAttackNanos(String runId) {
    Context c = active;
    return ENABLED && c != null && c.runId.equals(runId) ? c.firstAttackNanos : 0;
  }

  public static JsonObject snapshot(String runId) {
    Context c = active;
    boolean valid = ENABLED && c != null && c.runId.equals(runId);
    boolean pig = valid && c.pigEntries > 0;
    boolean sword = valid && c.swordEntries > 0;
    JsonObject r = new JsonObject();
    r.addProperty("runId", runId);
    r.addProperty("instrumentationMode", ENABLED ? "observational-mixin" : "unmodified-opponent");
    r.addProperty("advancedAttackObserved", pig);
    r.addProperty("swordAttackObserved", sword);
    r.addProperty("targetArgumentVerified", pig || sword);
    r.addProperty(
        "status",
        pig || sword ? "target-correlated-destructive-branch-observed" : "attackTargetNotVerified");
    r.addProperty("evidenceKind", "in-process-observational-mixin");
    r.addProperty(
        "evidenceLevel",
        pig || sword ? "destructive-operation-observed" : "no-destructive-operation-proof");
    if (valid) {
      r.addProperty("profile", c.profile);
      r.addProperty("expectedOriginalUUID", c.uuid);
      r.addProperty("pigLevel3InitialEntries", c.pigHeads);
      r.addProperty("pigLevel3Dispatches", c.pigDispatches);
      r.addProperty("swordHookEntries", c.swordHeads);
      r.addProperty("pigRemovalEffects", c.pigEntries);
      r.addProperty("swordDeathListEffects", c.swordEntries);
      r.addProperty(
          "actualAttackAgeMs",
          c.firstAttackNanos == 0 ? -1 : (System.nanoTime() - c.firstAttackNanos) / 1_000_000L);
    }
    r.addProperty(
        "limitation",
        "An observed destructive operation is not proof of the entire attack completing or"
            + " immunity; hostile in-process code can forge it.");
    return r;
  }

  public static void clear(String runId) {
    Context c = active;
    if (c != null && c.runId.equals(runId)) active = null;
  }
}
