package eff.minecraft.client;

import net.minecraft.client.Minecraft;
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
      mc.options.renderDistance().set(8);
      mc.options.simulationDistance().set(8);
      System.out.println("[EFF_DEV] ready screen=" + mc.screen.getClass().getName());
    }
  }
}
