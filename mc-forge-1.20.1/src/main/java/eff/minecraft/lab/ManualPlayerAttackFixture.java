package eff.minecraft.lab;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.authlib.GameProfile;
import com.mojang.brigadier.CommandDispatcher;
import eff.minecraft.EffArena;
import eff.minecraft.EffServer;
import eff.minecraft.Jsons;
import eff.minecraft.PlayerLifetime;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.UUID;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.common.util.FakePlayer;

/** Opt-in local test actuator, not a production defense or a survival verdict.
 * Uses normal ServerPlayer.attack, never opponent internals or target repair.
 * The fake attacker has no remote client: this tests the server attack route.
 */
public final class ManualPlayerAttackFixture {
  private static final String ITEM_ID = System.getProperty("eff.manualPlayerAttackItem", "");
  private static final Path DIRECTORY = Path.of("manual-player-attack");
  private static ServerPlayer original;
  private static FakePlayer attacker;
  private static Item item;
  private static UUID originalUuid;
  private static Object originalLevel;
  private static String runId;
  private static boolean failed;
  private static int attempts;
  private static long lastAttackNanos;

  private ManualPlayerAttackFixture() {}

  public static void register(CommandDispatcher<CommandSourceStack> dispatcher) {
    if (ITEM_ID.isBlank() || System.getProperty("eff.manualCombat", "").isBlank()) return;
    dispatcher.register(Commands.literal("efflab-player")
        .requires(source -> source.hasPermission(2) && !source.getServer().isDedicatedServer())
        .then(Commands.literal("prepare").executes(c -> invoke(c.getSource(), false)))
        .then(Commands.literal("strike").executes(c -> invoke(c.getSource(), true))));
  }

  private static int invoke(CommandSourceStack source, boolean strike) {
    try {
      var player = source.getPlayerOrException();
      if (!player.server.isSameThread()) throw new IllegalStateException("NOT_SERVER_THREAD");
      if (strike) strike(player); else prepare(player);
      source.sendSuccess(() -> Component.literal(strike
          ? "[EFF lab] Server-side attack returned. Check fresh attack evidence; no automatic pass."
          : "[EFF lab] Original empty-handed player bound. Start recording before strike."), false);
      return 1;
    } catch (Exception | LinkageError error) {
      source.sendFailure(Component.literal("[EFF lab] " + error.getClass().getSimpleName() + ": " + error.getMessage()));
      return 0;
    }
  }

  private static void requireTarget(ServerPlayer player) {
    var run = EffServer.run(player.getUUID());
    if (player.server.isDedicatedServer() || run == null || run.arena.player != player
        || !player.level().dimension().equals(EffArena.DIM) || !run.arena.ready()
        || !PlayerLifetime.active(player) || !PlayerLifetime.current(player))
      throw new IllegalStateException("ORIGINAL_ARENA_PLAYER_NOT_ADMITTED");
    // Fail rather than remove an item, effect or ability to make the test pass.
    if (!player.getInventory().isEmpty() || !player.getEnderChestInventory().isEmpty()
        || !player.getActiveEffects().isEmpty() || player.getAbsorptionAmount() != 0
        || player.isCreative() || player.isSpectator() || player.isInvulnerable()
        || player.getAbilities().invulnerable || player.getAbilities().instabuild
        || player.getAbilities().mayfly || player.getAbilities().flying
        || player.isNoGravity() || player.noPhysics)
      throw new IllegalStateException("PLAYER_TEST_PRECONDITION_CONTAMINATED");
  }

  private static void prepare(ServerPlayer player) throws Exception {
    if (original != null || failed) throw new IllegalStateException("ALREADY_PREPARED_OR_FAILED");
    requireTarget(player);
    LabThreadSampler.prepare(); // Asynchronous warmup before the separately issued strike.
    var ready = JsonParser.parseString(Files.readString(Path.of("manual-combat-ready.json"))).getAsJsonObject();
    var bound = JsonParser.parseString(Files.readString(Path.of("manual-scene-bound.json"))).getAsJsonObject();
    if (ready.get("pid").getAsLong() != ProcessHandle.current().pid()
        || bound.get("pid").getAsLong() != ProcessHandle.current().pid()
        || !bound.get("originalsFrozen").getAsBoolean()
        || !ITEM_ID.equals(ready.get("playerAttackItem").getAsString()))
      throw new IllegalStateException("ORIGINAL_BINDING_NOT_READY");
    item = BuiltInRegistries.ITEM.getOptional(new ResourceLocation(ITEM_ID))
        .orElseThrow(() -> new IllegalStateException("ATTACK_ITEM_NOT_REGISTERED"));
    if (item == net.minecraft.world.item.Items.AIR) throw new IllegalStateException("EMPTY_ATTACK_ITEM");
    // This new object is exclusively the attacker. The original target is never recreated.
    var candidate = new FakePlayer(player.serverLevel(), new GameProfile(UUID.randomUUID(), "EFFLabAttacker"));
    candidate.setPos(player.getX() + 2, player.getY(), player.getZ());
    candidate.setItemSlot(EquipmentSlot.MAINHAND, new ItemStack(item));
    original = player; originalUuid = player.getUUID(); originalLevel = player.level();
    attacker = candidate; runId = ready.get("manualRunId").getAsString();
    try { receipt("prepared", observation()); }
    catch (Exception error) { failed = true; throw error; }
  }

