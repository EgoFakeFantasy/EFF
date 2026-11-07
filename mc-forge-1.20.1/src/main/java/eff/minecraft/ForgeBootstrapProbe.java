package eff.minecraft;

/** Observes actual registration via ModLauncher's public API, never repairs or edits its registry. */
public final class ForgeBootstrapProbe {
  private static final java.util.Set<String> recorded = new java.util.HashSet<>();
  private ForgeBootstrapProbe() {}

  public static synchronized void snapshot(String phase) {
    if (!(Boolean.getBoolean("eff.pig2Lab") || Boolean.getBoolean("eff.foreverLoveLab")
        || Boolean.getBoolean("eff.entityGuardSelftest") || Boolean.getBoolean("eff.lifetimeSelftest")
        || !System.getProperty("eff.manualCombat", "").isEmpty())
        || recorded.size() >= 3 || !recorded.add(phase)) return;
    try {
      var launcher = cpw.mods.modlauncher.Launcher.INSTANCE;
      var gate = launcher.environment().findLaunchPlugin("eff_lifetime_field_gate");
      BootstrapDiagnostics.stage("launch-gate-" + phase,
          "registered=" + gate.isPresent() + ";implementation="
              + gate.map(plugin -> plugin.getClass().getName()).orElse("absent"));
    } catch (Exception | LinkageError error) {
      BootstrapDiagnostics.stage("launch-gate-" + phase,
          "query-failed=" + error.getClass().getName());
    }
  }
}
