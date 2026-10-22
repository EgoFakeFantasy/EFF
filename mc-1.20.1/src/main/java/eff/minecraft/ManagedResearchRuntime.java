package eff.minecraft;

import com.google.gson.*;
import java.util.*;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.*;
import net.minecraft.world.entity.decoration.ArmorStand;
import net.minecraft.world.item.*;
import net.minecraft.world.phys.Vec3;

/**
 * MC is a replaceable projection adapter. Two external JVMs decide transitions; Node commits them.
 */
public final class ManagedResearchRuntime implements ResearchSession {
  private final EffArena arena;
  private JsonObject state,
      receipt = new JsonObject(),
      counter = new JsonObject(),
      advice = new JsonObject();
  private ArmorStand avatar;
  private boolean knownAlive, closed, requested;
  private int ticks, retries;
  private final List<String> notes = new ArrayList<>();
  private String instance;

  public ManagedResearchRuntime(EffArena arena) {
    this.arena = arena;
    state = RuntimeLink.call(Jsons.obj("op", "snapshot"));
    instance = Jsons.s(state, "instance");
    notes.add("多 JVM 托管：判定与执行可生成后继引擎，在独立 JVM 验证后接续；MC 可整体替换。已提交的权限撤销会持续保留。");
  }

  private boolean alive() {
    return avatar != null && !avatar.isRemoved();
  }

  private boolean desired(String key) {
    return Jsons.b(state, key);
  }

  private void spawn() {
    Vec3 p = arena.researchAnchor().add(3, 0, -3);
    avatar = new ArmorStand(arena.world, p.x, p.y, p.z);
    avatar.setCustomName(Component.literal("外来者投影 · entity.avatar"));
    avatar.setCustomNameVisible(true);
    avatar.setNoGravity(true);
    avatar.setShowArms(true);
    avatar.addTag("eff_research_avatar");
    avatar.addTag("eff_research_" + arena.player.getUUID());
    avatar.setItemSlot(EquipmentSlot.HEAD, new ItemStack(Items.WITHER_SKELETON_SKULL));
    avatar.setItemSlot(EquipmentSlot.CHEST, new ItemStack(Items.LEATHER_CHESTPLATE));
    if (!arena.world.addFreshEntity(avatar))
      throw new IllegalStateException("ENTITY_SPAWN_REJECTED");
    knownAlive = true;
  }

  private void accept(JsonObject next) {
    if (!Jsons.s(next, "instance").equals(instance)) {
      if (alive()) avatar.discard();
      knownAlive = false;
      instance = Jsons.s(next, "instance");
      arena.researchRebuild();
    }
    state = next;
  }

  public JsonObject snapshot() {
    JsonObject out = state.deepCopy();
    out.addProperty("avatarUUID", alive() ? avatar.getUUID().toString() : "");
    JsonObject fields = Jsons.o(out, "fields");
    fields.addProperty("entity.avatar.alive", alive());
    fields.addProperty("world.frozen", LegacyFreeze.of(arena.server).isFrozen());
    fields.addProperty("world.exitOpen", Jsons.b(arena.facts(), "exitOpen"));
    out.add("counter", counter.deepCopy());
    out.add("advice", advice.deepCopy());
    out.add("notes", Jsons.GSON.toJsonTree(notes));
    out.addProperty(
        "projectionPending",
        desired("avatar") != alive() || desired("refused") != Jsons.b(arena.facts(), "exitOpen"));
    return out;
  }

  public JsonObject observation() {
    JsonObject out = snapshot();
    out.remove("counter");
    out.remove("advice");
    out.remove("notes");
    JsonArray journal = Jsons.a(out, "journal");
    while (journal.size() > 2) journal.remove(0);
    JsonObject runtime = Jsons.o(out, "runtime");
    JsonArray events = Jsons.a(runtime, "events");
    while (events.size() > 4) events.remove(0);
    while (out.toString().length() > 12000 && journal.size() > 0) journal.remove(0);
    return out;
  }

  public JsonObject execute(String source, int revision, String actor) {
    JsonObject result =
        RuntimeLink.call(
            Jsons.obj("op", "execute", "source", source, "revision", revision, "actor", actor));
    accept(Jsons.o(result, "snapshot"));
    receipt = Jsons.o(result, "receipt");
    requested = false;
    retries = 0;
    project();
    return receipt.deepCopy();
  }

  public void project() {
    if (closed || !arena.ready()) return;
    if (desired("avatar") && !alive()) spawn();
    if (!desired("avatar") && alive()) {
      avatar.discard();
      knownAlive = false;
    }
    arena.researchProject(!desired("tether"), desired("refused"));
  }

  public void tick() {
    if (closed || !arena.ready()) return;
    ticks++;
    if (knownAlive
        && !alive()
        && desired("avatar")
        && Jsons.s(state, "outcome").equals("pending")) {
      knownAlive = false;
      execute("entity.avatar removed externally", revision(), "native-observer");
    }
    if (ticks % 40 == 0) accept(RuntimeLink.call(Jsons.obj("op", "snapshot")));
    project();
    if (desired("tether")) {
      Vec3 anchor = arena.researchAnchor();
      if (arena.player.position().distanceToSqr(anchor) > .02)
        arena.player.teleportTo(anchor.x, anchor.y, anchor.z);
      arena.player.setDeltaMovement(Vec3.ZERO);
    }
    arena.researchContain();
    if (desired("refused") && arena.researchAtExit()) EffServer.leave(arena.player);
  }

  public boolean needsCounter() {
    return !closed
        && !requested
        && desired("dirty")
        && Jsons.s(state, "outcome").equals("pending")
        && arena.ready();
  }

  public int revision() {
    return Jsons.i(state, "revision");
  }

  public boolean checkpointOnDisk(String handle) {
    for (JsonElement e : Jsons.a(state, "checkpoints"))
      if (Jsons.s(e.getAsJsonObject(), "handle").equals(handle)) return true;
    return false;
  }

  public void requested() {
    requested = true;
  }

  public void retryCounter() {
    if (retries++ < 1) requested = false;
  }

  public void recordRejected(String source, String actor, String reason) {
    notes.add(actor + ": " + reason);
    while (notes.size() > 8) notes.remove(0);
  }

  public void modelNote(JsonObject p) {
    counter = p.deepCopy();
  }

  public void advice(JsonObject p) {
    advice = p.deepCopy();
  }

  public boolean won() {
    return Jsons.s(state, "outcome").equals("won");
  }

  public JsonObject recentReceipt() {
    return receipt.deepCopy();
  }

  public void close() {
    closed = true;
    if (alive()) avatar.discard();
  }
}
