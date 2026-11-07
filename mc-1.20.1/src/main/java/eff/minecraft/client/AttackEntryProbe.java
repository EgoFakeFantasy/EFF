package eff.minecraft.client;

import com.google.gson.JsonObject;
import eff.minecraft.lab.AttackTraceBridge;

/**
 * Bounded read-only server-stack sampling for disposable compatibility experiments. A stack frame
 * has no argument values: even a matching frame is NOT target-correlated proof. No target methods,
 * agents, bytecode changes, suspends, or opponent-field writes are used.
 */
final class AttackEntryProbe implements AutoCloseable {
  private static final String PIG_CLASS = "kakiku.pig2mod.entity.Pig2";
  private static final String SWORD_CLASS = "com.wzz.forever_love_sword.items.ItemForeverLoveSword";
  private final Thread serverThread;
  private final String profile, targetUUID, runId;
  private final Object originalTarget;
  private final long started = System.nanoTime();
  private final java.util.concurrent.ForkJoinPool sampler;
  private volatile boolean running = true;
  private volatile boolean directCall;
  private int samples, entryHits;
  private boolean directCallFrameObserved;
  private long lastSample, maxSamplingGapMs;
  private String error = "";

  static AttackEntryProbe start(
      Thread serverThread, String profile, Object originalTarget, String targetUUID, String runId) {
    return new AttackEntryProbe(serverThread, profile, originalTarget, targetUUID, runId);
  }

  private AttackEntryProbe(
      Thread serverThread, String profile, Object originalTarget, String targetUUID, String runId) {
    this.serverThread = serverThread;
    this.profile = profile;
    this.originalTarget = originalTarget;
    this.targetUUID = targetUUID;
    this.runId = runId;
    if (AttackTraceBridge.enabled()) {
      sampler = null;
      running = false;
      return;
    }
    sampler = new java.util.concurrent.ForkJoinPool(1);
    java.util.concurrent.CompletableFuture.supplyAsync(() -> { sample(); return null; }, sampler);
  }

  void beginDirectCall(Object target) {
    if (Thread.currentThread() != serverThread || target != originalTarget)
      throw new IllegalStateException("LAB_DIRECT_CALL_CONTEXT_MISMATCH");
    AttackTraceBridge.beginDirectAttack(runId, originalTarget);
    directCall = true;
  }

  void endDirectCall() {
    AttackTraceBridge.endDirectAttack(runId, originalTarget);
    directCall = false;
  }

  private void sample() {
    try {
      for (int i = 0; i < 22500 && running && serverThread.isAlive(); i++) {
        long now = System.nanoTime();
        if (now - started > 45_000_000_000L) break;
        boolean duringCall = directCall;
        boolean hit = hasEntry(serverThread.getStackTrace(), profile);
        synchronized (this) {
          samples++;
          if (lastSample != 0)
            maxSamplingGapMs = Math.max(maxSamplingGapMs, (now - lastSample) / 1_000_000L);
          lastSample = now;
          if (hit) {
            entryHits++;
            directCallFrameObserved |= duringCall && directCall;
          }
        }
        Thread.sleep(2);
      }
    } catch (InterruptedException stopped) {
      Thread.currentThread().interrupt();
    } catch (RuntimeException | LinkageError unavailable) {
      synchronized (this) {
        error = unavailable.getClass().getName();
      }
    } finally {
      running = false;
      sampler.shutdown();
    }
  }

  static boolean hasEntry(StackTraceElement[] stack, String profile) {
    String className, methodName;
    if ("pig2".equals(profile)) {
      className = PIG_CLASS;
      methodName = "tickLevel3";
    } else if ("foreverlove".equals(profile)) {
      className = SWORD_CLASS;
      methodName = "onLeftClickEntity";
    } else return false;
    for (int i = 0; i < Math.min(stack.length, 512); i++) {
      StackTraceElement frame = stack[i];
      if (className.equals(frame.getClassName()) && methodName.equals(frame.getMethodName()))
        return true;
    }
    return false;
  }

  synchronized JsonObject snapshot() {
    if (AttackTraceBridge.enabled()) return AttackTraceBridge.snapshot(runId);
    JsonObject result = new JsonObject();
    result.addProperty("instrumentationMode", "unmodified-opponent");
    result.addProperty("runId", runId);
    result.addProperty("profile", profile);
    result.addProperty("expectedOriginalUUID", targetUUID);
    result.addProperty("entryFrameObserved", entryHits > 0);
    result.addProperty("directCallWindowObserved", directCallFrameObserved);
    result.addProperty("stackSamples", samples);
    result.addProperty("entryFrameHits", entryHits);
    result.addProperty("maxStackSampleGapMs", maxSamplingGapMs);
    result.addProperty("samplerRunning", running);
    result.addProperty("targetArgumentVerified", false);
    result.addProperty("advancedAttackObserved", false);
    result.addProperty("swordAttackObserved", false);
    result.addProperty("status", "attackTargetNotVerified");
    result.addProperty(
        "reason",
        entryHits > 0
            ? "matching-stack-frame-has-no-target-arguments"
            : "entry-not-sampled-does-not-prove-no-attack");
    if (!error.isEmpty()) result.addProperty("probeError", error);
    return result;
  }

  @Override
  public void close() {
    running = false;
    if (sampler != null) sampler.shutdownNow();
  }
}
