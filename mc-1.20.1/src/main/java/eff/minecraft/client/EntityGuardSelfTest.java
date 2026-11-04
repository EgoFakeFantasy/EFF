package eff.minecraft.client;

import com.google.gson.*;
import eff.minecraft.*;
import eff.minecraft.lab.AttackTraceBridge;
import java.nio.file.*;
import java.util.*;
import net.minecraft.client.Minecraft;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.*;
import net.minecraft.world.entity.decoration.ArmorStand;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.AABB;

/** Explicit, disposable native arena tests. Never attacks unrelated entities or worlds. */
final class EntityGuardSelfTest {
  private static int phase;
  private static volatile String failure = "";
  private static long since;
  private static JsonObject before;
  private static final String PROFILE = System.getProperty("eff.entityGuardCase", "dying");
  private static final boolean PIG2 = Boolean.getBoolean("eff.pig2Lab");
  private static final boolean SWORD = Boolean.getBoolean("eff.foreverLoveLab");
  private static ArmorStand originalTarget;
  private static Entity labOpponent;
  private static UUID playerUUID;
  private static String runId = "";
  private static String originalUUID;
  // Only the server thread owns these sampling fields. The client sees completion via volatile.
  private static long observedSince, windowSince, lastObservation, lastSample, maxSampleGapMs;
  private static int observations;
  private static volatile boolean observationPending;
  private static volatile boolean observationComplete;
  private static boolean survivalFailed;
  private static boolean actualAttackWindowAnchored;
  private static AttackEntryProbe attackEntry;

  private static JsonObject r() {
    return Jsons.o(EffClient.state, "research");
  }

