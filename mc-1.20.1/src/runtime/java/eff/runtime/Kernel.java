package eff.runtime;

import static eff.minecraft.Jsons.*;

import com.google.gson.*;
import eff.minecraft.Jsons;
import eff.minecraft.ResearchProgram;
import java.util.*;

/** Portable research semantics. No Minecraft, filesystem, native code or arbitrary evaluation. */
public final class Kernel {
  private JsonObject s;
  private String transaction;
  private int instanceSerial;
  private final JsonArray actions = new JsonArray();

  public static JsonObject initial() {
    JsonObject s =
        obj(
            "revision",
            0,
            "instance",
            UUID.randomUUID().toString(),
            "generation",
            1,
            "outcome",
            "pending",
            "counterRounds",
            0,
            "avatar",
            true,
            "tether",
            true,
            "possess",
            true,
            "recovery",
            true,
            "refused",
            false,
            "dirty",
            false,
            "checkpoints",
            new JsonObject(),
            "watches",
            new JsonObject(),
            "journal",
            new JsonArray());
    o(s, "checkpoints").add("checkpoint.origin", saved(s, "intruder"));
    return s;
  }

  private static JsonObject saved(JsonObject s, String actor) {
    return obj(
        "avatar",
        b(s, "avatar"),
        "tether",
        b(s, "tether"),
        "possess",
        b(s, "possess"),
        "owner",
        actor,
        "instance",
        Jsons.s(s, "instance"));
  }

  public static JsonObject fields(JsonObject s) {
    JsonObject f =
        obj(
            "entity.avatar.alive",
            b(s, "avatar"),
            "control.tether.active",
            b(s, "tether"),
            "event.possess.active",
            b(s, "possess"),
            "authority.recovery.active",
            b(s, "recovery"),
            "ending.owned.refused",
            b(s, "refused"),
            "instance.world.active",
            true,
            "world.frozen",
            b(s, "tether"),
            "world.exitOpen",
            b(s, "refused"));
    o(s, "checkpoints")
        .entrySet()
        .forEach(
            e ->
                f.addProperty(
                    e.getKey() + ".active",
                    Jsons.s(e.getValue().getAsJsonObject(), "owner").equals("player")
                        || b(s, "recovery")));
    return f;
  }

  public static JsonObject snapshot(JsonObject s) {
    JsonObject out = s.deepCopy();
    out.add("fields", fields(s));
    JsonArray cps = new JsonArray(), watches = new JsonArray();
    o(s, "checkpoints")
        .entrySet()
        .forEach(
            e -> {
              JsonObject c = e.getValue().getAsJsonObject().deepCopy();
              c.addProperty("handle", e.getKey());
              c.addProperty("usable", Jsons.s(c, "owner").equals("player") || b(s, "recovery"));
              cps.add(c);
            });
    o(s, "watches")
        .entrySet()
        .forEach(
            e -> {
              JsonObject w = e.getValue().getAsJsonObject().deepCopy();
              w.addProperty("name", e.getKey());
              watches.add(w);
            });
    out.add("checkpoints", cps);
    out.add("watches", watches);
    out.addProperty("budget", 3);
    out.addProperty("mutationSerial", i(s, "revision"));
    out.add("notes", new JsonArray());
    return out;
  }

