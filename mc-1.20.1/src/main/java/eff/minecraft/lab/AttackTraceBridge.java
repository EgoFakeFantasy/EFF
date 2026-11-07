package eff.minecraft.lab;

import com.google.gson.JsonObject;

/** Opt-in in-process observations, never a trust root against an adversarial JVM. */
public final class AttackTraceBridge {
  private static final boolean ENABLED = Boolean.getBoolean("eff.labAttackTrace");
  private static final String MANUAL_PROFILE = System.getProperty("eff.manualCombat", "");
  private static final boolean MANUAL_ENABLED = "pig2".equals(MANUAL_PROFILE) || "foreverlove".equals(MANUAL_PROFILE);
  private static ManualContext manual;

  // Independent of the automated attack window: manual diagnostics never arm an
  // attack, advance its success clock, or confer an automatic combat verdict.
  private static final class ManualBinding {
    final Thread owner = Thread.currentThread();
    final Object[] originals;
    final String[] identities;
    ManualBinding(java.util.List<?> objects, java.util.List<String> ids) {
      originals = objects.toArray(); identities = ids.toArray(String[]::new);
    }
  }
  private static final class ManualContext {
    final String run;
    ManualBinding server, client;
    final java.util.LinkedHashMap<String, JsonObject> events = new java.util.LinkedHashMap<>();
    final java.util.HashMap<String, Long> operationLastNanos = new java.util.HashMap<>();
    final java.util.ArrayList<JsonObject> bursts = new java.util.ArrayList<>();
    int burstDropped;
    final java.util.ArrayList<JsonObject> damages = new java.util.ArrayList<>();
    int damageWrongThread, damageDropped;
    int wrongThread, dropped;
    ManualContext(String run) { this.run = run; }
  }

  /** Freeze original references once per side; never replace a dead/lost object. */
  public static synchronized void watchManual(String run, boolean server,
      java.util.List<?> objects, java.util.List<String> ids) {
    if (!MANUAL_ENABLED) return;
    if (run == null || run.isEmpty() || run.length() > 80 || objects == null || ids == null
        || objects.isEmpty() || objects.size() > 32 || objects.size() != ids.size())
      throw new IllegalArgumentException("MANUAL_TRACE_BINDING");
    var seen = new java.util.IdentityHashMap<Object, Boolean>();
    var seenIds = new java.util.HashSet<String>();
    for (int i = 0; i < objects.size(); i++) {
      if (objects.get(i) == null || seen.put(objects.get(i), true) != null
          || ids.get(i) == null || ids.get(i).isEmpty() || ids.get(i).length() > 100
          || !seenIds.add(ids.get(i))) throw new IllegalArgumentException("MANUAL_TRACE_ORIGINALS");
    }
    if (manual != null && (!manual.run.equals(run) || (server ? manual.server : manual.client) != null))
      throw new IllegalStateException("MANUAL_TRACE_REBIND_FORBIDDEN");
    if (!server) {
      if (manual == null || manual.server == null
          || !java.util.Arrays.equals(manual.server.identities, ids.toArray(String[]::new)))
        throw new IllegalArgumentException("MANUAL_TRACE_CLIENT_ROSTER_MISMATCH");
      for (Object client : objects) for (Object original : manual.server.originals)
        if (client == original) throw new IllegalArgumentException("MANUAL_TRACE_SIDES_ALIASED");
    }
    if (manual == null) manual = new ManualContext(run);
    if (server) manual.server = new ManualBinding(objects, ids);
    else manual.client = new ManualBinding(objects, ids);
  }

  private static int saturate(int value) { return value < 1_000_000 ? value + 1 : value; }

  public static boolean manualDamageEnabled() { return MANUAL_ENABLED; }

