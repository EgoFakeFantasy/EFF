package eff.minecraft.client;

import com.google.gson.JsonObject;
import com.mojang.blaze3d.pipeline.*;
import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.vertex.*;
import eff.minecraft.Jsons;
import java.util.*;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.renderer.GameRenderer;
import net.minecraft.network.chat.Component;
import org.lwjgl.opengl.GL30;

/** Captures 1.20.1's actual OpenGL framebuffer for screen fracture and reconstruction. */
public final class NativeTheatre {
  private static volatile JsonObject cue = new JsonObject();
  private static volatile int requested = -1, captured = -2;
  private static volatile long began;
  private static TextureTarget capture;
  private static volatile boolean releaseRequested;
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
    if (releaseRequested || capture != null && began != 0 && elapsed() >= duration()) {
      // The finished cue never draws this texture again. Retire it on the render thread.
      if (capture != null) retired.add(new Retired(capture, frame + 4));
      capture = null;
      began = 0;
      releaseRequested = false;
    }
    while (!retired.isEmpty() && retired.peek().after <= frame) {
      TextureTarget old = retired.remove().target;
      old.destroyBuffers();
    }
    if (captured != requested && requested >= 0) {
      if (capture != null) retired.add(new Retired(capture, frame + 4));
      capture = new TextureTarget(source.width, source.height, false, Minecraft.ON_OSX);
      GL30.glBindFramebuffer(GL30.GL_READ_FRAMEBUFFER, source.frameBufferId);
      GL30.glBindFramebuffer(GL30.GL_DRAW_FRAMEBUFFER, capture.frameBufferId);
      GL30.glBlitFramebuffer(
          0,
          0,
          source.width,
          source.height,
          0,
          0,
          source.width,
          source.height,
          GL30.GL_COLOR_BUFFER_BIT,
          GL30.GL_NEAREST);
      source.bindWrite(true);
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
    releaseRequested = true;
  }

  public static void skip() {
    began = 0;
    releaseRequested = true;
  }

  public static void close() {
    clear();
    if (RenderSystem.isOnRenderThread()) releaseBuffers();
    else RenderSystem.recordRenderCall(NativeTheatre::releaseBuffers);
  }

  private static void releaseBuffers() {
    if (capture != null) capture.destroyBuffers();
    capture = null;
    while (!retired.isEmpty()) retired.remove().target.destroyBuffers();
    releaseRequested = false;
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

  public static void draw(GuiGraphics g) {
    if (!active() || capture == null || captured != requested) return;
    g.pose().pushPose();
    // 1.20.1's text/widgets write GUI depth; the fracture must cover that same rendered window.
    g.pose().translate(0, 0, 400);
    try {
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
        g.flush();
        int slices = 18;
        for (int i = 0; i < slices; i++) {
          int top = i * h / slices, bottom = (i + 1) * h / slices;
          double sign = i % 2 == 0 ? 1 : -1;
          int dx = (int) (sign * (10 + i * 1.9) * force),
              dy = (int) (Math.sin(i * 2.7) * 7 * force);
          blitFrame(
              g,
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
          g.drawString(mc.font, code[i], x, y + i * 11, i == 0 ? 0xff94b4bd : 0xffcabacb);
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
        g.drawString(mc.font, mc.font.plainSubstrByWidth(headline, w - 32), 16, h - 53, color);
        var quote = mc.font.split(Component.literal(Jsons.s(cue, "quote")), w - 32);
        for (int i = 0; i < Math.min(2, quote.size()); i++)
          g.drawString(mc.font, quote.get(i), 16, h - 39 + i * 11, 0xffd1c6ca);
        g.drawString(mc.font, "Esc / 点击：略过演出", w - 133, h - 12, 0xffa29aab);
      }
    } finally {
      g.flush();
      g.pose().popPose();
    }
  }

  private static void blitFrame(
      GuiGraphics g,
      int left,
      int top,
      int right,
      int bottom,
      float u0,
      float u1,
      float v0,
      float v1) {
    RenderSystem.setShader(GameRenderer::getPositionTexShader);
    RenderSystem.setShaderTexture(0, capture.getColorTextureId());
    RenderSystem.setShaderColor(1, 1, 1, 1);
    var matrix = g.pose().last().pose();
    var b = Tesselator.getInstance().getBuilder();
    b.begin(VertexFormat.Mode.QUADS, DefaultVertexFormat.POSITION_TEX);
    b.vertex(matrix, left, top, 0).uv(u0, v0).endVertex();
    b.vertex(matrix, left, bottom, 0).uv(u0, v1).endVertex();
    b.vertex(matrix, right, bottom, 0).uv(u1, v1).endVertex();
    b.vertex(matrix, right, top, 0).uv(u1, v0).endVertex();
    BufferUploader.drawWithShader(b.end());
  }

  private NativeTheatre() {}
}
