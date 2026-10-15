package eff.minecraft.client;

import com.google.gson.*;
import com.mojang.blaze3d.pipeline.RenderTarget;
import eff.minecraft.*;
import java.nio.file.*;
import java.util.*;
import net.minecraft.client.*;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.world.Difficulty;
import net.minecraft.world.level.*;
import net.minecraft.world.level.levelgen.*;
import net.minecraft.world.level.levelgen.presets.WorldPresets;

/** Opt-in development harness. Uses only this game's own API and disposable dev worlds. */
public final class EffSelfTest {
  private static final boolean ENABLED = Boolean.getBoolean("eff.selftest");
  private static int phase = 0;
  private static long since = System.nanoTime();
  private static volatile String screenshot = "";
  private static final List<String> checks = new ArrayList<>();
  private static JsonObject modelProof = new JsonObject(), finalProof = new JsonObject();
  private static int generation;
  private static boolean delayedShot;
  private static boolean revealShot;
  private static String originalDimension = "";

  private static double seconds() {
    return (System.nanoTime() - since) / 1e9;
  }

  private static void next(int p) {
    phase = p;
    since = System.nanoTime();
    delayedShot = false;
    revealShot = false;
  }

  private static void check(boolean b, String label) {
    if (!b) throw new IllegalStateException(label);
    checks.add(label);
    System.out.println("[EFF_QA] " + label);
  }