  /** One bounded record per rejected damage call, not one stack reused for all sources. */
  public static synchronized void manualDamageRejected(Object target, String operation, float amount, JsonObject context) {
    if (!MANUAL_ENABLED || manual == null || target == null) return;
    try {
      ManualBinding binding = null; int index = -1; String side = "";
      for (int s = 0; s < 2 && binding == null; s++) {
        ManualBinding candidate = s == 0 ? manual.server : manual.client;
        if (candidate == null) continue;
        for (int i = 0; i < candidate.originals.length; i++) if (candidate.originals[i] == target) {
          binding = candidate; index = i; side = s == 0 ? "server" : "client"; break;
        }
      }
      if (binding == null) return;
      if (Thread.currentThread() != binding.owner) { manual.damageWrongThread = saturate(manual.damageWrongThread); return; }
      if (manual.damages.size() >= 256) { manual.damageDropped = saturate(manual.damageDropped); return; }
      JsonObject event = new JsonObject();
      event.addProperty("sequence", manual.damages.size() + 1);
      event.addProperty("side", side); event.addProperty("originalIdentity", binding.identities[index]);
      event.addProperty("operation", operation == null ? "unavailable" : operation.substring(0, Math.min(operation.length(), 96)));
      event.addProperty("observedAtUnixMs", System.currentTimeMillis());
      event.addProperty("amountRawBits", Float.floatToRawIntBits(amount));
      event.addProperty("amountFinite", Float.isFinite(amount));
      event.addProperty("amountText", Float.toString(amount));
      event.addProperty("rejectedBeforeBody", true); event.addProperty("attackAttributionVerified", false);
      if (context != null && context.toString().length() <= 8192) event.add("context", context.deepCopy());
      else event.addProperty("contextUnavailable", true);
      var frames = new com.google.gson.JsonArray();
      try { HIDDEN_STACK.walk(stream -> stream.limit(24).map(AttackTraceBridge::lifetimeDiagnosticFrame).toList()).forEach(frames::add); }
      catch (RuntimeException | LinkageError unavailable) { event.addProperty("stackUnavailable", true); }
      event.add("stackDiagnosticOnly", frames);
      manual.damages.add(event);
    } catch (RuntimeException | LinkageError unavailable) {
      manual.damageDropped = saturate(manual.damageDropped);
    }
  }

  public static synchronized com.google.gson.JsonArray manualDamageDetails(String run, int afterSequence) {
    var out = new com.google.gson.JsonArray();
    if (!MANUAL_ENABLED || manual == null || !manual.run.equals(run)) return out;
    for (JsonObject event : manual.damages)
      if (event.get("sequence").getAsInt() > afterSequence) out.add(event.deepCopy());
    return out;
  }

  /** Bounded, read-only evidence of an actual gate callback or method entry.
   * A gate may also reject ordinary game writes: caller frames are diagnostics,
   * not attack attribution. First stacks and bounded fresh stacks after a quiet
   * interval are separate ledgers; neither a key press nor a count reuses a stack. */
  private static synchronized void manualOperation(Object target, String kind, String operation) {
    if (!MANUAL_ENABLED || manual == null || target == null) return;
    try {
      ManualBinding binding = null; int index = -1; String side = "";
      for (int s = 0; s < 2 && binding == null; s++) {
        ManualBinding candidate = s == 0 ? manual.server : manual.client;
        if (candidate == null) continue;
        for (int i = 0; i < candidate.originals.length; i++) if (candidate.originals[i] == target) {
          binding = candidate; index = i; side = s == 0 ? "server" : "client"; break;
        }
      }
      if (binding == null) return;
      if (Thread.currentThread() != binding.owner) { manual.wrongThread = saturate(manual.wrongThread); return; }
      String op = operation == null ? "unavailable" : operation.substring(0, Math.min(operation.length(), 96));
      String key = side + ":" + index + ":" + kind + ":" + op;
      JsonObject event = manual.events.get(key);
      long at = System.currentTimeMillis();
      long nanos = System.nanoTime();
      Long previousNanos = manual.operationLastNanos.get(key);
      if (event == null) {
        if (manual.events.size() >= 128) { manual.dropped = saturate(manual.dropped); return; }
        event = new JsonObject();
        event.addProperty("sequence", manual.events.size() + 1);
        event.addProperty("side", side); event.addProperty("originalIdentity", binding.identities[index]);
        event.addProperty("kind", kind); event.addProperty("operation", op);
        event.addProperty("operationTruncated", operation != null && operation.length() > 96);
        event.addProperty("firstObservedAtUnixMs", at); event.addProperty("count", 0);
        var frames = new com.google.gson.JsonArray();
        try { HIDDEN_STACK.walk(stream -> stream.limit(16).map(AttackTraceBridge::lifetimeDiagnosticFrame).toList())
            .forEach(frames::add); }
        catch (RuntimeException | LinkageError unavailable) { event.addProperty("stackUnavailable", true); }
        event.add("firstStackDiagnosticOnly", frames);
        manual.events.put(key, event);
      }
      event.addProperty("count", saturate(event.get("count").getAsInt()));
      event.addProperty("lastObservedAtUnixMs", at);
      manual.operationLastNanos.put(key, nanos);
      // Monotonic quiet time is per original/side/operation. Continuous normal
      // game writes do not produce repeated stacks; omitted bursts are explicit.
      if (previousNanos == null || nanos - previousNanos >= 2_000_000_000L) {
        if (manual.bursts.size() >= 256) {
          manual.burstDropped = saturate(manual.burstDropped);
        } else {
          JsonObject burst = new JsonObject();
          burst.addProperty("sequence", manual.bursts.size() + 1);
          burst.addProperty("operationSequence", event.get("sequence").getAsInt());
          burst.addProperty("operationCount", event.get("count").getAsInt());
          burst.addProperty("side", side); burst.addProperty("originalIdentity", binding.identities[index]);
          burst.addProperty("kind", kind); burst.addProperty("operation", op);
          burst.addProperty("observedAtUnixMs", at);
          burst.addProperty("quietBeforeMs", previousNanos == null ? -1 : (nanos - previousNanos) / 1_000_000L);
          burst.addProperty("attackAttributionVerified", false);
          var frames = new com.google.gson.JsonArray();
          try { HIDDEN_STACK.walk(stream -> stream.limit(24).map(AttackTraceBridge::lifetimeDiagnosticFrame).toList())
              .forEach(frames::add); }
          catch (RuntimeException | LinkageError unavailable) { burst.addProperty("stackUnavailable", true); }
          burst.add("stackDiagnosticOnly", frames);
          manual.bursts.add(burst);
        }
      }
    } catch (RuntimeException | LinkageError unavailable) {
      // A broken diagnostic must never turn a rejected write into an accepted one.
      manual.dropped = saturate(manual.dropped);
    }
  }