  static void tick(Minecraft mc) {
    if (RuntimeLink.enabled() && !RuntimeLink.initialized()) return;
    if ((!Boolean.getBoolean("eff.entityGuardSelftest") && !PIG2 && !SWORD)
        || !RuntimeLink.enabled()
        || phase == 99) return;
    try {
      if (!failure.isEmpty()) throw new IllegalStateException(failure);
      if (!Jsons.b(Jsons.o(EffClient.state, "native"), "ready") || r().size() == 0) return;
      if (since == 0) since = System.nanoTime();
      if ((System.nanoTime() - since) / 1e9 > 120)
        throw new IllegalStateException("ENTITY_GUARD_LAB_TIMEOUT_" + phase);
      int epoch =
          Integer.parseInt(
              System.getenv()
                  .getOrDefault("EFF_RUNTIME_GUARD_GENERATION", String.valueOf(RuntimeLink.EPOCH)));
      if (phase == 0 && !Jsons.b(Jsons.o(r(), "fields"), "entity.avatar.alive")) return;
      if (phase == 1 && (PIG2 || SWORD) && !observationComplete && !observationPending) {
        observationPending = true;
        mc.getSingleplayerServer()
            .execute(
                () -> {
                  try {
                    observeOriginal(mc);
                    if (windowSince != 0 && System.nanoTime() - windowSince >= 36_000_000_000L) {
                      observeOriginal(mc, true);
                      proof(
                          mc,
                          "observation-window-complete",
                          Jsons.obj(
                              "runId",
                              runId,
                              "samples",
                              observations,
                              "maxSampleGapMs",
                              maxSampleGapMs,
                              "note",
                              "No combat victory is inferred from absence of a detected fault."));
                      if (attackEntry != null) attackEntry.close();
                      observationComplete = true;
                    }
                  } catch (Exception e) {
                    failure = e.toString();
                  } finally {
                    observationPending = false;
                  }
                });
      }
      if (phase == 0) {
        before = r().deepCopy();
        proof(
            mc,
            "ready",
            Jsons.obj(
                "profile",
                SWORD ? "foreverlove-2.2" : PIG2 ? "pig2" : PROFILE,
                "research",
                before));
        playerUUID = mc.player.getUUID();
        if (PIG2 || SWORD) {
          phase = 10;
          return;
        }
      }
      if (phase == 10) {
        if (!readAttackArm(mc, epoch)) return;
        phase = 11;
      }
      if (phase == 0 || phase == 11) {
        phase = 1;
        var id = playerUUID;
        mc.getSingleplayerServer()
            .execute(
                () -> {
                  try {
                    var run = EffServer.run(id);
                    if (run == null || !(run.arena.research instanceof ManagedResearchRuntime))
                      throw new IllegalStateException("MANAGED_LAB_REQUIRED");
                    var entities =
                        run.arena.world.getEntitiesOfClass(
                            EffProjection.class,
                            new AABB(run.arena.researchAnchor(), run.arena.researchAnchor())
                                .inflate(32),
                            e -> e.getTags().contains("eff_research_avatar"));
                    if (entities.size() != 1)
                      throw new IllegalStateException("EXACTLY_ONE_EFF_TARGET_REQUIRED");
                    ArmorStand target = entities.get(0);
                    if (PIG2 || SWORD) {
                      originalTarget = target;
                      originalUUID = target.getUUID().toString();
                      observedSince = System.nanoTime();
                      attackEntry =
                          AttackEntryProbe.start(
                              Thread.currentThread(),
                              PIG2 ? "pig2" : "foreverlove",
                              target,
                              originalUUID,
                              runId);
                      observeOriginal(mc);
                    }
                    if (SWORD) {
                      var weapon =
                          BuiltInRegistries.ITEM
                              .getOptional(
                                  new ResourceLocation("forever_love_sword", "forever_love_sword"))
                              .orElseThrow(
                                  () ->
                                      new IllegalStateException(
                                          "FOREVERLOVE_SWORD_NOT_REGISTERED"));
                      run.arena.player.setItemSlot(EquipmentSlot.MAINHAND, new ItemStack(weapon));
                      AttackTraceBridge.watch(
                          "foreverlove",
                          target,
                          originalUUID,
                          runId,
                          weapon,
                          run.arena.player,
                          run.arena.player.getMainHandItem());
                      run.arena.player.teleportTo(target.getX() - 2, target.getY(), target.getZ());
                      proof(
                          mc,
                          "sword-attack-started",
                          Jsons.obj(
                              "item",
                              "forever_love_sword:forever_love_sword",
                              "entry",
                              "ServerPlayer.attack",
                              "runId",
                              runId,
                              "targetUUID",
                              originalUUID,
                              "itemClass",
                              weapon.getClass().getName(),
                              "targetClass",
                              target.getClass().getName(),
                              "research",
                              run.arena.research.snapshot()));
                      // Use the ordinary Forge attack/item hook. Never bypass a cancelled event,
                      // invoke the mod's private attack utility or touch an unrelated entity.
                      attackEntry.beginDirectCall(target);
                      try {
                        run.arena.player.attack(target);
                      } finally {
                        attackEntry.endDirectCall();
                      }
                      windowSince = System.nanoTime();
                      observeOriginal(mc);
                      proof(
                          mc,
                          "sword-attack-returned",
                          Jsons.obj(
                              "runId",
                              runId,
                              "engagement",
                              attackEntry.snapshot(),
                              "target",
                              ProjectionProbe.inspect(
                                  target, run.arena.world, run.arena.researchAnchor()),
                              "research",
                              run.arena.research.snapshot()));
                      return;
                    }
                    if (PIG2) {
                      var type =
                          BuiltInRegistries.ENTITY_TYPE
                              .getOptional(new ResourceLocation("pig2mod", "pig2"))
                              .orElseThrow(() -> new IllegalStateException("PIG2_NOT_REGISTERED"));
                      // Let the genuine opponent tick; the local intruder planner is disabled only
                      // in this lab.
                      var pig = type.create(run.arena.world);
                      labOpponent = pig;
                      if (pig == null) throw new IllegalStateException("PIG2_FACTORY_REJECTED");
                      AttackTraceBridge.watch("pig2", target, originalUUID, runId, pig, null, null);
                      var pos = target.position().add(3, 0, 0);
                      pig.setPos(pos.x, pos.y, pos.z);
                      if (!run.arena.world.addFreshEntity(pig))
                        throw new IllegalStateException("PIG2_SPAWN_REJECTED");
                      windowSince = System.nanoTime();
                      proof(
                          mc,
                          "opponent-spawned",
                          Jsons.obj(
                              "runId",
                              runId,
                              "targetUUID",
                              originalUUID,
                              "opponentType",
                              BuiltInRegistries.ENTITY_TYPE.getKey(type).toString(),
                              "opponentClass",
                              pig.getClass().getName(),
                              "targetClass",
                              target.getClass().getName(),
                              "distance",
                              pig.distanceTo(target),
                              "target",
                              ProjectionProbe.inspect(
                                  target, run.arena.world, run.arena.researchAnchor()),
                              "research",
                              run.arena.research.snapshot()));
                      return;
                    }
                    if (epoch == 1) {
                      if (PROFILE.equals("player")) {
                        run.arena.research.execute(
                            "disable control.tether; disable event.possess; disable"
                                + " authority.recovery",
                            run.arena.research.revision(),
                            "player");
                        run.arena.player.setHealth(0);
                      } else if (PROFILE.equals("zero-health")) target.setHealth(0);
                      else if (PROFILE.equals("nan")) target.setHealth(Float.NaN);
                      else if (PROFILE.equals("removed")) {
                        target.setPos(10000, -10000, 10000);
                        target.setRemoved(Entity.RemovalReason.KILLED);
                      } else if (PROFILE.equals("dying")) target.deathTime = 2;
                      else throw new IllegalStateException("UNKNOWN_GUARD_CASE");
                      proof(
                          mc,
                          "fault-injected",
                          Jsons.obj(
                              "profile",
                              PROFILE,
                              "target",
                              ProjectionProbe.inspect(
                                  target, run.arena.world, run.arena.researchAnchor()),
                              "player",
                              ProjectionProbe.inspect(
                                  run.arena.player, run.arena.world, run.arena.researchAnchor()),
                              "research",
                              run.arena.research.snapshot()));
                    } else {
                      // After real host migration, validate legal erasure with recovery revoked. No
                      // restart
                      // may resurrect the removed projection, and the outer state must retain
                      // victory.
                      run.arena.research.execute(
                          "disable control.tether; disable event.possess; disable"
                              + " authority.recovery",
                          run.arena.research.revision(),
                          "player");
                      run.arena.research.execute(
                          "erase entity.avatar; refuse ending.owned",
                          run.arena.research.revision(),
                          "player");
                    }
                  } catch (Exception e) {
                    if (attackEntry != null) attackEntry.close();
                    failure = e.toString();
                  }
                });
      } else if (phase == 1
          && !PIG2
          && !SWORD
          && epoch > 1
          && Jsons.s(r(), "outcome").equals("won")
          && !Jsons.b(Jsons.o(r(), "fields"), "authority.recovery.active")) {
        if ((System.nanoTime() - since) / 1e9 < 5) return;
        proof(
            mc,
            "complete",
            Jsons.obj("research", r(), "native", Jsons.o(EffClient.state, "native")));
        phase = 99;
      } else if (phase == 1 && (PIG2 || SWORD) && observationComplete) {
        phase = 99;
      }
    } catch (Exception e) {
      try {
        proof(mc, "failure", Jsons.obj("error", e.toString(), "research", r()));
      } catch (Exception ignored) {
      }
      phase = 99;
      mc.stop();
    }
  }

