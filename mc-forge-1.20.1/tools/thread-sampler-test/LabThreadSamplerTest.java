package eff.minecraft.lab;

import com.google.gson.*;
import java.lang.management.ManagementFactory;
import java.nio.file.*;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

public final class LabThreadSamplerTest {
  private static int checks;
  private static void check(boolean value, String message) {
    checks++;
    if (!value) throw new AssertionError(message);
  }
  private static Path file(Path dir, String id) {
    return dir.resolve("7-thread-sampling-diagnostic-" + id + ".json");
  }
  private static JsonObject await(Path path) throws Exception {
    long end = System.nanoTime() + 6_000_000_000L;
    while (System.nanoTime() < end) {
      if (Files.isRegularFile(path)) try {
        return JsonParser.parseString(Files.readString(path)).getAsJsonObject();
      } catch (JsonParseException | IllegalStateException partialWrite) { }
      Thread.sleep(10);
    }
    throw new AssertionError("Missing diagnostic " + path);
  }
  private static String id() { return UUID.randomUUID().toString(); }

  public static void main(String[] args) throws Exception {
    boolean enabled = Boolean.getBoolean("eff.entityGuardSelftest") || Boolean.getBoolean("eff.pig2Lab")
        || Boolean.getBoolean("eff.foreverLoveLab")
        || (!System.getProperty("eff.manualCombat", "").isBlank()
            && !System.getProperty("eff.manualPlayerAttackItem", "").isBlank());
    Path dir = Path.of(args[0]);
    CountDownLatch release = new CountDownLatch(1);
    Object renderLock = new Object();
    Thread server = new Thread(() -> {
      try { release.await(); } catch (InterruptedException ignored) { }
    }, "PRIVATE_SERVER_NAME");
    Thread render = new Thread(() -> { synchronized (renderLock) { } }, "PRIVATE_RENDER_NAME");
    server.start();
    try {
      synchronized (renderLock) {
        render.start();
        if (args.length > 1 && args[1].equals("prepare-failure")) {
          AtomicInteger preparationCalls = new AtomicInteger();
          LabThreadSampler.prepare(() -> { preparationCalls.incrementAndGet(); throw new SecurityException("PRIVATE_PREPARE_MESSAGE"); });
          long end = System.nanoTime() + 2_000_000_000L;
          while (!LabThreadSampler.preparationFinished() && System.nanoTime() < end) Thread.sleep(10);
          check(LabThreadSampler.preparationFinished() && !LabThreadSampler.prepared(), "failed preparation terminal");
          LabThreadSampler.prepare(() -> { preparationCalls.incrementAndGet(); return null; });
          String failedPreparation = id();
          LabThreadSampler.start(dir, 7, failedPreparation, server, render);
          JsonObject failed = await(file(dir, failedPreparation));
          check(failed.get("status").getAsString().equals("preparation-failed"), "prepare failure diagnostic only");
          check(failed.get("sampleCount").getAsInt() == 0 && preparationCalls.get() == 1, "no retry or sampling after denied prepare");
          check(!failed.toString().contains("PRIVATE_PREPARE_MESSAGE"), "prepare message not exposed");
          System.out.println("PASS " + checks + " preparation-failure checks");
          return;
        }
        if (!enabled) {
          AtomicInteger preparationCalls = new AtomicInteger();
          LabThreadSampler.prepare(() -> { preparationCalls.incrementAndGet(); return null; });
          LabThreadSampler.prepare();
          AtomicInteger calls = new AtomicInteger();
          LabThreadSampler.start(dir, 7, id(), server, render, (ids, depth) -> {
            calls.incrementAndGet(); throw new AssertionError("disabled");
          });
          LabThreadSampler.startServer(dir, 7, id(), server, (ids, depth) -> {
            calls.incrementAndGet(); throw new AssertionError("disabled server diagnostic");
          });
          Thread.sleep(100);
          check(calls.get() == 0 && !Files.exists(dir) && !LabThreadSampler.prepared(), "disabled has no probe or output/warmup");
          check(preparationCalls.get() == 0 && Thread.getAllStackTraces().keySet().stream()
              .noneMatch(t -> t.getName().startsWith("eff-lab-thread-diagnostic")), "disabled creates no diagnostic thread");
        } else {
          String notReady = id();
          LabThreadSampler.start(dir, 7, notReady, server, render);
          JsonObject cold = await(file(dir, notReady));
          check(cold.get("status").getAsString().equals("not-ready") && cold.get("sampleCount").getAsInt() == 0,
              "cold start never initializes management API or waits");
          check(!LabThreadSampler.prepared(), "cold start did not warm API");
          LabThreadSampler.prepare();
          LabThreadSampler.prepare();
          long prepareEnd = System.nanoTime() + 3_000_000_000L;
          while (!LabThreadSampler.prepared() && System.nanoTime() < prepareEnd) Thread.sleep(10);
          check(LabThreadSampler.prepared(), "explicit early asynchronous warmup completes");
          String normal = id();
          LabThreadSampler.start(dir, 7, normal, server, render);
          AtomicInteger duplicate = new AtomicInteger();
          LabThreadSampler.start(dir, 7, normal, server, render, (ids, depth) -> {
            duplicate.incrementAndGet(); return null;
          });
          JsonObject report = await(file(dir, normal));
          check(report.get("diagnosticOnly").getAsBoolean(), "diagnostic only");
          check(report.get("status").getAsString().equals("complete"), "completed");
          check(report.get("runId").getAsString().equals(normal), "run bound");
          check(duplicate.get() == 0, "duplicate arm ignored");
          JsonArray samples = report.getAsJsonArray("samples");
          check(samples.size() > 0 && samples.size() <= 60, "sample cap");
          check(samples.size() == report.get("sampleCount").getAsInt(), "count accurate");
          boolean sawLock = false;
          long last = -1;
          for (JsonElement sample : samples) {
            JsonObject row = sample.getAsJsonObject();
            long at = row.get("offsetNanos").getAsLong();
            check(at >= last && at < 3_000_000_000L, "monotonic bounded sampling window");
            last = at;
            check(row.get("samplingNanos").getAsLong() >= 0, "sampling duration");
            JsonArray threads = row.getAsJsonArray("threads");
            check(threads.size() == 2, "only two explicit threads");
            for (int i = 0; i < 2; i++) {
              JsonObject thread = threads.get(i).getAsJsonObject();
              check(thread.get("threadId").getAsLong() == (i == 0 ? server : render).getId(), "exact IDs");
              check(thread.getAsJsonArray("frames").size() <= 24, "frame cap");
              for (JsonElement frame : thread.getAsJsonArray("frames")) check(frame.getAsString().length() <= 256, "text cap");
              if (i == 1 && thread.get("state").getAsString().equals("BLOCKED")) {
                sawLock = !thread.get("lockName").isJsonNull()
                    && thread.get("lockOwnerId").getAsLong() == Thread.currentThread().getId();
              }
            }
          }
          check(sawLock, "real blocked renderer lock/owner captured");
          String body = Files.readString(file(dir, normal));
          check(!body.contains("PRIVATE_") && !body.contains(".java:") && !body.contains("acceptance"), "no names/source paths/verdict");
          check(body.length() < 900_000, "bounded output");

          String single = id();
          AtomicInteger singleCalls = new AtomicInteger();
          LabThreadSampler.startServer(dir, 7, single, server, (ids, depth) -> {
            check(ids.length == 1 && ids[0] == server.getId() && depth == 24, "single exact server only");
            check(Thread.currentThread().isDaemon() && Thread.currentThread() != server, "single probe outside bound thread");
            singleCalls.incrementAndGet();
            return ManagementFactory.getThreadMXBean().getThreadInfo(ids, depth);
          });
          JsonObject singleReport = await(file(dir, single));
          check(singleReport.get("status").getAsString().equals("complete"), "single server complete");
          check(singleReport.get("boundRenderThreadId").isJsonNull()
              && singleReport.get("boundRenderAliveAtFinish").isJsonNull(), "no invented renderer identity");
          check(singleReport.get("startedAtUnixMs").getAsLong() > 0
              && singleReport.get("startedAtNanos").getAsLong() > 0, "paired sample-start evidence");
          check(singleCalls.get() > 0 && singleCalls.get() <= 60, "single probe bounded");
          for (var row : singleReport.getAsJsonArray("samples")) {
            var threads = row.getAsJsonObject().getAsJsonArray("threads");
            check(threads.size() == 1 && threads.get(0).getAsJsonObject().get("role").getAsString().equals("server"), "single report scope");
          }
          check(server.isAlive() && release.getCount() == 1, "sampling did not release or terminate target");

          String badSingle = id();
          LabThreadSampler.startServer(dir, 7, badSingle, server, (ids, depth) ->
              ManagementFactory.getThreadMXBean().getThreadInfo(new long[]{server.getId(), render.getId()}, depth));
          JsonObject badSingleReport = await(file(dir, badSingle));
          check(badSingleReport.get("status").getAsString().equals("unavailable")
              && badSingleReport.get("sampleCount").getAsInt() == 0, "extra thread shape rejected");

          String denied = id();
          LabThreadSampler.start(dir, 7, denied, server, render, (ids, depth) -> {
            check(Thread.currentThread().isDaemon() && Thread.currentThread() != server && Thread.currentThread() != render,
                "sampling runs on separate daemon");
            check(ids.length == 2 && ids[0] == server.getId() && ids[1] == render.getId() && depth == 24, "probe exact scope");
            throw new SecurityException("PRIVATE_ARGUMENT");
          });
          JsonObject deniedReport = await(file(dir, denied));
          check(deniedReport.get("status").getAsString().equals("unavailable"), "permission failure diagnostic only");
          check(deniedReport.get("sampleCount").getAsInt() == 0, "no invented sample");
          check(!deniedReport.toString().contains("PRIVATE_ARGUMENT"), "no exception message");

          String old = id(), newer = id();
          CountDownLatch entered = new CountDownLatch(1), resume = new CountDownLatch(1), exited = new CountDownLatch(1);
          LabThreadSampler.start(dir, 7, old, server, render, (ids, depth) -> {
            entered.countDown();
            try { resume.await(); } catch (InterruptedException e) { throw new AssertionError(e); }
            exited.countDown();
            return ManagementFactory.getThreadMXBean().getThreadInfo(ids, depth);
          });
          check(entered.await(2, TimeUnit.SECONDS), "old session entered");
          LabThreadSampler.start(dir, 7, newer, server, render, (ids, depth) -> { throw new SecurityException(); });
          JsonObject newerReport = await(file(dir, newer));
          resume.countDown();
          check(exited.await(2, TimeUnit.SECONDS), "old session resumed");
          Thread.sleep(150);
          check(!Files.exists(file(dir, old)), "superseded session does not publish");
          check(await(file(dir, newer)).equals(newerReport), "old session cannot overwrite new run");

          String wrong = id();
          LabThreadSampler.start(dir, 7, wrong, server, render, (ids, depth) ->
              ManagementFactory.getThreadMXBean().getThreadInfo(new long[]{render.getId(), server.getId()}, depth));
          JsonObject wrongReport = await(file(dir, wrong));
          check(wrongReport.get("status").getAsString().equals("unavailable") && wrongReport.get("sampleCount").getAsInt() == 0,
              "mismatched IDs discard whole row and keep valid JSON");

          Thread dead = new Thread(() -> { }); dead.start(); dead.join();
          String ended = id();
          LabThreadSampler.start(dir, 7, ended, dead, render, (ids, depth) -> { throw new AssertionError("dead thread queried"); });
          JsonObject endedReport = await(file(dir, ended));
          check(endedReport.get("status").getAsString().equals("bound-thread-ended"), "ended exact Thread never queried");
          check(endedReport.get("sampleCount").getAsInt() == 0, "no ID reuse attribution");

          String preserved = id();
          Files.writeString(file(dir, preserved), "{\"original\":true}");
          LabThreadSampler.start(dir, 7, preserved, server, render, (ids, depth) -> { throw new SecurityException(); });
          Thread.sleep(100);
          check(Files.readString(file(dir, preserved)).equals("{\"original\":true}"), "create-once never overwrites");
        }
      }
    } finally { release.countDown(); server.join(); render.join(); }
    System.out.println("PASS " + checks + " bounded thread diagnostic checks; enabled=" + enabled);
  }
}