  public static JsonObject run(JsonObject request) {
    Kernel k = new Kernel();
    k.transaction = Jsons.s(request, "transaction");
    k.s = o(request, "state").deepCopy();
    String actor = Jsons.s(request, "actor"), source = Jsons.s(request, "source");
    if (!Set.of("player", "intruder", "native-observer").contains(actor)) fail("INVALID_ACTOR");
    if (i(request, "revision") != i(k.s, "revision")) fail("STALE_RESEARCH_REVISION");
    if (!Jsons.s(k.s, "outcome").equals("pending")) fail("RESEARCH_FINISHED");
    JsonObject before = fields(k.s);
    JsonArray steps = new JsonArray();
    boolean changed = false;
    if (actor.equals("native-observer")) {
      if (!source.equals("entity.avatar removed externally")) fail("INVALID_OBSERVATION");
      if (b(k.s, "avatar")) {
        k.s.addProperty("avatar", false);
        changed = true;
      }
    } else {
      var program =
          ResearchProgram.parse(source); // reject malformed whole programs before any effect
      for (var step : program) {
        JsonObject prior = fields(k.s);
        try {
          changed |= k.apply(step, actor);
          steps.add(
              obj(
                  "statement",
                  ResearchProgram.render(step),
                  "accepted",
                  true,
                  "before",
                  prior,
                  "after",
                  fields(k.s)));
          if (!Jsons.s(k.s, "outcome").equals("pending")) break;
        } catch (IllegalArgumentException e) {
          steps.add(
              obj(
                  "statement",
                  ResearchProgram.render(step),
                  "accepted",
                  false,
                  "reason",
                  e.getMessage(),
                  "before",
                  prior,
                  "after",
                  fields(k.s)));
          break;
        }
      }
    }
    if (changed) {
      k.s.addProperty("revision", i(k.s, "revision") + 1);
      if (actor.equals("intruder")) k.s.addProperty("counterRounds", i(k.s, "counterRounds") + 1);
    }
    if (actor.equals("player") && changed || actor.equals("native-observer") && changed)
      k.s.addProperty("dirty", true);
    if (actor.equals("intruder")) k.s.addProperty("dirty", false);
    JsonObject receipt =
        obj(
            "actor",
            actor,
            "revision",
            i(k.s, "revision"),
            "program",
            source,
            "before",
            before,
            "after",
            fields(k.s),
            "steps",
            steps,
            "instance",
            Jsons.s(k.s, "instance"));
    k.append(receipt);
    // One-shot guards are part of the same durable transition, including their fired state.
    for (var entry : o(k.s, "watches").entrySet()) {
      JsonObject w = entry.getValue().getAsJsonObject();
      if (b(w, "fired") || !Jsons.s(k.s, "outcome").equals("pending")) continue;
      var condition = ResearchProgram.parse(Jsons.s(w, "program")).get(0);
      if (k.value(condition.field()) != condition.expected()) continue;
      w.addProperty("fired", true);
      try {
        JsonObject prior = fields(k.s);
        boolean effect = k.apply(condition.body(), Jsons.s(w, "actor"));
        if (effect) {
          k.s.addProperty("revision", i(k.s, "revision") + 1);
          if (Jsons.s(w, "actor").equals("player")) k.s.addProperty("dirty", true);
        }
        k.append(
            obj(
                "actor",
                Jsons.s(w, "actor") + "/watch",
                "revision",
                i(k.s, "revision"),
                "program",
                Jsons.s(w, "program"),
                "before",
                prior,
                "after",
                fields(k.s),
                "steps",
                new JsonArray()));
      } catch (IllegalArgumentException ex) {
        k.append(obj("actor", Jsons.s(w, "actor") + "/watch", "reason", ex.getMessage()));
      }
    }
    if (!Jsons.s(k.s, "outcome").equals("pending")) k.s.addProperty("dirty", false);
    return obj("state", k.s, "receipt", receipt, "actions", k.actions);
  }

  private void append(JsonObject receipt) {
    JsonArray j = a(s, "journal");
    j.add(receipt);
    while (j.size() > 12 || j.size() > 1 && j.toString().length() > 48000) j.remove(0);
  }

  private boolean value(String field) {
    JsonObject f = fields(s);
    if (f.has(field)) return f.get(field).getAsBoolean();
    if (field.matches("checkpoint\\.[a-z][a-z0-9_]{0,19}\\.active")) return false;
    fail("UNKNOWN_FIELD");
    return false;
  }

  private static void fail(String reason) {
    throw new IllegalArgumentException(reason);
  }

  private void need(boolean condition, String reason) {
    if (!condition) fail(reason);
  }

