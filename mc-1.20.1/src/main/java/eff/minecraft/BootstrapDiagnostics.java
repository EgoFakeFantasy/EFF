package eff.minecraft;

import com.google.gson.*;
import java.nio.file.*;
import java.util.concurrent.ExecutorService;

/** Bounded, opt-in observations. Never grants permissions or treats a host report as trusted. */
public final class BootstrapDiagnostics {
  private static int reports;
  private static int stalls;
  private static int projectionReports;
  private static int heartbeatReports;
  private static long lastHeartbeatReport;
  private static String projectionSignature = "";
  private static final java.util.Set<String> stages = new java.util.HashSet<>();
  private static final java.util.Map<String, String> stateSignatures = new java.util.HashMap<>();
  private static int stateReports;
  private static boolean enabled() {
    return Boolean.getBoolean("eff.pig2Lab") || Boolean.getBoolean("eff.foreverLoveLab")
        || Boolean.getBoolean("eff.entityGuardSelftest") || Boolean.getBoolean("eff.lifetimeSelftest")
        || !System.getProperty("eff.manualCombat", "").isEmpty();
  }

  /** First occurrence only; a small timeline independent of a functioning heartbeat. */
  public static void stage(String name, String detail) {
    if (!enabled() || !name.matches("[a-z0-9-]{1,64}")) return;
    // Claim a bounded slot only. Diagnostic file/console IO must not hold the game-wide class monitor.
    synchronized (stages) { if (stages.size() >= 32 || !stages.add(name)) return; }
    try {
      Path directory = Path.of("entity-guard-proof").toAbsolutePath(); Files.createDirectories(directory);
      JsonObject record = Jsons.obj("stage", name, "detail", bounded(detail, 300),
          "mcPid", ProcessHandle.current().pid(), "atUnixMs", System.currentTimeMillis(),
          "thread", Thread.currentThread().getName());
      Files.writeString(directory.resolve("bootstrap-stages.jsonl"), record + "\n",
          StandardOpenOption.CREATE, StandardOpenOption.APPEND);
      System.err.println("[EFF_BOOTSTRAP_STAGE] " + record);
    } catch (Exception | LinkageError unavailable) { /* Never changes game behavior. */ }
  }

  /** Bounded state transitions, separate from the first-occurrence startup timeline. */
  public static void state(String name, JsonObject state) {
    if (!enabled() || !name.matches("[a-z0-9-]{1,48}")) return;
    try {
      String signature = state.toString();
      if (signature.length() > 24000) return;
      int number;
      synchronized (stateSignatures) {
        if (stateReports >= 32 || signature.equals(stateSignatures.get(name))) return;
        stateSignatures.put(name, signature);
        number = ++stateReports;
      }
      Path directory = Path.of("entity-guard-proof").toAbsolutePath(); Files.createDirectories(directory);
      JsonObject report = Jsons.obj("stage", name, "state", state,
          "mcPid", ProcessHandle.current().pid(), "atUnixMs", System.currentTimeMillis(),
          "thread", Thread.currentThread().getName());
      Files.writeString(directory.resolve("state-" + number + "-" + name + ".json"), report.toString(),
          StandardOpenOption.CREATE_NEW);
      System.err.println("[EFF_STATE_DIAGNOSTIC] " + report);
    } catch (Exception | LinkageError unavailable) { /* Observation never grants readiness. */ }
  }

  public static synchronized void projection(JsonObject state, String instance, boolean desired, boolean admitted) {
    if (!enabled() || projectionReports >= 8 || Jsons.s(state, "uuid").isEmpty()) return;
    String signature = instance + ":" + desired + ":" + admitted + ":" + state.toString();
    if (signature.equals(projectionSignature)) return;
    projectionSignature = signature;
    try {
      JsonObject report = Jsons.obj("instance", instance, "desired", desired, "knownAlive", admitted,
          "atUnixMs", System.currentTimeMillis(), "mcPid", ProcessHandle.current().pid(),
          "thread", Thread.currentThread().getName(), "state", state);
      JsonArray stack = new JsonArray();
      for (var frame : Thread.currentThread().getStackTrace()) { if (stack.size() >= 18) break; stack.add(frame.toString()); }
      report.add("frames", stack);
      Path directory = Path.of("entity-guard-proof").toAbsolutePath(); Files.createDirectories(directory);
      Files.writeString(directory.resolve("projection-transition-" + (++projectionReports) + ".json"), report.toString());
    } catch (Exception | LinkageError unavailable) { projectionReports++; }
  }

