package eff.minecraft.client;

import com.google.gson.*;
import eff.minecraft.*;
import eff.minecraft.lab.AttackTraceBridge;
import eff.minecraft.lab.LabThreadSampler;
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
  private static volatile int phase;
  private static volatile String pendingSummon;
  private static long summonSince;
  private static volatile String failure = "";
  private static long since;
  private static JsonObject before;
  private static final String PROFILE = System.getProperty("eff.entityGuardCase", "dying");
  private static final boolean PIG2 = Boolean.getBoolean("eff.pig2Lab");
  private static final boolean SWORD = Boolean.getBoolean("eff.foreverLoveLab");
  private static final boolean BASELINE = Boolean.getBoolean("eff.entityGuardSelftest") && PROFILE.equals("baseline");
  private static final boolean CONTINUOUS = PIG2 || SWORD || BASELINE;
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
  private static volatile AttackEntryProbe attackEntry;
  // Client objects are separate from integrated-server objects even in one JVM.
  // Retain the first client object; never rebind or repair it after loss.
  private static ArmorStand originalClientTarget;
  private static net.minecraft.client.multiplayer.ClientLevel originalClientLevel;
  private static String originalClientUUID;
  private static int clientSamples;
  private static long clientLastSample, clientMaxGap;
  private static boolean clientFailed;
  private static volatile JsonObject clientObservation;
  private static volatile long clientObservedAt;
  private static final String MANUAL = System.getProperty("eff.manualCombat", "");
  private static volatile int manualPhase;
  private static volatile String manualError = "";
  private static volatile java.util.List<Entity> manualOriginals = java.util.List.of();
  private static volatile java.util.List<String> manualServerIdentities = java.util.List.of();
  private static volatile Object manualServerLevel;
  private static java.util.List<Entity> manualClients;
  private static java.util.List<String> manualClientIdentities;
  private static Object manualClientLevel;
  private static volatile boolean manualServerPending;
  private static long manualLastWrite, manualStarted, manualSamples;
  private static long manualMovementKeySamples, manualJumpKeySamples;
  private static long manualLastMovementKeyUnixMs, manualLastJumpKeyUnixMs;
  private static final ManualInputTrace manualInputTrace = new ManualInputTrace();
  private static final ManualInputTrace manualVanillaInputTrace =
      new ManualInputTrace("minecraft-key-handler-return-gameplay-only");
  private static String manualInputError = "";
  private static ManualTraceJournal manualJournal;
  private static boolean manualFailed;
  private static volatile JsonObject manualServerState;
  private static String manualRunId;
  private static Entity manualPrimary;
  private static long manualLastEngagement;
  private static JsonObject manualEngagementState;
  private static int manualOperationSequence;
  private static int manualBurstSequence;
  private static int manualDamageSequence;

  // Preparation only: no attack call, summon, timeout, verdict, recovery or game shutdown.
  private static void prepareManual(Minecraft mc) {
    if (manualPhase != 0) return;
    boolean hasPlayer = mc.player != null, hasServer = mc.getSingleplayerServer() != null,
        admitted = RuntimeLink.initialized(), arenaReady = Jsons.b(Jsons.o(EffClient.state, "native"), "ready"),
        hasResearch = r().size() != 0, tether = Jsons.b(Jsons.o(r(), "fields"), "control.tether.active");
    BootstrapDiagnostics.state("manual-client-preflight", Jsons.obj(
        "hasPlayer", hasPlayer, "hasServer", hasServer, "admitted", admitted,
        "arenaReady", arenaReady, "hasResearch", hasResearch, "tether", tether));
    if (!hasPlayer || !hasServer || !admitted || !arenaReady || !hasResearch || tether) return;
    if (!MANUAL.equals("foreverlove") && !MANUAL.equals("pig2")) {
      manualError = "UNKNOWN_MANUAL_PROFILE"; manualPhase = -1; return;
    }
    manualPhase = 1;
    UUID playerId = mc.player.getUUID();
    mc.getSingleplayerServer().execute(() -> {
      try {
        var run = EffServer.run(playerId);
        JsonObject serverPreflight = Jsons.obj(
            "hasRun", run != null, "arenaReady", run != null && run.arena.ready(),
            "actorCount", run == null ? -1 : run.arena.sceneActors().size());
        if (run != null) serverPreflight.add("rosterViews", manualRosterViews(run.arena));
        BootstrapDiagnostics.state("manual-server-preflight", serverPreflight);
        if (run == null || !run.arena.ready() || run.arena.sceneActors().isEmpty()) {
          manualPhase = 0; return;
        }
        var candidates = run.arena.world.getEntitiesOfClass(EffProjection.class,
            new AABB(run.arena.researchAnchor(), run.arena.researchAnchor()).inflate(32),
            e -> e.getTags().contains("eff_research_avatar"));
        if (candidates.size() != 1) {
          BootstrapDiagnostics.state("manual-target-preflight", Jsons.obj("candidateCount", candidates.size()));
          manualPhase = 0; return;
        }
        var target = candidates.get(0);
        // One-time preparation of the explicitly opted-in test world, before
        // freezing originals or issuing the ready receipt. Never reapply during combat.
        // Research worlds start peaceful; leaving that implicit invalidates player tests.
        var server = run.arena.world.getServer();
        server.setDifficulty(net.minecraft.world.Difficulty.NORMAL, false);
        run.arena.player.setGameMode(net.minecraft.world.level.GameType.SURVIVAL);
        if (run.arena.world.getDifficulty() != net.minecraft.world.Difficulty.NORMAL)
          throw new IllegalStateException("MANUAL_NORMAL_DIFFICULTY_NOT_APPLIED");
        JsonObject preparedGameplay = eff.minecraft.PlayerLifetime.diagnosticState(run.arena.player);
        if (!Jsons.s(preparedGameplay, "serverGameMode").equals("survival")
            || Jsons.b(preparedGameplay, "creative") || Jsons.b(preparedGameplay, "spectator")
            || Jsons.b(preparedGameplay, "abilityInvulnerable") || Jsons.b(preparedGameplay, "publicInvulnerable"))
          throw new IllegalStateException("MANUAL_SURVIVAL_MODE_NOT_APPLIED");
        var originals = new java.util.ArrayList<Entity>(run.arena.sceneActors());
        originals.add(target); originals.add(run.arena.player);
        manualOriginals = java.util.List.copyOf(originals);
        manualServerIdentities = originals.stream().map(e -> e.getId() + ":" + e.getUUID()).toList();
        manualServerLevel = run.arena.world;
        String playerAttackItem = System.getProperty("eff.manualPlayerAttackItem", "");
        if (!playerAttackItem.isBlank() && !run.arena.player.getInventory().isEmpty())
          throw new IllegalStateException("MANUAL_PLAYER_ATTACK_REQUIRES_EMPTY_ORIGINAL_INVENTORY");
        if (MANUAL.equals("foreverlove") && playerAttackItem.isBlank()) {
          var item = BuiltInRegistries.ITEM.getOptional(
              new ResourceLocation("forever_love_sword", "forever_love_sword"))
              .orElseThrow(() -> new IllegalStateException("FOREVERLOVE_SWORD_NOT_REGISTERED"));
          run.arena.player.getInventory().selected = 0;
          run.arena.player.setItemSlot(EquipmentSlot.MAINHAND, new ItemStack(item));
        }
        run.arena.player.teleportTo(run.arena.world, target.getX(), target.getY(), target.getZ()+2.5, 180, 12);
        manualRunId = java.util.UUID.randomUUID().toString();
        manualPrimary = target;
        AttackTraceBridge.watchManual(manualRunId, true, manualOriginals, manualServerIdentities);
        JsonArray roster = new JsonArray();
        for (Entity actor : run.arena.sceneActors()) roster.add(Jsons.obj(
            "uuid", actor.getUUID().toString(), "id", actor.getId(),
            "type", BuiltInRegistries.ENTITY_TYPE.getKey(actor.getType()).toString(),
            "tags", actor.getTags().toString(), "invisible", actor.isInvisible()));
        roster.add(Jsons.obj("uuid", target.getUUID().toString(), "id", target.getId(), "role", "primary-target"));
        Path receipt = mc.gameDirectory.toPath().resolve("manual-combat-ready.json");
        Files.writeString(receipt, Jsons.obj("profile", MANUAL, "pid", ProcessHandle.current().pid(),
            "attackAttempted", false, "automaticVerdict", false, "manualRunId", manualRunId,
            "preparedGameplay", preparedGameplay,
            "playerAttackItem", playerAttackItem,
            "targetUUID", target.getUUID().toString(),
            "sceneEntities", roster, "instruction", !playerAttackItem.isBlank()
                ? "Record a normal baseline, then /efflab-player prepare and /efflab-player strike. Server-side test actor; not a remote player."
                : MANUAL.equals("foreverlove")
                ? "Aim at the original scene entity and left-click with the equipped sword."
                : "Player starts the fight with /summon pig2mod:pig2 ~ ~ ~3").toString(),
            StandardOpenOption.CREATE_NEW);
        manualPhase = 2;
      } catch (Exception error) {
        manualError = error.toString(); manualPhase = -1;
        try { Files.writeString(mc.gameDirectory.toPath().resolve("manual-combat-error.json"),
            Jsons.obj("error", manualError, "attackAttempted", false).toString(), StandardOpenOption.CREATE_NEW);
        } catch (Exception ignored) { }
      }
    });
  }

  /** Same-server-thread observations; never substitutes a backing view to pass admission. */
  private static JsonObject manualRosterViews(EffArena arena) {
    JsonObject out = new JsonObject();
    try {
      var view = arena.sceneActors();
      out.addProperty("accessorClass", view.getClass().getName());
      out.addProperty("accessorSize", view.size());
      var field = EffArena.class.getDeclaredField("actors");
      if (!field.trySetAccessible()) throw new IllegalAccessException("ROSTER_FIELD_UNAVAILABLE");
      Object backing = field.get(arena);
      out.addProperty("backingClass", backing == null ? "null" : backing.getClass().getName());
      out.addProperty("readMode", "declared-field-then-collection-view-not-raw-jvm-memory");
      if (backing instanceof java.util.Collection<?> collection) {
        out.addProperty("backingSize", collection.size());
        out.addProperty("backingArrayLength", collection.toArray().length);
        out.addProperty("viewsSameSize", view.size() == collection.size());
      }
      out.addProperty("generation", arena.generation());
    } catch (ReflectiveOperationException | RuntimeException | LinkageError error) {
      out.addProperty("error", error.getClass().getName());
    }
    return out;
  }

  private static JsonObject r() {
    return Jsons.o(EffClient.state, "research");
  }

  static void tick(Minecraft mc) {
    if (!MANUAL.isEmpty()) { prepareManual(mc); observeManual(mc); return; }
    LabThreadSampler.prepare();
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
      if (phase == 0 && CONTINUOUS
          && !Jsons.b(Jsons.o(r(), "fields"), "projection.entity.avatar.observedAlive")) return;
      if (CONTINUOUS && originalClientTarget != null) observeClient(mc);
      if (phase == 12 && pendingSummon != null) {
        String command = pendingSummon;
        pendingSummon = null;
        summonSince = System.nanoTime();
        phase = 13;
        // Follow the same packet route as a player entering /summon. No EFF frame surrounds
        // the server's entity positioning, and no opponent method/field is forced.
        mc.player.connection.sendCommand(command);
      }
      if (phase == 13 && !observationPending) {
        observationPending = true;
        mc.getSingleplayerServer().execute(() -> {
          try {
            var run = EffServer.run(playerUUID);
            var pos = originalTarget.position().add(3, 0, 0);
            var opponents = run.arena.world.getEntities((Entity) null,
                new AABB(pos, pos).inflate(8),
                e -> "pig2mod:pig2".equals(BuiltInRegistries.ENTITY_TYPE.getKey(e.getType()).toString()));
            if (opponents.size() != 1) {
              if (System.nanoTime() - summonSince > 8_000_000_000L)
                throw new IllegalStateException("PIG2_PLAYER_SUMMON_NOT_AT_REQUESTED_POSITION");
              return;
            }
            var pig = opponents.get(0);
            if (pig.distanceTo(originalTarget) > 5)
              throw new IllegalStateException("PIG2_SPAWN_DISTANCE_INVALID");
            labOpponent = pig;
            AttackTraceBridge.watch("pig2", originalTarget, originalUUID, runId, pig, null, null);
            windowSince = System.nanoTime();
            proof(mc, "opponent-spawned", Jsons.obj("runId", runId,
                "targetUUID", originalUUID, "opponentType", "pig2mod:pig2",
                "opponentClass", pig.getClass().getName(),
                "targetClass", originalTarget.getClass().getName(),
                "distance", pig.distanceTo(originalTarget), "spawnRoute", "player-command-packet",
                "target", ProjectionProbe.inspect(originalTarget, run.arena.world, run.arena.researchAnchor()),
                "research", run.arena.research.snapshot()));
            phase = 1;
          } catch (Exception e) {
            failure = e.toString();
          } finally {
            observationPending = false;
          }
        });
      }
      if (phase == 1 && CONTINUOUS && !observationComplete && !observationPending) {
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
        if (CONTINUOUS) {
          phase = 10;
          return;
        }
      }
      if (phase == 10) {
        if (!readAttackArm(mc, epoch)) return;
        bindClient(mc);
        phase = 11;
      }
      if (phase == 0 || phase == 11) {
        phase = 1;
        var id = playerUUID;
        final Thread boundRenderThread = Thread.currentThread();
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
                    if (CONTINUOUS) {
                      originalTarget = target;
                      originalUUID = target.getUUID().toString();
                      LabThreadSampler.start(mc.gameDirectory.toPath().resolve("entity-guard-proof"),
                          epoch, runId, Thread.currentThread(), boundRenderThread);
                      observedSince = System.nanoTime();
                      if (!BASELINE) attackEntry =
                          AttackEntryProbe.start(
                              Thread.currentThread(),
                              PIG2 ? "pig2" : "foreverlove",
                              target,
                              originalUUID,
                              runId);
                      observeOriginal(mc);
                    }
                    if (BASELINE) {
                      windowSince = System.nanoTime();
                      proof(mc, "baseline-started", Jsons.obj("runId", runId, "originalUUID", originalUUID));
                      return;
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
                      // Retain the actual pre-attack representation. A wrapper installed
                      // before the lifetime claim is a different gap from a later swap.
                      proof(mc, "pre-attack-index", Jsons.obj(
                          "targetUUID", originalUUID,
                          "serverIndex", ProjectionProbe.indexDiagnostic(target.level(), target),
                          "clientObservation", clientObservation));
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
                      // Keep the same probe on the call stack. A foreign static-field reset must
                      // be reported as corruption, not mask the attack's original exception in finally.
                      final AttackEntryProbe directProbe = attackEntry;
                      if (directProbe == null) throw new IllegalStateException("ATTACK_PROBE_MISSING_BEFORE_CALL");
                      directProbe.beginDirectCall(target);
                      Throwable attackFailure = null;
                      try {
                        run.arena.player.attack(target);
                      } catch (RuntimeException | Error error) {
                        attackFailure = error;
                        throw error;
                      } finally {
                        directProbe.endDirectCall();
                        if (attackEntry != directProbe) {
                          var corruption = new IllegalStateException("ATTACK_PROBE_STATE_CHANGED_DURING_CALL");
                          if (attackFailure != null) attackFailure.addSuppressed(corruption);
                          else throw corruption;
                        }
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
                      // Use the ordinary summon command. pig2 rejects setPos/moveTo from another
                      // mod: a direct factory + setPos silently left it at the world origin.
                      // Do not write its private target/stage fields or invoke its attack helpers.
                      var pos = target.position().add(3, 0, 0);
                      String command = String.format(Locale.ROOT,
                          "summon pig2mod:pig2 %.6f %.6f %.6f", pos.x, pos.y, pos.z);
                      pendingSummon = command;
                      phase = 12;
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
      } else if (phase == 1 && CONTINUOUS && observationComplete) {
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

  /** Read-only sampling of frozen original objects on their owning threads. No rebind,
   * teleport, reinsertion, repair, attack, shutdown or automatic success verdict. */
  private static void observeManual(Minecraft mc) {
    if (manualPhase != 2 || mc.level == null || mc.getSingleplayerServer() == null) return;
    try {
      ManualObservationClock observationClock = ManualObservationClock.capture();
      long now = observationClock.sampledAtNanos();
      if (manualStarted == 0) manualStarted = now;
      if (manualClients == null) {
        var bound = new java.util.ArrayList<Entity>();
        for (Entity original : manualOriginals) {
          // First binding is ordinary packet-created client identity, before combat.
          // The independent raw-index observation must still validate it afterwards;
          // an unreadable raw observer must not prevent us from recording its failure.
          Entity client = mc.level.getEntity(original.getId());
          if (client == null || !original.getUUID().equals(client.getUUID())) {
            JsonArray present = new JsonArray();
            for (Entity candidate : mc.level.entitiesForRendering()) present.add(Jsons.obj(
                "id", candidate.getId(), "uuid", candidate.getUUID().toString()));
            Files.writeString(mc.gameDirectory.toPath().resolve("manual-bind-pending.json"),
                Jsons.obj("expectedId", original.getId(), "expectedUUID", original.getUUID().toString(),
                    "observedUUID", client == null ? "absent" : client.getUUID().toString(),
                    "levelClass", mc.level.getClass().getName(), "present", present).toString(),
                StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
            return;
          }
          bound.add(client);
        }
        manualClients = java.util.List.copyOf(bound);
        manualClientIdentities = bound.stream().map(e -> e.getId() + ":" + e.getUUID()).toList();
        manualClientLevel = mc.level;
        AttackTraceBridge.watchManual(manualRunId, false, manualClients, manualClientIdentities);
        Files.writeString(mc.gameDirectory.toPath().resolve("manual-scene-bound.json"),
            Jsons.obj("pid", ProcessHandle.current().pid(), "count", bound.size(), "originalsFrozen", true,
                "automaticAttack", false, "automaticVerdict", false).toString(), StandardOpenOption.CREATE_NEW);
        // Preparation only: leave the player looking at the original target,
        // without requiring a window-activation tool to close our own panel.
        if (mc.screen instanceof EffScreen) mc.setScreen(null);
      }
      if (!manualServerPending) {
        manualServerPending = true;
        mc.getSingleplayerServer().execute(() -> {
          try {
            JsonArray states = new JsonArray();
            boolean failed = false;
            for (int i = 0; i < manualOriginals.size(); i++) {
              Entity entity = manualOriginals.get(i);
              JsonObject value = manualObjectState(entity, manualServerLevel, manualServerIdentities.get(i));
              if (entity instanceof net.minecraft.world.entity.player.Player player)
                value.add("gameplay", eff.minecraft.PlayerLifetime.diagnosticState(player));
              states.add(value); failed |= Jsons.b(value, "structuralFailure");
            }
            // Publish data and capture time together. Never mutate after this volatile write.
            JsonObject engagement = manualEngagement();
            manualServerState = Jsons.obj("entities", states, "failed", failed, "engagement", engagement,
                "sampledAtNanos", System.nanoTime());
          } catch (RuntimeException error) {
            manualServerState = Jsons.obj("failed", true, "error", error.toString(),
                "sampledAtNanos", System.nanoTime());
          } finally { manualServerPending = false; }
        });
      }
      // Observe every client callback, not only the one-second journal sample:
      // short key taps can otherwise disappear between written snapshots.
      if (mc.options.keyUp.isDown() || mc.options.keyDown.isDown()
          || mc.options.keyLeft.isDown() || mc.options.keyRight.isDown()) {
        manualMovementKeySamples = Math.min(1_000_000L, manualMovementKeySamples + 1);
        manualLastMovementKeyUnixMs = System.currentTimeMillis();
      }
      if (mc.options.keyJump.isDown()) {
        manualJumpKeySamples = Math.min(1_000_000L, manualJumpKeySamples + 1);
        manualLastJumpKeyUnixMs = System.currentTimeMillis();
      }
      var listed = new java.util.IdentityHashMap<Entity, Boolean>();
      for (Entity entity : mc.level.entitiesForRendering()) listed.put(entity, Boolean.TRUE);
      JsonArray clients = new JsonArray(); boolean anomaly = false;
      for (int i = 0; i < manualClients.size(); i++) {
        Entity entity = manualClients.get(i);
        JsonObject value = manualObjectState(entity, manualClientLevel, manualClientIdentities.get(i));
        if (entity instanceof net.minecraft.world.entity.player.Player player)
          value.add("gameplay", eff.minecraft.PlayerLifetime.diagnosticState(player));
        if (manualClientLevel != mc.level) value.addProperty("structuralFailure", true);
        boolean renderListed = listed.containsKey(entity);
        Object dispatched = mc.getEntityRenderDispatcher().getRenderer(entity);
        value.addProperty("publicIdOriginal", mc.level.getEntity(entity.getId()) == entity);
        value.addProperty("entityClass", entity.getClass().getName());
        value.addProperty("lifetimeClaimed", entity instanceof EffProjection projection && projection.rejectLifetimeMutation()
            || eff.minecraft.PlayerLifetime.active(entity));
        value.addProperty("playerDeniedOperations", eff.minecraft.PlayerLifetime.deniedOperations(entity));
        value.addProperty("renderBoundaryCurrent", ProjectionRenderBoundary.current(entity));
        value.addProperty("ownedRendererRegistered", ProjectionRenderBoundary.renderer() != null);
        value.addProperty("publicRenderListed", renderListed);
        value.addProperty("dispatcherClass", mc.getEntityRenderDispatcher().getClass().getName());
        value.addProperty("publicRendererClass", dispatched == null ? "null" : dispatched.getClass().getName());
        value.addProperty("ownedDrawReturns", ProjectionRenderBoundary.drawCount(entity));
        value.add("renderEvents", ProjectionRenderBoundary.renderEventDiagnostic(entity));
        value.add("culling", ProjectionRenderBoundary.cullingDiagnostic(entity));
        long drawn = ProjectionRenderBoundary.lastDrawNanos(entity);
        value.addProperty("lastOwnedDrawAgeMs", drawn == 0 ? -1 : (now - drawn) / 1_000_000L);
        value.addProperty("invisible", entity.isInvisible());
        boolean filtered = entity instanceof EffProjection && !renderListed && !Jsons.b(value, "structuralFailure");
        value.addProperty("renderViewFiltered", filtered);
        clients.add(value); anomaly |= filtered || Jsons.b(value, "structuralFailure");
      }
      manualSamples++;
      JsonObject serverSnapshot = manualServerState;
      // Read the clock after acquiring the complete published sample, not before
      // client inspection and the asynchronous server task can finish.
      long serverObservedAt = System.nanoTime();
      long serverAgeMs = serverSnapshot == null ? -1
          : (serverObservedAt - serverSnapshot.get("sampledAtNanos").getAsLong()) / 1_000_000L;
      boolean structural = serverSnapshot != null && Jsons.b(serverSnapshot, "failed");
      for (var element : clients) structural |= Jsons.b(element.getAsJsonObject(), "structuralFailure");
      boolean first = structural && !manualFailed; manualFailed |= structural;
      // Continue checking originals on each observation, but avoid spending the
      // bounded trace budget on identical precombat snapshots. First structural
      // loss is still written immediately; abnormal visibility is sampled at 4 Hz.
      if (first || now - manualLastWrite >= (anomaly ? 250_000_000L : 1_000_000_000L)) {
        JsonArray damages = AttackTraceBridge.manualDamageDetails(manualRunId, manualDamageSequence);
        if (!damages.isEmpty()) {
          Files.writeString(mc.gameDirectory.toPath().resolve("manual-damage-details.jsonl"),
              Jsons.obj("runId", manualRunId, "damages", damages, "combatPassed", false).toString() + "\n",
              StandardOpenOption.CREATE, StandardOpenOption.APPEND);
          manualDamageSequence = damages.get(damages.size() - 1).getAsJsonObject().get("sequence").getAsInt();
        }
        JsonArray details = AttackTraceBridge.manualDetails(manualRunId, manualOperationSequence);
        if (!details.isEmpty()) {
          Files.writeString(mc.gameDirectory.toPath().resolve("manual-operation-details.jsonl"),
              Jsons.obj("runId", manualRunId, "operations", details, "combatPassed", false).toString() + "\n",
              StandardOpenOption.CREATE, StandardOpenOption.APPEND);
          manualOperationSequence = details.get(details.size() - 1).getAsJsonObject().get("sequence").getAsInt();
        }
        JsonArray bursts = AttackTraceBridge.manualBurstDetails(manualRunId, manualBurstSequence);
        if (!bursts.isEmpty()) {
          Files.writeString(mc.gameDirectory.toPath().resolve("manual-operation-bursts.jsonl"),
              Jsons.obj("runId", manualRunId, "bursts", bursts, "combatPassed", false).toString() + "\n",
              StandardOpenOption.CREATE, StandardOpenOption.APPEND);
          manualBurstSequence = bursts.get(bursts.size() - 1).getAsJsonObject().get("sequence").getAsInt();
        }
        JsonObject evidence = Jsons.obj("levelRendererClass", mc.levelRenderer.getClass().getName(),
            "pickState", manualPickState(mc),
            "playerControl", manualPlayerControl(mc),
            "renderRoute", Jsons.obj("candidates", ProjectionRenderBoundary.candidateCalls(),
                "frustum", ProjectionRenderBoundary.frustumCalls(), "dispatch", ProjectionRenderBoundary.dispatchCalls()),
            "pid", ProcessHandle.current().pid(), "samples", manualSamples,
            "structuralFailureLatched", manualFailed, "paused", mc.isPaused(), "client", clients,
            "server", serverSnapshot == null ? new JsonObject() : serverSnapshot,
            "serverAgeMs", serverAgeMs, "serverSamplePending", serverSnapshot == null,
            "manualOperations", AttackTraceBridge.manualSnapshot(manualRunId),
            "scope", "sampled-original-objects-not-combat-verdict");
        // The interval covers client inspection and detail collection. A slow
        // observation remains explicit evidence uncertainty, not a shifted clock.
        observationClock.appendTo(evidence, manualStarted, System.nanoTime());
        if (manualJournal == null) manualJournal = new ManualTraceJournal(mc.gameDirectory.toPath());
        manualJournal.append(evidence.toString(), first);
        manualLastWrite = now;
      }
    } catch (Exception error) {
      // Leave the game and original objects intact. A broken observer is missing evidence.
      manualPhase = -2; manualError = error.toString();
      try { Files.writeString(mc.gameDirectory.toPath().resolve("manual-observer-error.json"),
          Jsons.obj("error", manualError, "failed", true).toString(), StandardOpenOption.CREATE_NEW); }
      catch (Exception ignored) { }
    }
  }

  /** Forge callback observer; exclude menus/chat and never consume or alter the event. */
  static void manualKeyEvent(int key, int scan, int action, int modifiers) {
    observeManualKey(manualInputTrace, key, scan, action, modifiers);
  }

  static void manualVanillaKeyEvent(int key, int scan, int action, int modifiers) {
    observeManualKey(manualVanillaInputTrace, key, scan, action, modifiers);
  }

  private static void observeManualKey(ManualInputTrace trace, int key, int scan, int action, int modifiers) {
    if (MANUAL.isEmpty() || manualRunId == null || manualClients == null) return;
    Minecraft mc = Minecraft.getInstance();
    if (!mc.isSameThread() || mc.screen != null || mc.player == null || mc.level != manualClientLevel
        || manualClients.stream().noneMatch(entity -> entity == mc.player)) return;
    try {
      var options = mc.options;
      boolean movementMatch = options.keyUp.matches(key, scan) || options.keyDown.matches(key, scan)
          || options.keyLeft.matches(key, scan) || options.keyRight.matches(key, scan);
      trace.observe(key, scan, action, modifiers, movementMatch,
          options.keyJump.matches(key, scan),
          options.keyUp.isDown() || options.keyDown.isDown()
              || options.keyLeft.isDown() || options.keyRight.isDown(),
          options.keyJump.isDown(), mc.player.tickCount, System.currentTimeMillis(), System.nanoTime());
    } catch (RuntimeException | LinkageError unavailable) {
      manualInputError = unavailable.getClass().getName();
    }
  }

  /** Diagnostic only: never updates input, ticking membership or player state. */
  private static JsonObject manualPlayerControl(Minecraft mc) {
    JsonObject out = Jsons.obj("scope", "sampled-player-control-not-survival-proof",
        "readable", false, "movementKeySamples", manualMovementKeySamples,
        "jumpKeySamples", manualJumpKeySamples, "lastMovementKeyUnixMs", manualLastMovementKeyUnixMs,
        "lastJumpKeyUnixMs", manualLastJumpKeyUnixMs, "keyCounterLimit", 1_000_000L);
    out.add("keyEvents", manualInputTrace.snapshot());
    out.add("vanillaKeyEvents", manualVanillaInputTrace.snapshot());
    out.add("vanillaObserverHealth", ManualKeyboardObserver.health());
    out.addProperty("keyEventError", manualInputError);
    try {
      var player = mc.player;
      if (player == null) return out;
      out.addProperty("keyboardHandlerClass", mc.keyboardHandler.getClass().getName());
      out.addProperty("keyboardHandlerIdentity", System.identityHashCode(mc.keyboardHandler));
      out.addProperty("originalIdentity", player.getId() + ":" + player.getUUID());
      out.addProperty("objectIdentity", System.identityHashCode(player));
      out.addProperty("tickCount", player.tickCount);
      out.addProperty("screenClass", mc.screen == null ? "null" : mc.screen.getClass().getName());
      out.addProperty("windowActive", mc.isWindowActive());
      out.addProperty("mouseGrabbed", mc.mouseHandler.isMouseGrabbed());
      out.addProperty("movementKeyDown", mc.options.keyUp.isDown() || mc.options.keyDown.isDown()
          || mc.options.keyLeft.isDown() || mc.options.keyRight.isDown());
      out.addProperty("jumpKeyDown", mc.options.keyJump.isDown());
      out.add("bindings", Jsons.obj("up", mc.options.keyUp.saveString(),
          "down", mc.options.keyDown.saveString(), "left", mc.options.keyLeft.saveString(),
          "right", mc.options.keyRight.saveString(), "jump", mc.options.keyJump.saveString()));
      var input = player.input;
      out.addProperty("inputClass", input == null ? "null" : input.getClass().getName());
      out.addProperty("inputIdentity", input == null ? 0 : System.identityHashCode(input));
      if (input != null) {
        out.addProperty("forwardImpulse", Float.toString(input.forwardImpulse));
        out.addProperty("leftImpulse", Float.toString(input.leftImpulse));
        out.addProperty("jumping", input.jumping);
      }
      out.addProperty("readable", true);
      // Separately report unavailable tick-list evidence; do not replace it with
      // registration or a protected public lookup and call the player active.
      JsonObject ticking = Jsons.obj("readable", false,
          "readMode", "base-declared-field-and-map-view-not-raw-jvm-memory");
      out.add("ticking", ticking);
      try {
        Object list = null;
        for (String name : new String[] {"tickingEntities", "f_171630_"}) {
          try {
            var field = net.minecraft.client.multiplayer.ClientLevel.class.getDeclaredField(name);
            if (field.trySetAccessible()) { list = field.get(mc.level); break; }
          } catch (NoSuchFieldException absent) { }
        }
        if (list != null) {
          ticking.addProperty("listClass", list.getClass().getName());
          ticking.addProperty("listIdentity", System.identityHashCode(list));
          for (String name : new String[] {"active", "f_156903_"}) {
            try {
              var field = net.minecraft.world.level.entity.EntityTickList.class.getDeclaredField(name);
              if (!field.trySetAccessible()) continue;
              Object value = field.get(list);
              if (value instanceof java.util.Map<?, ?> map) {
                ticking.addProperty("mapClass", value.getClass().getName());
                ticking.addProperty("mapIdentity", System.identityHashCode(value));
                ticking.addProperty("containsOriginal", map.get(player.getId()) == player);
                ticking.addProperty("readable", true);
              }
              break;
            } catch (NoSuchFieldException absent) { }
          }
        }
      } catch (ReflectiveOperationException | RuntimeException | LinkageError unavailable) {
        ticking.addProperty("errorType", unavailable.getClass().getName());
      }
    } catch (RuntimeException | LinkageError unavailable) {
      out.addProperty("errorType", unavailable.getClass().getName());
    }
    return out;
  }

  /** Observe the real game pick and spatial query, without selecting or repairing a target. */
  private static JsonObject manualPickState(Minecraft mc) {
    JsonObject result = Jsons.obj("scope", "sampled-query-and-pick-not-attack-verdict");
    try {
      result.addProperty("gameRendererClass", mc.gameRenderer.getClass().getName());
      result.addProperty("hitType", mc.hitResult == null ? "null" : ((Enum<?>) mc.hitResult.getType()).name());
      if (mc.hitResult instanceof net.minecraft.world.phys.EntityHitResult hit) {
        Entity target = hit.getEntity();
        result.addProperty("hitId", target.getId());
        result.addProperty("hitUUID", target.getUUID().toString());
        result.addProperty("hitObjectIdentity", System.identityHashCode(target));
      }
      JsonArray entries = new JsonArray();
      for (Entity entity : manualClients) {
        JsonObject entry = Jsons.obj("id", entity.getId(), "uuid", entity.getUUID().toString(),
            "objectIdentity", System.identityHashCode(entity));
        try {
          entry.addProperty("pickable", entity.isPickable());
          entry.addProperty("spectator", entity.isSpectator());
          entry.addProperty("attackable", entity.isAttackable());
          boolean present = mc.level.getEntities((Entity) null, entity.getBoundingBox().inflate(0.05),
              candidate -> candidate == entity).stream().anyMatch(candidate -> candidate == entity);
          entry.addProperty("spatialQueryContainsOriginal", present);
          if (!present || manualPrimary != null && entity.getUUID().equals(manualPrimary.getUUID()))
            entry.add("queryRoute", ProjectionProbe.spatialQueryDiagnostic(mc.level, entity));
          entry.addProperty("readable", true);
        } catch (RuntimeException | LinkageError unavailable) {
          entry.addProperty("readable", false);
          entry.addProperty("errorType", unavailable.getClass().getName());
        }
        entries.add(entry);
      }
      result.add("originals", entries);
    } catch (RuntimeException | LinkageError unavailable) {
      result.addProperty("observationUnavailable", true);
      result.addProperty("errorType", unavailable.getClass().getName());
    }
    return result;
  }

  /** Stage/target intent only. Never invokes an attack or changes an opponent. */
  private static JsonObject manualEngagement() {
    long now = System.nanoTime();
    if (manualEngagementState != null && now - manualLastEngagement < 1_000_000_000L)
      return manualEngagementState;
    manualLastEngagement = now;
    JsonObject out = Jsons.obj("attackEntryVerified", false, "combatPassed", false,
        "sampledAtUnixMs", System.currentTimeMillis(), "scope", "nearby-opponent-stage-and-target-only");
    manualEngagementState = out;
    if (!MANUAL.equals("pig2")) {
      out.addProperty("status", "use-operation-records-and-manual-video"); return out;
    }
    try {
      var level = (net.minecraft.server.level.ServerLevel) manualServerLevel;
      var opponents = level.getEntitiesOfClass(Entity.class, manualPrimary.getBoundingBox().inflate(48),
          e -> "kakiku.pig2mod.entity.Pig2".equals(e.getClass().getName()));
      JsonArray entries = new JsonArray();
      for (int i = 0; i < Math.min(8, opponents.size()); i++) {
        Entity opponent = opponents.get(i);
        JsonObject entry = Pig2EngagementProbe.observe(opponent, manualPrimary, manualOriginals, manualServerIdentities);
        entry.addProperty("opponentId", opponent.getId());
        entry.addProperty("opponentUUID", opponent.getUUID().toString());
        entry.addProperty("opponentObjectIdentity", System.identityHashCode(opponent));
        entries.add(entry);
      }
      out.addProperty("nearbyCount", opponents.size()); out.addProperty("truncated", opponents.size() > 8);
      out.add("opponents", entries);
    } catch (RuntimeException | LinkageError error) {
      out.addProperty("observationUnavailable", true); out.addProperty("errorType", error.getClass().getName());
    }
    return out;
  }

  private static JsonObject manualObjectState(Entity entity, Object level, String identity) {
    JsonObject registration = ProjectionProbe.registrationDiagnostic(level, entity);
    JsonObject publicIndex = ProjectionProbe.publicIndexDiagnostic(level, entity);
    boolean publicIndexUnavailable = !Jsons.b(publicIndex, "readable");
    boolean publicIndexBroken = !publicIndexUnavailable && (!Jsons.b(publicIndex, "idOriginal")
        || "server".equals(Jsons.s(publicIndex, "side"))
            && (!Jsons.b(publicIndex, "uuidOriginal") || !Jsons.b(publicIndex, "interactionOriginal")));
    String removal = ProjectionProbe.rawRemovalReason(entity);
    Float health = entity instanceof LivingEntity living ? ProjectionProbe.storedHealth(living) : null;
    JsonObject lifecycle = ProjectionProbe.lifecycleDiagnostic(entity);
    boolean lifecycleUnreadable = !Jsons.b(lifecycle, "rawReadable") || !Jsons.b(lifecycle, "publicReadable");
    if (lifecycle.has("storedArmorPoses")) lifecycleUnreadable |=
        !Jsons.b(lifecycle.getAsJsonObject("storedArmorPoses"), "readable");
    boolean deathState = Jsons.b(lifecycle, "deathStateObserved");
    boolean publicMismatch = Jsons.b(lifecycle, "publicReadable") &&
        (!Jsons.b(lifecycle, "publicHealthFinite") || !Jsons.b(lifecycle, "publicAlive")
        || Jsons.b(lifecycle, "publicDying") || Jsons.b(lifecycle, "publicRemoved")
        || health != null && Jsons.d(lifecycle, "publicHealth") != health);
    boolean removed = !removal.equals("null") && !removal.equals("UNAVAILABLE");
    boolean healthBad = health == null || !Float.isFinite(health) || health <= 0;
    boolean indexed = Jsons.b(registration, "readable") && Jsons.b(registration, "idOriginal")
        && Jsons.b(registration, "uuidOriginal") && Jsons.b(registration, "sameLevel");
    boolean sameIdentity = identity.equals(entity.getId() + ":" + entity.getUUID());
    JsonObject spatial = ProjectionProbe.spatialDiagnostic(entity);
    boolean spatialUnreadable = !Jsons.b(spatial, "rawReadable") || !Jsons.b(spatial, "publicReadable");
    boolean spatialBroken = spatialUnreadable;
    for (String name : java.util.List.of("storedPosition", "storedBoundsMin", "storedBoundsMax", "publicPosition", "cullingBoundsMin", "cullingBoundsMax"))
      spatialBroken |= !Jsons.b(Jsons.o(spatial, name), "finite");
    boolean outsideSpatialLease = !spatialUnreadable && eff.minecraft.PlayerLifetime.active(entity)
        && !eff.minecraft.PlayerLifetime.allowsPosition(entity, Jsons.d(Jsons.o(spatial, "storedPosition"), "x"),
            Jsons.d(Jsons.o(spatial, "storedPosition"), "y"), Jsons.d(Jsons.o(spatial, "storedPosition"), "z"));
    String classification = !sameIdentity ? "IDENTITY_BROKEN" : removed || deathState || health != null && (!Float.isFinite(health) || health <= 0)
        ? "LIFECYCLE_BROKEN" : !Jsons.b(registration, "readable") || removal.equals("UNAVAILABLE") || health == null || lifecycleUnreadable
        ? "OBSERVATION_UNAVAILABLE" : !indexed ? "REGISTRATION_BROKEN"
        : publicIndexUnavailable ? "PUBLIC_LOOKUP_UNAVAILABLE" : publicIndexBroken ? "PUBLIC_LOOKUP_BROKEN"
        : publicMismatch ? "PUBLIC_STATE_MISMATCH" : spatialUnreadable ? "SPATIAL_OBSERVATION_UNAVAILABLE"
        : spatialBroken ? "SPATIAL_STATE_BROKEN" : outsideSpatialLease ? "OUTSIDE_SPATIAL_LEASE" : "CHECKED_FIELDS_CONSISTENT_NOT_SURVIVAL_PROOF";
    return Jsons.obj("uuid", entity.getUUID().toString(), "id", entity.getId(),
        "objectIdentity", System.identityHashCode(entity), "registration", registration, "publicIndex", publicIndex,
        "rawRemoval", removal, "rawHealthReadable", health != null && Float.isFinite(health),
        "rawHealth", health != null && Float.isFinite(health) ? health : 0,
        "sameOriginalIdentity", sameIdentity, "classification", classification,
        "lifecycle", lifecycle, "spatial", spatial, "publicStateMismatch", publicMismatch,
        "observationIncomplete", lifecycleUnreadable || publicIndexUnavailable || spatialUnreadable, "combatPassed", false,
        "structuralFailure", !sameIdentity || removed || healthBad || !indexed || deathState || publicMismatch || lifecycleUnreadable
            || publicIndexUnavailable || publicIndexBroken || spatialBroken || outsideSpatialLease);
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
    String removalBefore = rawRemovalReason(originalTarget);
    var state =
        ProjectionProbe.inspect(originalTarget, run.arena.world, run.arena.researchAnchor());
    state.add("indexDiagnostic", ProjectionProbe.indexDiagnostic(run.arena.world, originalTarget));
    state.addProperty("rawRemovalBeforeProbe", removalBefore);
    state.addProperty("rawRemovalAfterProbe", rawRemovalReason(originalTarget));
    if (originalTarget instanceof EffProjection projection)
      state.addProperty("deniedLifetimeMutations", projection.deniedLifetimeMutations());
    boolean healthy =
        ProjectionProbe.healthy(originalTarget, run.arena.world, run.arena.researchAnchor())
            && originalUUID.equals(Jsons.s(state, "uuid"))
            && ProjectionProbe.healthyPlayer(
                run.arena.player, run.arena.world, run.arena.researchAnchor());
    if (!healthy && !survivalFailed) {
      JsonObject loss = state.deepCopy();
      loss.addProperty("rawRemovalReason", rawRemovalReason(originalTarget));
      if (PIG2) loss.add("pig2Stage", Pig2EngagementProbe.observe(labOpponent, originalTarget));
      BootstrapDiagnostics.failure("original-entity-loss", new IllegalStateException(loss.toString()), null);
    }
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
              "client", clientObservation == null ? new JsonObject() : clientObservation,
              "clientAgeMs", clientObservedAt == 0 ? -1 : (now - clientObservedAt) / 1_000_000L,
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

  private static void bindClient(Minecraft mc) throws Exception {
    String expected = Jsons.s(r(), "avatarUUID");
    if (mc.level == null || expected.isEmpty()) throw new IllegalStateException("CLIENT_TARGET_IDENTITY_REQUIRED");
    ArmorStand selected = null;
    for (Entity entity : mc.level.entitiesForRendering()) {
      if (entity instanceof EffProjection && expected.equals(entity.getUUID().toString())) {
        if (selected != null) throw new IllegalStateException("CLIENT_TARGET_AMBIGUOUS");
        selected = (ArmorStand) entity;
      }
    }
    if (selected == null) throw new IllegalStateException("ORIGINAL_CLIENT_TARGET_NOT_PRESENT_BEFORE_ATTACK");
    originalClientTarget = selected;
    originalClientLevel = mc.level;
    originalClientUUID = expected;
    observeClient(mc);
    if (clientFailed) throw new IllegalStateException("ORIGINAL_CLIENT_TARGET_UNHEALTHY_BEFORE_ATTACK");
  }

  // Read-only diagnostics on the render thread. A server survivor cannot conceal a lost client copy.
  private static void observeClient(Minecraft mc) throws Exception {
    ArmorStand target = originalClientTarget;
    long now = System.nanoTime();
    if (clientLastSample != 0) clientMaxGap = Math.max(clientMaxGap, (now - clientLastSample) / 1_000_000L);
    clientLastSample = now;
    boolean listed = false, uuidMatches = false;
    if (mc.level != null) for (Entity entity : mc.level.entitiesForRendering()) {
      if (entity == target) listed = true;
      if (originalClientUUID.equals(entity.getUUID().toString())) uuidMatches = entity == target;
    }
    boolean sameLevel = mc.level == originalClientLevel && target.level() == originalClientLevel;
    boolean registered = sameLevel && mc.level.getEntity(target.getId()) == target && uuidMatches;
    float health = target.getHealth();
    Float stored = ProjectionProbe.storedHealth(target);
    boolean readable = stored != null && Float.isFinite(stored);
    boolean dying = target.isDeadOrDying() || target.deathTime > 0;
    Object renderer = mc.getEntityRenderDispatcher().getRenderer(target);
    boolean rendererOwned = renderer instanceof EffProjectionRenderer;
    boolean healthy = registered && listed && target.isAlive() && !target.isRemoved() && !dying
        && !target.isInvisible() && rendererOwned && Float.isFinite(health) && health > 0 && readable && stored == health;
    boolean firstLoss = !healthy && !clientFailed;
    clientFailed |= !healthy;
    JsonObject snapshot = Jsons.obj("uuid", target.getUUID().toString(),
        "sameOriginal", originalClientUUID.equals(target.getUUID().toString()),
        "sameLevel", sameLevel, "registered", registered, "renderListed", listed,
        "alive", target.isAlive(), "removed", target.isRemoved(), "dying", dying,
        "visible", !target.isInvisible(), "health", Float.isFinite(health) ? health : 0,
        "rawHealthReadable", readable, "rawHealth", readable ? stored : 0,
        "rawRemovalReason", rawRemovalReason(target), "entityId", target.getId(),
        "renderer", renderer == null ? "null" : renderer.getClass().getName(),
        "rendererOwned", rendererOwned, "position", target.position().toString(),
        "bounds", target.getBoundingBox().toString(),
        "failed", clientFailed, "samples", ++clientSamples, "maxSampleGapMs", clientMaxGap);
    snapshot.add("indexDiagnostic", ProjectionProbe.indexDiagnostic(mc.level, target));
    snapshot.add("rendererDiagnostic", ProjectionProbe.rendererDiagnostic(mc.getEntityRenderDispatcher(), target, renderer));
    clientObservation = snapshot;
    clientObservedAt = now;
    if (firstLoss) proof(mc, "client-first-loss", snapshot);
  }

  private static String rawRemovalReason(ArmorStand entity) {
    for (String name : new String[] {"removalReason", "f_146795_"}) {
      try {
        var field = Entity.class.getDeclaredField(name);
        if (field.trySetAccessible()) return String.valueOf(field.get(entity));
      } catch (ReflectiveOperationException | RuntimeException unavailable) {
        // Optional read-only observation, not a health verdict.
      }
    }
    return "UNAVAILABLE";
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
    // Windows can briefly deny replacement while a reader/scanner holds the destination.
    // Keep the old complete proof, retry only this atomic rename, and never truncate/delete it.
    for (int attempt = 0; ; attempt++) {
      try {
        Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        break;
      } catch (AccessDeniedException busyDestination) {
        if (attempt >= 3) throw busyDestination;
        System.err.println("[EFF_PROOF_REPLACE_RETRY] " + check + " attempt=" + (attempt + 1));
        Thread.sleep(10L << attempt);
      }
    }
    System.out.println("[EFF_ENTITY_GUARD_QA] " + check);
  }

  private EntityGuardSelfTest() {}
}
