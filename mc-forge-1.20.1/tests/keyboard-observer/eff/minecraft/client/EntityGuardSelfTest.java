package eff.minecraft.client;

/** Offline receiver only: never loads or controls an actual game. */
public final class EntityGuardSelfTest {
  static int forwarded;
  static String arguments;
  static RuntimeException failure;
  static void manualVanillaKeyEvent(int key, int scan, int action, int modifiers) {
    if (failure != null) throw failure;
    forwarded++;
    arguments = key + ":" + scan + ":" + action + ":" + modifiers;
  }
}
