package eff.minecraft;

import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.Identifier;

public final class EffPackets {
  public record Action(String json) implements CustomPacketPayload {
    public static final Type<Action> TYPE =
        new Type<>(Identifier.fromNamespaceAndPath("eff", "action"));
    public static final StreamCodec<RegistryFriendlyByteBuf, Action> CODEC =
        StreamCodec.composite(ByteBufCodecs.stringUtf8(8192), Action::json, Action::new);

    public Type<? extends CustomPacketPayload> type() {
      return TYPE;
    }
  }

  public record State(String json) implements CustomPacketPayload {
    public static final Type<State> TYPE =
        new Type<>(Identifier.fromNamespaceAndPath("eff", "state"));
    public static final StreamCodec<RegistryFriendlyByteBuf, State> CODEC =
        StreamCodec.composite(ByteBufCodecs.stringUtf8(262144), State::json, State::new);

    public Type<? extends CustomPacketPayload> type() {
      return TYPE;
    }
  }

  public static void register() {
    PayloadTypeRegistry.serverboundPlay().register(Action.TYPE, Action.CODEC);
    PayloadTypeRegistry.clientboundPlay().registerLarge(State.TYPE, State.CODEC, 1048576);
  }
}
