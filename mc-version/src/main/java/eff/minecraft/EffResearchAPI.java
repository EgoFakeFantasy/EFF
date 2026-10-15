package eff.minecraft;

import com.google.gson.JsonObject;
import net.minecraft.server.level.ServerPlayer;

/** Call on the server thread. An extension may also directly affect the tagged native avatar. */
public final class EffResearchAPI {
  private static void thread(ServerPlayer player) {
    if (!player.level().getServer().isSameThread())
      throw new IllegalStateException("SERVER_THREAD_REQUIRED");
  }

  public static JsonObject observe(ServerPlayer player) {
    thread(player);
    EffServer.Run run = EffServer.run(player.getUUID());
    if (run == null || run.research == null) throw new IllegalStateException("RESEARCH_NOT_READY");
    return run.research.snapshot().deepCopy();
  }

  public static void submit(ServerPlayer player, String source, int observedRevision) {
    thread(player);
    EffServer.receive(
        player, Jsons.obj("op", "researchSubmit", "source", source, "revision", observedRevision));
  }

  private EffResearchAPI() {}
}
