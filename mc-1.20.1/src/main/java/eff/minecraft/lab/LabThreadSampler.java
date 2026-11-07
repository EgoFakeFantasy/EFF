package eff.minecraft.lab;

import java.lang.management.ManagementFactory;
import java.lang.management.ThreadInfo;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.concurrent.locks.LockSupport;

/** Bounded, opt-in observations of explicitly bound lab threads. Never a verdict. */
public final class LabThreadSampler {
  private static final long PERIOD = 50_000_000L, BUDGET = 3_000_000_000L;
  private static Session active;
  private static boolean preparationStarted;
  private static volatile Probe preparedProbe;
  private static volatile String preparationFailure = "";

  interface Probe { ThreadInfo[] read(long[] ids, int depth); }
  private static final class Session {
    final String runId;
    final Path file;
    final Thread server, render;
    final Probe probe;
    Session(String runId, Path file, Thread server, Thread render, Probe probe) {
      this.runId = runId; this.file = file; this.server = server; this.render = render; this.probe = probe;
    }
  }

  private LabThreadSampler() {}

  private static boolean enabled() {
    return Boolean.getBoolean("eff.entityGuardSelftest") || Boolean.getBoolean("eff.pig2Lab")
        || Boolean.getBoolean("eff.foreverLoveLab")
        || (!System.getProperty("eff.manualCombat", "").isBlank()
            && !System.getProperty("eff.manualPlayerAttackItem", "").isBlank());
  }

  /** Invoked before scene readiness. Initializes only our management API, asynchronously. */
  public static void prepare() {
    prepare(() -> {
      var bean = ManagementFactory.getThreadMXBean();
      bean.getThreadInfo(new long[0], 24); // Warm the API without observing any thread.
      return bean::getThreadInfo;
    });
  }

  static synchronized void prepare(java.util.concurrent.Callable<Probe> factory) {
    try {
      if (!enabled() || preparationStarted) return;
      preparationStarted = true;
      Thread warmup = new Thread(() -> {
        try {
          preparedProbe = java.util.Objects.requireNonNull(factory.call());
        } catch (Throwable unavailable) {
          preparationFailure = unavailable.getClass().getName();
        }
      }, "eff-lab-thread-diagnostic-prepare");
      warmup.setDaemon(true);
      warmup.start();
    } catch (Throwable unavailable) { preparationFailure = unavailable.getClass().getName(); }
  }

  static boolean prepared() { return preparedProbe != null; }
  static boolean preparationFinished() { return preparedProbe != null || !preparationFailure.isEmpty(); }

  public static void start(Path proofDirectory, int generation, String runId, Thread server, Thread render) {
    // Never initialize the management API or wait for it in the attack window.
    start(proofDirectory, generation, runId, server, render, preparedProbe);
  }

  /** The manual player fixture has an exact server thread, but no retained renderer.
   * Do not enumerate threads or guess a renderer by its name to fill that gap. */
  public static void startServer(Path proofDirectory, int generation, String runId, Thread server) {
    startServer(proofDirectory, generation, runId, server, preparedProbe);
  }

  static synchronized void startServer(Path proofDirectory, int generation, String runId,
      Thread server, Probe probe) {
    startBound(proofDirectory, generation, runId, server, null, probe);
  }

  // Package-private probe seam is used by offline permission/failure fixtures only.
  static synchronized void start(Path proofDirectory, int generation, String runId,
      Thread server, Thread render, Probe probe) {
    if (render == null || server == render) return;
    startBound(proofDirectory, generation, runId, server, render, probe);
  }

  private static synchronized void startBound(Path proofDirectory, int generation, String runId,
      Thread server, Thread render, Probe probe) {
    try {
      if (!enabled()) return;
      if (runId == null || !runId.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
          || server == null || proofDirectory == null) return;
      if (active != null && active.runId.equals(runId)) return;
      Path file = proofDirectory.resolve(generation + "-thread-sampling-diagnostic-" + runId + ".json");
      Session session = new Session(runId, file, server, render, probe);
      Thread worker = new Thread(() -> sample(session), "eff-lab-thread-diagnostic");
      worker.setDaemon(true);
      active = session;
      worker.start();
    } catch (Throwable diagnosticUnavailable) {
      // No logging, retry, or propagation on the game thread, including denied thread creation.
    }
  }

  private static synchronized boolean current(Session session) { return active == session; }
  private static boolean boundThreadsAlive(Session session) {
    return session.server.isAlive() && (session.render == null || session.render.isAlive());
  }

