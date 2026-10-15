package eff.minecraft.client;

import com.google.gson.*;
import eff.minecraft.*;
import java.nio.file.*;
import java.util.*;
import net.minecraft.client.*;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.world.Difficulty;
import net.minecraft.world.level.*;
import net.minecraft.world.level.levelgen.*;
import net.minecraft.world.level.levelgen.presets.WorldPresets;

/**
 * Real MC acceptance. Uses an isolated disposable world and the same network/extension entry points
 * as play.
 */
public final class ResearchSelfTest {
  private static final boolean ENABLED = Boolean.getBoolean("eff.researchSelftest");
  private static int phase;
  private static volatile boolean screenshot;
  private static long since = System.nanoTime();
  private static final List<String> checks = new ArrayList<>();
  private static final List<JsonObject> evidence = new ArrayList<>();
  private static String originalAvatar = "", originalInstance = "";
  private static int priorRevision, priorGeneration;
  private static volatile String failure = "";
  private static volatile boolean serverChecks, sourceChecks;

  private static double seconds() {
    return (System.nanoTime() - since) / 1e9;
  }

  private static void next(int p) {
    phase = p;
    since = System.nanoTime();
  }

  private static JsonObject research() {
    return Jsons.o(EffClient.state, "research");
  }

  private static JsonObject fields() {
    return Jsons.o(research(), "fields");
  }

  private static boolean idle() {
    return !Jsons.b(EffClient.state, "researchBusy") && !Jsons.b(EffClient.state, "pending");
  }

  private static void check(boolean b, String text) {
    if (!b) throw new IllegalStateException(text);
    checks.add(text);
    System.out.println("[EFF_RESEARCH_QA] " + text);
  }

  private static void submit(String source) {
    EffClient.send(
        Jsons.obj(
            "op", "researchSubmit", "source", source, "revision", Jsons.i(research(), "revision")));
  }

  private static void capture() {
    evidence.add(research().deepCopy());
  }

