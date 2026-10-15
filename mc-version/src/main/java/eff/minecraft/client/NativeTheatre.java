package eff.minecraft.client;

import com.google.gson.JsonObject;
import com.mojang.blaze3d.pipeline.*;
import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.renderpearl.api.textures.FilterMode;
import eff.minecraft.Jsons;
import java.util.*;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.network.chat.Component;

/** Captures Minecraft's actual render target. No browser canvas or OpenGL-specific calls. */
public final class NativeTheatre {
  private static volatile JsonObject cue = new JsonObject();
  private static volatile int requested = -1, captured = -2;
  private static volatile long began;
  private static TextureTarget capture;
  private static int frame;
  private static final ArrayDeque<Retired> retired = new ArrayDeque<>();

  private record Retired(TextureTarget target, int after) {}

  public static void offer(JsonObject next) {
    int serial = Jsons.i(next, "serial");
    if (serial <= requested) return;
    cue = next.deepCopy();
    requested = serial;
    began = 0;
    var mc = Minecraft.getInstance();
    var sound =
        Jsons.s(next, "kind").equals("rebuild")
            ? net.minecraft.sounds.SoundEvents.BEACON_DEACTIVATE
            : net.minecraft.sounds.SoundEvents.AMETHYST_BLOCK_CHIME;
    mc.getSoundManager()
        .play(net.minecraft.client.resources.sounds.SimpleSoundInstance.forUI(sound, .65f, .45f));
  }

  public static void captureFrame(RenderTarget source) {
    frame++;
    while (!retired.isEmpty() && retired.peek().after <= frame) {
      TextureTarget old = retired.remove().target;
      RenderSystem.queueFencedTask(old::destroyBuffers);
    }
    if (captured != requested && requested >= 0) {
      if (capture != null) retired.add(new Retired(capture, frame + 4));
      capture =
          new TextureTarget(
              "EFF surface fracture",
              source.width,
              source.height,
              source.getColorTexture().getFormat(),
              null);
      capture.copyColorFrom(source);
      captured = requested;
      began = System.nanoTime();
    }
    EffSelfTest.captureFrame(source);
    ResearchSelfTest.captureFrame(source);
  }

  public static void clear() {
    cue = new JsonObject();
    began = 0;
    requested = -1;
    captured = -2;
  }

  public static void skip() {
    began = 0;
  }

  public static double elapsed() {
    return began == 0 ? 100 : (System.nanoTime() - began) / 1e9;
  }

  public static boolean active() {
    return began != 0 && elapsed() < duration();
  }

  private static double duration() {
    String kind = Jsons.s(cue, "kind");
    return kind.equals("rebuild")
        ? 5.8
        : kind.equals("claim") ? 3.2 : kind.equals("arrive") ? 1.7 : 4.2;
  }

