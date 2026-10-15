package eff.minecraft;

import java.util.WeakHashMap;
import net.minecraft.server.MinecraftServer;

/** 1.20.1 simulation freeze; server tasks, packets and EFF lifecycle events continue. */
public final class LegacyFreeze {
  private static final WeakHashMap<MinecraftServer, LegacyFreeze> STATES = new WeakHashMap<>();
  private volatile boolean frozen;

  public static synchronized LegacyFreeze of(MinecraftServer server) {
    return STATES.computeIfAbsent(server, k -> new LegacyFreeze());
  }

  public boolean isFrozen() {
    return frozen;
  }

  public void setFrozen(boolean value) {
    frozen = value;
  }
}