  private static void strike(ServerPlayer player) throws Exception {
    if (failed || original == null || player != original || player.level() != originalLevel
        || !player.getUUID().equals(originalUuid) || attempts >= 3)
      throw new IllegalStateException("ORIGINAL_IDENTITY_OR_ATTEMPT_LIMIT");
    requireTarget(player);
    if (attacker.level() != originalLevel || attacker.distanceTo(player) > 4
        || !attacker.getMainHandItem().is(item)) throw new IllegalStateException("ATTACKER_PRECONDITION_CHANGED");
    if (!LabThreadSampler.prepared()) throw new IllegalStateException("THREAD_DIAGNOSTIC_NOT_READY");
    long now = System.nanoTime();
    if (attempts > 0 && now - lastAttackNanos < 1_000_000_000L)
      throw new IllegalStateException("ATTACK_COOLDOWN");
    attempts++; lastAttackNanos = now;
    receipt("attempt-" + attempts, observation());
    LabThreadSampler.startServer(DIRECTORY, attempts, runId, Thread.currentThread());
    try {
      attacker.attack(original);
      receipt("returned-" + attempts, observation());
    } catch (Exception | LinkageError error) {
      failed = true;
      var out = observation(); out.addProperty("failureType", error.getClass().getName());
      receipt("failed-" + attempts, out);
      throw error;
    }
  }

  private static JsonObject observation() {
    var out = Jsons.obj("scope", "programmatic-server-player-attack-not-remote-client-combat",
        "combatPassed", false, "manualRunId", runId, "pid", ProcessHandle.current().pid(),
        "atUnixMs", System.currentTimeMillis(), "attempt", attempts,
        "targetUUID", original.getUUID().toString(), "targetObjectIdentity", System.identityHashCode(original),
        "targetClass", original.getClass().getName(),
        "connectionClass", original.connection == null ? "null" : original.connection.getClass().getName(),
        "connectionObjectIdentity", System.identityHashCode(original.connection),
        "threadSamplerPrepared", LabThreadSampler.prepared(),
        "attackerUUID", attacker.getUUID().toString(), "attackerObjectIdentity", System.identityHashCode(attacker),
        "attackerRegisteredInWorld", false, "item", ITEM_ID,
        "targetInventoryEmpty", original.getInventory().isEmpty(),
        "targetLifetimeActive", PlayerLifetime.active(original), "targetLifetimeCurrent", PlayerLifetime.current(original),
        "targetAbsorption", original.getAbsorptionAmount(), "targetEffectCount", original.getActiveEffects().size());
    out.add("targetGameplay", PlayerLifetime.diagnosticState(original));
    out.add("liveTickAudit", liveTickAudit());
    return out;
  }

  private static JsonObject liveTickAudit() {
    var out = Jsons.obj("readOnly", true, "executionProven", false, "atomicSnapshot", false);
    long start = System.nanoTime();
    try {
      // The reviewed startup agent owns this API. Never attach an agent or load a
      // library here; absence/errors are evidence, not permission to alter the VM.
      var api = Class.forName("eff.hiddenboundary.NativeHiddenBoundary", false, ClassLoader.getSystemClassLoader());
      var inspect = api.getMethod("inspectTick", Class.class);
      for (var type : new Class<?>[] {net.minecraft.server.network.ServerGamePacketListenerImpl.class, ServerPlayer.class,
          net.minecraft.server.level.ServerLevel.class}) {
        out.add(type.getName(), JsonParser.parseString((String) inspect.invoke(null, type)));
      }
    } catch (Exception | LinkageError error) {
      out.addProperty("errorType", error.getClass().getName());
      if (error.getCause() != null) out.addProperty("causeType", error.getCause().getClass().getName());
    }
    out.addProperty("elapsedNanos", System.nanoTime() - start);
    return out;
  }

  private static void receipt(String name, JsonObject value) throws Exception {
    Files.createDirectories(DIRECTORY);
    Files.writeString(DIRECTORY.resolve(name + ".json"), value.toString(), StandardOpenOption.CREATE_NEW);
  }
}
