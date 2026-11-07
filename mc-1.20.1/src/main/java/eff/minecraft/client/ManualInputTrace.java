package eff.minecraft.client;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import eff.minecraft.Jsons;
import java.util.ArrayDeque;

/** Bounded callback evidence only. This class never sends or holds an input. */
public final class ManualInputTrace {
  private static final int LIMIT = 16;
  private final String source;
  private final ArrayDeque<JsonObject> recent = new ArrayDeque<>();
  private long sequence, presses, releases, repeats, invalidKeys, evicted;

  public ManualInputTrace() { this("forge-key-event-gameplay-only"); }
  public ManualInputTrace(String source) {
    if (source == null || source.isBlank() || source.length() > 120)
      throw new IllegalArgumentException("INPUT_TRACE_SOURCE");
    this.source = source;
  }

  public synchronized void observe(int key, int scan, int action, int modifiers,
      boolean movementMatch, boolean jumpMatch, boolean movementDown, boolean jumpDown,
      int playerTick, long unixMs, long nanos) {
    if (action == 0) releases++;
    else if (action == 1) presses++;
    else if (action == 2) repeats++;
    if (key == -1) invalidKeys++;
    JsonObject event = Jsons.obj("sequence", ++sequence, "key", key, "scanCode", scan,
        "action", action, "modifiers", modifiers, "movementBindingMatches", movementMatch,
        "jumpBindingMatches", jumpMatch, "movementDownAtCallback", movementDown,
        "jumpDownAtCallback", jumpDown, "playerTick", playerTick,
        "atUnixMs", unixMs, "atNanos", nanos);
    if (recent.size() == LIMIT) { recent.removeFirst(); evicted++; }
    recent.addLast(event);
  }

  public synchronized JsonObject snapshot() {
    JsonArray events = new JsonArray();
    for (JsonObject event : recent) events.add(event.deepCopy());
    return Jsons.obj("source", source,
        "scope", "callback-observation-not-os-delivery-or-movement-proof",
        "total", sequence, "presses", presses, "releases", releases,
        "repeats", repeats, "unknownKeys", invalidKeys, "tailLimit", LIMIT,
        "evicted", evicted, "events", events);
  }
}
