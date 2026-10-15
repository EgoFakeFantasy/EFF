package eff.minecraft;

import com.google.gson.JsonParser;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.fabricmc.fabric.api.event.lifecycle.v1.*;
import net.fabricmc.fabric.api.networking.v1.*;
import net.minecraft.commands.Commands;

public final class EffMod implements ModInitializer {
  public void onInitialize() {
    EffPackets.register();
    ServerPlayNetworking.registerGlobalReceiver(
        EffPackets.Action.TYPE,
        (payload, context) -> {
          try {
            if (payload.json().length() > 8192) throw new IllegalArgumentException();
            var request = JsonParser.parseString(payload.json()).getAsJsonObject();
            EffServer.receive(context.player(), request);
          } catch (Exception e) {
            EffServer.send(context.player(), Jsons.obj("error", "INVALID_CLIENT_REQUEST"));
          }
        });
    CommandRegistrationCallback.EVENT.register(
        (dispatcher, access, environment) ->
            dispatcher.register(
                Commands.literal("eff")
                    .executes(
                        c -> {
                          EffServer.send(
                              c.getSource().getPlayerOrException(), Jsons.obj("menu", true));
                          return 1;
                        })
                    .then(
                        Commands.literal("play")
                            .executes(
                                c -> {
                                  EffServer.enter(c.getSource().getPlayerOrException(), "story");
                                  return 1;
                                }))
                    .then(
                        Commands.literal("duel")
                            .executes(
                                c -> {
                                  EffServer.enter(c.getSource().getPlayerOrException(), "practice");
                                  return 1;
                                }))
                    .then(
                        Commands.literal("leave")
                            .executes(
                                c -> {
                                  EffServer.leave(c.getSource().getPlayerOrException());
                                  return 1;
                                }))));
    ServerTickEvents.END_SERVER_TICK.register(EffServer::tick);
    ServerLifecycleEvents.SERVER_STOPPING.register(EffServer::stop);
    ServerPlayConnectionEvents.JOIN.register(
        (handler, sender, server) ->
            EffArena.recover(
                handler.player,
                server
                    .getWorldPath(net.minecraft.world.level.storage.LevelResource.ROOT)
                    .resolve("eff-runtime")
                    .resolve(handler.player.getUUID().toString())));
    ServerPlayConnectionEvents.DISCONNECT.register(
        (handler, server) -> EffServer.leave(handler.player));
  }
}