  public static synchronized JsonObject manualSnapshot(String run) {
    JsonObject out = new JsonObject();
    out.addProperty("enabled", MANUAL_ENABLED); out.addProperty("combatPassed", false);
    boolean bound = MANUAL_ENABLED && manual != null && manual.run.equals(run);
    out.addProperty("bound", bound);
    out.addProperty("evidenceKind", "in-process-original-reference-operation-observations");
    out.addProperty("attackAttributionVerified", false);
    out.addProperty("limitation", "Gate callbacks may be ordinary game writes; first stacks are diagnostic only. No complete attack or survival verdict.");
    if (bound) {
      out.addProperty("runId", manual.run); out.addProperty("profile", MANUAL_PROFILE);
      out.addProperty("serverOriginals", manual.server == null ? 0 : manual.server.originals.length);
      out.addProperty("clientOriginals", manual.client == null ? 0 : manual.client.originals.length);
      out.addProperty("wrongThreadCallbacks", manual.wrongThread); out.addProperty("droppedCallbacks", manual.dropped);
      out.addProperty("counterLimit", 1_000_000); out.addProperty("eventLimit", 128);
      out.addProperty("operationBurstCount", manual.bursts.size());
      out.addProperty("operationBurstLimit", 256);
      out.addProperty("operationBurstQuietMs", 2000);
      out.addProperty("operationBurstDropped", manual.burstDropped);
      out.addProperty("damageEventCount", manual.damages.size()); out.addProperty("damageEventLimit", 256);
      out.addProperty("damageWrongThreadCallbacks", manual.damageWrongThread);
      out.addProperty("damageDroppedCallbacks", manual.damageDropped);
      var events = new com.google.gson.JsonArray();
      for (JsonObject event : manual.events.values()) {
        JsonObject summary = event.deepCopy(); summary.remove("firstStackDiagnosticOnly"); events.add(summary);
      }
      out.add("operations", events);
    }
    return out;
  }

  /** Append these bounded first-stack details separately, not in every scene sample. */
  public static synchronized com.google.gson.JsonArray manualDetails(String run, int afterSequence) {
    var out = new com.google.gson.JsonArray();
    if (!MANUAL_ENABLED || manual == null || !manual.run.equals(run)) return out;
    for (JsonObject event : manual.events.values())
      if (event.get("sequence").getAsInt() > afterSequence) out.add(event.deepCopy());
    return out;
  }

  /** Fresh callback stacks only, with an independent append cursor and finite budget. */
  public static synchronized com.google.gson.JsonArray manualBurstDetails(String run, int afterSequence) {
    var out = new com.google.gson.JsonArray();
    if (!MANUAL_ENABLED || manual == null || !manual.run.equals(run)) return out;
    for (JsonObject burst : manual.bursts)
      if (burst.get("sequence").getAsInt() > afterSequence) out.add(burst.deepCopy());
    return out;
  }
  private static volatile Context active;
  private static final StackWalker HIDDEN_STACK = StackWalker.getInstance(java.util.Set.of(
      StackWalker.Option.SHOW_HIDDEN_FRAMES, StackWalker.Option.RETAIN_CLASS_REFERENCE));
  private static final String FOREVER_KILL_OWNER = "com.wzz.forever_love_sword.util.ForeverUtils";
  private static final int LIFETIME_DIAGNOSTIC_LIMIT = 4096;

