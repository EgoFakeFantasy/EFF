package eff.minecraft;

/** Per-invocation dispatch coordination, not an integrity or security attestation. */
public final class CoreTickScope {
  private static final ThreadLocal<int[]> DEPTH = ThreadLocal.withInitial(() -> new int[2]);

  private CoreTickScope() {}

  public static void enter(boolean client) { DEPTH.get()[client ? 0 : 1]++; }

  public static boolean active(boolean client) { return DEPTH.get()[client ? 0 : 1] > 0; }

  public static void exit(boolean client) {
    int[] depth = DEPTH.get();
    int index = client ? 0 : 1;
    if (depth[index] <= 0) throw new IllegalStateException("UNBALANCED_CORE_TICK_SCOPE");
    depth[index]--;
    if (depth[0] == 0 && depth[1] == 0) DEPTH.remove();
  }
}
