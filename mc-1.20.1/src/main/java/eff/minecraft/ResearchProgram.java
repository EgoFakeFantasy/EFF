package eff.minecraft;

import java.util.*;
import java.util.regex.*;

/** A bounded composable intervention language. No JVM source, reflection or host calls. */
public final class ResearchProgram {
  public record Step(String op, String target, String field, boolean expected, Step body) {}

  private static final Pattern WATCH =
      Pattern.compile(
          "watch ([a-z][a-z0-9_]{0,19}) when ([a-z][a-zA-Z0-9_.]{0,63}) == (true|false) -> (.+)");
  private static final Pattern ASSERT =
      Pattern.compile("assert ([a-z][a-zA-Z0-9_.]{0,63}) == (true|false)");
  private static final Map<String, String> TARGETS =
      Map.ofEntries(
          Map.entry("erase", "entity.avatar"),
          Map.entry("spawn", "entity.avatar"),
          Map.entry("bind", "control.tether"),
          Map.entry("emit", "event.possess"),
          Map.entry("refuse", "ending.owned"),
          Map.entry("commit", "ending.owned"),
          Map.entry("rebuild", "instance.world"));

  public static List<Step> parse(String source) {
    if (source == null || source.length() > 4096 || source.isBlank())
      throw new IllegalArgumentException("PROGRAM_SIZE");
    List<Step> out = new ArrayList<>();
    for (String raw : source.split("[;\\r\\n]+")) {
      String line = raw.trim();
      if (line.isEmpty() || line.startsWith("#")) continue;
      if (out.size() >= 16) throw new IllegalArgumentException("PROGRAM_FUEL");
      out.add(parseLine(line, true));
    }
    if (out.isEmpty()) throw new IllegalArgumentException("EMPTY_PROGRAM");
    long cost = out.stream().filter(s -> !Set.of("assert", "inspect").contains(s.op())).count();
    if (cost > 3) throw new IllegalArgumentException("TURN_BUDGET_3");
    return List.copyOf(out);
  }

  private static Step parseLine(String line, boolean allowWatch) {
    Matcher m = WATCH.matcher(line);
    if (m.matches() && allowWatch) {
      Step body = parseLine(m.group(4), false);
      if (Set.of("assert", "inspect", "watch", "unwatch", "rebuild").contains(body.op()))
        throw new IllegalArgumentException("INVALID_WATCH_BODY");
      return new Step("watch", m.group(1), m.group(2), Boolean.parseBoolean(m.group(3)), body);
    }
    m = ASSERT.matcher(line);
    if (m.matches())
      return new Step("assert", "", m.group(1), Boolean.parseBoolean(m.group(2)), null);
    String[] parts = line.split("\\s+");
    if (parts.length != 2 || !parts[1].matches("[a-z][a-zA-Z0-9_.]{0,63}"))
      throw new IllegalArgumentException("PROGRAM_SYNTAX");
    String op = parts[0], target = parts[1];
    boolean valid = TARGETS.containsKey(op) && TARGETS.get(op).equals(target);
    if (op.equals("disable"))
      valid = Set.of("control.tether", "event.possess", "authority.recovery").contains(target);
    if (Set.of("seal", "restore", "save").contains(op))
      valid = target.matches("checkpoint\\.[a-z][a-z0-9_]{0,19}");
    if (op.equals("inspect"))
      valid = true; // Runtime verifies known handles or actual public fields.
    if (op.equals("unwatch")) valid = target.matches("[a-z][a-z0-9_]{0,19}");
    if (!valid) throw new IllegalArgumentException("UNKNOWN_INTERVENTION");
    return new Step(op, target, "", false, null);
  }

  public static String render(Step s) {
    if (s.op().equals("watch"))
      return "watch "
          + s.target()
          + " when "
          + s.field()
          + " == "
          + s.expected()
          + " -> "
          + render(s.body());
    if (s.op().equals("assert")) return "assert " + s.field() + " == " + s.expected();
    return s.op() + " " + s.target();
  }

  private ResearchProgram() {}
}
