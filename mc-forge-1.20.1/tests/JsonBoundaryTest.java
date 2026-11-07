package eff.minecraft;

import com.google.gson.*;

/** Protocol data must retain real observations, including failures, without aliasing inputs. */
public final class JsonBoundaryTest {
  private static void check(boolean ok, String label) {
    if (!ok) throw new AssertionError(label);
  }
  public static void main(String[] args) {
    JsonObject failed = Jsons.obj("uuid", "original", "alive", false, "health", 0,
        "registered", false, "rawHealthReadable", false);
    JsonArray history = new JsonArray(); history.add(failed);
    JsonObject packet = Jsons.obj("player", failed, "avatar", failed, "history", history,
        "enabled", true, "absent", JsonNull.INSTANCE);
    check(Jsons.o(packet, "avatar").equals(failed), "real failed observation preserved");
    check(!Jsons.b(Jsons.o(packet, "avatar"), "alive"), "no fabricated survival");
    failed.addProperty("alive", true); history.add("later");
    check(!Jsons.b(Jsons.o(packet, "avatar"), "alive"), "input mutation isolated");
    check(Jsons.a(packet, "history").size() == 1, "array snapshot isolated");
    Jsons.o(packet, "player").addProperty("uuid", "other");
    check(Jsons.s(Jsons.o(packet, "avatar"), "uuid").equals("original"), "siblings isolated");
    check(Jsons.o(packet, "absent").size() == 0 && Jsons.a(packet, "avatar").size() == 0,
        "wrong shape fails closed");
    check(Jsons.o(null, "avatar").size() == 0, "missing packet fails closed");
    JsonObject roundTrip = JsonParser.parseString(packet.toString()).getAsJsonObject();
    check(roundTrip.equals(packet), "wire round trip");
    boolean rejected = false;
    try { Jsons.obj("missing-value"); } catch (IllegalArgumentException expected) { rejected = true; }
    check(rejected, "malformed pairs rejected");
    System.out.println("JSON_BOUNDARY_TEST_OK");
  }
}