  public static void draw(GuiGraphicsExtractor g) {
    if (!active() || capture == null || captured != requested) return;
    double t = elapsed();
    int w = g.guiWidth(), h = g.guiHeight();
    String kind = Jsons.s(cue, "kind");
    var mc = Minecraft.getInstance();
    if (kind.equals("arrive")) {
      int alpha = (int) (Math.max(0, 1 - t / 1.7) * 220);
      g.fill(0, 0, w, h, (alpha << 24) | 0x090b14);
      return;
    }
    boolean rebuild = kind.equals("rebuild"), black = rebuild && t > 1.1 && t < 3.6;
    int color = kind.equals("past") || kind.equals("intervention") ? 0xffb8c9ea : 0xffc58698;
    if (EffClient.reducedMotion) {
      g.fill(0, 0, w, h, 0x99120d1a);
    } else if (black) {
      g.fill(0, 0, w, h, 0xff090910);
    } else if (!kind.equals("arrive")) {
      double force =
          Math.min(1, t / .75)
              * (rebuild ? Math.max(0, 1 - (t - 3.6) / 2.2) : Math.max(0, 1 - (t - 2.1) / 2.1));
      g.fill(0, 0, w, h, 0xff0b0710);
      var sampler = RenderSystem.getSamplerCache().getClampToEdge(FilterMode.NEAREST);
      int slices = 18;
      for (int i = 0; i < slices; i++) {
        int top = i * h / slices, bottom = (i + 1) * h / slices;
        double sign = i % 2 == 0 ? 1 : -1;
        int dx = (int) (sign * (10 + i * 1.9) * force), dy = (int) (Math.sin(i * 2.7) * 7 * force);
        g.blit(
            capture.getColorTextureView(),
            sampler,
            dx,
            top + dy,
            dx + w,
            bottom + dy,
            0,
            1,
            1 - (float) top / h,
            1 - (float) bottom / h);
        if (force > .3)
          g.fill(
              Math.max(0, dx),
              top + dy,
              Math.min(w, w + dx),
              top + dy + 1,
              (i % 3 == 0 ? 0xffa3d4d0 : 0xff6d3c65));
      }
    }
    if (black || t > .55) {
      int x = 15, y = Math.max(40, h / 5);
      g.fill(x - 6, y - 9, Math.min(w - 10, x + 360), Math.min(h - 30, y + 85), 0xcc0a0b14);
      JsonObject battle = Jsons.o(EffClient.state, "battle"),
          nativeState = Jsons.o(EffClient.state, "native");
      String[] code = {
        "// EFF / committed world projection",
        "entity.controller = " + Jsons.s(battle, "bodyOwner"),
        "authority.attribution = " + Jsons.s(battle, "attribution"),
        "ending.commit = " + Jsons.s(battle, "endingLock"),
        "world.generation = " + Jsons.i(nativeState, "generation"),
        "event.revision = " + Jsons.i(battle, "revision") + "; history retained"
      };
      if (Set.of("history", "intervention", "past").contains(kind)) {
        JsonObject finale = Jsons.o(Jsons.o(EffClient.state, "story"), "finale");
        code =
            new String[] {
              "// EFF / contested event history",
              "history.node = " + Jsons.s(finale, "node"),
              "past.authorized = " + Jsons.b(finale, "authorizedPast"),
              "timeline.rewind_step = " + Jsons.i(finale, "step"),
              "rewrite.committed = " + Jsons.b(finale, "rewritten"),
              "world.generation = " + Jsons.i(nativeState, "generation")
            };
      }
      int limit = Math.min(code.length, 1 + (int) (t * 4));
      for (int i = 0; i < limit; i++)
        g.text(mc.font, code[i], x, y + i * 11, i == 0 ? 0xff94b4bd : 0xffcabacb);
      String headline =
          switch (kind) {
            case "claim" -> "是谁在决定这具身体？";
            case "entity" -> "撕扯的力道，消失了一点。";
            case "attribution" -> "我否定这样的事情。";
            case "ending" -> "这样的结局绝不可能发生！";
            case "rebuild" -> t < 3.6 ? "世界表象失去响应" : "同一段现实，重新开始运行。";
            case "past" -> "过去也在回应此刻。";
            case "history" -> "连发生过的过程，也正在被争夺。";
            case "intervention" -> "那份请求，终于抵达无意识。";
            case "lost" -> "身体继续行动。决定它的，已经是他者。";
            default -> "无中归来者";
          };
      g.fill(0, h - 63, w, h, 0xdd100e19);
      g.text(mc.font, mc.font.plainSubstrByWidth(headline, w - 32), 16, h - 53, color);
      var quote = mc.font.split(Component.literal(Jsons.s(cue, "quote")), w - 32);
      for (int i = 0; i < Math.min(2, quote.size()); i++)
        g.text(mc.font, quote.get(i), 16, h - 39 + i * 11, 0xffd1c6ca);
      g.text(mc.font, "Esc / 点击：略过演出", w - 133, h - 12, 0xffa29aab);
    }
  }

  private NativeTheatre() {}
}
