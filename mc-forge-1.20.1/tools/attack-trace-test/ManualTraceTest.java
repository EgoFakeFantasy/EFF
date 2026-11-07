import eff.minecraft.lab.AttackTraceBridge;
import com.google.gson.*;
import java.util.List;

/** Calls real production observer; no Minecraft, sample, or attack is launched. */
public final class ManualTraceTest {
  private static int checks;
  private static void check(boolean value, String why) { checks++; if (!value) throw new AssertionError(why); }
  private static JsonObject state() { return AttackTraceBridge.manualSnapshot("manual-run"); }
  private static JsonArray events() { return state().getAsJsonArray("operations"); }
  private static void rejected(Runnable action, String why) {
    boolean rejected = false;
    try { action.run(); } catch (IllegalArgumentException | IllegalStateException expected) { rejected = true; }
    check(rejected, why);
  }
  // Deliberately hostile equality: reference identity must still distinguish these.
  private static class EqualObject {
    @Override public boolean equals(Object other) { return true; }
    @Override public int hashCode() { return 1; }
    @Override public String toString() { throw new AssertionError("must not stringify targets"); }
  }
  public static void main(String[] args) throws Exception {
    Object original = new EqualObject(), player = new EqualObject(), client = new EqualObject(), replacement = new EqualObject();
    check(!state().get("bound").getAsBoolean(), "no implicit binding");
    AttackTraceBridge.lifetimeOperationRejected(original, "field-write:position");
    AttackTraceBridge.watchManual("manual-run", true, List.of(original, player), List.of("1:entity", "2:player"));
    if (!state().get("enabled").getAsBoolean()) {
      AttackTraceBridge.manualDamageRejected(original, "player:hurt", 1000f, new JsonObject());
      check(AttackTraceBridge.manualDamageDetails("manual-run", 0).isEmpty(), "opt-out damage evidence disabled");
      AttackTraceBridge.entityRemovalCall(original, "KILLED");
      check(!state().has("operations") && AttackTraceBridge.manualDetails("manual-run", 0).isEmpty(), "opt-out has no evidence");
      System.out.println("MANUAL_TRACE_OK checks=" + checks + " enabled=false minecraft=false"); return;
    }
    check(events().isEmpty(), "binding is not attack evidence");
    rejected(() -> AttackTraceBridge.watchManual("manual-run", false, List.of(client), List.of("1:entity")), "partial client roster rejected");
    rejected(() -> AttackTraceBridge.watchManual("manual-run", false, List.of(original, player), List.of("1:entity", "2:player")), "server objects cannot be client evidence");
    AttackTraceBridge.watchManual("manual-run", false, List.of(client, new EqualObject()), List.of("1:entity", "2:player"));
    rejected(() -> AttackTraceBridge.watchManual("manual-run", true, List.of(replacement), List.of("1:entity")), "same ID replacement forbidden");
    rejected(() -> AttackTraceBridge.watchManual("new-run", true, List.of(replacement), List.of("3:new")), "new run cannot erase original evidence");
    AttackTraceBridge.lifetimeOperationRejected(replacement, "map-remove-present");
    check(events().isEmpty(), "equal replacement cannot impersonate original");
    Thread wrong = new Thread(() -> AttackTraceBridge.lifetimeOperationRejected(original, "map-remove-present"));
    wrong.start(); wrong.join();
    check(events().isEmpty() && state().get("wrongThreadCallbacks").getAsInt() == 1, "wrong thread separated");
    AttackTraceBridge.lifetimeOperationRejected(original, "map-remove-present");
    AttackTraceBridge.lifetimeOperationRejected(original, "map-remove-present");
    AttackTraceBridge.lifetimeOperationRejected(player, "player:health-data-write");
    AttackTraceBridge.protectedWriteRejected(client, "canUpdate", false);
    AttackTraceBridge.entityRemovalCall(original, "KILLED");
    check(events().size() == 4, "distinct original side and operation kind");
    check(events().get(0).getAsJsonObject().get("count").getAsInt() == 2, "actual callbacks counted");
    check(events().get(1).getAsJsonObject().get("originalIdentity").getAsString().equals("2:player"), "player covered");
    check(events().get(2).getAsJsonObject().get("side").getAsString().equals("client"), "client separate");
    check(events().get(3).getAsJsonObject().get("kind").getAsString().equals("removal-method-entry"), "method entry never relabeled prevented");
    check(!state().get("combatPassed").getAsBoolean() && !state().get("attackAttributionVerified").getAsBoolean(), "no automatic success");
    check(AttackTraceBridge.firstAttackNanos("manual-run") == 0, "automated attack clock remains zero");
    JsonArray details = AttackTraceBridge.manualDetails("manual-run", 0);
    check(details.size() == 4 && AttackTraceBridge.manualDetails("manual-run", 4).isEmpty(), "cursor permits append once");
    for (JsonElement element : details) {
      JsonArray frames = element.getAsJsonObject().getAsJsonArray("firstStackDiagnosticOnly");
      check(!frames.isEmpty() && frames.size() <= 16, "bounded real stack");
      for (JsonElement frame : frames) check(frame.getAsString().length() <= 256, "bounded frame text");
    }
    check(!state().toString().contains("firstStackDiagnosticOnly"), "no repeated large stacks in scene trace");
    details.get(0).getAsJsonObject().addProperty("count", 9999);
    events().get(0).getAsJsonObject().addProperty("count", 9999);
    check(events().get(0).getAsJsonObject().get("count").getAsInt() == 2, "snapshots cannot mutate observer");
    check(!AttackTraceBridge.manualSnapshot("wrong-run").has("operations")
        && AttackTraceBridge.manualDetails("wrong-run", 0).isEmpty(), "run scoped reads");
    for (int i = 0; i < 200; i++) AttackTraceBridge.lifetimeOperationRejected(original, "diagnostic-" + i);
    check(events().size() == 128 && state().get("droppedCallbacks").getAsInt() == 76, "bounded keys disclose overflow");
    for (int i = 0; i < 1_000_010; i++) AttackTraceBridge.lifetimeOperationRejected(original, "map-remove-present");
    check(events().get(0).getAsJsonObject().get("count").getAsInt() == 1_000_000, "saturating count");
    check(AttackTraceBridge.manualDetails("manual-run", 0).toString().length() < 600_000, "bounded stack ledger size");
    JsonObject context = new JsonObject(); context.addProperty("sourceClass", "fixture.Source");
    AttackTraceBridge.manualDamageRejected(replacement, "player:hurt", 1000f, context);
    check(AttackTraceBridge.manualDamageDetails("manual-run", 0).isEmpty(), "replacement cannot supply damage proof");
    Thread wrongDamage = new Thread(() -> AttackTraceBridge.manualDamageRejected(player, "player:hurt", 3f, context));
    wrongDamage.start(); wrongDamage.join();
    check(state().get("damageWrongThreadCallbacks").getAsInt() == 1, "wrong-thread damage is separated");
    for (float amount : new float[]{0f, 3f, 3f, 1000f, Float.intBitsToFloat(0x7fc00001)})
      AttackTraceBridge.manualDamageRejected(player, "player:hurt", amount, context);
    context.addProperty("sourceClass", "mutated");
    JsonArray damage = AttackTraceBridge.manualDamageDetails("manual-run", 0);
    check(damage.size() == 5, "repeated damage has fresh records, not only first stack");
    check(damage.get(0).getAsJsonObject().get("amountRawBits").getAsInt() == 0, "zero damage distinguished");
    check(damage.get(3).getAsJsonObject().get("amountText").getAsString().equals("1000.0"), "lethal amount retained");
    check(damage.get(4).getAsJsonObject().get("amountRawBits").getAsInt() == 0x7fc00001
        && !damage.get(4).getAsJsonObject().get("amountFinite").getAsBoolean(), "nonfinite payload retained as valid JSON");
    check(damage.get(0).getAsJsonObject().getAsJsonObject("context").get("sourceClass").getAsString().equals("fixture.Source"), "caller cannot mutate ledger");
    damage.get(0).getAsJsonObject().addProperty("amountText", "tampered");
    check(AttackTraceBridge.manualDamageDetails("manual-run", 0).get(0).getAsJsonObject().get("amountText").getAsString().equals("0.0"), "reader cannot mutate ledger");
    check(AttackTraceBridge.manualDamageDetails("manual-run", 4).size() == 1
        && AttackTraceBridge.manualDamageDetails("other-run", 0).isEmpty(), "damage cursor and run isolation");
    for (JsonElement d : damage) check(d.getAsJsonObject().getAsJsonArray("stackDiagnosticOnly").size() <= 24, "bounded per-event stacks");
    for (int i=0; i<260; i++) AttackTraceBridge.manualDamageRejected(player, "player:hurt", 3f, context);
    check(state().get("damageEventCount").getAsInt() == 256 && state().get("damageDroppedCallbacks").getAsInt() == 9,
        "bounded damage ledger discloses lost observations");
    check(!state().toString().contains("stackDiagnosticOnly") && !state().get("combatPassed").getAsBoolean(), "damage evidence never promotes success");
    System.out.println("MANUAL_TRACE_OK checks=" + checks + " enabled=true minecraft=false");
  }
}
