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
    BootstrapDiagnostics.stage("forge-client-enter", "initialize");
    menu = new KeyMapping("key.eff.menu", InputConstants.KEY_R, "key.categories.gameplay");
    interact = new KeyMapping("key.eff.interact", InputConstants.KEY_V, "key.categories.gameplay");
    FMLJavaModLoadingContext.get().getModEventBus().addListener(EffClient::registerKeys);
    FMLJavaModLoadingContext.get().getModEventBus().addListener(EffClient::registerRenderers);
    EffPackets.setClientReceiver(EffClient::receive);
    MinecraftForge.EVENT_BUS.addListener(EffClient::tick);
    MinecraftForge.EVENT_BUS.addListener(EffClient::renderHud);
    MinecraftForge.EVENT_BUS.addListener(EffClient::observeKey);
    MinecraftForge.EVENT_BUS.addListener(EffClient::shutdown);
    BootstrapDiagnostics.stage("forge-client-ready", "listeners-registered");
  }

  private static void registerRenderers(
      net.minecraftforge.client.event.EntityRenderersEvent.RegisterRenderers event) {
    event.registerEntityRenderer(
        EffEntities.PROJECTION, EffProjectionRenderer::new);
  }

  private static void registerKeys(RegisterKeyMappingsEvent event) {
    event.register(menu);
    event.register(interact);
  }

  private static void observeKey(net.minecraftforge.client.event.InputEvent.Key event) {
    EntityGuardSelfTest.manualKeyEvent(
        event.getKey(), event.getScanCode(), event.getAction(), event.getModifiers());
  }

  private static void shutdown(GameShuttingDownEvent event) {
    NativeTheatre.close();
    RuntimeLink.shutdown();
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
      if (System.getProperty("eff.manualCombat", "").isEmpty() && !key.equals(opened)
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
    BootstrapDiagnostics.stage("forge-client-event", "wrapped=" + CoreTickScope.active(true));
    eff.minecraft.ForgeBootstrapProbe.snapshot("client");
    if (event.phase == TickEvent.Phase.END && !CoreTickScope.active(true)) coreTick();
  }

  public static void coreTick() {
    BootstrapDiagnostics.stage("client-core-tick", "wrapped=" + CoreTickScope.active(true));
    if (menu == null || interact == null) return;
    Minecraft mc = Minecraft.getInstance();
    try { RuntimeLink.clientTick(mc.isPaused(), mc.level != null); }
    catch (RuntimeException | LinkageError error) {
      BootstrapDiagnostics.failure("client-runtime-link", error, null);
      throw error;
    }
    LegacyDev.prepare(mc);
    ManagedSelfTest.tick(mc);
    GuardedSelfTest.tick(mc);
    EntityGuardSelfTest.tick(mc);
    LifetimeSelfTest.tick(mc);
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
                  && !Boolean.getBoolean("eff.entityGuardSelftest")
                  && !(Boolean.getBoolean("eff.pig2Lab")
                      || Boolean.getBoolean("eff.foreverLoveLab"))
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
