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
      HEARTBEAT = new AtomicLong();
  private static volatile boolean paused, active, started;

  public static boolean enabled() {
    return ENDPOINT != null && SESSION != null && LEASE != null;
  }

  public static void clientTick(boolean gamePaused, boolean inWorld) {
    if (!enabled()) return;
    CLIENT.incrementAndGet();
    paused = gamePaused;
    active = inWorld;
    if (!started) {
      started = true;
      var executor =
          Executors.newSingleThreadScheduledExecutor(
              r -> {
                Thread t = new Thread(r, "EFF managed host progress");
                t.setDaemon(true);
                return t;
              });
      executor.scheduleWithFixedDelay(
          () -> {
            try {
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
                      active));
            } catch (Exception ignored) {
            }
          },
          0,
          1,
          TimeUnit.SECONDS);
    }
  }

  public static void serverTick() {
    if (enabled()) SERVER.incrementAndGet();
  }

  public static JsonObject call(JsonObject body) {
    if (!enabled()) throw new IllegalStateException("MANAGED_RUNTIME_REQUIRED");
    try {
      URI uri = URI.create(ENDPOINT + "/v1/host");
      if (!"http".equals(uri.getScheme())
          || !"127.0.0.1".equals(uri.getHost())
          || uri.getPort() < 1) throw new IllegalArgumentException("INVALID_RUNTIME_ENDPOINT");
      body = body.deepCopy();
      body.addProperty("session", SESSION);
      body.addProperty("epoch", EPOCH);
      body.addProperty("requestId", UUID.randomUUID().toString());
      String encoded = body.toString();
      var req =
          HttpRequest.newBuilder(uri)
              .timeout(Duration.ofSeconds(5))
              .header("Content-Type", "application/json")
              .header("X-EFF-Auth", signature("request:" + encoded))
              .POST(HttpRequest.BodyPublishers.ofString(encoded))
              .build();
      var response = HTTP.send(req, HttpResponse.BodyHandlers.ofString());
      if (response.body().length() > 262144)
        throw new IllegalStateException("RUNTIME_REPLY_BUDGET");
      if (!java.security.MessageDigest.isEqual(
          signature("reply:" + response.body()).getBytes(StandardCharsets.UTF_8),
          response.headers().firstValue("X-EFF-Auth").orElse("").getBytes(StandardCharsets.UTF_8)))
        throw new IllegalStateException("RUNTIME_REPLY_AUTHENTICATION_FAILED");
      JsonObject reply = JsonParser.parseString(response.body()).getAsJsonObject();
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
