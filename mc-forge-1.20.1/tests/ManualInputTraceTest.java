package eff.minecraft.client;

import com.google.gson.JsonObject;

/** A complete short tap must remain visible even when no game tick samples it. */
public final class ManualInputTraceTest {
  private static void check(boolean condition, String label) {
    if (!condition) throw new AssertionError(label);
  }
  public static void main(String[] args) {
    ManualInputTrace trace = new ManualInputTrace();
    ManualInputTrace separate = new ManualInputTrace("minecraft-key-handler-return-gameplay-only");
    check(trace.snapshot().get("total").getAsLong() == 0, "empty is not delivery");
    trace.observe(87, 17, 1, 0, true, false, true, false, 50, 1000, 1000000);
    trace.observe(87, 17, 0, 0, true, false, false, false, 50, 1001, 2000000);
    JsonObject shortTap = trace.snapshot();
    check(shortTap.get("presses").getAsLong() == 1 && shortTap.get("releases").getAsLong() == 1,
        "press and release between ticks retained");
    check(shortTap.getAsJsonArray("events").get(0).getAsJsonObject().get("playerTick").getAsInt()
        == shortTap.getAsJsonArray("events").get(1).getAsJsonObject().get("playerTick").getAsInt(),
        "no invented tick or movement");
    shortTap.getAsJsonArray("events").get(0).getAsJsonObject().addProperty("key", 0);
    check(trace.snapshot().getAsJsonArray("events").get(0).getAsJsonObject().get("key").getAsInt() == 87,
        "snapshot cannot corrupt next evidence");
    trace.observe(-1, 256, 1, 0, false, false, false, false, 51, 1002, 3000000);
    check(trace.snapshot().get("unknownKeys").getAsLong() == 1, "unknown scan preserved");
    for (int i = 0; i < 40; i++)
      trace.observe(87, 17, 2, 0, true, false, true, false, 52 + i, 1010 + i, 4000000 + i);
    JsonObject bounded = trace.snapshot();
    check(bounded.getAsJsonArray("events").size() == 16, "bounded memory and journal size");
    check(bounded.get("total").getAsLong() == 43 && bounded.get("evicted").getAsLong() == 27,
        "truncation explicit, cannot claim complete event history");
    check(bounded.get("repeats").getAsLong() == 40, "repeat distinct from fresh press");
    check(bounded.getAsJsonArray("events").get(0).getAsJsonObject().get("sequence").getAsLong() == 28,
        "retained tail has monotonic sequence");
    separate.observe(68, 32, 1, 0, true, false, true, false, 100, 2000, 5000000);
    check(separate.snapshot().get("total").getAsLong() == 1
        && trace.snapshot().get("total").getAsLong() == 43, "independent observation streams");
    check(!separate.snapshot().get("source").equals(trace.snapshot().get("source")),
        "bus observation cannot impersonate keyboard handler evidence");
    System.out.println("MANUAL_INPUT_TRACE_TEST_OK");
  }
}
