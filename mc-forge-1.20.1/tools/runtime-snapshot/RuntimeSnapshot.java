package eff.diagnostics;

import java.lang.instrument.Instrumentation;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.nio.file.*;
import java.util.*;

/** Opt-in diagnostic agent: reads EFF fields, registers no transformer and performs no repair. */
public final class RuntimeSnapshot {
  private static final Map<String, List<String>> FIELDS = Map.of(
      "eff.minecraft.RuntimeLink", List.of("admitted", "active", "paused", "started", "CLIENT", "SERVER",
          "HEARTBEAT", "PROJECTION_SEQUENCE", "heartbeatPhase", "projection"),
      "eff.minecraft.client.EffClient", List.of("state", "sequence", "error", "manualPause", "pauseSent"),
      "eff.minecraft.client.EntityGuardSelfTest", List.of("MANUAL", "manualPhase", "manualError",
          "manualServerPending", "manualFailed", "manualSamples", "manualServerAt"),
      "eff.minecraft.EffServer", List.of("ticks"));

  public static void agentmain(String output, Instrumentation instrumentation) throws Exception {
    String mode = System.getProperty("eff.manualCombat", "");
    if (!mode.equals("foreverlove") && !mode.equals("pig2"))
      throw new IllegalStateException("MANUAL_CANDIDATE_REQUIRED");
    Path target = Path.of(output).toAbsolutePath().normalize();
    if (!target.getFileName().toString().matches("runtime-snapshot-[a-z0-9-]+\\.json"))
      throw new IllegalArgumentException("SNAPSHOT_FILENAME_REQUIRED");
    Files.writeString(target, collect(instrumentation.getAllLoadedClasses()), StandardOpenOption.CREATE_NEW);
  }

  static String collect(Class<?>[] loaded) {
    Map<String, String> values = new LinkedHashMap<>();
    values.put("scope", "read-only-cross-thread-diagnostic-not-acceptance");
    values.put("pid", Long.toString(ProcessHandle.current().pid()));
    values.put("atUnixMs", Long.toString(System.currentTimeMillis()));
    for (Class<?> type : loaded) {
      List<String> fields = FIELDS.get(type.getName());
      if (fields == null) continue;
      for (String name : fields) {
        String key = type.getName() + "." + name;
        if (values.containsKey(key)) { values.put(key, "AMBIGUOUS_CLASS_LOADERS"); continue; }
        try {
          Field field = type.getDeclaredField(name);
          if (!Modifier.isStatic(field.getModifiers()) || !field.trySetAccessible())
            throw new IllegalAccessException("FIELD_UNAVAILABLE");
          values.put(key, bounded(String.valueOf(field.get(null)), 20000));
        } catch (ReflectiveOperationException | RuntimeException | LinkageError error) {
          values.put(key, "UNAVAILABLE:" + error.getClass().getSimpleName());
        }
      }
      if (type.getName().equals("eff.minecraft.EffServer")) inspectRuns(type, values);
    }
    StringJoiner json = new StringJoiner(",", "{", "}");
    values.forEach((key, value) -> json.add(quote(key) + ":" + quote(value)));
    return json.toString();
  }

  private static void inspectRuns(Class<?> type, Map<String, String> values) {
    try {
      Field field = type.getDeclaredField("RUNS");
      if (!field.trySetAccessible()) throw new IllegalAccessException();
      Object value = field.get(null);
      if (!(value instanceof Map<?, ?> map)) return;
      int count = 0;
      // A racing copy is reported as unavailable, never repaired or treated as a consistent snapshot.
      for (Object run : map.values().toArray()) {
        if (count >= 4) break;
        String prefix = "run" + (++count) + ".";
        for (String name : List.of("active", "manualFault", "polling", "unacknowledgedTicks", "researchBusy"))
          readInstance(run, name, prefix, values);
        Object arena = readInstance(run, "arena", prefix, values);
        if (arena != null) for (String name : List.of("closed", "appliedState", "entered", "ticks", "playerLifetimeClaimed"))
          readInstance(arena, name, prefix + "arena.", values);
      }
      values.put("runCount", Integer.toString(map.size()));
    } catch (ReflectiveOperationException | RuntimeException | LinkageError error) {
      values.put("runsError", error.getClass().getName());
    }
  }

  private static Object readInstance(Object instance, String name, String prefix, Map<String,String> values) {
    try {
      Field field = instance.getClass().getDeclaredField(name);
      if (Modifier.isStatic(field.getModifiers()) || !field.trySetAccessible()) throw new IllegalAccessException();
      Object value = field.get(instance);
      values.put(prefix + name, value == null ? "null" : (value instanceof Number || value instanceof Boolean
          || value instanceof String) ? bounded(String.valueOf(value), 1000) : value.getClass().getName());
      return value;
    } catch (ReflectiveOperationException | RuntimeException | LinkageError error) {
      values.put(prefix + name, "UNAVAILABLE:" + error.getClass().getSimpleName()); return null;
    }
  }

  static String bounded(String text, int max) { return text.length() <= max ? text : text.substring(0,max) + "[TRUNCATED]"; }
  static String quote(String text) {
    StringBuilder out = new StringBuilder("\"");
    for (char c : text.toCharArray()) {
      if (c == '"' || c == '\\') out.append('\\').append(c);
      else if (c < 32) out.append(String.format("\\u%04x", (int)c));
      else out.append(c);
    }
    return out.append('"').toString();
  }
}
