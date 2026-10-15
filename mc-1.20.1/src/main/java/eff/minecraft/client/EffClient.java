package eff.minecraft.client;

import com.google.gson.*;
import com.mojang.blaze3d.platform.InputConstants;
import eff.minecraft.*;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.minecraft.client.*;
import net.minecraft.client.gui.*;

public final class EffClient implements ClientModInitializer {
  public static JsonObject state = new JsonObject();
  public static String error = "";
  public static boolean reducedMotion = false, manualPause = false;
  private static KeyMapping menu, interact;
  private static long sequence;
  private static String opened = "";
  private static boolean pauseSent = false;

  public void onInitializeClient() {
    net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents.CLIENT_STOPPING
        .register(
            mc -> {
              if (RuntimeLink.enabled())
                try {
                  RuntimeLink.call(Jsons.obj("op", "goodbye"));
                } catch (Exception ignored) {
                }
            });
    menu =
        KeyBindingHelper.registerKeyBinding(
            new KeyMapping("key.eff.menu", InputConstants.KEY_R, "key.categories.gameplay"));
    interact =
        KeyBindingHelper.registerKeyBinding(
            new KeyMapping("key.eff.interact", InputConstants.KEY_V, "key.categories.gameplay"));
    ClientPlayNetworking.registerGlobalReceiver(
        EffPackets.STATE,
        (client, handler, buf, response) -> {
          final String json = buf.readUtf(262144);
          client.execute(
              () -> {
                JsonObject next = JsonParser.parseString(json).getAsJsonObject();
                Minecraft mc = Minecraft.getInstance();
                if (Jsons.b(next, "left")) {
                  state = new JsonObject();
                  sequence = 0;
                  opened = "";
                  manualPause = false;
                  pauseSent = false;
                  NativeTheatre.clear();
                  if (mc.screen instanceof EffScreen) mc.setScreen(null);
                  return;
                }
                if (next.has("error")) {
                  error = Jsons.s(next, "error");
                  if (!(mc.screen instanceof EffScreen)) mc.setScreen(new EffScreen("menu"));
                  return;
                }
                if (Jsons.b(next, "menu")) {
                  mc.setScreen(new EffScreen("menu"));
                  return;
                }
                long seq = Jsons.i(next, "sequence");
                if (seq <= sequence) return;
                sequence = seq;
                String oldMode = Jsons.s(state, "mode");
                state = next;
                if (!oldMode.equals(Jsons.s(next, "mode")) && mc.screen instanceof EffScreen)
                  mc.setScreen(
                      new EffScreen(
                          Jsons.s(next, "mode").equals("research")
                              ? "research"
                              : Jsons.s(next, "mode").equals("practice") ? "battle" : "story"));
                error = "";
                NativeTheatre.offer(Jsons.o(next, "cinema"));
                String key =
                    Jsons.i(Jsons.o(next, "story"), "revision") + ":" + Jsons.s(next, "mode");
                boolean dialogue = Jsons.b(Jsons.o(Jsons.o(next, "story"), "dialog"), "active"),
                    agency = Jsons.b(Jsons.o(Jsons.o(next, "story"), "agency"), "active"),
                    rain = (Jsons.o(Jsons.o(next, "story"), "rain").size() != 0);
                boolean ending = (Jsons.o(Jsons.o(next, "story"), "ending").size() != 0);
                if (!key.equals(opened)
                    && (dialogue
                        || agency
                        || rain
                        || ending
                        || Jsons.s(next, "mode").equals("practice")
                        || Jsons.s(next, "mode").equals("research"))) {
                  if (mc.screen == null) {
                    opened = key;
                    mc.setScreen(
                        new EffScreen(
                            Jsons.s(next, "mode").equals("research")
                                ? "research"
                                : Jsons.s(next, "mode").equals("practice") ? "battle" : "story"));
                  }
                }
                if (mc.screen instanceof EffScreen screen) screen.refresh();
              });
        });
    ClientTickEvents.END_CLIENT_TICK.register(
        mc -> {
          RuntimeLink.clientTick(mc.isPaused(), mc.level != null);
          LegacyDev.prepare(mc);
          ManagedSelfTest.tick(mc);
          EffSelfTest.tick(mc);
          ResearchSelfTest.tick(mc);
          EffPreview.tick(mc);
          if (mc.player == null) {
            state = new JsonObject();
            sequence = 0;
            opened = "";
            return;
          }
          while (menu.consumeClick())
            mc.setScreen(
                new EffScreen(
                    (state.size() == 0)
                        ? "menu"
                        : Jsons.s(state, "mode").equals("research")
                            ? "research"
                            : Jsons.s(state, "mode").equals("practice") ? "battle" : "story"));
          while (interact.consumeClick())
            send(Jsons.obj("op", "story", "input", Jsons.obj("action", "advance")));
          if ((state.size() != 0)) {
            boolean pause =
                manualPause
                    || !mc.isWindowActive()
                        && !Boolean.getBoolean("eff.researchSelftest")
                        && !Boolean.getBoolean("eff.selftest")
                    || mc.isPaused() && !(mc.screen instanceof EffScreen);
            if (pause != pauseSent) {
              pauseSent = pause;
              send(Jsons.obj("op", "pause", "paused", pause));
            }
          }
        });
    HudRenderCallback.EVENT.register(
        (g, dt) -> {
          Minecraft mc = Minecraft.getInstance();
          if ((state.size() != 0) && !(mc.screen instanceof EffScreen)) {
            JsonObject story = Jsons.o(state, "story"),
                facts = Jsons.o(Jsons.o(state, "native"), "facts");
            g.fill(5, 5, Math.min(g.guiWidth() - 5, 360), 31, 0xcc100e19);
            g.drawString(
                mc.font,
                "EFF / " + Jsons.s(story, "name") + "   第 " + Jsons.i(facts, "generation") + " 重表象",
                11,
                10,
                0xffd9cfae);
            g.drawString(
                mc.font,
                "R 展开 · V 调查  |  " + (Jsons.b(facts, "frozen") ? "世界时间停滞" : "世界时间流动"),
                11,
                21,
                0xff92c6c4);
          }
          if (mc.screen == null) NativeTheatre.draw(g);
        });
  }

  public static void send(JsonObject request) {
    if (Jsons.s(request, "op").equals("enter")) {
      manualPause = false;
      pauseSent = false;
    }
    if (!ClientPlayNetworking.canSend(EffPackets.ACTION)) {
      error = "请在安装了 EFF 模组的 Java 1.20.1 单人世界中进入。";
      return;
    }
    ClientPlayNetworking.send(EffPackets.ACTION, EffPackets.encode(request.toString(), 8192));
  }
}
