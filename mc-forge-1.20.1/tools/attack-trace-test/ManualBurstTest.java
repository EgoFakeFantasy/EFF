import eff.minecraft.lab.AttackTraceBridge;
import com.google.gson.*;
import java.util.List;
import java.util.Map;

/** Actual observer under a real JVM; no game, native sample or attack is run. */
public final class ManualBurstTest {
  private static int checks;
  private static final Object ORIGINAL = new Object();
  private static void check(boolean value, String why) {
    checks++; if (!value) throw new AssertionError(why);
  }
  private static JsonArray details(int after) { return AttackTraceBridge.manualBurstDetails("burst-run", after); }
  private static JsonObject snapshot() { return AttackTraceBridge.manualSnapshot("burst-run"); }
  private static void firstCaller() { AttackTraceBridge.lifetimeOperationRejected(ORIGINAL, "map-remove-present"); }
  private static void secondCaller() { AttackTraceBridge.lifetimeOperationRejected(ORIGINAL, "map-remove-present"); }
  @SuppressWarnings("unchecked")
  private static void ageKey(long nanos) throws Exception {
    // Test-only aging of the observer's monotonic marker avoids sleeps or clock changes.
    var field=AttackTraceBridge.class.getDeclaredField("manual"); field.setAccessible(true);
    Object context=field.get(null);
    var times=context.getClass().getDeclaredField("operationLastNanos"); times.setAccessible(true);
    ((Map<String,Long>)times.get(context)).put("server:0:gate-rejected:map-remove-present", nanos);
  }
  public static void main(String[] args) throws Exception {
    AttackTraceBridge.watchManual("burst-run",true,List.of(ORIGINAL),List.of("1:original"));
    firstCaller();
    if (!snapshot().get("enabled").getAsBoolean()) {
      check(details(0).isEmpty(),"opt-out has no bursts");
      System.out.println("MANUAL_BURST_OK checks="+checks+" enabled=false minecraft=false"); return;
    }
    check(details(0).size()==1,"first actual callback has one burst");
    check(details(0).get(0).toString().contains("ManualBurstTest.firstCaller"),"actual first caller captured");
    secondCaller();
    check(details(0).size()==1,"immediate repeat counts without claiming fresh attribution");
    ageKey(System.nanoTime()-3_000_000_000L);
    secondCaller();
    JsonArray fresh=details(1);
    check(fresh.size()==1,"quiet repeat appends once with independent cursor");
    JsonObject burst=fresh.get(0).getAsJsonObject();
    check(burst.get("operationCount").getAsInt()==3,"fresh stack attached to its actual operation count");
    check(burst.get("quietBeforeMs").getAsLong()>=2000,"monotonic quiet interval retained");
    check(burst.toString().contains("ManualBurstTest.secondCaller")&&!burst.toString().contains("ManualBurstTest.firstCaller"),"repeat stack is not recycled first stack");
    check(details(2).isEmpty()&&AttackTraceBridge.manualBurstDetails("wrong-run",0).isEmpty(),"cursor and run isolation");
    burst.addProperty("operation","tampered");
    check(!details(1).toString().contains("tampered"),"returned records are copies");
    Thread wrong=new Thread(ManualBurstTest::secondCaller); wrong.start();wrong.join();
    check(details(0).size()==2&&snapshot().get("wrongThreadCallbacks").getAsInt()==1,"wrong thread cannot fabricate burst");
    AttackTraceBridge.lifetimeOperationRejected(new Object(),"map-remove-present");
    check(details(0).size()==2,"replacement reference cannot fabricate burst");
    ageKey(System.nanoTime()+5_000_000_000L); secondCaller();
    check(details(0).size()==2,"negative interval is not a quiet burst");
    for(int i=0;i<260;i++) { ageKey(System.nanoTime()-3_000_000_000L); secondCaller(); }
    check(details(0).size()==256&&snapshot().get("operationBurstDropped").getAsInt()==6,"bounded ledger exposes missing observations");
    for(JsonElement element:details(0)) {
      JsonObject record=element.getAsJsonObject();
      check(!record.get("attackAttributionVerified").getAsBoolean(),"no automatic attribution");
      JsonArray frames=record.getAsJsonArray("stackDiagnosticOnly");
      check(!frames.isEmpty()&&frames.size()<=24,"bounded actual stack");
      for(JsonElement frame:frames)check(frame.getAsString().length()<=256,"bounded frame text");
    }
    check(!snapshot().toString().contains("stackDiagnosticOnly"),"large stacks absent from recurring scene snapshots");
    check(!snapshot().get("combatPassed").getAsBoolean()&&AttackTraceBridge.firstAttackNanos("burst-run")==0,"no attack or success clock armed");
    System.out.println("MANUAL_BURST_OK checks="+checks+" enabled=true minecraft=false");
  }
}
