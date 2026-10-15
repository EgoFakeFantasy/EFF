package eff.minecraft;

import net.fabricmc.fabric.api.networking.v1.PacketByteBufs;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.resources.ResourceLocation;

/** 1.20.1 channels; copy data on the network thread, dispatch only on the game thread. */
public final class EffPackets {
  public static final ResourceLocation ACTION = new ResourceLocation("eff", "action");
  public static final ResourceLocation STATE = new ResourceLocation("eff", "state");

  public static FriendlyByteBuf encode(String value, int limit) {
    if (value.length() > limit) throw new IllegalArgumentException("PACKET_BUDGET");
    return PacketByteBufs.create().writeUtf(value, limit);
  }

  public static void register() {}
}