  private static void sample(Session session) {
    long began = System.nanoTime();
    long beganUnixMs = System.currentTimeMillis();
    StringBuilder samples = new StringBuilder(32768);
    String status = "complete", failureType = "";
    int count = 0;
    try {
      if (session.probe == null) {
        status = preparationFailure.isEmpty() ? "not-ready" : "preparation-failed";
        failureType = preparationFailure;
      }
      long[] ids = session.render == null ? new long[]{session.server.getId()}
          : new long[]{session.server.getId(), session.render.getId()};
      while (session.probe != null && count < 60 && System.nanoTime() - began < BUDGET && current(session)) {
        if (!boundThreadsAlive(session)) { status = "bound-thread-ended"; break; }
        long started = System.nanoTime();
        ThreadInfo[] info = session.probe.read(ids.clone(), 24);
        long duration = System.nanoTime() - started;
        // Thread IDs may be reused after termination. Never interpret a sample if
        // either exact retained Thread stopped during the MXBean call.
        if (!boundThreadsAlive(session)) { status = "bound-thread-ended"; break; }
        if (info == null || info.length != ids.length) throw new IllegalStateException("DIAGNOSTIC_SHAPE");
        StringBuilder row = new StringBuilder(1024);
        row.append("{\"offsetNanos\":").append(started - began)
            .append(",\"samplingNanos\":").append(duration).append(",\"threads\":[");
        appendThread(row, "server", ids[0], info[0]);
        if (session.render != null) {
          row.append(',');
          appendThread(row, "render", ids[1], info[1]);
        }
        row.append("]}");
        if (count++ != 0) samples.append(',');
        samples.append(row);
        // No catch-up bursts. A slow MXBean call reduces the number of samples.
        long remaining = Math.min(BUDGET - (System.nanoTime() - began), PERIOD - (System.nanoTime() - started));
        if (remaining > 0) LockSupport.parkNanos(remaining);
        if (Thread.currentThread().isInterrupted()) { status = "interrupted"; break; }
      }
    } catch (Throwable unavailable) {
      status = "unavailable";
      failureType = unavailable.getClass().getName();
    }
    try {
      StringBuilder json = new StringBuilder(samples.length() + 512);
      json.append("{\"diagnosticOnly\":true,\"runId\":"); quote(json, session.runId);
      json.append(",\"mcPid\":").append(ProcessHandle.current().pid()).append(",\"status\":"); quote(json, status);
      json.append(",\"failureType\":"); quote(json, failureType);
      json.append(",\"boundServerThreadId\":").append(session.server.getId())
          .append(",\"boundRenderThreadId\":").append(session.render == null ? "null" : session.render.getId());
      json.append(",\"boundServerAliveAtFinish\":").append(session.server.isAlive())
          .append(",\"boundRenderAliveAtFinish\":").append(session.render == null ? "null" : session.render.isAlive());
      json.append(",\"startedAtUnixMs\":").append(beganUnixMs)
          .append(",\"startedAtNanos\":").append(began);
      json.append(",\"maxSamples\":60,\"maxFramesPerThread\":24,\"periodNanos\":").append(PERIOD)
          .append(",\"budgetNanos\":").append(BUDGET).append(",\"elapsedNanos\":").append(System.nanoTime() - began)
          .append(",\"sampleCount\":").append(count).append(",\"samples\":[").append(samples).append("]}");
      // File I/O occurs only on this daemon, never under the start/current lock.
      publish(session, json.toString());
    } catch (Throwable diagnosticUnavailable) { /* Diagnostic failure cannot change a verdict. */ }
  }

  private static void publish(Session session, String json) throws Exception {
    if (!current(session)) return;
    Files.createDirectories(session.file.getParent());
    // Run-specific, create-once output: even a superseded writer cannot overwrite another run.
    if (current(session)) Files.writeString(session.file, json, StandardCharsets.UTF_8, StandardOpenOption.CREATE_NEW);
  }

  private static void appendThread(StringBuilder json, String role, long id, ThreadInfo info) {
    json.append("{\"role\":"); quote(json, role);
    json.append(",\"threadId\":").append(id).append(",\"available\":").append(info != null);
    if (info != null) {
      if (info.getThreadId() != id) throw new IllegalStateException("DIAGNOSTIC_THREAD_ID");
      json.append(",\"state\":"); quote(json, info.getThreadState().name());
      json.append(",\"lockName\":"); quote(json, info.getLockName());
      json.append(",\"lockOwnerId\":").append(info.getLockOwnerId()).append(",\"frames\":[");
      StackTraceElement[] frames = info.getStackTrace();
      for (int i = 0; i < Math.min(frames.length, 24); i++) {
        if (i != 0) json.append(',');
        // No source path, line number, thread name, arguments, or local values.
        quote(json, frames[i].getClassName() + "." + frames[i].getMethodName());
      }
      json.append(']');
    }
    json.append('}');
  }

  private static void quote(StringBuilder json, String value) {
    if (value == null) { json.append("null"); return; }
    json.append('"');
    for (int i = 0; i < Math.min(value.length(), 256); i++) {
      char c = value.charAt(i);
      if (c == '"' || c == '\\') json.append('\\').append(c);
      else if (c < 32) json.append(' ');
      else json.append(c);
    }
    json.append('"');
  }
}