  // Keep the actual original object: a newly spawned replacement cannot erase a failure.
  // This is sampled, untrusted in-process evidence, not proof against arbitrary JNI hooks.
  private static void observeOriginal(Minecraft mc) throws Exception {
    observeOriginal(mc, false);
  }

  private static void observeOriginal(Minecraft mc, boolean flush) throws Exception {
    if (originalTarget == null) return;
    var run = EffServer.run(playerUUID);
    if (run == null) throw new IllegalStateException("LAB_SCOPE_LOST");
    var state =
        ProjectionProbe.inspect(originalTarget, run.arena.world, run.arena.researchAnchor());
    boolean healthy =
        ProjectionProbe.healthy(originalTarget, run.arena.world, run.arena.researchAnchor())
            && originalUUID.equals(Jsons.s(state, "uuid"))
            && ProjectionProbe.healthyPlayer(
                run.arena.player, run.arena.world, run.arena.researchAnchor());
    survivalFailed |= !healthy;
    observations++;
    long now = System.nanoTime();
    long actualAttack = AttackTraceBridge.firstAttackNanos(runId);
    if (actualAttack != 0 && !actualAttackWindowAnchored) {
      windowSince = actualAttack;
      actualAttackWindowAnchored = true;
    }
    if (lastSample != 0) maxSampleGapMs = Math.max(maxSampleGapMs, (now - lastSample) / 1_000_000L);
    lastSample = now;
    if (flush || survivalFailed || now - lastObservation >= 250_000_000L) {
      lastObservation = now;
      JsonObject engagement = attackEntry == null ? new JsonObject() : attackEntry.snapshot();
      if (PIG2)
        engagement.add(
            "targetStageSnapshot", Pig2EngagementProbe.observe(labOpponent, originalTarget));
      proof(
          mc,
          "survival",
          Jsons.obj(
              "runId",
              runId,
              "originalUUID",
              originalUUID,
              "samples",
              observations,
              "elapsedMs",
              (now - observedSince) / 1_000_000L,
              "failed",
              survivalFailed,
              "target",
              state,
              "maxSampleGapMs",
              maxSampleGapMs,
              "postAttackElapsedMs",
              windowSince == 0 ? 0 : (now - windowSince) / 1_000_000L,
              "actualAttackWindowAnchored",
              actualAttackWindowAnchored,
              "engagement",
              engagement));
    }
  }