  public static void tick(Minecraft mc) {
    if (!ENABLED || phase == 99) return;
    try {
      if ((phase == 10 || phase == 12 || phase == 14) && seconds() > .8 && !delayedShot) {
        delayedShot = true;
        screenshot =
            phase == 10
                ? "04-body-fracture.png"
                : phase == 12 ? "05-attribution-fracture.png" : "08-rebuild-blackout.png";
      }
      if (phase == 14 && seconds() > 4.5 && !revealShot) {
        revealShot = true;
        screenshot = "09-new-surface.png";
      }
      if (seconds() > 240) throw new IllegalStateException("PHASE_TIMEOUT_" + phase);
      if (phase == 0 && (mc.screen instanceof TitleScreen && mc.getOverlay() == null)) {
        mc.getTutorial().setStep(net.minecraft.client.tutorial.TutorialSteps.NONE);
        mc.createWorldOpenFlows()
            .createFreshLevel(
                "eff-native-qa-" + System.currentTimeMillis(),
                new LevelSettings(
                    "EFF disposable native QA",
                    GameType.CREATIVE,
                    false,
                    Difficulty.PEACEFUL,
                    true,
                    new GameRules(),
                    WorldDataConfiguration.DEFAULT),
                new WorldOptions(271828, false, false),
                WorldPresets::createNormalWorldDimensions);
        next(1);
      } else if (phase == 1 && mc.player != null && mc.level != null) {
        originalDimension = mc.level.dimension().location().toString();
        EffClient.send(Jsons.obj("op", "enter", "mode", "story"));
        next(2);
      } else if (phase == 2 && Jsons.b(Jsons.o(EffClient.state, "native"), "ready")) {
        check(mc.level.dimension().equals(EffArena.DIM), "native EFF dimension entered");
        check(
            Jsons.s(Jsons.o(EffClient.state, "story"), "area").equals("mirror"),
            "unchanged original story starts in mirror");
        screenshot = "01-mirror.png";
        next(3);
      } else if (phase == 3 && seconds() > 3) {
        EffClient.send(Jsons.obj("op", "enter", "mode", "practice"));
        next(4);
      } else if (phase == 4
          && Jsons.s(EffClient.state, "mode").equals("practice")
          && Jsons.b(Jsons.o(EffClient.state, "native"), "ready")
          && seconds() > 4) {
        var n = Jsons.o(EffClient.state, "native");
        generation = Jsons.i(n, "generation");
        check(
            Jsons.b(Jsons.o(n, "facts"), "frozen"),
            "Minecraft 1.20.1 simulation frozen at body claim");
        check(
            Jsons.s(Jsons.o(n, "facts"), "controller").equals("contested"),
            "native controller reflects unresolved ownership");
        screenshot = "02-court-claimed.png";
        EffClient.send(Jsons.obj("op", "modelStatus"));
        next(5);
      } else if (phase == 5 && seconds() > 2) {
        String chosen = "";
        for (var m : Jsons.a(EffClient.state, "models"))
          if (m.getAsString().equals("qwen3.5:4b")) chosen = m.getAsString();
        if (!chosen.isEmpty()) {
          EffClient.send(
              Jsons.obj(
                  "op", "modelConfigure", "enabled", true, "model", chosen, "profile", "patient"));
          next(6);
        } else {
          checks.add("local model unavailable; rule fallback QA only");
          next(7);
        }
      } else if (phase == 6 && Jsons.b(Jsons.o(EffClient.state, "modelConfig"), "enabled")) {
        check(true, "local model enabled through native MC packet");
        next(7);
      } else if (phase == 7 && seconds() > 2) {
        EffClient.send(Jsons.obj("op", "plan", "goal", "body", "risk", "low"));
        next(8);
      } else if (phase == 8 && (Jsons.o(EffClient.state, "plan").size() != 0)) {
        JsonObject plan = Jsons.o(EffClient.state, "plan");
        modelProof = plan.deepCopy();
        checks.add("defender source: " + Jsons.s(Jsons.o(plan, "player"), "source"));
        checks.add("intruder source: " + Jsons.s(Jsons.o(plan, "intruder"), "source"));
        screenshot = "03-dual-agent-plan.png";
        EffClient.send(Jsons.obj("op", "resolve", "goal", "body", "useAgent", false));
        next(9);
      } else if (phase == 9 && Jsons.i(Jsons.o(EffClient.state, "battle"), "revision") == 1) {
        check(
            !Jsons.b(Jsons.o(Jsons.o(EffClient.state, "native"), "facts"), "frozen"),
            "body response releases actual MC world time");
        screenshot = "04-body-fracture.png";
        next(10);
      } else if (phase == 10 && seconds() > 5) {
        EffClient.send(Jsons.obj("op", "resolve", "goal", "attribution", "useAgent", false));
        next(11);
      } else if (phase == 11 && Jsons.i(Jsons.o(EffClient.state, "battle"), "revision") == 2) {
        check(
            Jsons.s(Jsons.o(Jsons.o(EffClient.state, "native"), "facts"), "attribution")
                .equals("rejected"),
            "attribution changes independently of body and exit");
        screenshot = "05-attribution-fracture.png";
        next(12);
      } else if (phase == 12 && seconds() > 5) {
        EffClient.send(Jsons.obj("op", "resolve", "goal", "bad_owned", "useAgent", false));
        next(13);
      } else if (phase == 13
          && Jsons.s(Jsons.o(EffClient.state, "battle"), "outcome").equals("won")
          && Jsons.b(Jsons.o(EffClient.state, "native"), "ready")) {
        finalProof = EffClient.state.deepCopy();
        check(
            Jsons.i(Jsons.o(EffClient.state, "native"), "generation") > generation,
            "new native world projection generated after ending refusal");
        check(
            Jsons.b(Jsons.o(Jsons.o(EffClient.state, "native"), "facts"), "exitOpen"),
            "native exit predicate opened");
        screenshot = "06-world-rebuild.png";
        next(14);
      } else if (phase == 14 && seconds() > 7) {
        mc.setScreen(null);
        screenshot = "07-native-world.png";
        next(15);
      } else if (phase == 15 && seconds() > 3) {
        EffClient.send(Jsons.obj("op", "leave"));
        next(16);
      } else if (phase == 16
          && (EffClient.state.size() == 0)
          && mc.level.dimension().location().toString().equals(originalDimension)) {
        check(mc.player.isCreative(), "original MC game mode restored");
        check(
            !LegacyFreeze.of(mc.getSingleplayerServer()).isFrozen(),
            "MC tick state restored on return");
        EffClient.send(Jsons.obj("op", "enter", "mode", "practice"));
        next(17);
      } else if (phase == 17
          && Jsons.s(Jsons.o(EffClient.state, "battle"), "outcome").equals("lost")) {
        check(
            Jsons.s(Jsons.o(Jsons.o(EffClient.state, "native"), "facts"), "controller")
                .equals("intruder"),
            "decision deadline transfers native body controller to intruder");
        screenshot = "10-timeout-possession.png";
        EffClient.send(Jsons.obj("op", "leave"));
        next(18);
      } else if (phase == 18
          && (EffClient.state.size() == 0)
          && mc.level.dimension().location().toString().equals(originalDimension)) {
        EffClient.send(Jsons.obj("op", "enter", "mode", "practice"));
        next(19);
      } else if (phase == 19 && Jsons.b(Jsons.o(EffClient.state, "native"), "ready")) {
        var server = mc.getSingleplayerServer();
        var id = mc.player.getUUID();
        server.execute(
            () -> {
              var run = EffServer.run(id);
              if (run != null) run.bridge.close();
            });
        next(20);
      } else if (phase == 20
          && (EffClient.state.size() == 0)
          && mc.level.dimension().location().toString().equals(originalDimension)) {
        check(
            !LegacyFreeze.of(mc.getSingleplayerServer()).isFrozen(),
            "owned bridge failure restores native MC world and time");
        finish(mc, null);
      }
    } catch (Exception e) {
      finish(mc, e.toString());
    }
  }

  private static void finish(Minecraft mc, String error) {
    try {
      Path output = mc.gameDirectory.toPath().resolve("eff-qa");
      Files.createDirectories(output);
      Files.writeString(
          output.resolve("result.json"),
          Jsons.obj(
                  "ok",
                  error == null,
                  "error",
                  error,
                  "checks",
                  checks,
                  "modelProof",
                  modelProof,
                  "finalBattle",
                  Jsons.o(finalProof, "battle"),
                  "nativeWorld",
                  Jsons.o(finalProof, "native"),
                  "receipts",
                  Jsons.a(finalProof, "receipts"),
                  "javaProcess",
                  ProcessHandle.current().pid(),
                  "phase",
                  phase)
              .toString());
      System.out.println("[EFF_QA] " + (error == null ? "PASS" : error));
    } catch (Exception ignored) {
    }
    phase = 99;
    if (!Boolean.getBoolean("eff.keepPreview")) mc.stop();
    else mc.setScreen(new EffScreen("menu"));
  }

  public static void captureFrame(RenderTarget target) {
    if (!ENABLED || screenshot.isEmpty()) return;
    String name = screenshot;
    screenshot = "";
    Minecraft mc = Minecraft.getInstance();
    Screenshot.grab(mc.gameDirectory, name, target, c -> {});
  }

  private EffSelfTest() {}
}
