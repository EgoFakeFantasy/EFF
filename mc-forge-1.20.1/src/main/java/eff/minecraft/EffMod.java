package eff.minecraft;

import com.mojang.brigadier.arguments.StringArgumentType;
import net.minecraft.commands.Commands;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.level.storage.LevelResource;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.common.MinecraftForge;
import net.minecraftforge.event.RegisterCommandsEvent;
import net.minecraftforge.event.TickEvent;
import net.minecraftforge.event.entity.player.PlayerEvent;
import net.minecraftforge.event.server.ServerStoppingEvent;
import net.minecraftforge.fml.DistExecutor;
import net.minecraftforge.fml.common.Mod;

/** Forge binding for the same 1.20.1 game and sealed runtime protocol. */
@Mod("eff")
public final class EffMod {
  private static final net.minecraftforge.registries.DeferredRegister<
          net.minecraft.world.entity.EntityType<?>>
      ENTITIES =
          net.minecraftforge.registries.DeferredRegister.create(
              net.minecraftforge.registries.ForgeRegistries.ENTITY_TYPES, "eff");
  private static final net.minecraftforge.registries.RegistryObject<
          net.minecraft.world.entity.EntityType<net.minecraft.world.entity.decoration.ArmorStand>>
      PROJECTION = ENTITIES.register("projection", () -> EffEntities.PROJECTION);

  public EffMod() {
    BootstrapDiagnostics.stage("forge-mod-enter", "constructor");
    ForgeBootstrapProbe.snapshot("construct");
    var modBus = net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext.get().getModEventBus();
    ENTITIES.register(modBus);
    modBus.addListener(EffMod::attributes);
    EffPackets.register();
    MinecraftForge.EVENT_BUS.addListener(EffMod::registerCommands);
    MinecraftForge.EVENT_BUS.addListener(EffMod::serverTick);
    MinecraftForge.EVENT_BUS.addListener(EffMod::serverStopping);
    MinecraftForge.EVENT_BUS.addListener(EffMod::playerJoined);
    MinecraftForge.EVENT_BUS.addListener(EffMod::playerLeft);
    DistExecutor.safeRunWhenOn(Dist.CLIENT, () -> eff.minecraft.client.EffClient::initialize);
    BootstrapDiagnostics.stage("forge-mod-ready", "listeners-registered");
  }

  private static void attributes(
      net.minecraftforge.event.entity.EntityAttributeCreationEvent event) {
    event.put(PROJECTION.get(), EffEntities.attributes().build());
  }

  private static void registerCommands(RegisterCommandsEvent event) {
    var dispatcher = event.getDispatcher();
    eff.minecraft.lab.ManualPlayerAttackFixture.register(dispatcher);
    dispatcher.register(
        Commands.literal("eff")
            .executes(
                c -> {
                  EffServer.send(c.getSource().getPlayerOrException(), Jsons.obj("menu", true));
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
                Commands.literal("research")
                    .executes(
                        c -> {
                          EffServer.enter(c.getSource().getPlayerOrException(), "research");
                          return 1;
                        }))
            .then(
                Commands.literal("code")
                    .then(
                        Commands.argument("program", StringArgumentType.greedyString())
                            .executes(
                                c -> {
                                  var player = c.getSource().getPlayerOrException();
                                  var observation = EffResearchAPI.observe(player);
                                  EffResearchAPI.submit(
                                      player,
                                      StringArgumentType.getString(c, "program"),
                                      Jsons.i(observation, "revision"));
                                  return 1;
                                })))
            .then(
                Commands.literal("leave")
                    .executes(
                        c -> {
                          EffServer.leave(c.getSource().getPlayerOrException());
                          return 1;
                        })));
  }

  private static void serverTick(TickEvent.ServerTickEvent event) {
    ForgeBootstrapProbe.snapshot("server");
    BootstrapDiagnostics.stage("forge-server-event", "wrapped=" + CoreTickScope.active(false));
    if (event.phase == TickEvent.Phase.END && !CoreTickScope.active(false))
      EffServer.tick(event.getServer());
  }

  private static void serverStopping(ServerStoppingEvent event) {
    EffServer.stop(event.getServer());
  }

  private static void playerJoined(PlayerEvent.PlayerLoggedInEvent event) {
    if (!(event.getEntity() instanceof ServerPlayer player)) return;
    EffArena.recover(
        player,
        player
            .server
            .getWorldPath(LevelResource.ROOT)
            .resolve("eff-runtime")
            .resolve(player.getUUID().toString()));
  }

  private static void playerLeft(PlayerEvent.PlayerLoggedOutEvent event) {
    if (event.getEntity() instanceof ServerPlayer player) EffServer.leave(player);
  }
}
