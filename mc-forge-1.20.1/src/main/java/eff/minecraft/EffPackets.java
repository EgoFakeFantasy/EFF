package eff.minecraft;

import com.google.gson.JsonParser;
import java.util.Optional;
import java.util.function.Consumer;
import java.util.function.Supplier;
import net.minecraft.network.Connection;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.minecraftforge.network.NetworkDirection;
import net.minecraftforge.network.NetworkEvent;
import net.minecraftforge.network.NetworkRegistry;
import net.minecraftforge.network.PacketDistributor;
import net.minecraftforge.network.simple.SimpleChannel;

/** Direction-pinned, bounded messages. JSON is data and never a launch command. */
public final class EffPackets {
  private static final String PROTOCOL = "1";
  private static final int ACTION_LIMIT = 8192, STATE_LIMIT = 262144;
  private static final SimpleChannel CHANNEL =
      NetworkRegistry.newSimpleChannel(
          new ResourceLocation("eff", "runtime"),
          () -> PROTOCOL,
          PROTOCOL::equals,
          PROTOCOL::equals);
  private static volatile Consumer<String> clientReceiver = value -> {};

  private record Action(String json) {}

  private record State(String json) {}

  public static void register() {
    CHANNEL.registerMessage(
        0,
        Action.class,
        (message, buffer) -> write(buffer, message.json(), ACTION_LIMIT),
        buffer -> new Action(read(buffer, ACTION_LIMIT)),
        EffPackets::action,
        Optional.of(NetworkDirection.PLAY_TO_SERVER));
    CHANNEL.registerMessage(
        1,
        State.class,
        (message, buffer) -> write(buffer, message.json(), STATE_LIMIT),
        buffer -> new State(read(buffer, STATE_LIMIT)),
        EffPackets::state,
        Optional.of(NetworkDirection.PLAY_TO_CLIENT));
  }

  private static void write(FriendlyByteBuf buffer, String value, int limit) {
    if (value.length() > limit) throw new IllegalArgumentException("PACKET_BUDGET");
    buffer.writeUtf(value, limit);
  }

  private static String read(FriendlyByteBuf buffer, int limit) {
    String value = buffer.readUtf(limit);
    if (buffer.isReadable()) throw new IllegalArgumentException("PACKET_TRAILING_DATA");
    return value;
  }

  private static void action(Action message, Supplier<NetworkEvent.Context> source) {
    NetworkEvent.Context context = source.get();
    ServerPlayer player = context.getSender();
    if (player != null)
      context.enqueueWork(
          () -> {
            try {
              EffServer.receive(player, JsonParser.parseString(message.json()).getAsJsonObject());
            } catch (RuntimeException invalid) {
              EffServer.send(player, Jsons.obj("error", "INVALID_CLIENT_REQUEST"));
            }
          });
    context.setPacketHandled(true);
  }

  private static void state(State message, Supplier<NetworkEvent.Context> source) {
    NetworkEvent.Context context = source.get();
    context.enqueueWork(() -> clientReceiver.accept(message.json()));
    context.setPacketHandled(true);
  }

  /** Installed only from client initialization; this class loads on dedicated servers too. */
  public static void setClientReceiver(Consumer<String> receiver) {
    clientReceiver = receiver;
  }

  public static boolean canSend(ServerPlayer player) {
    return CHANNEL.isRemotePresent(player.connection.connection);
  }

  public static boolean canSendClient(Connection connection) {
    return connection != null && CHANNEL.isRemotePresent(connection);
  }

  public static void sendState(ServerPlayer player, String json) {
    CHANNEL.send(PacketDistributor.PLAYER.with(() -> player), new State(json));
  }

  public static void sendAction(String json) {
    CHANNEL.sendToServer(new Action(json));
  }

  private EffPackets() {}
}
