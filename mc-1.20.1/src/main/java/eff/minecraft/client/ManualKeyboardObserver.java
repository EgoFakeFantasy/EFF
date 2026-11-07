package eff.minecraft.client;

/** Independent of Forge event-bus subscribers; no input mutation or verdict. */
public final class ManualKeyboardObserver {
  private static final boolean ENABLED = !System.getProperty("eff.manualCombat", "").isEmpty();
  private static final long LIMIT = 1_000_000L;
  private static long entries, wrongThread, wrongWindow, forwarded, failures;
  private static long lastWindow, expectedWindow;
  private static String lastError = "";
  private ManualKeyboardObserver() {}

  public static void returned(long window, int key, int scan, int action, int modifiers) {
    if (!ENABLED) return;
    synchronized (ManualKeyboardObserver.class) {
      entries = next(entries);
      lastWindow = window;
    }
    try {
      var mc = net.minecraft.client.Minecraft.getInstance();
      if (!mc.isSameThread()) {
        synchronized (ManualKeyboardObserver.class) { wrongThread = next(wrongThread); }
        return;
      }
      long expected = mc.getWindow().getWindow();
      synchronized (ManualKeyboardObserver.class) { expectedWindow = expected; }
      if (expected != window) {
        synchronized (ManualKeyboardObserver.class) { wrongWindow = next(wrongWindow); }
        return;
      }
      EntityGuardSelfTest.manualVanillaKeyEvent(key, scan, action, modifiers);
      synchronized (ManualKeyboardObserver.class) { forwarded = next(forwarded); }
    } catch (RuntimeException | LinkageError unavailable) {
      // An optional diagnostic must not break the game's input callback.
      synchronized (ManualKeyboardObserver.class) {
        failures = next(failures);
        lastError = unavailable.getClass().getName();
      }
    }
  }

  private static long next(long value) { return value < LIMIT ? value + 1 : LIMIT; }

  public static synchronized com.google.gson.JsonObject health() {
    return eff.minecraft.Jsons.obj("scope", "observer-entry-and-filter-health-not-input-or-survival-proof",
        "enabled", ENABLED, "counterLimit", LIMIT, "entries", entries,
        "wrongThread", wrongThread, "wrongWindow", wrongWindow,
        "forwardedToGameplayFilter", forwarded, "failures", failures,
        "lastWindow", Long.toUnsignedString(lastWindow),
        "expectedWindow", Long.toUnsignedString(expectedWindow), "lastError", lastError);
  }
}
