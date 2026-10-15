package eff.minecraft;

import com.google.gson.*;
import java.nio.file.*;
import java.util.*;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.*;
import net.minecraft.world.entity.decoration.ArmorStand;
import net.minecraft.world.item.*;
import net.minecraft.world.phys.Vec3;

/**
 * Real server-side executors, observed entities, a replaceable event/control instance and disk
 * checkpoints.
 */
public final class ResearchRuntime implements AutoCloseable {
  private final EffArena arena;
  private final Path directory;
  private final Map<String, Saved> checkpoints = new LinkedHashMap<>();
  private final Map<String, Watch> watches = new LinkedHashMap<>();
  private final List<JsonObject> journal = new ArrayList<>();
  private final List<String> notes = new ArrayList<>();
  private ArmorStand avatar;
  private ExecutionInstance instance;
  private int revision, replacements, ticks, counterRounds, retries;
  private boolean knownAlive, dirty, closed, refused, waitingSpawn;
  private boolean recoveryAuthority = true;
  private String outcome = "pending";
  private JsonObject lastAI = new JsonObject(), advice = new JsonObject();

  private final class ExecutionInstance {
    final String id = UUID.randomUUID().toString();
    final Map<String, Runnable> handlers = new HashMap<>();
    boolean tether;

    ExecutionInstance(boolean control, boolean possess) {
      tether = control;
      if (possess)
        handlers.put(
            "possess",
            () -> {
              if (instance == this && alive()) tether = true;
            });
    }
  }

  private record Saved(
      boolean avatar, boolean tether, boolean possess, String owner, String instance) {}

  private static final class Watch {
    final String actor;
    final ResearchProgram.Step condition;
    boolean fired;

    Watch(String a, ResearchProgram.Step s) {
      actor = a;
      condition = s;
    }
  }

  public ResearchRuntime(EffArena arena, Path save) throws Exception {
    this.arena = arena;
    directory = save.resolve("research").resolve(UUID.randomUUID().toString());
    Files.createDirectories(directory);
    instance = new ExecutionInstance(true, true);
    waitingSpawn = true;
    // This is a real disk-backed recoverable execution checkpoint, not the visual body.
    capture("checkpoint.origin", "intruder", new Saved(true, true, true, "intruder", instance.id));
    note("研究场已建立。inspect 可查看对象；每次程序最多 3 次干预，可组合断言与单次触发器。");
  }

  private boolean alive() {
    return avatar != null && !avatar.isRemoved();
  }

  private void note(String text) {
    notes.add(text);
    if (notes.size() > 12) notes.removeFirst();
  }

  private void spawn() {
    if (alive()) throw new IllegalArgumentException("ENTITY_ALREADY_ALIVE");
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
    waitingSpawn = false;
  }

  private JsonObject fields() {
    JsonObject f =
        Jsons.obj(
            "entity.avatar.alive",
            alive(),
            "control.tether.active",
            instance.tether,
            "event.possess.active",
            instance.handlers.containsKey("possess"),
            "authority.recovery.active",
            recoveryAuthority,
            "ending.owned.refused",
            refused,
            "instance.world.active",
            !closed,
            "world.frozen",
            arena.server.tickRateManager().isFrozen(),
            "world.exitOpen",
            Jsons.b(arena.facts(), "exitOpen"));
    checkpoints.forEach(
        (k, v) -> f.addProperty(k + ".active", v.owner().equals("player") || recoveryAuthority));
    return f;
  }

  public JsonObject snapshot() {
    JsonArray saved = new JsonArray();
    checkpoints.forEach(
        (k, v) ->
            saved.add(
                Jsons.obj(
                    "handle",
                    k,
                    "owner",
                    v.owner(),
                    "usable",
                    v.owner().equals("player") || recoveryAuthority,
                    "avatar",
                    v.avatar(),
                    "tether",
                    v.tether(),
                    "possess",
                    v.possess(),
                    "instance",
                    v.instance())));
    JsonArray guards = new JsonArray();
    watches.forEach(
        (k, v) ->
            guards.add(
                Jsons.obj(
                    "name",
                    k,
                    "actor",
                    v.actor,
                    "program",
                    ResearchProgram.render(v.condition),
                    "fired",
                    v.fired)));
    return Jsons.obj(
        "revision",
        revision,
        "instance",
        instance.id,
        "generation",
        replacements + 1,
        "outcome",
        outcome,
        "counterRounds",
        counterRounds,
        "fields",
        fields(),
        "avatarUUID",
        alive() ? avatar.getUUID().toString() : "",
        "checkpoints",
        saved,
        "watches",
        guards,
        "notes",
        notes,
        "journal",
        journal.subList(Math.max(0, journal.size() - 3), journal.size()),
        "counter",
        lastAI,
        "advice",
        advice,
        "budget",
        3,
        "mutationSerial",
        revision);
  }

