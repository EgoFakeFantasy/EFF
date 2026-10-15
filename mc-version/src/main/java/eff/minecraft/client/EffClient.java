package eff.minecraft.client;

import com.google.gson.*;
import com.mojang.blaze3d.platform.InputConstants;
import eff.minecraft.*;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.minecraft.client.*;
import net.minecraft.client.gui.*;
import net.minecraft.resources.Identifier;

public final class EffClient implements ClientModInitializer {
  public static JsonObject state = new JsonObject();
  public static String error = "";
  public static boolean reducedMotion = false, manualPause = false;
  private static KeyMapping menu, interact;
  private static long sequence;
  private static String opened = "";
  private static boolean pauseSent = false;

  public void onInitializeClient() {
    menu =
        KeyMappingHelper.registerKeyMapping(
            new KeyMapping("key.eff.menu", InputConstants.KEY_R, KeyMapping.Category.GAMEPLAY));
    interact =
        KeyMappingHelper.registerKeyMapping(
            new KeyMapping("key.eff.interact", InputConstants.KEY_V, KeyMapping.Category.GAMEPLAY));
    ClientPlayNetworking.registerGlobalReceiver(
        EffPackets.State.TYPE,
        (payload, context) -> {
          JsonObject next = JsonParser.parseString(payload.json()).getAsJsonObject();
          Minecraft mc = Minecraft.getInstance();
          if (Jsons.b(next, "left")) {
            state = new JsonObject();
            sequence = 0;
            opened = "";
            manualPause = false;
            pauseSent = false;
            NativeTheatre.clear();
            if (mc.gui.screen() instanceof EffScreen) mc.gui.setScreen(null);
            return;
          }
          if (next.has("error")) {
            error = Jsons.s(next, "error");
            if (!(mc.gui.screen() instanceof EffScreen)) mc.gui.setScreen(new EffScreen("menu"));
            return;
          }
          if (Jsons.b(next, "menu")) {
            mc.gui.setScreen(new EffScreen("menu"));
            return;
          }
          long seq = Jsons.i(next, "sequence");
          if (seq <= sequence) return;
          sequence = seq;
          String oldMode = Jsons.s(state, "mode");
          state = next;
          if (!oldMode.equals(Jsons.s(next, "mode")) && mc.gui.screen() instanceof EffScreen)
            mc.gui.setScreen(
                new EffScreen(Jsons.s(next, "mode").equals("practice") ? "battle" : "story"));
          error = "";
          NativeTheatre.offer(Jsons.o(next, "cinema"));
          String key = Jsons.i(Jsons.o(next, "story"), "revision") + ":" + Jsons.s(next, "mode");
          boolean dialogue = Jsons.b(Jsons.o(Jsons.o(next, "story"), "dialog"), "active"),
              agency = Jsons.b(Jsons.o(Jsons.o(next, "story"), "agency"), "active"),
              rain = !Jsons.o(Jsons.o(next, "story"), "rain").isEmpty();
          boolean ending = !Jsons.o(Jsons.o(next, "story"), "ending").isEmpty();
          if (!key.equals(opened)
              && (dialogue
                  || agency
                  || rain
                  || ending
                  || Jsons.s(next, "mode").equals("practice"))) {
            if (mc.gui.screen() == null) {
              opened = key;
              mc.gui.setScreen(
                  new EffScreen(Jsons.s(next, "mode").equals("practice") ? "battle" : "story"));
            }
          }
          if (mc.gui.screen() instanceof EffScreen screen) screen.refresh();
        });
    ClientTickEvents.END_CLIENT_TICK.register(
        mc -> {
          EffSelfTest.tick(mc);
          EffPreview.tick(mc);
          if (mc.player == null) {
            state = new JsonObject();
            sequence = 0;
            opened = "";
            return;
          }
          while (menu.consumeClick())
            mc.gui.setScreen(
                new EffScreen(
                    state.isEmpty()
                        ? "menu"
                        : Jsons.s(state, "mode").equals("practice") ? "battle" : "story"));
          while (interact.consumeClick())
            send(Jsons.obj("op", "story", "input", Jsons.obj("action", "advance")));
          if (!state.isEmpty()) {
            boolean pause =
                manualPause
                    || !mc.isWindowActive()
                    || mc.isPaused() && !(mc.gui.screen() instanceof EffScreen);
            if (pause != pauseSent) {
              pauseSent = pause;
              send(Jsons.obj("op", "pause", "paused", pause));
            }
          }
        });
    HudElementRegistry.addLast(
        Identifier.fromNamespaceAndPath("eff", "fusion"),
        (g, dt) -> {
          Minecraft mc = Minecraft.getInstance();
          if (!state.isEmpty() && !(mc.gui.screen() instanceof EffScreen)) {
            JsonObject story = Jsons.o(state, "story"),
                facts = Jsons.o(Jsons.o(state, "native"), "facts");
            g.fill(5, 5, Math.min(g.guiWidth() - 5, 360), 31, 0xcc100e19);
            g.text(
                mc.font,
                "EFF / " + Jsons.s(story, "name") + "   第 " + Jsons.i(facts, "generation") + " 重表象",
                11,
                10,
                0xffd9cfae);
            g.text(
                mc.font,
                "R 展开 · V 调查  |  " + (Jsons.b(facts, "frozen") ? "世界时间停滞" : "世界时间流动"),
                11,
                21,
                0xff92c6c4);
          }
          if (mc.gui.screen() == null) NativeTheatre.draw(g);
        });
  }

  public static void send(JsonObject request) {
    if (Jsons.s(request, "op").equals("enter")) {
      manualPause = false;
      pauseSent = false;
    }
    if (!ClientPlayNetworking.canSend(EffPackets.Action.TYPE)) {
      error = "请在安装了 EFF 模组的 Java 26.3 单人世界中进入。";
      return;
    }
    ClientPlayNetworking.send(new EffPackets.Action(request.toString()));
  }
}
