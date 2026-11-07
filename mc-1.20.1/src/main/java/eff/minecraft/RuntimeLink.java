package eff.minecraft;

import com.google.gson.*;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** Loopback owned-host lease. Deliberately independent of simulated world time and entities. */
public final class RuntimeLink {
  private static final String ENDPOINT = System.getenv("EFF_RUNTIME_ENDPOINT");
  private static final String SESSION = System.getenv("EFF_RUNTIME_SESSION");
  private static final String LEASE = System.getenv("EFF_RUNTIME_LEASE");
  public static final int EPOCH =
      enabled() ? Integer.parseInt(System.getenv("EFF_RUNTIME_EPOCH")) : 0;
  private static final HttpClient HTTP =
      HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(1)).build();
  private static final AtomicLong CLIENT = new AtomicLong(),
      SERVER = new AtomicLong(),
      HEARTBEAT = new AtomicLong(),
      PROJECTION_SEQUENCE = new AtomicLong();
  private static volatile boolean paused, active, started, admitted;
  private static int diagnostics;
  private static volatile long lastServerProgress = System.nanoTime();
  private static ForkJoinPool progressExecutor;
  private static volatile Thread heartbeatWorker;
  private static volatile long heartbeatReturnedAt = System.nanoTime();
  private static volatile String heartbeatPhase = "not-started";
  private static long worldAdmissionSince;
  private static volatile JsonObject projection =
      Jsons.obj("schema", 1, "sequence", 0, "enabled", false);

  /** Called only on the server thread; the heartbeat thread reads this immutable copy. */
  public static void publishProjection(JsonObject sample) {
    if (!enabled()) return;
    if (Jsons.b(sample, "enabled")) BootstrapDiagnostics.stage("projection-json-shape",
        "player=" + jsonShape(sample.get("player")) + ";avatar=" + jsonShape(sample.get("avatar")));
    JsonObject next = sample.deepCopy();
    next.addProperty("schema", 1);
    next.addProperty("sequence", PROJECTION_SEQUENCE.incrementAndGet());
    projection = next;
  }

  public static void clearProjection() {
    publishProjection(Jsons.obj("enabled", false));
  }

  public static boolean initialized() {
    return admitted;
  }

  public static boolean enabled() {
    return ENDPOINT != null && SESSION != null && LEASE != null;
  }

  public static void clientTick(boolean gamePaused, boolean inWorld) {
    if (!enabled()) return;
    CLIENT.incrementAndGet();
    paused = gamePaused;
    active = inWorld;
    if (inWorld && !admitted) {
      if (worldAdmissionSince == 0) worldAdmissionSince = System.nanoTime();
    } else worldAdmissionSince = 0;
    if (started && (System.nanoTime() - heartbeatReturnedAt > 8_000_000_000L
        || worldAdmissionSince != 0 && System.nanoTime() - worldAdmissionSince > 8_000_000_000L))
      BootstrapDiagnostics.heartbeatStall(heartbeatWorker, heartbeatPhase,
          HEARTBEAT.get(), CLIENT.get(), SERVER.get(), progressExecutor, projection, admitted);
    if (!started) {
      BootstrapDiagnostics.stage("heartbeat-submit", "dedicated-worker");
      started = true;
      // One dedicated JDK worker; heartbeat remains independent of simulated world time.
      var executor = new ForkJoinPool(1);
      progressExecutor = executor;
      CompletableFuture.supplyAsync(
          () -> {
            heartbeatWorker = Thread.currentThread();
            BootstrapDiagnostics.stage("heartbeat-worker-enter", "dedicated-worker");
            BootstrapDiagnostics.note("heartbeat-worker-enter", Thread.currentThread().getClass().getName());
            while (!executor.isShutdown()) {
            try {
              heartbeatPhase = "snapshot";
              if (active && !paused && admitted && Jsons.b(projection, "enabled")
                  && System.nanoTime() - lastServerProgress > 2000000000L)
                BootstrapDiagnostics.progressStall(CLIENT.get(), SERVER.get(), PROJECTION_SEQUENCE.get());
              JsonObject heartbeat =
                  call(
                      Jsons.obj(
                          "op",
                          "heartbeat",
                          "sequence",
                          HEARTBEAT.incrementAndGet(),
                          "clientTick",
                          CLIENT.get(),
                          "serverTick",
                          SERVER.get(),
                          "paused",
                          paused,
                          "active",
                          active,
                          "projection",
                          projection.deepCopy()));
              admitted = Jsons.b(heartbeat, "initialized");
              heartbeatReturnedAt = System.nanoTime();
              heartbeatPhase = "returned";
              if (active) BootstrapDiagnostics.stage("heartbeat-world-reply",
                  "initialized=" + admitted + ";projection=" + Jsons.b(projection, "enabled")
                  + ";projectionSequence=" + PROJECTION_SEQUENCE.get());
              BootstrapDiagnostics.stage("heartbeat-reply", "initialized=" + admitted);
              if (Boolean.getBoolean("eff.entityGuardSelftest") && diagnostics++ < 180)
                System.out.println(
                    "[EFF_INIT_QA] "
                        + Jsons.obj(
                            "admitted",
                            admitted,
                            "enabled",
                            Jsons.b(projection, "enabled"),
                            "revision",
                            Jsons.i(projection, "revision"),
                            "player",
                            Jsons.o(projection, "player"),
                            "avatar",
                            Jsons.o(projection, "avatar"),
                            "active",
                            active,
                            "paused",
                            paused));

            } catch (Exception ignored) {
              BootstrapDiagnostics.failure("heartbeat-call", ignored, executor);
              if (Boolean.getBoolean("eff.entityGuardSelftest") && diagnostics++ < 180)
                System.out.println(
                    "[EFF_INIT_QA_ERROR] "
                        + ignored.getClass().getSimpleName()
                        + ":"
                        + (String.valueOf(ignored.getMessage()).matches("[A-Z0-9_]+")
                            ? ignored.getMessage()
                            : "runtime-link"));
            }
              try {
                heartbeatPhase = "sleep";
                Thread.sleep(1000);
              } catch (InterruptedException stopped) {
                BootstrapDiagnostics.stage("heartbeat-interrupted", "shutdown=" + executor.isShutdown());
                Thread.currentThread().interrupt();
                return null;
              }
            }
            return null;
          }, executor).whenComplete((unused, error) -> {
            BootstrapDiagnostics.stage("heartbeat-terminal", "failed=" + (error != null)
                + ";shutdown=" + executor.isShutdown() + ";phase=" + heartbeatPhase);
            if (error != null) BootstrapDiagnostics.failure("heartbeat-worker-terminal", error, executor);
          });
    }
  }

  public static void serverTick() {
    if (enabled()) { SERVER.incrementAndGet(); lastServerProgress = System.nanoTime(); }
  }

  public static void shutdown() {
    if (progressExecutor != null) progressExecutor.shutdownNow();
  }

  public static JsonObject call(JsonObject body) {
    if (!enabled()) throw new IllegalStateException("MANAGED_RUNTIME_REQUIRED");
    try {
      URI uri = URI.create(ENDPOINT + "/v1/host");
      if (!"http".equals(uri.getScheme())
          || !"127.0.0.1".equals(uri.getHost())
          || uri.getPort() < 1) throw new IllegalArgumentException("INVALID_RUNTIME_ENDPOINT");
      heartbeatCallPhase("copy");
      body = body.deepCopy();
      body.addProperty("session", SESSION);
      body.addProperty("epoch", EPOCH);
      body.addProperty("requestId", UUID.randomUUID().toString());
      heartbeatCallPhase("encode");
      String encoded = body.toString();
      heartbeatCallPhase("request-build");
      var req =
          HttpRequest.newBuilder(uri)
              .timeout(Duration.ofSeconds(5))
              .header("Content-Type", "application/json")
              .header("X-EFF-Auth", signature("request:" + encoded))
              .POST(HttpRequest.BodyPublishers.ofString(encoded))
              .build();
      heartbeatCallPhase("http-send");
      var response = HTTP.send(req, HttpResponse.BodyHandlers.ofString());
      heartbeatCallPhase("reply-verify");
      if (response.body().length() > 262144)
        throw new IllegalStateException("RUNTIME_REPLY_BUDGET");
      if (!java.security.MessageDigest.isEqual(
          signature("reply:" + response.body()).getBytes(StandardCharsets.UTF_8),
          response.headers().firstValue("X-EFF-Auth").orElse("").getBytes(StandardCharsets.UTF_8)))
        throw new IllegalStateException("RUNTIME_REPLY_AUTHENTICATION_FAILED");
      JsonObject reply = JsonParser.parseString(response.body()).getAsJsonObject();
      if (active && Jsons.b(projection, "enabled")) BootstrapDiagnostics.stage("runtime-json-reply",
          "http=" + response.statusCode() + ";ok=" + Jsons.b(reply, "ok")
          + ";result=" + jsonShape(reply.get("result"))
          + ";projection=" + jsonShape(body.get("projection")));
      if (!Jsons.b(reply, "ok")) throw new IllegalArgumentException(Jsons.s(reply, "error"));
      if (!SESSION.equals(Jsons.s(reply, "session")) || Jsons.i(reply, "epoch") != EPOCH)
        throw new IllegalStateException("STALE_RUNTIME_REPLY");
      return Jsons.o(reply, "result");
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException("RUNTIME_INTERRUPTED");
    } catch (java.io.IOException e) {
      throw new IllegalStateException("RUNTIME_UNAVAILABLE");
    }
  }

  private static void heartbeatCallPhase(String phase) {
    if (Thread.currentThread() == heartbeatWorker) heartbeatPhase = phase;
  }

  private static String jsonShape(com.google.gson.JsonElement value) {
    return value == null ? "missing" : value.getClass().getName()
        + ";typedObject=" + (value instanceof JsonObject) + ";virtualObject=" + value.isJsonObject()
        + (value instanceof JsonObject object ? ";size=" + object.size() : "");
  }

  private static String signature(String body) {
    try {
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(LEASE.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
      return HexFormat.of().formatHex(mac.doFinal(body.getBytes(StandardCharsets.UTF_8)));
    } catch (java.security.GeneralSecurityException e) {
      throw new IllegalStateException("HMAC_UNAVAILABLE");
    }
  }

  private RuntimeLink() {}
}
