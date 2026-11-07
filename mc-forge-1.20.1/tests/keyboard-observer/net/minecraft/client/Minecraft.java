package net.minecraft.client;

/** Offline fault-injection double. Excluded from every shipped source set. */
public final class Minecraft {
  public static final Minecraft INSTANCE = new Minecraft();
  public static boolean sameThread = true;
  public static long window = 17L;
  public static RuntimeException lookupFailure;
  public static LinkageError windowFailure;
  static { System.setProperty("eff.test.minecraftInitialized", "true"); }
  public static Minecraft getInstance() {
    if (lookupFailure != null) throw lookupFailure;
    return INSTANCE;
  }
  public boolean isSameThread() { return sameThread; }
  public Window getWindow() {
    if (windowFailure != null) throw windowFailure;
    return new Window();
  }
  public static final class Window {
    public long getWindow() { return window; }
  }
}
