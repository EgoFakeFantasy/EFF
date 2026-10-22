package eff.minecraft.client;

import com.google.gson.*;
import com.mojang.blaze3d.platform.InputConstants;
import eff.minecraft.*;
import net.minecraft.client.*;
import net.minecraft.client.gui.*;
import net.minecraftforge.client.event.RegisterKeyMappingsEvent;
import net.minecraftforge.client.event.RenderGuiEvent;
import net.minecraftforge.common.MinecraftForge;
import net.minecraftforge.event.GameShuttingDownEvent;
import net.minecraftforge.event.TickEvent;
import net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext;

/** Client-only Forge event bindings; packet callbacks run on the game thread. */
public final class EffClient {
  public static JsonObject state = new JsonObject();
  public static String error = "";
  public static boolean reducedMotion = false, manualPause = false;
  private static KeyMapping menu, interact;
  private static long sequence;
  private static String opened = "";
  private static boolean pauseSent = false;

  public static void initialize() {
    menu = new KeyMapping("key.eff.menu", InputConstants.KEY_R, "key.categories.gameplay");
    interact = new KeyMapping("key.eff.interact", InputConstants.KEY_V, "key.categories.gameplay");
    FMLJavaModLoadingContext.get().getModEventBus().addListener(EffClient::registerKeys);
    EffPackets.setClientReceiver(EffClient::receive);
    MinecraftForge.EVENT_BUS.addListener(EffClient::tick);
    MinecraftForge.EVENT_BUS.addListener(EffClient::renderHud);
    MinecraftForge.EVENT_BUS.addListener(EffClient::shutdown);
  }

  private static void registerKeys(RegisterKeyMappingsEvent event) {
    event.register(menu);
    event.register(interact);
  }

  private static void shutdown(GameShuttingDownEvent event) {
    NativeTheatre.close();
    if (RuntimeLink.enabled())
      try {
        RuntimeLink.call(Jsons.obj("op", "goodbye"));
      } catch (Exception ignored) {
      }
  }

  private static void receive(String json) {
    try {
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
      String key = Jsons.i(Jsons.o(next, "story"), "revision") + ":" + Jsons.s(next, "mode");
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

    } catch (RuntimeException invalid) {
      error = "INVALID_SERVER_STATE";
    }
  }

  private static void tick(TickEvent.ClientTickEvent event) {
    if (event.phase != TickEvent.Phase.END) return;
    Minecraft mc = Minecraft.getInstance();
    RuntimeLink.clientTick(mc.isPaused(), mc.level != null);
    LegacyDev.prepare(mc);
    ManagedSelfTest.tick(mc);
    GuardedSelfTest.tick(mc);
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
  }

  private static void renderHud(RenderGuiEvent.Post event) {
    GuiGraphics g = event.getGuiGraphics();
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
  }

  public static void send(JsonObject request) {
    if (Jsons.s(request, "op").equals("enter")) {
      manualPause = false;
      pauseSent = false;
    }
    if (!EffPackets.canSendClient(
        Minecraft.getInstance().getConnection() == null
            ? null
            : Minecraft.getInstance().getConnection().getConnection())) {
      error = "请在安装了 EFF 模组的 Java 1.20.1 单人世界中进入。";
      return;
    }
    EffPackets.sendAction(request.toString());
  }
}
