package eff.minecraft.client;

import net.minecraft.client.*;
import net.minecraft.client.gui.screens.TitleScreen;

/** Options only for owned opt-in dev worlds; ordinary installation leaves user options alone. */
final class LegacyDev {
  private static boolean logged;

  static void prepare(Minecraft mc) {
    if (!Boolean.getBoolean("eff.preview")
        && !Boolean.getBoolean("eff.selftest")
        && !Boolean.getBoolean("eff.researchSelftest")) return;
    mc.options.pauseOnLostFocus = false;
    mc.options.onboardAccessibility = false;
    if (mc.screen != null
        && mc.screen.getClass().getSimpleName().equals("AccessibilityOnboardingScreen"))
      mc.setScreen(new TitleScreen());
    if (!logged && mc.getOverlay() == null && mc.screen != null) {
      logged = true;
      mc.options.guiScale().set(2);
      boolean lowMemory = Boolean.getBoolean("eff.lowMemory");
      int render =
          Math.max(2, Math.min(16, Integer.getInteger("eff.renderDistance", lowMemory ? 2 : 8)));
      // Vanilla 1.20.1 rejects simulation distances below five and resets them to its default.
      int simulation =
          Math.max(
              5, Math.min(16, Integer.getInteger("eff.simulationDistance", lowMemory ? 5 : 8)));
      mc.options.renderDistance().set(render);
      mc.options.simulationDistance().set(simulation);
      if (lowMemory) {
        mc.options.graphicsMode().set(GraphicsStatus.FAST);
        mc.options.cloudStatus().set(CloudStatus.OFF);
        mc.options.ambientOcclusion().set(false);
        mc.options.mipmapLevels().set(0);
        mc.options.biomeBlendRadius().set(0);
        mc.options.entityShadows().set(false);
        mc.options.framerateLimit().set(60);
      }
      System.out.println(
          "[EFF_DEV] ready screen="
              + mc.screen.getClass().getName()
              + " lowMemory="
              + lowMemory
              + " renderDistance="
              + render
              + " simulationDistance="
              + simulation);
    }
  }
}
