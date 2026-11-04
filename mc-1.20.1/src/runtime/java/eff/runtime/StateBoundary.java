package eff.runtime;

import com.google.gson.*;
import eff.minecraft.ResearchProgram;
import java.util.*;

/**
 * Closed gameplay DTO. Executable context and ambient host capabilities never cross generations.
 */
public final class StateBoundary {
  private static final Set<String> ROOT =
      Set.of(
          "revision",
          "instance",
          "generation",
          "outcome",
          "counterRounds",
          "avatar",
          "tether",
          "possess",
          "recovery",
          "refused",
          "dirty",
          "checkpoints",
          "watches",
          "journal");
  private static final Set<String> CHECKPOINT =
      Set.of("avatar", "tether", "possess", "owner", "instance");
  private static final Set<String> WATCH = Set.of("actor", "program", "fired");
  private static final Set<String> FIELDS =
      Set.of(
          "entity.avatar.alive",
          "control.tether.active",
          "event.possess.active",
          "authority.recovery.active",
          "ending.owned.refused",
          "instance.world.active",
          "world.frozen",
          "world.exitOpen");
  private static final Set<String> RECEIPT =
      Set.of("actor", "revision", "program", "before", "after", "steps", "instance");
  private static final Set<String> WATCH_RECEIPT =
      Set.of("actor", "revision", "program", "before", "after", "steps");
  private static final Set<String> WATCH_FAILURE = Set.of("actor", "reason");
  private static final Set<String> STEP = Set.of("statement", "accepted", "before", "after");
  private static final Set<String> REJECTED_STEP =
      Set.of("statement", "accepted", "before", "after", "reason");

  private static void require(boolean valid, String error) {
    if (!valid) throw new IllegalArgumentException(error);
  }

  private static JsonObject object(JsonElement value) {
    require(value != null && value.isJsonObject(), "STATE_OBJECT_TYPE");
    return value.getAsJsonObject();
  }

  private static JsonArray array(JsonElement value) {
    require(value != null && value.isJsonArray(), "STATE_ARRAY_TYPE");
    return value.getAsJsonArray();
  }

  private static void keys(JsonObject value, Set<String> expected) {
    require(value.keySet().equals(expected), "STATE_UNKNOWN_OR_MISSING_KEYS");
  }

  private static String text(JsonObject value, String key, int max) {
    JsonElement field = value.get(key);
    require(
        field != null && field.isJsonPrimitive() && field.getAsJsonPrimitive().isString(),
        "STATE_STRING_TYPE");
    String result = field.getAsString();
    require(result.length() <= max, "STATE_STRING_BUDGET");
    return result;
  }

  private static boolean bool(JsonObject value, String key) {
    JsonElement field = value.get(key);
    require(
        field != null && field.isJsonPrimitive() && field.getAsJsonPrimitive().isBoolean(),
        "STATE_BOOLEAN_TYPE");
    return field.getAsBoolean();
  }

  private static int integer(JsonObject value, String key, int low, int high) {
    JsonElement field = value.get(key);
    require(
        field != null && field.isJsonPrimitive() && field.getAsJsonPrimitive().isNumber(),
        "STATE_INTEGER_TYPE");
    String raw = field.getAsString();
    require(raw.matches("0|[1-9][0-9]{0,9}"), "STATE_INTEGER_TYPE");
    long result;
    try {
      result = Long.parseLong(raw);
    } catch (NumberFormatException e) {
      throw new IllegalArgumentException("STATE_INTEGER_TYPE");
    }
    require(result >= low && result <= high, "STATE_INTEGER_RANGE");
    return (int) result;
  }

  private static void uuid(JsonObject value, String key) {
    String raw = text(value, key, 36);
    require(
        raw.matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"),
        "STATE_INSTANCE_INVALID");
  }

  private static String actor(JsonObject value, String key) {
    String result = text(value, key, 16);
    require(result.equals("player") || result.equals("intruder"), "STATE_ACTOR_INVALID");
    return result;
  }

  private static void reason(JsonObject value) {
    require(text(value, "reason", 120).matches("[A-Z][A-Z0-9_]{0,119}"), "STATE_REASON_INVALID");
  }

  private static void fields(JsonElement value) {
    JsonObject f = object(value);
    require(
        f.size() >= 8 && f.size() <= 14 && f.keySet().containsAll(FIELDS), "STATE_FIELDS_INVALID");
    for (String key : f.keySet()) {
      require(
          FIELDS.contains(key) || key.matches("checkpoint\\.[a-z][a-z0-9_]{0,19}\\.active"),
          "STATE_FIELDS_INVALID");
      bool(f, key);
    }
    require(
        bool(f, "instance.world.active")
            && bool(f, "world.frozen") == bool(f, "control.tether.active")
            && bool(f, "world.exitOpen") == bool(f, "ending.owned.refused"),
        "STATE_FIELDS_INCONSISTENT");
  }