  private static final class Context {
    final Thread server;
    final String profile, uuid, runId;
    final Object target, opponent, player, stack;
    final Class<?> opponentClass, forgeHooksClass, playerClass, serverPlayerClass;
    volatile int pigEntries, swordEntries, pigHeads, swordHeads, pigDispatches;
    volatile int pigHeadCallbacks, pigDispatchCallbacks, pigEffectCallbacks;
    volatile int pigPreventedWrites;
    boolean directAttackArmed;
    volatile int lifetimePreventedWrites;
    int lifetimeCallbackCount, lifetimeWrongThread, lifetimeWrongTarget, lifetimeNotArmed;
    int lifetimeUnsupportedOperation, lifetimeMissingFrame;
    boolean lifetimeMissingFramesCaptured;
    String[] lifetimeMissingFramesDiagnosticOnly = new String[0];
    volatile String lifetimeOperation = "", lifetimeAttackFrame = "";
    volatile String lifetimeAttributionKind = "", lifetimeItemFrame = "";
    volatile String lifetimeForgeAttackFrame = "", lifetimePlayerAttackFrame = "", lifetimeServerPlayerAttackFrame = "";
    volatile String lastPigCallback = "";
    volatile boolean pigContext, swordContext;
    volatile long firstAttackNanos;
    volatile int opponentRemovalCalls, allRemovalCalls;
    volatile String removalCaller = "", removalReason = "";

    Context(
        Thread server,
        String profile,
        Object target,
        String uuid,
        String runId,
        Object opponent,
        Object player,
        Object stack) {
      this.server = server;
      this.profile = profile;
      this.target = target;
      this.uuid = uuid;
      this.runId = runId;
      this.opponent = opponent;
      this.player = player;
      this.stack = stack;
      this.opponentClass = opponent.getClass();
      this.playerClass = hierarchyClass(player, "net.minecraft.world.entity.player.Player");
      this.serverPlayerClass = hierarchyClass(player, "net.minecraft.server.level.ServerPlayer");
      Class<?> forge = null;
      if (playerClass != null && serverPlayerClass != null) try {
        forge = Class.forName("net.minecraftforge.common.ForgeHooks", false, player.getClass().getClassLoader());
      } catch (ClassNotFoundException | LinkageError unavailable) { /* New attribution fails closed. */ }
      this.forgeHooksClass = forge;
    }
  }

  private AttackTraceBridge() {}
  private static Class<?> hierarchyClass(Object object, String name) {
    if (object != null) for (Class<?> type = object.getClass(); type != null; type = type.getSuperclass())
      if (name.equals(type.getName())) return type;
    return null;
  }

  public static boolean enabled() {
    return ENABLED;
  }

  public static void watch(
      String profile,
      Object original,
      String uuid,
      String runId,
      Object opponent,
      Object player,
      Object stack) {
    if (!ENABLED) return;
    if (!("pig2".equals(profile) || "foreverlove".equals(profile))
        || original == null
        || opponent == null
        || uuid == null
        || uuid.isEmpty()
        || runId == null
        || runId.isEmpty()) throw new IllegalArgumentException("LAB_TRACE_CONTEXT");
    active =
        new Context(
            Thread.currentThread(), profile, original, uuid, runId, opponent, player, stack);
  }

  // Only the bounded direct ServerPlayer.attack call owns this window. Arming alone
  // does not advance the attack clock or create a receipt.
  public static void beginDirectAttack(String runId, Object originalTarget) {
    if (!ENABLED) return;
    Context c = active;
    if (c == null || Thread.currentThread() != c.server || !c.runId.equals(runId)
        || c.target != originalTarget || c.directAttackArmed)
      throw new IllegalStateException("LAB_DIRECT_ATTACK_CONTEXT");
    c.directAttackArmed = true;
  }

  public static void endDirectAttack(String runId, Object originalTarget) {
    if (!ENABLED) return;
    Context c = active;
    if (c == null || Thread.currentThread() != c.server || !c.runId.equals(runId)
        || c.target != originalTarget)
      throw new IllegalStateException("LAB_DIRECT_ATTACK_CONTEXT");
    c.directAttackArmed = false;
  }

