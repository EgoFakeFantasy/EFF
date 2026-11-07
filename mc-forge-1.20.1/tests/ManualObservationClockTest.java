package eff.minecraft.client;

import com.google.gson.JsonObject;
import java.util.concurrent.atomic.AtomicInteger;

public final class ManualObservationClockTest {
  static ManualObservationClock sample(long first, long last, long wall) {
    AtomicInteger reads = new AtomicInteger();
    return ManualObservationClock.capture(() -> reads.getAndIncrement() == 0 ? first : last, () -> wall);
  }
  static JsonObject finish(ManualObservationClock clock, long origin, long end) {
    JsonObject json = new JsonObject(); clock.appendTo(json, origin, end); return json;
  }
  static void check(boolean value) { if (!value) throw new AssertionError(); }
  static void rejects(Runnable action) {
    try { action.run(); } catch (IllegalStateException expected) { return; }
    throw new AssertionError("expected rejection");
  }
  public static void main(String[] args) {
    long epoch = 1700000000000L, origin = 900_000_000L;
    JsonObject first = finish(sample(origin, origin + 100_000L, epoch), origin, origin + 800_000_000L);
    JsonObject second = finish(sample(origin + 1_000_000_000L, origin + 1_000_100_000L, epoch + 1000),
        origin, origin + 1_010_000_000L);
    check(first.get("elapsedMs").getAsLong() == 0);
    check(first.get("observedAtUnixMs").getAsLong() == epoch);
    check(second.get("elapsedMs").getAsLong() == 1000);
    check(second.get("observedAtUnixMs").getAsLong() == epoch + 1000);
    check(first.getAsJsonObject("observationClock").get("observationSpanMs").getAsDouble() == 800);
    check(first.getAsJsonObject("observationClock").get("readSkewMs").getAsDouble() == 0.1);
    // A real wall-clock adjustment must remain visible, not be normalized away.
    JsonObject jumped = finish(sample(origin + 2_000_000_000L, origin + 2_000_000_000L, epoch + 8000),
        origin, origin + 2_001_000_000L);
    check(jumped.get("observedAtUnixMs").getAsLong() == epoch + 8000);
    check(jumped.get("elapsedMs").getAsLong() == 2000);
    JsonObject delayed = finish(sample(origin, origin + 30_000_000L, epoch), origin, origin + 40_000_000L);
    check(delayed.getAsJsonObject("observationClock").get("readSkewMs").getAsDouble() == 30);
    rejects(() -> sample(origin, origin - 1, epoch));
    rejects(() -> finish(sample(origin, origin + 10, epoch), origin, origin + 9));
    rejects(() -> finish(sample(origin, origin, epoch), origin + 1, origin + 2));
    System.out.println("MANUAL_OBSERVATION_CLOCK_TEST_PASSED");
  }
}
