package eff.minecraft.client;

import com.google.gson.JsonObject;
import eff.minecraft.*;
import java.nio.file.*;
import net.minecraft.client.Minecraft;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.decoration.ArmorStand;

/** Explicit native API matrix, independent of any opponent name or implementation. */
final class LifetimeSelfTest {
  private static volatile boolean queued, done;
  private static EffProjection original;
  private static long since, previous, maxGap;
  private static int samples;
  private static String uuid;
  private static boolean fieldGateActive;

  static void tick(Minecraft mc) {
    if (!Boolean.getBoolean("eff.lifetimeSelftest") || !RuntimeLink.initialized()
        || done || queued || mc.player == null || mc.getSingleplayerServer() == null) return;
    var server = mc.getSingleplayerServer();
    var id = mc.player.getUUID();
    queued = true;
    server.execute(() -> {
      try {
        var run = EffServer.run(id);
        if (run == null || run.arena.research == null) return;
        var snap = run.arena.research.snapshot();
        if (original == null) {
          String found = Jsons.s(snap, "avatarUUID");
          if (found.isEmpty()) return;
          original = (EffProjection) run.arena.world.getEntity(java.util.UUID.fromString(found));
          try {
            Class<?> gate = Class.forName("eff.lifetime.LifetimeTarget");
            fieldGateActive = gate.isInstance(original);
            if (!fieldGateActive) throw new AssertionError("FIELD_GATE_SERVICE_NOT_APPLIED");
          } catch (ClassNotFoundException optionalGateAbsent) { fieldGateActive = false; }
          uuid = found; since = System.nanoTime(); previous = since;
          write(mc, "lifetime-ready", Jsons.obj("uuid", uuid));
          return;
        }
        if (!Files.exists(mc.gameDirectory.toPath().resolve("lifetime-arm.json"))) return;
        if (samples == 0) { since = System.nanoTime(); previous = since; }
        long now = System.nanoTime(); maxGap = Math.max(maxGap, now - previous); previous = now;
        original.kill(); original.discard(); original.remove(Entity.RemovalReason.KILLED);
        for (Entity.RemovalReason reason : Entity.RemovalReason.values()) original.setRemoved(reason);
        original.hurt(run.arena.world.damageSources().genericKill(), Float.MAX_VALUE);
        original.die(run.arena.world.damageSources().genericKill());
        original.setHealth(0); original.setHealth(-1); original.setHealth(Float.NaN);
        original.setHealth(Float.NEGATIVE_INFINITY);
        if (fieldGateActive) {
          original.deathTime = 99;
          if (original.deathTime != 0) throw new AssertionError("DIRECT_DEATH_WRITE_NOT_BLOCKED");
        }
        try { original.releaseLifetime(new Object()); throw new AssertionError("FORGED_OWNER_ACCEPTED"); }
        catch (IllegalStateException expected) { }
        if (!uuid.equals(original.getUUID().toString())
            || run.arena.world.getEntity(original.getUUID()) != original
            || !ProjectionProbe.healthy(original, run.arena.world, run.arena.researchAnchor()))
          throw new AssertionError("ORIGINAL_IDENTITY_OR_LIVENESS_LOST");
        samples++;
        if (samples == 1) {
          var lookup = new net.minecraft.world.level.entity.EntityLookup<net.minecraft.world.entity.Entity>();
          lookup.add(original); lookup.remove(original);
          if (lookup.getEntity(original.getUUID()) != original) throw new AssertionError("LOOKUP_REMOVAL_NOT_BLOCKED");
          var section = new net.minecraft.world.level.entity.EntitySection<net.minecraft.world.entity.Entity>(
              net.minecraft.world.entity.Entity.class, net.minecraft.world.level.entity.Visibility.TICKING);
          section.add(original);
          if (section.remove(original) || section.isEmpty()) throw new AssertionError("SECTION_REMOVAL_NOT_BLOCKED");
          var ticking = new net.minecraft.world.level.entity.EntityTickList();
          ticking.add(original); ticking.remove(original);
          if (!ticking.contains(original)) throw new AssertionError("TICK_REMOVAL_NOT_BLOCKED");
          ArmorStand ordinary = EffEntities.createProjection(run.arena.world, original.position().add(0, 0, 4));
          if (!run.arena.world.addFreshEntity(ordinary)) throw new AssertionError("CONTROL_SPAWN");
          ordinary.setHealth(0);
          if (ordinary.getHealth() > 0) throw new AssertionError("UNOWNED_HEALTH_MUTATION_BLOCKED");
          ordinary.discard();
          if (!ordinary.isRemoved()) throw new AssertionError("UNOWNED_REMOVAL_BLOCKED");
          // Repeated entry must not discard/recreate the protected object while awaiting a reply.
          EffServer.enter(run.arena.player, "research");
        }
        if ((now - since) / 1000000 >= 31000 && samples >= 100) {
          JsonObject proof = Jsons.obj("ok", true, "uuid", uuid, "samples", samples,
              "elapsedMs", (now - since) / 1000000, "maxGapMs", maxGap / 1000000,
              "denied", original.deniedLifetimeMutations(), "sameObject", true,
              "target", ProjectionProbe.inspect(original, run.arena.world, run.arena.researchAnchor()));
          run.arena.research.execute("disable control.tether; disable event.possess; disable authority.recovery",
              run.arena.research.revision(), "player");
          run.arena.research.execute("erase entity.avatar; refuse ending.owned", run.arena.research.revision(), "player");
          if (!original.isRemoved() || !run.arena.research.won()) throw new AssertionError("LEGAL_ERASURE_BLOCKED");
          proof.addProperty("legalErasurePreserved", true);
          proof.addProperty("fieldGateActive", fieldGateActive);
          write(mc, "lifetime-result", proof); done = true;
        }
      } catch (Throwable failure) {
        done = true;
        try { write(mc, "lifetime-result", Jsons.obj("ok", false, "error", failure.toString())); }
        catch (Exception ignored) { }
      } finally { queued = false; }
    });
  }

  private static void write(Minecraft mc, String name, JsonObject value) throws Exception {
    value.addProperty("mcPid", ProcessHandle.current().pid());
    Path file = mc.gameDirectory.toPath().resolve(name + ".json"), temp = file.resolveSibling(name + ".tmp");
    Files.writeString(temp, value.toString());
    Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
  }
}