  public static synchronized void progressStall(long clientTick, long serverTick, long sequence) {
    if (!enabled() || stalls >= 3) return;
    try {
      JsonObject report = Jsons.obj("clientTick", clientTick, "serverTick", serverTick,
          "projectionSequence", sequence, "mcPid", ProcessHandle.current().pid());
      JsonArray threads = new JsonArray();
      for (var info : java.lang.management.ManagementFactory.getThreadMXBean().dumpAllThreads(false, false, 24)) {
        if (!(info.getThreadName().equals("Server thread") || info.getThreadName().equals("Render thread"))) continue;
        JsonObject thread = Jsons.obj("name", info.getThreadName(), "state", info.getThreadState().name(), "suspended", info.isSuspended());
        JsonArray frames = new JsonArray(); for (var frame : info.getStackTrace()) frames.add(frame.toString());
        thread.add("frames", frames); threads.add(thread);
      }
      report.add("threads", threads);
      Path directory = Path.of("entity-guard-proof").toAbsolutePath(); Files.createDirectories(directory);
      Files.writeString(directory.resolve("progress-stall-" + (++stalls) + ".json"), report.toString());
    } catch (Exception | LinkageError unavailable) { stalls++; }
  }

  /** Render-side observation of a stalled heartbeat; never restarts or replaces its worker. */
  public static void heartbeatStall(Thread worker, String phase, long sequence,
      long clientTick, long serverTick, ExecutorService executor, JsonObject projection, boolean admitted) {
    if (!enabled()) return;
    long now = System.nanoTime();
    int number;
    synchronized (stages) {
      if (heartbeatReports >= 3 || now - lastHeartbeatReport < 8_000_000_000L) return;
      lastHeartbeatReport = now;
      number = ++heartbeatReports;
    }
    try {
      JsonObject report = Jsons.obj("phase", phase, "sequence", sequence,
          "clientTick", clientTick, "serverTick", serverTick,
          "mcPid", ProcessHandle.current().pid(), "atUnixMs", System.currentTimeMillis(),
          "workerPresent", worker != null, "workerAlive", worker != null && worker.isAlive());
      report.addProperty("admitted", admitted);
      report.addProperty("projectionEnabled", Jsons.b(projection, "enabled"));
      report.addProperty("projectionSequence", Jsons.i(projection, "sequence"));
      report.add("player", Jsons.o(projection, "player").deepCopy());
      report.add("avatar", Jsons.o(projection, "avatar").deepCopy());
      if (executor != null) report.addProperty("executorState", bounded(executor.toString(), 1000));
      JsonArray threads = new JsonArray();
      for (var info : java.lang.management.ManagementFactory.getThreadMXBean().dumpAllThreads(false, false, 48)) {
        boolean target = worker != null && info.getThreadId() == worker.getId();
        if (!(target || info.getThreadName().equals("Server thread")
            || info.getThreadName().equals("Render thread")
            || info.getThreadName().startsWith("HttpClient-")) || threads.size() >= 12) continue;
        JsonObject thread = Jsons.obj("name", info.getThreadName(), "heartbeatWorker", target,
            "state", info.getThreadState().name(), "suspended", info.isSuspended(),
            "lock", info.getLockName(), "lockOwner", info.getLockOwnerName());
        JsonArray frames = new JsonArray();
        for (var frame : info.getStackTrace()) frames.add(frame.toString());
        thread.add("frames", frames); threads.add(thread);
      }
      report.add("threads", threads);
      Path directory = Path.of("entity-guard-proof").toAbsolutePath(); Files.createDirectories(directory);
      Files.writeString(directory.resolve("heartbeat-stall-" + number + ".json"), report.toString(),
          StandardOpenOption.CREATE_NEW);
      System.err.println("[EFF_HEARTBEAT_STALL] phase=" + phase + ";sequence=" + sequence);
    } catch (Exception | LinkageError unavailable) { /* Bounded diagnostics only. */ }
  }

