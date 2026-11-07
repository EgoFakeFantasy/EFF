package eff.minecraft.client;
import java.util.*;
import kakiku.pig2mod.entity.Pig2;

public final class Pig2ObservationTest {
  static int checks;
  static void check(boolean ok, String reason) { checks++; if (!ok) throw new AssertionError(reason); }
  public static void main(String[] args) {
    Object target = new Object(), player = new Object(), other = new Object();
    var pig = new Pig2(player, target, false); Object[] before = pig.snapshot();
    var result = Pig2EngagementProbe.observe(pig, target, List.of(target, player), List.of("target", "player"));
    check(result.get("observationAvailable").getAsBoolean(), "audited shape read");
    check(!result.get("advancedAttackObserved").getAsBoolean(), "stage is not attack entry");
    check(!result.get("enemyMatchesOriginal").getAsBoolean(), "player is not primary target");
    check(result.get("attackingEnemyMatchesOriginal").getAsBoolean(), "primary target reference");
    check(result.get("enemyFrozenIdentity").getAsString().equals("player"), "player intent recorded");
    check(result.get("attackingEnemyFrozenIdentity").getAsString().equals("target"), "entity intent recorded");
    check(result.get("level3TickCounter").getAsInt() == 17, "does not advance opponent tick");
    check(Arrays.equals(before, pig.snapshot()), "all fixture fields unchanged");
    var unmatched = Pig2EngagementProbe.observe(new Pig2(other, other, false), target, List.of(target), List.of("target"));
    check(unmatched.get("enemyFrozenIdentity").getAsString().equals("unmatched"), "foreign reference not accepted");
    check(!Pig2EngagementProbe.observe(new Pig2(target, target, true), target).get("observationAvailable").getAsBoolean(), "malformed field remains unavailable");
    check(!Pig2EngagementProbe.observe(other, target).get("observationAvailable").getAsBoolean(), "unrecognized class remains unavailable");
    check(!Pig2EngagementProbe.observe(pig, null).get("observationAvailable").getAsBoolean(), "missing primary remains unavailable");
    System.out.println("PIG2_STAGE_OBSERVATION_OK checks=" + checks + " synthetic=true minecraft=false");
  }
}