  private static void program(String source, boolean watchOnly, String expectedWatch) {
    List<ResearchProgram.Step> parsed;
    try {
      parsed = ResearchProgram.parse(source);
    } catch (IllegalArgumentException e) {
      throw new IllegalArgumentException("STATE_PROGRAM_INVALID");
    }
    if (watchOnly) {
      require(
          parsed.size() == 1
              && parsed.get(0).op().equals("watch")
              && (expectedWatch == null || parsed.get(0).target().equals(expectedWatch)),
          "STATE_WATCH_INVALID");
      String field = parsed.get(0).field();
      require(
          FIELDS.contains(field) || field.matches("checkpoint\\.[a-z][a-z0-9_]{0,19}\\.active"),
          "STATE_WATCH_FIELD_INVALID");
    }
  }

  private static void journal(JsonArray values, int revision) {
    require(values.size() <= 12 && values.toString().length() <= 48000, "STATE_JOURNAL_BUDGET");
    for (JsonElement raw : values) {
      JsonObject r = object(raw);
      String actor = text(r, "actor", 20);
      boolean watch = actor.equals("player/watch") || actor.equals("intruder/watch");
      if (watch && r.has("reason")) {
        keys(r, WATCH_FAILURE);
        reason(r);
        continue;
      }
      keys(r, watch ? WATCH_RECEIPT : RECEIPT);
      require(
          watch
              || actor.equals("player")
              || actor.equals("intruder")
              || actor.equals("native-observer"),
          "STATE_ACTOR_INVALID");
      integer(r, "revision", 0, revision);
      String source = text(r, "program", 4096);
      if (actor.equals("native-observer"))
        require(source.equals("entity.avatar removed externally"), "STATE_PROGRAM_INVALID");
      else program(source, watch, null);
      if (!watch) uuid(r, "instance");
      fields(r.get("before"));
      fields(r.get("after"));
      JsonArray steps = array(r.get("steps"));
      require(steps.size() <= 16 && (!watch || steps.isEmpty()), "STATE_STEP_BUDGET");
      for (JsonElement rawStep : steps) {
        JsonObject step = object(rawStep);
        boolean accepted = bool(step, "accepted");
        keys(step, accepted ? STEP : REJECTED_STEP);
        program(text(step, "statement", 4096), false, null);
        if (!accepted) reason(step);
        fields(step.get("before"));
        fields(step.get("after"));
      }
    }
  }

  public static JsonObject checked(JsonObject state) {
    require(state != null, "STATE_OBJECT_TYPE");
    keys(state, ROOT);
    require(state.toString().length() <= 65536, "STATE_BUDGET");
    int revision = integer(state, "revision", 0, Integer.MAX_VALUE);
    integer(state, "generation", 1, 5);
    integer(state, "counterRounds", 0, revision);
    uuid(state, "instance");
    String outcome = text(state, "outcome", 7);
    require(Set.of("pending", "won", "lost").contains(outcome), "STATE_OUTCOME_INVALID");
    for (String key : List.of("avatar", "tether", "possess", "recovery", "refused", "dirty"))
      bool(state, key);
    require(bool(state, "refused") == outcome.equals("won"), "STATE_ENDING_INCONSISTENT");
    if (outcome.equals("won"))
      require(
          !bool(state, "avatar") && !bool(state, "tether") && !bool(state, "possess"),
          "STATE_ENDING_INCONSISTENT");
    if (!outcome.equals("pending")) require(!bool(state, "dirty"), "STATE_ENDING_INCONSISTENT");
    JsonObject checkpoints = object(state.get("checkpoints"));
    require(checkpoints.size() <= 6, "STATE_CHECKPOINT_BUDGET");
    for (var entry : checkpoints.entrySet()) {
      require(entry.getKey().matches("checkpoint\\.[a-z][a-z0-9_]{0,19}"), "STATE_CHECKPOINT_NAME");
      JsonObject checkpoint = object(entry.getValue());
      keys(checkpoint, CHECKPOINT);
      for (String key : List.of("avatar", "tether", "possess")) bool(checkpoint, key);
      actor(checkpoint, "owner");
      uuid(checkpoint, "instance");
    }
    JsonObject watches = object(state.get("watches"));
    require(watches.size() <= 4, "STATE_WATCH_BUDGET");
    for (var entry : watches.entrySet()) {
      require(entry.getKey().matches("[a-z][a-z0-9_]{0,19}"), "STATE_WATCH_NAME");
      JsonObject watch = object(entry.getValue());
      keys(watch, WATCH);
      actor(watch, "actor");
      bool(watch, "fired");
      program(text(watch, "program", 4096), true, entry.getKey());
    }
    journal(array(state.get("journal")), revision);
    return state.deepCopy();
  }

  private StateBoundary() {}
}