  public static void note(String stage, String detail) {
    if (!enabled()) return;
    try {
      Path directory=Path.of("entity-guard-proof").toAbsolutePath();Files.createDirectories(directory);
      Files.writeString(directory.resolve("bootstrap-observation.json"),Jsons.obj("stage",stage,"detail",bounded(detail,1000)).toString());
      System.err.println("[EFF_BOOTSTRAP_OBSERVATION] " + stage + " " + bounded(detail,1000));
    } catch (Exception ignored) {}
  }

  public static synchronized void failure(String stage, Throwable error, ExecutorService executor) {
    if (!enabled() || reports++ >= 4) return;
    try {
      JsonObject report = Jsons.obj("stage", stage, "error", error.getClass().getName(),
          "message", bounded(String.valueOf(error.getMessage()), 2000));
      if (executor != null) {
        report.addProperty("executorClass", executor.getClass().getName());
        report.addProperty("executorState", bounded(executor.toString(), 1000));
        report.addProperty("executorShutdown", executor.isShutdown());
      }
      JsonArray causes = new JsonArray();
      Throwable current = error;
      for (int depth = 0; current != null && depth < 5; depth++, current = current.getCause()) {
        JsonArray frames = new JsonArray();
        StackTraceElement[] stack = current.getStackTrace();
        for (int i = 0; i < Math.min(stack.length, 32); i++) frames.add(stack[i].toString());
        JsonObject cause = Jsons.obj("type", current.getClass().getName(),
            "message", bounded(String.valueOf(current.getMessage()), 2000));
        cause.add("frames", frames); causes.add(cause);
      }
      report.add("causes", causes);
      JsonArray threads = new JsonArray();
      try {
      for (var info : java.lang.management.ManagementFactory.getThreadMXBean()
          .dumpAllThreads(false, false, 24)) {
        boolean owned = false;
        for (var frame : info.getStackTrace())
          if (frame.getClassName().startsWith("eff.minecraft.")) owned = true;
        if (!owned || threads.size() >= 8) continue;
        JsonArray stack = new JsonArray();
        for (var frame : info.getStackTrace()) stack.add(frame.toString());
        JsonObject thread = Jsons.obj("name", info.getThreadName(),
            "state", info.getThreadState().name(), "suspended", info.isSuspended());
        thread.add("frames", stack);
        threads.add(thread);
      }
      } catch (Exception | LinkageError unavailable) {
        report.addProperty("threadObservationError", unavailable.getClass().getName());
      }
      report.add("ownedThreads", threads);
      Path directory = Path.of("entity-guard-proof").toAbsolutePath();
      Files.createDirectories(directory);
      String epoch = System.getenv().getOrDefault("EFF_RUNTIME_GUARD_GENERATION", "1");
      if (!epoch.matches("[0-9]{1,6}")) epoch = "1";
      Path target = directory.resolve(epoch + "-bootstrap-failure.json");
      Path temp = directory.resolve(epoch + "-bootstrap-failure.tmp");
      Files.writeString(temp, report.toString());
      Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
      System.err.println("[EFF_BOOTSTRAP_FAILURE] " + report);
    } catch (Exception diagnosticError) {
      System.err.println("[EFF_BOOTSTRAP_DIAGNOSTIC_FAILED] " + diagnosticError.getClass().getName());
    }
  }

  private static String bounded(String text, int limit) {
    return text.length() > limit ? text.substring(0, limit) : text;
  }
}