  public JsonObject observation() {
    JsonObject out = snapshot();
    out.remove("advice");
    out.remove("counter");
    out.remove("notes");
    JsonArray recent = new JsonArray();
    for (JsonElement item : Jsons.a(out, "journal")) {
      JsonObject raw = item.getAsJsonObject(),
          entry =
              Jsons.obj(
                  "actor",
                  Jsons.s(raw, "actor"),
                  "revision",
                  Jsons.i(raw, "revision"),
                  "before",
                  Jsons.o(raw, "before"),
                  "after",
                  Jsons.o(raw, "after"));
      JsonArray steps = new JsonArray();
      for (JsonElement e : Jsons.a(raw, "steps")) {
        JsonObject step = e.getAsJsonObject();
        steps.add(
            Jsons.obj(
                "statement",
                Jsons.s(step, "statement"),
                "accepted",
                Jsons.b(step, "accepted"),
                "reason",
                Jsons.s(step, "reason")));
      }
      entry.add("steps", steps);
      recent.add(entry);
    }
    out.add("journal", recent);
    while (out.toString().length() > 12000 && recent.size() > 1) recent.remove(0);
    return out;
  }

  public boolean needsCounter() {
    return dirty && !closed && outcome.equals("pending") && arena.ready();
  }

  public int revision() {
    return revision;
  }

  public boolean checkpointOnDisk(String handle) {
    if (!handle.matches("checkpoint\\.[a-z][a-z0-9_]{0,19}"))
      throw new IllegalArgumentException("INVALID_HANDLE");
    return Files.isRegularFile(directory.resolve(handle + ".json"));
  }

  public void requested() {
    dirty = false;
  }

  public void retryCounter() {
    if (retries++ < 1 && outcome.equals("pending")) dirty = true;
  }

  public void recordRejected(String source, String actor, String reason) {
    append(
        Jsons.obj(
            "actor",
            actor,
            "revision",
            revision,
            "program",
            source.substring(0, Math.min(source.length(), 4096)),
            "before",
            fields(),
            "after",
            fields(),
            "instance",
            instance.id,
            "steps",
            List.of(
                Jsons.obj(
                    "statement",
                    source.substring(0, Math.min(source.length(), 180)),
                    "accepted",
                    false,
                    "reason",
                    reason))));
  }

  public void modelNote(JsonObject p) {
    lastAI = p.deepCopy();
  }

  public void advice(JsonObject p) {
    advice = p.deepCopy();
  }

  public boolean won() {
    return outcome.equals("won");
  }

  public JsonObject execute(String source, int observed, String actor) {
    if (closed || !outcome.equals("pending"))
      throw new IllegalArgumentException("RESEARCH_FINISHED");
    if (observed != revision) throw new IllegalArgumentException("STALE_RESEARCH_REVISION");
    if (!Set.of("player", "intruder").contains(actor))
      throw new IllegalArgumentException("INVALID_ACTOR");
    List<ResearchProgram.Step> program =
        ResearchProgram.parse(source); // Whole-program syntax/fuel validation first.
    JsonObject before = fields();
    String beforeId = alive() ? avatar.getUUID().toString() : "";
    JsonArray steps = new JsonArray();
    boolean modified = false;
    for (var step : program) {
      JsonObject prior = fields();
      try {
        boolean effect = apply(step, actor);
        modified |= effect;
        project();
        steps.add(
            Jsons.obj(
                "statement",
                ResearchProgram.render(step),
                "accepted",
                true,
                "before",
                prior,
                "after",
                fields()));
        if (!outcome.equals("pending")) break;
      } catch (Exception e) {
        if (!prior.equals(fields())) modified = true;
        steps.add(
            Jsons.obj(
                "statement",
                ResearchProgram.render(step),
                "accepted",
                false,
                "reason",
                e.getMessage(),
                "before",
                prior,
                "after",
                fields()));
        break; // Earlier successful effects are retained and explicitly receipted.
      }
    }
    if (modified) {
      revision++;
      if (actor.equals("intruder")) counterRounds++;
    }
    JsonObject receipt =
        Jsons.obj(
            "actor",
            actor,
            "revision",
            revision,
            "program",
            source,
            "before",
            before,
            "after",
            fields(),
            "entityBefore",
            beforeId,
            "entityAfter",
            alive() ? avatar.getUUID().toString() : "",
            "steps",
            steps,
            "instance",
            instance.id);
    append(receipt);
    if (actor.equals("player") && modified) {
      dirty = true;
      retries = 0;
    }
    fireWatches();
    return receipt;
  }

