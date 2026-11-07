package eff.minecraft.client;

import com.google.gson.JsonObject;
import eff.minecraft.Jsons;
import java.util.function.LongSupplier;

/** Paired clocks at observation start. Does not invent a wall clock from JVM uptime. */
record ManualObservationClock(long sampledAtNanos, long unixMillis, long clockReadNanos) {
  static ManualObservationClock capture() {
    return capture(System::nanoTime, System::currentTimeMillis);
  }

  static ManualObservationClock capture(LongSupplier nanos, LongSupplier millis) {
    long before = nanos.getAsLong();
    long wall = millis.getAsLong();
    long after = nanos.getAsLong();
    if (after - before < 0) throw new IllegalStateException("OBSERVATION_CLOCK_REVERSED");
    return new ManualObservationClock(before, wall, after - before);
  }

  void appendTo(JsonObject evidence, long originNanos, long completedNanos) {
    long elapsed = sampledAtNanos - originNanos, span = completedNanos - sampledAtNanos;
    if (elapsed < 0 || span < clockReadNanos)
      throw new IllegalStateException("OBSERVATION_CLOCK_INTERVAL");
    evidence.addProperty("elapsedMs", elapsed / 1_000_000L);
    evidence.addProperty("observedAtUnixMs", unixMillis);
    evidence.add("observationClock", Jsons.obj("source", "paired-at-observation-start",
        "readSkewMs", clockReadNanos / 1_000_000.0,
        "observationSpanMs", span / 1_000_000.0));
  }
}
