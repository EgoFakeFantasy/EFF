package eff.minecraft;

import com.google.gson.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.network.chat.Component;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.level.storage.LevelResource;

public final class EffServer {
  private static final Map<UUID, Run> RUNS = new HashMap<>();
  private static final Set<UUID> STARTING = new HashSet<>();
  private static final ExecutorService IO =
      Executors.newCachedThreadPool(
          r -> {
            Thread t = new Thread(r, "EFF bridge setup");
            t.setDaemon(true);
            return t;
          });
  private static int ticks;

  public static final class Run {
    public final EffArena arena;
    public final BridgeProcess bridge;
    JsonObject last;
    boolean polling = false, active = true;
    long sequence;
    long lastAck = System.nanoTime();

    Run(EffArena a, BridgeProcess b) {
      arena = a;
      bridge = b;
    }
  }

  public static void receive(ServerPlayer p, JsonObject r) {
    String op = Jsons.s(r, "op");
    if (op.equals("leave")) {
      leave(p);
      return;
    }
    if (op.equals("enter")) {
      enter(p, Jsons.s(r, "mode"));
      return;
    }
    Run run = RUNS.get(p.getUUID());
    if (run == null) {
      send(p, Jsons.obj("error", "先选择进入正文或争夺练习。"));
      return;
    }
    if (!Set.of(
            "story",
            "plan",
            "resolve",
            "pause",
            "cancel",
            "modelStatus",
            "modelConfigure",
            "checkpoint")
        .contains(op)) {
      send(p, Jsons.obj("error", "OP_NOT_ALLOWED"));
      return;
    }
    if (Set.of("plan", "resolve").contains(op) && !run.arena.ready()) {
      send(p, Jsons.obj("error", "ARENA_BUILDING"));
      return;
    }
    request(run, r);
  }

  public static void enter(ServerPlayer p, String mode) {
    if (!Set.of("story", "practice").contains(mode)) {
      send(p, Jsons.obj("error", "INVALID_MODE"));
      return;
    }
    if (RUNS.containsKey(p.getUUID())) {
      Run old = RUNS.get(p.getUUID());
      request(old, Jsons.obj("op", "enter", "mode", mode));
      return;
    }
    if (!STARTING.add(p.getUUID())) return;
    MinecraftServer server = p.level().getServer();
    try {
      Path save =
          server
              .getWorldPath(LevelResource.ROOT)
              .resolve("eff-runtime")
              .resolve(p.getUUID().toString());
      EffArena arena = new EffArena(p, save);
      CompletableFuture.supplyAsync(
              () -> {
                try {
                  return new BridgeProcess(save);
                } catch (Exception e) {
                  throw new CompletionException(e);
                }
              },
              IO)
          .whenComplete(
              (bridge, error) ->
                  server.execute(
                      () -> {
                        boolean waiting = STARTING.remove(p.getUUID());
                        if (error != null) {
                          arena.close();
                          send(
                              p,
                              Jsons.obj(
                                  "error", "本地剧情桥接启动失败。请安装 Node.js 22 或更新版，或设置 -Deff.node=绝对路径。"));
                          return;
                        }
                        if (!waiting || p.isRemoved()) {
                          bridge.close();
                          arena.close();
                          return;
                        }
                        Run run = new Run(arena, bridge);
                        RUNS.put(p.getUUID(), run);
                        request(run, Jsons.obj("op", "enter", "mode", mode));
                      }));
    } catch (Exception e) {
      STARTING.remove(p.getUUID());
      send(p, Jsons.obj("error", e.getMessage()));
    }
  }

  private static void request(Run run, JsonObject request) {
    run.bridge
        .request(request)
        .whenComplete(
            (state, error) ->
                run.arena.server.execute(
                    () -> {
                      if (!run.active) return;
                      if (error != null) {
                        String message =
                            error.getCause() == null
                                ? error.getMessage()
                                : error.getCause().getMessage();
                        send(run.arena.player, Jsons.obj("error", message));
                        if (message != null
                            && (message.contains("BRIDGE_STOPPED")
                                || message.contains("BRIDGE_FAILURE"))) leave(run.arena.player);
                        return;
                      }
                      accept(run, state);
                    }));
  }

  private static void accept(Run run, JsonObject state) {
    long sequence = Jsons.i(state, "sequence");
    if (sequence <= run.sequence) return;
    run.sequence = sequence;
    run.lastAck = System.nanoTime();
    run.last = state;
    try {
      run.arena.apply(state);
    } catch (Exception e) {
      send(run.arena.player, Jsons.obj("error", "MC 场景生成失败：" + e.getMessage()));
      leave(run.arena.player);
      return;
    }
    publish(run);
  }

  private static void publish(Run run) {
    JsonObject payload = run.last.deepCopy();
    payload.add(
        "native",
        Jsons.obj(
            "ready",
            run.arena.ready(),
            "generation",
            run.arena.generation(),
            "facts",
            run.arena.facts()));
    send(run.arena.player, payload);
  }

  public static void tick(MinecraftServer server) {
    ticks++;
    for (Run run : List.copyOf(RUNS.values())) {
      if (run.arena.server != server) continue;
      if ((System.nanoTime() - run.lastAck) / 1e9 > 15) {
        send(run.arena.player, Jsons.obj("error", "本地桥接长时间未响应，已恢复原世界。"));
        leave(run.arena.player);
        continue;
      }
      if (server.getPlayerList().getPlayerCount() != 1) {
        send(run.arena.player, Jsons.obj("error", "有其他玩家加入，已退出并恢复 MC 时间状态。"));
        leave(run.arena.player);
        continue;
      }
      try {
        run.arena.tick();
      } catch (Exception e) {
        send(run.arena.player, Jsons.obj("error", "MC_RUNTIME_FAILURE"));
        leave(run.arena.player);
        continue;
      }
      if (ticks % 2 == 0 && !run.polling && run.arena.ready()) {
        run.polling = true;
        run.bridge
            .request(run.arena.step())
            .whenComplete(
                (state, error) ->
                    server.execute(
                        () -> {
                          run.polling = false;
                          if (!run.active) return;
                          if (error == null) accept(run, state);
                          else if (error.getMessage() != null
                              && error.getMessage().contains("BRIDGE_STOPPED"))
                            leave(run.arena.player);
                        }));
      }
    }
  }

  public static void leave(ServerPlayer p) {
    STARTING.remove(p.getUUID());
    Run run = RUNS.remove(p.getUUID());
    if (run != null) {
      run.active = false;
      try {
        run.arena.close();
      } finally {
        run.bridge.close();
      }
    }
    send(p, Jsons.obj("left", true));
  }

  public static void stop(MinecraftServer server) {
    for (Run run : List.copyOf(RUNS.values()))
      if (run.arena.server == server) leave(run.arena.player);
  }

  public static Run run(UUID id) {
    return RUNS.get(id);
  }

  public static void send(ServerPlayer p, JsonObject state) {
    if (ServerPlayNetworking.canSend(p, EffPackets.State.TYPE))
      ServerPlayNetworking.send(p, new EffPackets.State(state.toString()));
    else p.sendSystemMessage(Component.literal("[EFF] " + Jsons.s(state, "error")));
  }

  private EffServer() {}
}