  private boolean value(String field) {
    JsonElement v = fields().get(field);
    if (v == null) {
      if (field.matches("checkpoint\\.[a-z][a-z0-9_]{0,19}\\.active")) return false;
      throw new IllegalArgumentException("UNKNOWN_FIELD");
    }
    return v.getAsBoolean();
  }

  private boolean apply(ResearchProgram.Step s, String actor) throws Exception {
    String op = s.op(), target = s.target();
    if (op.equals("assert")) {
      if (value(s.field()) != s.expected()) throw new IllegalArgumentException("ASSERTION_FAILED");
      return false;
    }
    if (op.equals("inspect")) {
      if (!Set.of(
                  "entity.avatar",
                  "control.tether",
                  "event.possess",
                  "ending.owned",
                  "instance.world",
                  "authority.recovery")
              .contains(target)
          && !fields().has(target)
          && !checkpoints.containsKey(target)) throw new IllegalArgumentException("UNKNOWN_HANDLE");
      note(target + ": " + fields());
      return false;
    }
    if (op.equals("watch")) {
      value(s.field());
      if (watches.size() >= 4 && !watches.containsKey(s.target()))
        throw new IllegalArgumentException("WATCH_BUDGET");
      Watch old = watches.get(s.target());
      if (old != null && !old.actor.equals(actor))
        throw new IllegalArgumentException("WATCH_OWNERSHIP");
      watches.put(s.target(), new Watch(actor, s));
      return true;
    }
    if (op.equals("unwatch")) {
      Watch w = watches.get(target);
      if (w == null) throw new IllegalArgumentException("UNKNOWN_WATCH");
      // Both combatants can discover and interrupt an exposed guard.
      watches.remove(target);
      return true;
    }
    if (op.equals("erase")) {
      if (!alive()) throw new IllegalArgumentException("ENTITY_ALREADY_ABSENT");
      avatar.discard();
      knownAlive = false;
      note("实际实体已移除；控制连接、处理器与检查点分别保留。");
      return true;
    }
    if (op.equals("disable")) {
      if (target.equals("control.tether")) instance.tether = false;
      else if (target.equals("event.possess")) instance.handlers.remove("possess");
      else {
        if (!actor.equals("player")) throw new IllegalArgumentException("ACTOR_AUTHORITY");
        if (instance.tether || instance.handlers.containsKey("possess"))
          throw new IllegalArgumentException("SOURCE_STILL_EXECUTING");
        recoveryAuthority = false;
        note("上层恢复授权已撤销；旧检查点数据保留，但不能恢复外来者权限。");
      }
      return true;
    }
    if (op.equals("bind") || op.equals("emit")) {
      if (!actor.equals("intruder")) throw new IllegalArgumentException("ACTOR_AUTHORITY");
      Runnable event = instance.handlers.get("possess");
      if (event == null || !alive())
        throw new IllegalArgumentException("POSSESSION_SOURCE_MISSING");
      event.run(); // Actual registered callback drives the same controller used by the server tick.
      return true;
    }
    if (op.equals("spawn")) {
      if (actor.equals("intruder") && !recoveryAuthority)
        throw new IllegalArgumentException("RECOVERY_AUTHORITY_REVOKED");
      if (checkpoints.values().stream().noneMatch(c -> c.avatar() && c.owner().equals(actor)))
        throw new IllegalArgumentException("NO_RECOVERY_SOURCE");
      spawn();
      return true;
    }
    if (op.equals("commit")) {
      if (!actor.equals("intruder")
          || counterRounds < 3
          || !alive()
          || !instance.tether
          || !instance.handlers.containsKey("possess")
          || checkpoints.values().stream().noneMatch(c -> c.owner().equals("intruder")))
        throw new IllegalArgumentException("OCCUPATION_PRECONDITION_UNMET");
      outcome = "lost";
      dirty = false;
      note("持续夺回执行权后，外来者完成占据结局的实际提交。");
      return true;
    }
    if (op.equals("save")) {
      if (actor.equals("intruder")
          && (!instance.tether || !alive() || !instance.handlers.containsKey("possess")))
        throw new IllegalArgumentException("CHECKPOINT_EXECUTION_AUTHORITY_LOST");
      if (checkpoints.size() >= 6 && !checkpoints.containsKey(target))
        throw new IllegalArgumentException("CHECKPOINT_BUDGET");
      Saved old = checkpoints.get(target);
      if (old != null && !old.owner().equals(actor))
        throw new IllegalArgumentException("CHECKPOINT_OWNERSHIP");
      capture(
          target,
          actor,
          new Saved(
              alive(),
              instance.tether,
              instance.handlers.containsKey("possess"),
              actor,
              instance.id));
      return true;
    }
    if (op.equals("seal")) {
      if (!actor.equals("player")) throw new IllegalArgumentException("ACTOR_AUTHORITY");
      if (instance.tether || instance.handlers.containsKey("possess"))
        throw new IllegalArgumentException("SOURCE_STILL_EXECUTING");
      if (!checkpoints.containsKey(target))
        throw new IllegalArgumentException("CHECKPOINT_MISSING");
      Files.deleteIfExists(directory.resolve(target + ".json"));
      checkpoints.remove(target);
      note("恢复来源 " + target + " 已撤销。");
      return true;
    }
    if (op.equals("restore") || op.equals("rebuild")) {
      if (actor.equals("intruder") && !recoveryAuthority)
        throw new IllegalArgumentException("RECOVERY_AUTHORITY_REVOKED");
      String key = target;
      if (op.equals("rebuild")) {
        key =
            checkpoints.entrySet().stream()
                .filter(e -> e.getValue().owner().equals(actor))
                .map(Map.Entry::getKey)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("NO_RECOVERY_SOURCE"));
      }
      Saved saved = checkpoints.get(key);
      if (saved == null || !saved.owner().equals(actor))
        throw new IllegalArgumentException("CHECKPOINT_AUTHORITY");
      // Read and verify the actual checkpoint; a missing/altered disk file is not a recovery
      // receipt.
      JsonObject stored =
          JsonParser.parseString(Files.readString(directory.resolve(key + ".json")))
              .getAsJsonObject();
      if (!stored.equals(savedJson(saved)))
        throw new IllegalArgumentException("CHECKPOINT_CHANGED");
      if (op.equals("rebuild")) {
        if (replacements >= 4) throw new IllegalArgumentException("INSTANCE_BUDGET");
        if (alive()) avatar.discard();
        instance.handlers.clear();
        instance = new ExecutionInstance(saved.tether(), saved.possess());
        replacements++;
        arena.researchRebuild();
        waitingSpawn = saved.avatar();
        knownAlive = false;
        note("旧执行实例已解除；新实例 " + instance.id + " 从 " + key + " 接续。");
      } else {
        instance.tether = saved.tether();
        instance.handlers.clear();
        if (saved.possess()) {
          ExecutionInstance owner = instance;
          instance.handlers.put(
              "possess",
              () -> {
                if (instance == owner && alive()) owner.tether = true;
              });
        }
        if (saved.avatar() && !alive()) spawn();
        if (!saved.avatar() && alive()) {
          avatar.discard();
          knownAlive = false;
        }
        note("已从真实检查点 " + key + " 恢复。");
      }
      return true;
    }
    if (op.equals("refuse")) {
      if (!actor.equals("player")) throw new IllegalArgumentException("ACTOR_AUTHORITY");
      if (instance.tether
          || instance.handlers.containsKey("possess")
          || alive()
          || waitingSpawn
          || checkpoints.values().stream()
              .anyMatch(c -> c.owner().equals("intruder") && recoveryAuthority))
        throw new IllegalArgumentException("ENDING_PRECONDITION_UNMET");
      refused = true;
      project();
      if (!Jsons.b(arena.facts(), "exitOpen"))
        throw new IllegalStateException("NATIVE_EXIT_NOT_OPEN");
      outcome = "won";
      dirty = false;
      note("控制、事件、实体与恢复来源均已处理；MC 出口实际打开。");
      return true;
    }
    throw new IllegalArgumentException("UNKNOWN_INTERVENTION");
  }

  private JsonObject savedJson(Saved s) {
    return Jsons.obj(
        "avatar",
        s.avatar(),
        "tether",
        s.tether(),
        "possess",
        s.possess(),
        "owner",
        s.owner(),
        "instance",
        s.instance());
  }

  private void capture(String key, String actor, Saved s) throws Exception {
    Path temporary = directory.resolve(key + ".json.tmp"), file = directory.resolve(key + ".json");
    Files.writeString(temporary, savedJson(s).toString());
    try {
      Files.move(
          temporary, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
    } catch (AtomicMoveNotSupportedException e) {
      Files.move(temporary, file, StandardCopyOption.REPLACE_EXISTING);
    }
    checkpoints.put(key, s);
  }

  private void append(JsonObject receipt) {
    journal.add(receipt);
    if (journal.size() > 48) journal.removeFirst();
    try {
      Files.writeString(
          directory.resolve("journal.json"), Jsons.obj("receipts", journal).toString());
    } catch (Exception e) {
      note("本地日志写入失败：" + e.getClass().getSimpleName());
    }
  }

  private void fireWatches() {
    int fuel = 4;
    for (Watch w : List.copyOf(watches.values())) {
      if (fuel-- <= 0 || w.fired || !outcome.equals("pending")) continue;
      try {
        if (value(w.condition.field()) != w.condition.expected()) continue;
        w.fired = true;
        JsonObject before = fields();
        boolean changed = apply(w.condition.body(), w.actor);
        if (changed) {
          revision++;
          if (w.actor.equals("player")) dirty = true;
        }
        project();
        append(
            Jsons.obj(
                "actor",
                w.actor + "/watch",
                "revision",
                revision,
                "program",
                ResearchProgram.render(w.condition),
                "before",
                before,
                "after",
                fields(),
                "instance",
                instance.id,
                "steps",
                List.of()));
      } catch (Exception e) {
        recordRejected(ResearchProgram.render(w.condition), w.actor + "/watch", e.getMessage());
        note("触发器被拒绝：" + e.getMessage());
      }
    }
  }

  public void project() {
    arena.researchProject(!instance.tether, refused);
  }

  public void tick() {
    if (closed || !arena.ready()) return;
    ticks++;
    if (waitingSpawn) {
      spawn();
      project();
    }
    boolean now = alive();
    if (knownAlive && !now) {
      knownAlive = false;
      revision++;
      dirty = true;
      retries = 0;
      note("MC 实测：投影被外部伤害、命令或模组移除；控制来源尚需独立检查。");
      append(
          Jsons.obj(
              "actor",
              "native-observer",
              "revision",
              revision,
              "program",
              "entity.avatar removed externally",
              "after",
              fields(),
              "instance",
              instance.id,
              "steps",
              List.of()));
    }
    fireWatches();
    project();
    if (instance.tether) {
      Vec3 anchor = arena.researchAnchor();
      if (arena.player.position().distanceToSqr(anchor) > .02)
        arena.player.teleportTo(anchor.x, anchor.y, anchor.z);
      arena.player.setDeltaMovement(Vec3.ZERO);
    }
    arena.researchContain();
    if (refused && arena.researchAtExit()) EffServer.leave(arena.player);
  }

  public JsonObject recentReceipt() {
    return journal.isEmpty() ? new JsonObject() : journal.getLast().deepCopy();
  }

  @Override
  public void close() {
    closed = true;
    dirty = false;
    if (alive()) avatar.discard();
    instance.handlers.clear();
    watches.clear();
  }
}