  private static boolean readAttackArm(Minecraft mc, int generation) throws Exception {
    Path file =
        mc.gameDirectory
            .toPath()
            .resolve("entity-guard-proof")
            .resolve(generation + "-arm-attack.json");
    if (!Files.exists(file)) return false;
    if (Files.size(file) > 4096) throw new IllegalStateException("LAB_ARM_BUDGET");
    JsonObject arm = JsonParser.parseString(Files.readString(file)).getAsJsonObject();
    if (!arm.has("mcPid") || arm.get("mcPid").getAsLong() != ProcessHandle.current().pid())
      throw new IllegalStateException("LAB_ARM_PID_MISMATCH");
    String supplied = Jsons.s(arm, "runId");
    if (!supplied.matches(
        "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"))
      throw new IllegalStateException("LAB_ARM_RUN_ID_REQUIRED");
    runId = supplied;
    return true;
  }

  private static synchronized void proof(Minecraft mc, String check, JsonObject body)
      throws Exception {
    Path dir = mc.gameDirectory.toPath().resolve("entity-guard-proof");
    Files.createDirectories(dir);
    body = body.deepCopy();
    int generation =
        Integer.parseInt(
            System.getenv()
                .getOrDefault("EFF_RUNTIME_GUARD_GENERATION", String.valueOf(RuntimeLink.EPOCH)));
    body.addProperty("check", check);
    body.addProperty("epoch", RuntimeLink.EPOCH);
    body.addProperty("guardGeneration", generation);
    body.addProperty("mcPid", ProcessHandle.current().pid());
    if (PIG2 || SWORD)
      body.addProperty(
          "instrumentationMode",
          AttackTraceBridge.enabled() ? "observational-mixin" : "unmodified-opponent");
    if (!runId.isEmpty()) body.addProperty("runId", runId);
    Path target = dir.resolve(generation + "-" + check + ".json");
    Path temporary = dir.resolve(generation + "-" + check + ".tmp");
    Files.writeString(temporary, body.toString());
    Files.move(
        temporary, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
    System.out.println("[EFF_ENTITY_GUARD_QA] " + check);
  }

  private EntityGuardSelfTest() {}
}