  public static void tick(Minecraft mc) {
    if (!ENABLED || phase == 99) return;
    try {
      mc.options.pauseOnLostFocus = false;
      if (!failure.isEmpty()) throw new IllegalStateException(failure);
      if (seconds() > 100)
        throw new IllegalStateException("PHASE_TIMEOUT_" + phase + " " + EffClient.error);
      if (phase == 0 && mc.isGameLoadFinished()) {
        mc.getTutorial().setStep(net.minecraft.client.tutorial.TutorialSteps.NONE);
        mc.createWorldOpenFlows()
            .createFreshLevel(
                "eff-research-qa-" + System.currentTimeMillis(),
                new LevelSettings(
                    "EFF research disposable QA",
                    GameType.CREATIVE,
                    new LevelSettings.DifficultySettings(Difficulty.PEACEFUL, false, false),
                    true,
                    WorldDataConfiguration.DEFAULT),
                new WorldOptions(271828, false, false),
                WorldPresets::createTestWorldDimensions,
                new TitleScreen());
        next(1);
      } else if (phase == 1 && mc.player != null && mc.level != null) {
        EffClient.send(Jsons.obj("op", "enter", "mode", "research"));
        next(2);
      } else if (phase == 2
          && !research().isEmpty()
          && Jsons.b(fields(), "entity.avatar.alive")
          && Jsons.b(Jsons.o(EffClient.state, "native"), "ready")) {
        check(
            mc.level.dimension().equals(EffArena.DIM), "research enters real native EFF dimension");
        check(Jsons.b(fields(), "control.tether.active"), "real control executor initially bound");
        check(Jsons.b(fields(), "world.frozen"), "real MC server time initially frozen");
        originalAvatar = Jsons.s(research(), "avatarUUID");
        EffClient.send(Jsons.obj("op", "modelStatus"));
        next(3);
      } else if (phase == 3 && !Jsons.a(EffClient.state, "models").isEmpty()) {
        check(
            Jsons.a(EffClient.state, "models").asList().stream()
                .anyMatch(e -> e.getAsString().equals("qwen3.5:4b")),
            "installed local qwen3.5:4b available");
        EffClient.send(
            Jsons.obj(
                "op",
                "modelConfigure",
                "enabled",
                true,
                "model",
                "qwen3.5:4b",
                "profile",
                "patient"));
        next(4);
      } else if (phase == 4 && Jsons.b(Jsons.o(EffClient.state, "modelConfig"), "enabled")) {
        var server = mc.getSingleplayerServer();
        var id = mc.player.getUUID();
        server.execute(
            () -> {
              try {
                var run = EffServer.run(id);
                var entity = run.arena.world.getEntity(UUID.fromString(originalAvatar));
                if (entity == null)
                  throw new IllegalStateException("native avatar missing before external attack");
                entity.discard(); // Actual vanilla entity removal. No EFF program submission or
                // fabricated receipt.
              } catch (Exception e) {
                failure = e.toString();
              }
            });
        next(5);
      } else if (phase == 5
          && seconds() > 2
          && idle()
          && Jsons.s(Jsons.o(research(), "counter"), "source").equals("local-model")
          && Jsons.b(fields(), "entity.avatar.alive")
          && Jsons.b(Jsons.o(EffClient.state, "native"), "ready")) {
        check(
            !originalAvatar.equals(Jsons.s(research(), "avatarUUID")),
            "local AI restores a genuinely new native entity after external removal");
        check(
            Jsons.a(research(), "journal").asList().stream()
                .anyMatch(e -> Jsons.s(e.getAsJsonObject(), "actor").equals("native-observer")),
            "external removal is discovered by server observation");
        check(
            Jsons.b(fields(), "control.tether.active"), "AI recovery restores real control source");
        capture();
        // Parse failures and stale requests must have no side effects.
        var server = mc.getSingleplayerServer();
        var id = mc.player.getUUID();
        server.execute(
            () -> {
              try {
                var rt = EffServer.run(id).arena.research;
                int revision = rt.revision();
                for (String bad :
                    List.of(
                        "erase entity.avatar; disable control.tether; disable event.possess; seal"
                            + " checkpoint.origin",
                        "exec process.shell",
                        "watch a when x == true -> watch b when x == true -> erase"
                            + " entity.avatar")) {
                  try {
                    rt.execute(bad, revision, "player");
                    throw new IllegalStateException("invalid program executed");
                  } catch (IllegalArgumentException expected) {
                  }
                }
                try {
                  rt.execute("erase entity.avatar", revision - 1, "player");
                  throw new IllegalStateException("stale program executed");
                } catch (IllegalArgumentException expected) {
                }
                if (rt.revision() != revision)
                  throw new IllegalStateException("rejected program mutated native revision");
                serverChecks = true;
              } catch (Exception e) {
                failure = e.toString();
              }
            });
        submit("disable control.tether; disable event.possess; disable authority.recovery");
        next(6);
      } else if (phase == 6
          && seconds() > 2
          && idle()
          && !Jsons.b(fields(), "control.tether.active")
          && !Jsons.b(fields(), "event.possess.active")
          && Jsons.i(Jsons.o(research(), "counter"), "revision") >= 3) {
        check(serverChecks, "malformed, over-budget and stale programs have no native effects");
        check(
            !Jsons.b(fields(), "authority.recovery.active"),
            "recovery authority revoked outside replaceable instance");
        check(!Jsons.b(fields(), "world.frozen"), "cutting control restores actual MC world time");
        check(
            Jsons.a(research(), "checkpoints").asList().stream()
                .noneMatch(e -> Jsons.b(e.getAsJsonObject(), "usable")),
            "existing intruder checkpoints cannot regain revoked recovery authority");
        capture();
        var runtimeServer = mc.getSingleplayerServer();
        var runtimeId = mc.player.getUUID();
        runtimeServer.execute(
            () -> {
              try {
                var rt = EffServer.run(runtimeId).arena.research;
                for (String forbidden :
                    List.of("restore checkpoint.origin", "emit event.possess")) {
                  var denied = rt.execute(forbidden, rt.revision(), "intruder");
                  if (Jsons.b(Jsons.a(denied, "steps").get(0).getAsJsonObject(), "accepted"))
                    throw new IllegalStateException("revoked native source unexpectedly executed");
                }
                sourceChecks = true;
              } catch (Exception e) {
                failure = e.toString();
              }
            });
        priorRevision = Jsons.i(research(), "revision");
        EffClient.send(Jsons.obj("op", "researchAdvice", "goal", "保全当前真实状态；不要重建外来者控制。"));
        next(7);
      } else if (phase == 7
          && seconds() > 1
          && idle()
          && sourceChecks
          && !Jsons.o(research(), "advice").isEmpty()) {
        check(
            Jsons.s(Jsons.o(research(), "advice"), "source").equals("local-model"),
            "protective aspect also uses real local inference");
        check(
            Jsons.i(research(), "revision") == priorRevision,
            "AI advice does not execute without human submission");
        capture();
        originalInstance = Jsons.s(research(), "instance");
        priorGeneration = Jsons.i(Jsons.o(EffClient.state, "native"), "generation");
        var server = mc.getSingleplayerServer();
        var id = mc.player.getUUID();
        server.execute(
            () -> {
              try {
                var player = server.getPlayerList().getPlayer(id);
                var observation = EffResearchAPI.observe(player);
                EffResearchAPI.submit(
                    player,
                    "save checkpoint.player; seal checkpoint.origin; rebuild instance.world",
                    Jsons.i(observation, "revision"));
              } catch (Exception e) {
                failure = e.toString();
              }
            });
        next(8);
      } else if (phase == 8
          && seconds() > 2
          && idle()
          && !originalInstance.equals(Jsons.s(research(), "instance"))
          && Jsons.b(Jsons.o(EffClient.state, "native"), "ready")) {
        check(
            Jsons.i(Jsons.o(EffClient.state, "native"), "generation") > priorGeneration,
            "extension SDK replaces real execution instance and native arena");
        check(
            !Jsons.b(fields(), "control.tether.active")
                && !Jsons.b(fields(), "event.possess.active"),
            "new instance inherits confirmed source cuts, not old control permissions");
        check(
            !fields().has("checkpoint.origin.active"),
            "sealed origin checkpoint is deleted before instance replacement");
        var diskServer = mc.getSingleplayerServer();
        var diskId = mc.player.getUUID();
        diskServer.execute(
            () -> {
              if (EffServer.run(diskId).arena.research.checkpointOnDisk("checkpoint.origin"))
                failure = "sealed native checkpoint file still exists";
            });
        check(
            sourceChecks,
            "revoked checkpoint restore and removed callback are rejected by real executors");
        capture();
        submit(
            "watch shield when entity.avatar.alive == false -> disable event.possess; erase"
                + " entity.avatar");
        next(9);
      } else if (phase == 9
          && seconds() > 2
          && idle()
          && !Jsons.b(fields(), "entity.avatar.alive")) {
        check(
            Jsons.a(research(), "watches").asList().stream()
                .anyMatch(e -> Jsons.b(e.getAsJsonObject(), "fired")),
            "player-authored conditional guard executes on actual entity state");
        check(
            !Jsons.b(fields(), "control.tether.active"),
            "AI cannot restore sealed intruder sources");
        capture();
        submit("refuse ending.owned");
        next(10);
      } else if (phase == 10 && Jsons.s(research(), "outcome").equals("won")) {
        check(Jsons.b(fields(), "world.exitOpen"), "ending refusal opens actual MC barrier blocks");
        check(
            !Jsons.b(fields(), "entity.avatar.alive"),
            "visual victory corresponds to actual absent opponent entity");
        capture();
        NativeTheatre.skip();
        mc.gui.setScreen(new EffScreen("research"));
        next(11);
      } else if (phase == 11 && seconds() > 2) {
        screenshot = true;
        next(12);
      } else if (phase == 12 && seconds() > 1) {
        EffClient.send(Jsons.obj("op", "leave"));
        next(13);
      } else if (phase == 13 && EffClient.state.isEmpty()) {
        check(
            !mc.getSingleplayerServer().tickRateManager().isFrozen(),
            "leaving research restores original world time");
        EffClient.send(Jsons.obj("op", "enter", "mode", "research"));
        next(14);
      } else if (phase == 14
          && Jsons.b(Jsons.o(EffClient.state, "native"), "ready")
          && Jsons.b(fields(), "entity.avatar.alive")) {
        var lossServer = mc.getSingleplayerServer();
        var lossId = mc.player.getUUID();
        lossServer.execute(
            () -> {
              try {
                var rt = EffServer.run(lossId).arena.research;
                var premature = rt.execute("commit ending.owned", rt.revision(), "intruder");
                if (Jsons.b(Jsons.a(premature, "steps").get(0).getAsJsonObject(), "accepted"))
                  throw new IllegalStateException("premature occupation committed");
                for (int i = 0; i < 3; i++)
                  rt.execute("restore checkpoint.origin", rt.revision(), "intruder");
                rt.execute("commit ending.owned; erase entity.avatar", rt.revision(), "intruder");
              } catch (Exception e) {
                failure = e.toString();
              }
            });
        next(15);
      } else if (phase == 15 && Jsons.s(research(), "outcome").equals("lost")) {
        check(
            Jsons.b(fields(), "control.tether.active") && Jsons.b(fields(), "world.frozen"),
            "native occupation requires restored control and retains actual possession");
        check(
            Jsons.b(fields(), "entity.avatar.alive"),
            "terminal commit stops remaining program instructions");
        check(
            !Jsons.b(fields(), "world.exitOpen"),
            "occupation failure keeps actual exit barrier closed");
        capture();
        EffClient.send(Jsons.obj("op", "leave"));
        next(16);
      } else if (phase == 16 && EffClient.state.isEmpty()) {
        check(
            !mc.getSingleplayerServer().tickRateManager().isFrozen(),
            "leaving a lost research battle also restores original world time");
        finish(mc, null);
      }
    } catch (Exception e) {
      finish(mc, e.toString());
    }
  }

  private static void finish(Minecraft mc, String error) {
    try {
      Path out = mc.gameDirectory.toPath().resolve("eff-research-qa");
      Files.createDirectories(out);
      Files.writeString(
          out.resolve("result.json"),
          Jsons.obj(
                  "ok",
                  error == null,
                  "error",
                  error,
                  "phase",
                  phase,
                  "checks",
                  checks,
                  "evidence",
                  evidence,
                  "lastState",
                  EffClient.state,
                  "pid",
                  ProcessHandle.current().pid())
              .toString());
      System.out.println("[EFF_RESEARCH_QA] " + (error == null ? "PASS" : error));
    } catch (Exception ignored) {
    }
    phase = 99;
    mc.stop();
  }

  public static void captureFrame(com.mojang.blaze3d.pipeline.RenderTarget target) {
    if (!ENABLED || !screenshot) return;
    screenshot = false;
    Minecraft mc = Minecraft.getInstance();
    Screenshot.grab(mc.gameDirectory, "research-editor-and-receipts.png", target, 1, c -> {});
  }

  private ResearchSelfTest() {}
}