  // Called exclusively by the gate after an actual present-entry removal or
  // supported field-write instruction was rejected. Names classify observational evidence, never the protection policy.
  public static void lifetimeOperationRejected(Object target, String operation) {
    manualOperation(target, "gate-rejected", operation);
    Context c = active;
    if (!ENABLED || c == null || !"foreverlove".equals(c.profile)) return;
    lifetimeDiagnostic(c, target, operation);
    if (Thread.currentThread() != c.server || !c.directAttackArmed || c.target != target
        || !("map-remove-present".equals(operation) || "field-write:position".equals(operation)
            || "field-write:removalReason".equals(operation))) return;
    String[] attribution = HIDDEN_STACK.walk(frames -> findForeverKillFrame(frames, c));
    if (attribution.length == 0) {
      synchronized (c) {
        if (c.lifetimeMissingFrame < LIFETIME_DIAGNOSTIC_LIMIT) c.lifetimeMissingFrame++;
        if (!c.lifetimeMissingFramesCaptured) {
          c.lifetimeMissingFramesCaptured = true;
          try {
            c.lifetimeMissingFramesDiagnosticOnly = HIDDEN_STACK.walk(frames ->
                frames.limit(16).map(AttackTraceBridge::lifetimeDiagnosticFrame).toArray(String[]::new));
          } catch (RuntimeException unavailable) {
            // Diagnostic failure must not change the rejection or retry/expand the capture.
          }
        }
      }
      return;
    }
    if (c.firstAttackNanos == 0) c.firstAttackNanos = System.nanoTime();
    if (c.lifetimePreventedWrites < Integer.MAX_VALUE) c.lifetimePreventedWrites++;
    c.lifetimeOperation = operation;
    c.lifetimeAttributionKind = attribution[0];
    c.lifetimeAttackFrame = attribution[1];
    c.lifetimeItemFrame = attribution[2];
    c.lifetimeForgeAttackFrame = attribution[3];
    c.lifetimePlayerAttackFrame = attribution[4];
    c.lifetimeServerPlayerAttackFrame = attribution[5];
  }

  private static String lifetimeDiagnosticFrame(StackWalker.StackFrame frame) {
    String suffix = ";isHidden=" + frame.getDeclaringClass().isHidden();
    String name = frame.getClassName() + "." + frame.getMethodName();
    return name.substring(0, Math.min(name.length(), 256 - suffix.length())) + suffix;
  }

  // Diagnostic counts only: a callback may fail multiple independent checks.
  // Never stores an unbound target, thread name, operation text, or stack content;
  // never advances the attack clock or contributes to the acceptance decision.
  private static void lifetimeDiagnostic(Context c, Object target, String operation) {
    boolean wrongThread = Thread.currentThread() != c.server;
    boolean wrongTarget = c.target != target;
    boolean notArmed = !c.directAttackArmed;
    boolean unsupported = !("map-remove-present".equals(operation)
        || "field-write:position".equals(operation) || "field-write:removalReason".equals(operation));
    synchronized (c) {
      if (c.lifetimeCallbackCount < LIFETIME_DIAGNOSTIC_LIMIT) c.lifetimeCallbackCount++;
      if (wrongThread && c.lifetimeWrongThread < LIFETIME_DIAGNOSTIC_LIMIT) c.lifetimeWrongThread++;
      if (wrongTarget && c.lifetimeWrongTarget < LIFETIME_DIAGNOSTIC_LIMIT) c.lifetimeWrongTarget++;
      if (notArmed && c.lifetimeNotArmed < LIFETIME_DIAGNOSTIC_LIMIT) c.lifetimeNotArmed++;
      if (unsupported && c.lifetimeUnsupportedOperation < LIFETIME_DIAGNOSTIC_LIMIT)
        c.lifetimeUnsupportedOperation++;
    }
  }

  private static String[] findForeverKillFrame(java.util.stream.Stream<StackWalker.StackFrame> frames, Context c) {
    java.util.Iterator<StackWalker.StackFrame> iterator = frames.iterator();
    String hiddenKill = "", item = "", forge = "", player = "";
    for (int i = 0; i < 512 && iterator.hasNext(); i++) {
      StackWalker.StackFrame frame = iterator.next();
      Class<?> declaring = frame.getDeclaringClass();
      String name = declaring.getName();
      String method = frame.getMethodName();
      if ("killEntity".equals(method)
          && (FOREVER_KILL_OWNER.equals(name)
              || declaring.isHidden() && name.startsWith(FOREVER_KILL_OWNER + "/")))
        return new String[]{"named-forever-utils", name + ".killEntity", "", "", "", ""};
      // Unknown hidden names are never sufficient. Require an ordered enclosing
      // chain tied to the exact watched item Class and actual player's class hierarchy.
      if (hiddenKill.isEmpty() && declaring.isHidden() && "killEntity".equals(method)) {
        hiddenKill = name + ".killEntity";
      } else if (!hiddenKill.isEmpty() && item.isEmpty()
          && declaring == c.opponentClass && "onLeftClickEntity".equals(method)) {
        item = name + ".onLeftClickEntity";
      } else if (!item.isEmpty() && forge.isEmpty()
          && declaring == c.forgeHooksClass && "onPlayerAttackTarget".equals(method)) {
        forge = name + ".onPlayerAttackTarget";
      } else if (!forge.isEmpty() && player.isEmpty()
          && declaring == c.playerClass && ("attack".equals(method) || "m_5706_".equals(method))) {
        player = name + "." + method;
      } else if (!player.isEmpty() && declaring == c.serverPlayerClass
          && ("attack".equals(method) || "m_5706_".equals(method))) {
        return new String[]{"bound-item-hidden-kill", hiddenKill, item, forge, player, name + "." + method};
      }
    }
    return new String[0];
  }

