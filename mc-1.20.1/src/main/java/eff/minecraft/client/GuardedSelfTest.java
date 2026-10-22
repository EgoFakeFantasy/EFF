package eff.minecraft.client;

import com.google.gson.*;
import eff.minecraft.*;
import java.nio.file.*;
import net.minecraft.client.Minecraft;

final class GuardedSelfTest {
  private static int phase;
  private static final boolean ALLOW_RULE_FALLBACK = Boolean.getBoolean("eff.guardedAllowFallback");
  private static final int GENERATION =
      Integer.parseInt(System.getenv().getOrDefault("EFF_RUNTIME_GUARD_GENERATION", "0"));
  private static long since;

  private static JsonObject r() {
    return Jsons.o(EffClient.state, "research");
  }

  private static void send(String program) {
    EffClient.send(
        Jsons.obj("op", "researchSubmit", "revision", Jsons.i(r(), "revision"), "source", program));
    phase++;
    since = System.nanoTime();
  }

  static void tick(Minecraft mc) {
    if (!Boolean.getBoolean("eff.guardedSelftest") || GENERATION == 0 || phase == 99) return;
    try {
      if (since != 0 && (System.nanoTime() - since) / 1e9 > 160)
        throw new IllegalStateException("GUARDED_NATIVE_TIMEOUT_" + phase + "_" + EffClient.error);
      if (!Jsons.b(Jsons.o(EffClient.state, "native"), "ready") || r().size() == 0) return;
      if (since == 0) since = System.nanoTime();
      JsonObject f = Jsons.o(r(), "fields");
      boolean idle = !Jsons.b(EffClient.state, "researchBusy");
      if (GENERATION == 1) {
        if (phase == 0
            && (ALLOW_RULE_FALLBACK || Jsons.b(Jsons.o(EffClient.state, "modelConfig"), "enabled"))
            && Jsons.b(f, "entity.avatar.alive")) send("erase entity.avatar");
        else if (phase == 1
            && idle
            && Jsons.b(f, "entity.avatar.alive")
            && (Jsons.s(Jsons.o(r(), "counter"), "source").equals("local-model")
                || ALLOW_RULE_FALLBACK
                    && Jsons.s(Jsons.o(r(), "counter"), "source").equals("rule-template"))) {
          proof(mc, "counter-recovered");
          send("disable control.tether; disable event.possess; disable authority.recovery");
        } else if (phase == 2 && idle && !Jsons.b(f, "authority.recovery.active")) {
          send("rebuild runtime.execution");
        } else if (phase == 3 && idle && engineGeneration() == 1) {
          proof(mc, "first-generated-engine");
          send("rebuild runtime.execution");
        } else if (phase == 4 && idle && engineGeneration() == 2) {
          proof(mc, "ready-for-controller-death");
          phase = 99;
        }
      } else if (GENERATION == 2) {
        if (phase == 0
            && idle
            && !Jsons.b(f, "authority.recovery.active")
            && !Jsons.b(f, "control.tether.active")
            && !Jsons.b(f, "event.possess.active")
            && engineGeneration() == 2) {
          proof(mc, "outer-ledger-restored");
          send("erase entity.avatar; refuse ending.owned");
        } else if (phase == 1
            && Jsons.s(r(), "outcome").equals("won")
            && Jsons.b(f, "world.exitOpen")) {
          proof(mc, "complete");
          phase = 99;
        }
      }
    } catch (Exception e) {
      try {
        Files.writeString(
            mc.gameDirectory.toPath().resolve("guarded-failure.json"),
            Jsons.obj("error", e.getMessage(), "generation", GENERATION, "state", r()).toString());
      } catch (Exception ignored) {
      }
      phase = 99;
      mc.stop();
    }
  }

  private static int engineGeneration() {
    return Jsons.i(
        Jsons.o(Jsons.o(Jsons.o(r(), "runtime"), "execution"), "engine")
            .getAsJsonObject("descriptor"),
        "generation");
  }

  private static void proof(Minecraft mc, String name) throws Exception {
    Path dir = mc.gameDirectory.toPath().resolve("guarded-proof");
    Files.createDirectories(dir);
    Files.writeString(
        dir.resolve(GENERATION + "-" + name + ".json"),
        Jsons.obj(
                "check",
                name,
                "generation",
                GENERATION,
                "mcPid",
                ProcessHandle.current().pid(),
                "research",
                r(),
                "native",
                Jsons.o(EffClient.state, "native"))
            .toString());
    System.out.println("[EFF_GUARDED_QA] " + name);
  }

  private GuardedSelfTest() {}
}
