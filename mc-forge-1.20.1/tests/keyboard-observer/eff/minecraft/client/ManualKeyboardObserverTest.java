package eff.minecraft.client;

import net.minecraft.client.Minecraft;

/** Checks failure containment and evidence filtering, not MC combat success. */
public final class ManualKeyboardObserverTest {
  private static void check(boolean ok, String message) {
    if (!ok) throw new AssertionError(message);
  }
  private static long count(String name) {
    return ManualKeyboardObserver.health().get(name).getAsLong();
  }
  public static void main(String[] args) {
    if (args.length == 1 && args[0].equals("disabled")) {
      check(System.getProperty("eff.manualCombat", "").isEmpty(), "disabled process required");
      ManualKeyboardObserver.returned(17L, 68, 32, 1, 0);
      check(!ManualKeyboardObserver.health().get("enabled").getAsBoolean(), "unexpected opt-in");
      check(count("entries") == 0, "disabled observer recorded input");
      check(System.getProperty("eff.test.minecraftInitialized") == null,
          "disabled observer initialized game dependency");
      System.out.println("PASS: disabled observer leaves game dependency uninitialized");
      return;
    }
    check(ManualKeyboardObserver.health().get("enabled").getAsBoolean(), "manual opt-in required");
    ManualKeyboardObserver.returned(17L, 68, 32, 1, 3);
    check(EntityGuardSelfTest.forwarded == 1 && "68:32:1:3".equals(EntityGuardSelfTest.arguments),
        "valid callback changed or duplicated");
    Minecraft.sameThread = false;
    ManualKeyboardObserver.returned(17L, 65, 30, 1, 0);
    Minecraft.sameThread = true;
    ManualKeyboardObserver.returned(18L, 65, 30, 1, 0);
    check(count("wrongThread") == 1 && count("wrongWindow") == 1,
        "rejection causes were conflated");
    check(EntityGuardSelfTest.forwarded == 1, "rejected context forwarded an input");
    Minecraft.lookupFailure = new IllegalStateException("injected lookup failure");
    ManualKeyboardObserver.returned(17L, 32, 57, 1, 0);
    Minecraft.lookupFailure = null;
    Minecraft.windowFailure = new NoClassDefFoundError("injected linkage failure");
    ManualKeyboardObserver.returned(17L, 32, 57, 1, 0);
    Minecraft.windowFailure = null;
    EntityGuardSelfTest.failure = new IllegalArgumentException("injected receiver failure");
    ManualKeyboardObserver.returned(17L, 32, 57, 1, 0);
    EntityGuardSelfTest.failure = null;
    check(count("failures") == 3 && count("forwardedToGameplayFilter") == 1,
        "failed diagnostics counted as successful callbacks");
    ManualKeyboardObserver.returned(17L, 32, 57, 0, 0);
    check(count("entries") == 7 && count("forwardedToGameplayFilter") == 2
        && EntityGuardSelfTest.forwarded == 2, "observer did not recover after contained failure");
    var snapshot = ManualKeyboardObserver.health();
    snapshot.addProperty("entries", 999L);
    check(count("entries") == 7, "snapshot mutation affected observer");
    check(!snapshot.toString().contains("injected receiver"), "exception message leaked to diagnostics");
    System.out.println("PASS: valid callback, rejected contexts, contained runtime/linkage failures, recovery, independent snapshots");
  }
}