  private boolean apply(ResearchProgram.Step step, String actor) {
    String op = step.op(), t = step.target();
    JsonObject cps = o(s, "checkpoints"), ws = o(s, "watches");
    boolean player = actor.equals("player");
    switch (op) {
      case "assert":
        need(value(step.field()) == step.expected(), "ASSERTION_FAILED");
        return false;
      case "inspect":
        need(
            Set.of(
                        "runtime.policy",
                        "runtime.execution",
                        "runtime.host",
                        "entity.avatar",
                        "control.tether",
                        "event.possess",
                        "authority.recovery",
                        "ending.owned",
                        "instance.world")
                    .contains(t)
                || fields(s).has(t)
                || cps.has(t),
            "UNKNOWN_HANDLE");
        return false;
      case "watch":
        value(step.field());
        need(ws.size() < 4 || ws.has(t), "WATCH_BUDGET");
        need(!ws.has(t) || Jsons.s(o(ws, t), "actor").equals(actor), "WATCH_OWNERSHIP");
        ws.add(t, obj("actor", actor, "program", ResearchProgram.render(step), "fired", false));
        return true;
      case "unwatch":
        need(ws.has(t), "UNKNOWN_WATCH");
        ws.remove(t);
        return true;
      case "erase":
        need(b(s, "avatar"), "ENTITY_ALREADY_ABSENT");
        s.addProperty("avatar", false);
        return true;
      case "disable":
        if (t.equals("control.tether")) s.addProperty("tether", false);
        else if (t.equals("event.possess")) s.addProperty("possess", false);
        else {
          need(player, "ACTOR_AUTHORITY");
          need(!b(s, "tether") && !b(s, "possess"), "SOURCE_STILL_EXECUTING");
          s.addProperty("recovery", false);
        }
        return true;
      case "bind":
      case "emit":
        need(!player, "ACTOR_AUTHORITY");
        need(b(s, "avatar") && b(s, "possess"), "POSSESSION_SOURCE_MISSING");
        s.addProperty("tether", true);
        return true;
      case "spawn":
        need(player || b(s, "recovery"), "RECOVERY_AUTHORITY_REVOKED");
        need(!b(s, "avatar"), "ENTITY_ALREADY_ALIVE");
        need(
            cps.entrySet().stream()
                .anyMatch(
                    e ->
                        Jsons.s(e.getValue().getAsJsonObject(), "owner").equals(actor)
                            && b(e.getValue().getAsJsonObject(), "avatar")),
            "NO_RECOVERY_SOURCE");
        s.addProperty("avatar", true);
        return true;
      case "commit":
        need(
            !player
                && i(s, "counterRounds") >= 3
                && b(s, "avatar")
                && b(s, "tether")
                && b(s, "possess")
                && cps.entrySet().stream()
                    .anyMatch(
                        e -> Jsons.s(e.getValue().getAsJsonObject(), "owner").equals("intruder")),
            "OCCUPATION_PRECONDITION_UNMET");
        s.addProperty("outcome", "lost");
        return true;
      case "save":
        need(
            player || b(s, "avatar") && b(s, "tether") && b(s, "possess"),
            "CHECKPOINT_EXECUTION_AUTHORITY_LOST");
        need(cps.size() < 6 || cps.has(t), "CHECKPOINT_BUDGET");
        need(!cps.has(t) || Jsons.s(o(cps, t), "owner").equals(actor), "CHECKPOINT_OWNERSHIP");
        cps.add(t, saved(s, actor));
        return true;
      case "seal":
        need(player, "ACTOR_AUTHORITY");
        need(!b(s, "tether") && !b(s, "possess"), "SOURCE_STILL_EXECUTING");
        need(cps.has(t), "CHECKPOINT_MISSING");
        cps.remove(t);
        return true;
      case "rebuild":
        need(player || b(s, "recovery"), "RECOVERY_AUTHORITY_REVOKED");
        if (t.startsWith("runtime.")) {
          actions.add(t.substring(8));
          return true;
        }
        need(i(s, "generation") < 5, "INSTANCE_BUDGET");
        t =
            cps.entrySet().stream()
                .filter(e -> Jsons.s(e.getValue().getAsJsonObject(), "owner").equals(actor))
                .map(Map.Entry::getKey)
                .findFirst()
                .orElse("");
        need(!t.isEmpty(), "NO_RECOVERY_SOURCE");
        s.addProperty(
            "instance",
            UUID.nameUUIDFromBytes(
                    (transaction + ":" + (++instanceSerial))
                        .getBytes(java.nio.charset.StandardCharsets.UTF_8))
                .toString());
        s.addProperty("generation", i(s, "generation") + 1);
      // Fall through to the same owned-checkpoint semantics.
      case "restore":
        need(player || b(s, "recovery"), "RECOVERY_AUTHORITY_REVOKED");
        need(cps.has(t) && Jsons.s(o(cps, t), "owner").equals(actor), "CHECKPOINT_AUTHORITY");
        JsonObject c = o(cps, t);
        for (String k : List.of("avatar", "tether", "possess")) s.addProperty(k, b(c, k));
        return true;
      case "refuse":
        need(player, "ACTOR_AUTHORITY");
        need(
            !b(s, "tether")
                && !b(s, "possess")
                && !b(s, "avatar")
                && (!b(s, "recovery")
                    || cps.entrySet().stream()
                        .noneMatch(
                            e ->
                                Jsons.s(e.getValue().getAsJsonObject(), "owner")
                                    .equals("intruder"))),
            "ENDING_PRECONDITION_UNMET");
        s.addProperty("refused", true);
        s.addProperty("outcome", "won");
        return true;
      default:
        fail("UNKNOWN_INTERVENTION");
        return false;
    }
  }

  private Kernel() {}
}
