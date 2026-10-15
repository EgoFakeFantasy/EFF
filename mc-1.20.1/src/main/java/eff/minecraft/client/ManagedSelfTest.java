package eff.minecraft.client;

import com.google.gson.*;
import eff.minecraft.*;
import java.nio.file.*;
import net.minecraft.client.Minecraft;

/** Opt-in native regression, intentionally kills ONLY the managed Minecraft child. */
final class ManagedSelfTest {
  private static int phase;
  private static volatile String failure = "";
  private static volatile boolean deniedRestore;
  private static long since = System.nanoTime();

  private static JsonObject r() {
    return Jsons.o(EffClient.state, "research");
  }

  private static void submit(String source) {
    EffClient.send(
        Jsons.obj("op", "researchSubmit", "source", source, "revision", Jsons.i(r(), "revision")));
    phase++;
    since = System.nanoTime();
  }

  static void tick(Minecraft mc) {
    if (!Boolean.getBoolean("eff.managedSelftest") || !RuntimeLink.enabled() || phase == 99) return;
    try {
      if (!failure.isEmpty()) throw new IllegalStateException(failure);
      if ((System.nanoTime() - since) / 1e9 > 170)
        throw new IllegalStateException("MANAGED_NATIVE_TIMEOUT_" + phase + "_" + EffClient.error);
      if (!Jsons.b(Jsons.o(EffClient.state, "native"), "ready") || r().size() == 0) return;
      JsonObject f = Jsons.o(r(), "fields");
      boolean idle = !Jsons.b(EffClient.state, "researchBusy");
      if (RuntimeLink.EPOCH == 1) {
        if (phase == 0
            && Jsons.b(f, "entity.avatar.alive")
            && Jsons.b(Jsons.o(EffClient.state, "modelConfig"), "enabled"))
          submit("erase entity.avatar");
        else if (phase == 1
            && idle
            && Jsons.s(Jsons.o(r(), "counter"), "source").equals("local-model")
            && Jsons.b(f, "entity.avatar.alive")) {
          proof(mc, "local-model-recovered-native-avatar");
          submit("disable control.tether; disable event.possess; disable authority.recovery");
        } else if (phase == 2 && idle && !Jsons.b(f, "authority.recovery.active")) {
          proof(mc, "revocation-committed");
          submit("rebuild runtime.execution; rebuild runtime.policy");
        } else if (phase == 3
            && idle
            && Jsons.i(Jsons.o(Jsons.o(r(), "runtime"), "execution"), "epoch") >= 2) {
          proof(mc, "two-real-worker-jvms-replaced");
          submit("rebuild runtime.host");
        }
      } else if (RuntimeLink.EPOCH > 2) {
        if (phase == 0 && Jsons.s(r(), "outcome").equals("won") && Jsons.b(f, "world.exitOpen")) {
          proof(mc, "unexpected-jvm-death-preserved-native-victory");
          submitFinished(mc);
        }
      } else if (RuntimeLink.EPOCH == 2) {
        if (phase == 0
            && idle
            && !Jsons.b(f, "authority.recovery.active")
            && !Jsons.b(f, "control.tether.active")
            && !Jsons.b(f, "event.possess.active")) {
          proof(mc, "whole-minecraft-jvm-resumed-revoked-state");
          var id = mc.player.getUUID();
          mc.getSingleplayerServer()
              .execute(
                  () -> {
                    var run = EffServer.run(id);
                    try {
                      var denied =
                          run.arena.research.execute(
                              "restore checkpoint.origin",
                              run.arena.research.revision(),
                              "intruder");
                      if (!denied.toString().contains("RECOVERY_AUTHORITY_REVOKED"))
                        throw new IllegalStateException("REVOKED_AI_RESTORE_ACCEPTED");
                      deniedRestore = true;
                    } catch (Exception e) {
                      failure = e.getMessage();
                    }
                  });
          submit("erase entity.avatar; refuse ending.owned");
        } else if (phase == 1
            && deniedRestore
            && Jsons.s(r(), "outcome").equals("won")
            && Jsons.b(f, "world.exitOpen")) {
          proof(mc, "native-exit-open-after-host-replacement");
          submitFinished(mc);
        }
      }
    } catch (Exception e) {
      try {
        Files.writeString(
            mc.gameDirectory.toPath().resolve("managed-failure.json"),
            Jsons.obj("error", e.getMessage(), "epoch", RuntimeLink.EPOCH, "state", r())
                .toString());
      } catch (Exception ignored) {
      }
      phase = 99;
      mc.stop();
    }
  }

  private static void proof(Minecraft mc, String check) throws Exception {
    Path dir = mc.gameDirectory.toPath().resolve("managed-proof");
    Files.createDirectories(dir);
    Files.writeString(
        dir.resolve(RuntimeLink.EPOCH + "-" + check + ".json"),
        Jsons.obj(
                "check",
                check,
                "pid",
                ProcessHandle.current().pid(),
                "epoch",
                RuntimeLink.EPOCH,
                "research",
                r(),
                "native",
                Jsons.o(EffClient.state, "native"))
            .toString());
    System.out.println("[EFF_MULTI_JVM_QA] " + check);
  }

  private static void submitFinished(Minecraft mc) throws Exception {
    proof(mc, "complete");
    phase = 99;
  }

  private ManagedSelfTest() {}
}
