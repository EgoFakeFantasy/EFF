package eff.minecraft;

import com.google.gson.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import net.minecraft.network.chat.Component;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.level.storage.LevelResource;

public final class EffServer {
  private static final Map<UUID, Run> RUNS = new HashMap<>();
  private static final Set<UUID> STARTING = new HashSet<>();
  // Keep transport setup on JDK-owned workers. A mod can erase custom Runnable factories
  // and suspend ordinary executor workers; this is compatibility, not a native trust boundary.
  private static final ForkJoinPool IO = new ForkJoinPool(2);
  private static int ticks;

  public static final class Run {
    public final EffArena arena;
    public final BridgeProcess bridge;
    JsonObject last;
    boolean polling = false, active = true;
    long sequence;
    ResearchSession research;
    boolean researchBusy;
    long researchToken;
    Path save;
    int unacknowledgedTicks;
    boolean manualFault;

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
    if (Set.of("researchSubmit", "researchAdvice").contains(op)) {
      if (run.research == null || !run.arena.ready()) {
        send(p, Jsons.obj("error", "RESEARCH_NOT_READY"));
        return;
      }
      if (run.researchBusy) {
        send(p, Jsons.obj("error", "MODEL_BUSY"));
        return;
      }
      try {
        if (op.equals("researchSubmit")) {
          if (r.size() != 3 || !r.has("source") || !r.has("revision"))
            throw new IllegalArgumentException("INVALID_PROGRAM_REQUEST");
          run.research.execute(Jsons.s(r, "source"), Jsons.i(r, "revision"), "player");
          publish(run);
        } else {
          if (r.size() != 2 || Jsons.s(r, "goal").length() > 240)
            throw new IllegalArgumentException("INVALID_RESEARCH_GOAL");
          researchPlan(run, "repression", Jsons.s(r, "goal"));
        }
      } catch (Exception e) {
        if (op.equals("researchSubmit")) {
          run.research.recordRejected(Jsons.s(r, "source"), "player", e.getMessage());
          publish(run);
        }
        send(p, Jsons.obj("error", e.getMessage()));
      }
      return;
    }
    if (run.researchBusy && op.equals("modelConfigure")) {
      send(p, Jsons.obj("error", "MODEL_BUSY"));
      return;
    }
    if (op.equals("cancel") && run.research != null) {
      run.researchBusy = false;
      run.researchToken++;
      run.research.requested();
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
    if (!Set.of("story", "practice", "research").contains(mode)) {
      send(p, Jsons.obj("error", "INVALID_MODE"));
      return;
    }
    if (RUNS.containsKey(p.getUUID())) {
      Run old = RUNS.get(p.getUUID());
      // Keep the current projection until a new mode is acknowledged; accept() retires it.
      old.researchBusy = false;
      old.researchToken++;
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
                          BootstrapDiagnostics.failure("bridge-construction", error, IO);
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
                        run.save = save;
                        RUNS.put(p.getUUID(), run);
                        request(run, Jsons.obj("op", "enter", "mode", mode));
                      }));
    } catch (Exception e) {
      STARTING.remove(p.getUUID());
      BootstrapDiagnostics.failure("arena-enter", e, IO);
      send(p, Jsons.obj("error", e.getMessage()));
    }
  }

  private static void request(Run run, JsonObject request) {
    run.bridge
        .request(request)
        .whenComplete(
            (state, error) -> {
                BootstrapDiagnostics.stage("bridge-result-schedule", "failed=" + (error != null));
                run.arena.server.execute(
                    () -> {
                      BootstrapDiagnostics.stage("bridge-result-enter", "active=" + run.active);
                      if (!run.active || run.manualFault) return;
                      if (error != null) {
                        String message =
                            error.getCause() == null
                                ? error.getMessage()
                                : error.getCause().getMessage();
                        send(run.arena.player, Jsons.obj("error", message));
                        if (message != null
                            && (message.contains("BRIDGE_STOPPED")
                                || message.contains("BRIDGE_FAILURE"))) runtimeFailure(run);
                        return;
                      }
                      accept(run, state);
                    });
            });
  }

  private static void accept(Run run, JsonObject state) {
    long sequence = Jsons.i(state, "sequence");
    BootstrapDiagnostics.stage("bridge-result-accept", "sequence=" + sequence + ";previous=" + run.sequence);
    if (sequence <= run.sequence) return;
    run.sequence = sequence;
    run.unacknowledgedTicks = 0;
    run.last = state;
    try {
      boolean wantsResearch = Jsons.s(state, "mode").equals("research");
      if (!wantsResearch && run.research != null) {
        run.research.close();
        run.research = null;
        run.arena.research = null;
        run.researchBusy = false;
      }
      run.arena.apply(state);
      if (wantsResearch && run.research == null) {
        run.research =
            RuntimeLink.enabled()
                ? new ManagedResearchRuntime(run.arena)
                : new ResearchRuntime(run.arena, run.save);
        run.arena.research = run.research;
        run.research.project();
      }
    } catch (Exception e) {
      send(run.arena.player, Jsons.obj("error", "MC 场景生成失败：" + e.getMessage()));
      runtimeFailure(run);
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
    if (run.research != null) {
      payload.add("research", run.research.snapshot());
      payload.addProperty("researchBusy", run.researchBusy);
    }
    send(run.arena.player, payload);
  }

  public static void tick(MinecraftServer server) {
    RuntimeLink.serverTick();
    ticks++;
    for (Run run : List.copyOf(RUNS.values())) {
      if (!run.active || run.manualFault || run.arena.server != server) continue;
      if (run.research instanceof ManagedResearchRuntime managed && managed.observePlayerFault())
        continue;
      // Count active server ticks: a paused integrated server is not a failed bridge.
      // External supervision remains responsible for a stopped server thread.
      if (++run.unacknowledgedTicks > 300) {
        BootstrapDiagnostics.failure("bridge-watchdog", new TimeoutException("BRIDGE_ACK_TIMEOUT"), IO);
        send(run.arena.player, Jsons.obj("error", System.getProperty("eff.manualCombat", "").isBlank()
            ? "本地桥接长时间未响应，已恢复原世界。" : "桥接运行故障，保留原场景；本次验收失败。"));
        runtimeFailure(run);
        continue;
      }
      if (server.getPlayerList().getPlayerCount() != 1) {
        send(run.arena.player, Jsons.obj("error", "有其他玩家加入，已退出并恢复 MC 时间状态。"));
        runtimeFailure(run);
        continue;
      }
      try {
        run.arena.tick();
      } catch (Exception e) {
        BootstrapDiagnostics.failure("arena-tick", e, IO);
        send(run.arena.player, Jsons.obj("error", "MC_RUNTIME_FAILURE"));
        runtimeFailure(run);
        continue;
      }
      if (!run.active) continue;
      if (run.research != null
          && !run.researchBusy
          && run.research.needsCounter()
          && !Boolean.getBoolean("eff.pig2Lab")
          && !Boolean.getBoolean("eff.foreverLoveLab")) researchPlan(run, "intruder", "");
      if (ticks % 2 == 0 && !run.polling && run.arena.ready()) {
        run.polling = true;
        JsonObject step = run.arena.step();
        run.bridge
            .request(step)
            .whenComplete(
                (state, error) ->
                    server.execute(
                        () -> {
                          run.polling = false;
                          if (!run.active || run.manualFault) return;
                          if (error == null) accept(run, state);
                          else {
                            BootstrapDiagnostics.note("bridge-poll-request", step.toString());
                            BootstrapDiagnostics.failure("bridge-poll", error, IO);
                            if (error.getMessage() != null
                                && error.getMessage().contains("BRIDGE_STOPPED"))
                              runtimeFailure(run);
                          }
                        }));
      }
    }
  }

  private static void researchPlan(Run run, String actor, String goal) {
    ResearchSession runtime = run.research;
    if (runtime == null || run.researchBusy) return;
    JsonObject observed = runtime.observation();
    int revision = runtime.revision();
    long token = ++run.researchToken;
    run.researchBusy = true;
    if (actor.equals("intruder")) runtime.requested();
    publish(run);
    run.bridge
        .request(
            Jsons.obj("op", "researchPlan", "snapshot", observed, "actor", actor, "goal", goal))
        .whenComplete(
            (state, error) ->
                run.arena.server.execute(
                    () -> {
                      if (!run.active || run.research != runtime || run.researchToken != token)
                        return;
                      run.researchBusy = false;
                      if (error != null) {
                        runtime.modelNote(
                            Jsons.obj(
                                "source", "cancelled-or-error", "explanation", error.getMessage()));
                      } else {
                        JsonObject proposal = Jsons.o(state, "researchPlan");
                        if (actor.equals("repression")) runtime.advice(proposal);
                        else {
                          runtime.modelNote(proposal);
                          if (runtime.revision() == revision) {
                            try {
                              JsonObject receipt =
                                  runtime.execute(
                                      Jsons.s(proposal, "program"), revision, "intruder");
                              if (Jsons.a(receipt, "steps").asList().stream()
                                  .anyMatch(e -> !Jsons.b(e.getAsJsonObject(), "accepted")))
                                runtime.retryCounter();
                            } catch (Exception e) {
                              runtime.recordRejected(
                                  Jsons.s(proposal, "program"), "intruder", e.getMessage());
                              runtime.retryCounter();
                              runtime.modelNote(
                                  Jsons.obj(
                                      "source",
                                      Jsons.s(proposal, "source"),
                                      "program",
                                      Jsons.s(proposal, "program"),
                                      "explanation",
                                      "实际执行被拒绝：" + e.getMessage()));
                            }
                          } else
                            runtime.modelNote(
                                Jsons.obj(
                                    "source", "stale-rejected", "explanation", "现场已改变；旧方案未执行。"));
                        }
                      }
                      publish(run);
                    }));
  }

  private static void runtimeFailure(Run run) {
    if (System.getProperty("eff.manualCombat", "").isBlank()) {
      leave(run.arena.player);
      return;
    }
    if (run.manualFault) return;
    run.manualFault = true;
    // Keep original entities, world and window. This is a failed baseline/run,
    // never a successful recovery. No more bridge projections after this fault.
    System.err.println("[EFF_MANUAL] runtime fault; original scene retained; acceptance failed");
    try {
      Files.writeString(Path.of("manual-runtime-fault.json"),
          Jsons.obj("pid", ProcessHandle.current().pid(), "failed", true,
              "reason", "AUTOMATIC_RUNTIME_EXIT_SUPPRESSED",
              "unacknowledgedTicks", run.unacknowledgedTicks,
              "sceneRetained", true, "success", false).toString(),
          StandardOpenOption.CREATE_NEW);
    } catch (Exception error) { System.err.println("[EFF_MANUAL] fault evidence write failed: " + error); }
  }

  public static void leave(ServerPlayer p) {
    STARTING.remove(p.getUUID());
    Run run = RUNS.remove(p.getUUID());
    if (run != null) {
      run.active = false;
      try {
        if (run.research != null) run.research.close();
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
    if (EffPackets.canSend(p)) EffPackets.sendState(p, state.toString());
    else p.sendSystemMessage(Component.literal("[EFF] " + Jsons.s(state, "error")));
  }

  private EffServer() {}
}