  // Invoked only by the observational HEAD callback; never calls a target method.
  public static void pigLevel3Entry(Object opponent, Object target, int counterBeforeIncrement) {
    Context c = active;
    pigDiagnostic(c, "head", opponent, target, counterBeforeIncrement);
    if (!ENABLED || c == null || Thread.currentThread() != c.server) return;
    c.pigContext = false;
    boolean matches =
        "pig2".equals(c.profile)
            && c.opponent == opponent
            && c.target == target
            && counterBeforeIncrement == 0;
    if (matches && c.pigHeads < Integer.MAX_VALUE) c.pigHeads++;
  }

  public static void swordEntry(Object item, Object stack, Object player, Object target) {
    Context c = active;
    if (!ENABLED || c == null || Thread.currentThread() != c.server) return;
    c.swordContext =
        "foreverlove".equals(c.profile)
            && c.opponent == item
            && c.target == target
            && c.player != null
            && c.stack != null
            && c.player == player
            && c.stack == stack;
    if (c.swordContext && c.swordHeads < Integer.MAX_VALUE) c.swordHeads++;
  }

  public static void pigLevel3Dispatch(Object opponent, Object target, int counter) {
    Context c = active;
    pigDiagnostic(c, "dispatch", opponent, target, counter);
    if (!ENABLED || c == null || Thread.currentThread() != c.server) return;
    c.pigContext =
        "pig2".equals(c.profile) && c.opponent == opponent && c.target == target && counter == 1;
    if (c.pigContext && c.pigDispatches < Integer.MAX_VALUE) c.pigDispatches++;
  }

  public static void pigLevel3Exit(Object opponent) {
    Context c = active;
    if (c != null && Thread.currentThread() == c.server && c.opponent == opponent)
      c.pigContext = false;
  }

  public static void swordExit(Object item) {
    Context c = active;
    if (c != null && Thread.currentThread() == c.server && c.opponent == item)
      c.swordContext = false;
  }

  public static void pigRemovalEffect(Object target) {
    Context c = active;
    pigDiagnostic(c, "effect", null, target, -1);
    if (!ENABLED
        || c == null
        || Thread.currentThread() != c.server
        || !c.pigContext
        || c.target != target
        || !hasCaller("kakiku.pig2mod.entity.Pig2", "tickLevel3")) return;
    if (c.firstAttackNanos == 0) c.firstAttackNanos = System.nanoTime();
    if (c.pigEntries < Integer.MAX_VALUE) c.pigEntries++;
  }

  public static void swordDeathListEffect(Object target, Object attacker) {
    Context c = active;
    if (!ENABLED
        || c == null
        || Thread.currentThread() != c.server
        || !c.swordContext
        || c.target != target
        || c.player != attacker
        || !hasCaller("com.wzz.forever_love_sword.items.ItemForeverLoveSword", "onLeftClickEntity"))
      return;
    if (c.firstAttackNanos == 0) c.firstAttackNanos = System.nanoTime();
    if (c.swordEntries < Integer.MAX_VALUE) c.swordEntries++;
  }

  private static boolean hasCaller(String owner, String method) {
    StackTraceElement[] stack = Thread.currentThread().getStackTrace();
    for (int i = 0; i < Math.min(stack.length, 512); i++)
      if (owner.equals(stack[i].getClassName()) && method.equals(stack[i].getMethodName()))
        return true;
    return false;
  }

  // Generic write-gate receipt. Opponent names occur only in this opt-in audit,
  // never in the gate's decision. Records an attempted write, not a completed effect.
  public static void protectedWriteRejected(Object target, String field, boolean value) {
    if (MANUAL_ENABLED) manualOperation(target, "boolean-write-rejected", field + "=" + value);
    Context c = active;
    if (!ENABLED || c == null || c.target != target || Thread.currentThread() != c.server
        || !"pig2".equals(c.profile) || !"canUpdate".equals(field) || value
        || !hasCaller("kakiku.pig2mod.MyHelper", "removeTheEnemiesInTheServerLevel")
        || !hasCaller("kakiku.pig2mod.entity.Pig2", "tickLevel3")) return;
    if (c.firstAttackNanos == 0) c.firstAttackNanos = System.nanoTime();
    if (c.pigPreventedWrites < Integer.MAX_VALUE) c.pigPreventedWrites++;
  }

