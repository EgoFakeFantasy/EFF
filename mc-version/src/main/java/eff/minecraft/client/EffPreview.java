package eff.minecraft.client;

import eff.minecraft.*;
import java.nio.file.*;
import net.minecraft.client.*;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.client.tutorial.TutorialSteps;
import net.minecraft.world.Difficulty;
import net.minecraft.world.level.*;
import net.minecraft.world.level.levelgen.*;
import net.minecraft.world.level.levelgen.presets.WorldPresets;

/** Explicit development preview; only opens a world created in this isolated run directory. */
public final class EffPreview {
  private static final boolean ENABLED =
      Boolean.getBoolean("eff.preview") && !Boolean.getBoolean("eff.selftest");
  private static int phase;
  private static long requestedAt;
  private static boolean wantsModel;
  private static String name = "eff-playground";

  public static void tick(Minecraft mc) {
    if (!ENABLED || phase >= 5) return;
    try {
      if (phase == 0 && mc.isGameLoadFinished() && mc.level == null) {
        mc.getTutorial().setStep(TutorialSteps.NONE);
        Path saves = mc.gameDirectory.toPath().resolve("saves"), world = saves.resolve(name);
        if (Files.isRegularFile(world.resolve("eff-preview.marker"))) {
          mc.createWorldOpenFlows().openWorld(name, () -> mc.gui.setScreen(new TitleScreen()));
        } else {
          if (Files.exists(world)) name += "-" + System.currentTimeMillis();
          mc.createWorldOpenFlows()
              .createFreshLevel(
                  name,
                  new LevelSettings(
                      "EFF · MC 表象融合试玩",
                      GameType.CREATIVE,
                      new LevelSettings.DifficultySettings(Difficulty.PEACEFUL, false, false),
                      true,
                      WorldDataConfiguration.DEFAULT),
                  new WorldOptions(271828, false, false),
                  WorldPresets::createTestWorldDimensions,
                  new TitleScreen());
        }
        phase = 1;
      } else if (phase == 1 && mc.player != null && mc.level != null) {
        Files.writeString(
            mc.gameDirectory.toPath().resolve("saves").resolve(name).resolve("eff-preview.marker"),
            "EFF owned development preview");
        EffClient.send(Jsons.obj("op", "enter", "mode", "practice"));
        phase = 2;
      } else if (phase == 2 && Jsons.b(Jsons.o(EffClient.state, "native"), "ready")) {
        EffClient.manualPause = true;
        EffClient.send(Jsons.obj("op", "pause", "paused", true));
        EffClient.send(Jsons.obj("op", "modelStatus"));
        phase = 3;
        requestedAt = System.nanoTime();
      } else if (phase == 3 && !Jsons.a(EffClient.state, "models").isEmpty()) {
        String model = "";
        for (var m : Jsons.a(EffClient.state, "models"))
          if (m.getAsString().equals("qwen3.5:4b")) model = m.getAsString();
        if (!model.isEmpty()) {
          EffClient.send(
              Jsons.obj(
                  "op", "modelConfigure", "enabled", true, "model", model, "profile", "patient"));
          phase = 4;
          wantsModel = true;
          requestedAt = System.nanoTime();
        } else {
          phase = 4;
          wantsModel = false;
        }
      } else if ((phase == 3
              && (!EffClient.error.isEmpty() || (System.nanoTime() - requestedAt) / 1e9 > 5))
          || phase == 4
              && (!wantsModel
                  || Jsons.b(Jsons.o(EffClient.state, "modelConfig"), "enabled")
                  || (System.nanoTime() - requestedAt) / 1e9 > 5)) {
        Path out = mc.gameDirectory.toPath().resolve("eff-preview.json");
        Files.writeString(
            out,
            Jsons.obj(
                    "ready",
                    true,
                    "pid",
                    ProcessHandle.current().pid(),
                    "model",
                    Jsons.o(EffClient.state, "modelConfig"),
                    "paused",
                    true)
                .toString());
        mc.gui.setScreen(new EffScreen("battle"));
        phase = 5;
      }
    } catch (Exception e) {
      EffClient.error = "试玩启动失败：" + e.getMessage();
      phase = 5;
      mc.gui.setScreen(new EffScreen("menu"));
    }
  }

  private EffPreview() {}
}