  // Rejected callback diagnostics never count as verified engagement. They distinguish
  // missing instrumentation from a callback on a different thread/object/stage.
  private static void pigDiagnostic(Context c, String kind, Object opponent, Object target, int counter) {
    if (!ENABLED || c == null || !"pig2".equals(c.profile)) return;
    synchronized (c) {
      if ("head".equals(kind) && c.pigHeadCallbacks < Integer.MAX_VALUE) c.pigHeadCallbacks++;
      if ("dispatch".equals(kind) && c.pigDispatchCallbacks < Integer.MAX_VALUE) c.pigDispatchCallbacks++;
      if ("effect".equals(kind) && c.pigEffectCallbacks < Integer.MAX_VALUE) c.pigEffectCallbacks++;
      c.lastPigCallback = kind + ":server=" + (Thread.currentThread() == c.server)
          + ":opponent=" + (c.opponent == opponent) + ":target=" + (c.target == target)
          + ":counter=" + counter + ":thread=" + Thread.currentThread().getName();
    }
  }

  public static void entityRemovalCall(Object affected, String reason) {
    manualOperation(affected, "removal-method-entry", reason);
    Context c = active;
    if (!ENABLED || c == null || c.target != affected || Thread.currentThread() != c.server
        || c.allRemovalCalls >= 4) return;
    c.allRemovalCalls++;
    com.google.gson.JsonArray frames = new com.google.gson.JsonArray();
    String firstCaller = "";
    for (StackTraceElement frame : Thread.currentThread().getStackTrace()) {
      String name = frame.getClassName();
      if (frames.size() < 24) frames.add(frame.toString());
      if (firstCaller.isEmpty() && !name.startsWith("java.")
          && !name.equals(AttackTraceBridge.class.getName())
          && !name.startsWith("net.minecraft.")) firstCaller = frame.toString();
      if (name.startsWith("kakiku.pig2mod.")
          || name.startsWith("com.wzz.forever_love_sword.")) {
        c.opponentRemovalCalls++;
        firstCaller = frame.toString();
        break;
      }
    }
      c.removalCaller = firstCaller;
      c.removalReason = reason;
      // Preserve the entry even if the host is quarantined before another client tick.
      // This is a call observation, not L3/effect proof or a trusted outer receipt.
      try {
        java.nio.file.Path dir = java.nio.file.Path.of("entity-guard-proof");
        java.nio.file.Files.createDirectories(dir);
        JsonObject r = new JsonObject();
        r.addProperty("runId", c.runId); r.addProperty("targetUUID", c.uuid);
        r.addProperty("caller", c.removalCaller); r.addProperty("reason", reason);
        r.add("frames", frames);
        r.addProperty("opponentOnStack", c.opponentRemovalCalls > 0);
        r.addProperty("evidenceKind", "in-process-removal-entry-observation");
        java.nio.file.Files.writeString(dir.resolve("opponent-removal-call.json"), r.toString());
      } catch (Exception ignored) {}
  }

  public static long firstAttackNanos(String runId) {
    Context c = active;
    return ENABLED && c != null && c.runId.equals(runId) ? c.firstAttackNanos : 0;
  }

  public static JsonObject snapshot(String runId) {
    Context c = active;
    boolean valid = ENABLED && c != null && c.runId.equals(runId);
    boolean prevented = valid && c.pigPreventedWrites > 0;
    boolean pig = valid && (c.pigEntries > 0 || prevented);
    boolean lifetimePrevented = valid && c.lifetimePreventedWrites > 0;
    boolean sword = valid && (c.swordEntries > 0 || lifetimePrevented);
    JsonObject r = new JsonObject();
    r.addProperty("runId", runId);
    r.addProperty("instrumentationMode", ENABLED ? (lifetimePrevented ? "observational-lifetime-gate" : prevented ? "observational-write-gate" : "observational-mixin") : "unmodified-opponent");
    r.addProperty("advancedAttackObserved", pig);
    r.addProperty("swordAttackObserved", sword);
    r.addProperty("targetArgumentVerified", pig || sword);
    r.addProperty(
        "status",
        pig || sword ? "target-correlated-destructive-branch-observed" : "attackTargetNotVerified");
    r.addProperty("evidenceKind", lifetimePrevented ? "in-process-observational-lifetime-gate" : "in-process-observational-mixin");
    r.addProperty(
        "evidenceLevel",
        prevented || lifetimePrevented ? "destructive-operation-prevented" : pig || sword ? "destructive-operation-observed" : "no-destructive-operation-proof");
    if (valid) {
      r.addProperty("profile", c.profile);
      r.addProperty("expectedOriginalUUID", c.uuid);
      r.addProperty("pigLevel3InitialEntries", c.pigHeads);
      r.addProperty("pigHeadCallbacks", c.pigHeadCallbacks);
      r.addProperty("pigDispatchCallbacks", c.pigDispatchCallbacks);
      r.addProperty("pigEffectCallbacks", c.pigEffectCallbacks);
      r.addProperty("lastPigCallback", c.lastPigCallback);
      r.addProperty("pigLevel3Dispatches", c.pigDispatches);
      r.addProperty("swordHookEntries", c.swordHeads);
      r.addProperty("pigRemovalEffects", c.pigEntries);
      r.addProperty("pigPreventedWrites", c.pigPreventedWrites);
      r.addProperty("preventedField", prevented ? "canUpdate" : "");
      r.addProperty("preventedBooleanValue", false);
      r.addProperty("swordDeathListEffects", c.swordEntries);
      r.addProperty("lifetimePreventedWrites", c.lifetimePreventedWrites);
      synchronized (c) {
        r.addProperty("lifetimeCallbackCount", c.lifetimeCallbackCount);
        r.addProperty("lifetimeWrongThread", c.lifetimeWrongThread);
        r.addProperty("lifetimeWrongTarget", c.lifetimeWrongTarget);
        r.addProperty("lifetimeNotArmed", c.lifetimeNotArmed);
        r.addProperty("lifetimeUnsupportedOperation", c.lifetimeUnsupportedOperation);
        r.addProperty("lifetimeMissingFrame", c.lifetimeMissingFrame);
        var frames = new com.google.gson.JsonArray();
        for (String frame : c.lifetimeMissingFramesDiagnosticOnly) frames.add(frame);
        r.add("lifetimeMissingFramesDiagnosticOnly", frames);
      }
      r.addProperty("lifetimePreventedOperation", c.lifetimeOperation);
      r.addProperty("lifetimeAttackFrame", c.lifetimeAttackFrame);
      boolean boundItem = lifetimePrevented && "bound-item-hidden-kill".equals(c.lifetimeAttributionKind);
      r.addProperty("lifetimeAttributionKind", lifetimePrevented ? c.lifetimeAttributionKind : "");
      r.addProperty("lifetimeExactItemClassVerified", boundItem);
      r.addProperty("lifetimeKillFrameHiddenVerified", boundItem);
      r.addProperty("lifetimeNormalAttackChainVerified", boundItem);
      r.addProperty("lifetimeBoundItemClass", boundItem ? c.opponentClass.getName() : "");
      r.addProperty("lifetimeItemFrame", boundItem ? c.lifetimeItemFrame : "");
      r.addProperty("lifetimeForgeAttackFrame", boundItem ? c.lifetimeForgeAttackFrame : "");
      r.addProperty("lifetimePlayerAttackFrame", boundItem ? c.lifetimePlayerAttackFrame : "");
      r.addProperty("lifetimeServerPlayerAttackFrame", boundItem ? c.lifetimeServerPlayerAttackFrame : "");
      r.addProperty("lifetimeReceiptRunId", lifetimePrevented ? c.runId : "");
      r.addProperty("lifetimeOriginalTargetVerified", lifetimePrevented);
      r.addProperty("lifetimeServerThreadVerified", lifetimePrevented);
      r.addProperty("lifetimeDirectAttackWindowVerified", lifetimePrevented);
      r.addProperty("lifetimePresentEntryVerified", lifetimePrevented && "map-remove-present".equals(c.lifetimeOperation));
      r.addProperty("lifetimeFieldWriteVerified", lifetimePrevented && ("field-write:position".equals(c.lifetimeOperation)
          || "field-write:removalReason".equals(c.lifetimeOperation)));
      r.addProperty("opponentRemovalCalls", c.opponentRemovalCalls);
      r.addProperty("allRemovalCalls", c.allRemovalCalls);
      r.addProperty("removalCaller", c.removalCaller);
      r.addProperty("removalReason", c.removalReason);
      r.addProperty(
          "actualAttackAgeMs",
          c.firstAttackNanos == 0 ? -1 : (System.nanoTime() - c.firstAttackNanos) / 1_000_000L);
    }
    r.addProperty(
        "limitation",
        "An observed destructive operation is not proof of the entire attack completing or"
            + " immunity; hostile in-process code can forge it.");
    return r;
  }

  public static void clear(String runId) {
    Context c = active;
    if (c != null && c.runId.equals(runId)) active = null;
  }
}
