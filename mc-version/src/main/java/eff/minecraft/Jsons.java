package eff.minecraft;

import com.google.gson.*;

public final class Jsons {
  public static final Gson GSON = new Gson();

  public static JsonObject obj(Object... pairs) {
    JsonObject o = new JsonObject();
    for (int i = 0; i < pairs.length; i += 2)
      o.add((String) pairs[i], GSON.toJsonTree(pairs[i + 1]));
    return o;
  }

  public static JsonObject o(JsonObject o, String k) {
    return o != null && o.has(k) && o.get(k).isJsonObject()
        ? o.getAsJsonObject(k)
        : new JsonObject();
  }

  public static JsonArray a(JsonObject o, String k) {
    return o != null && o.has(k) && o.get(k).isJsonArray() ? o.getAsJsonArray(k) : new JsonArray();
  }

  public static String s(JsonObject o, String k) {
    try {
      return o.get(k).isJsonNull() ? "" : o.get(k).getAsString();
    } catch (Exception e) {
      return "";
    }
  }

  public static boolean b(JsonObject o, String k) {
    try {
      return o.get(k).getAsBoolean();
    } catch (Exception e) {
      return false;
    }
  }

  public static int i(JsonObject o, String k) {
    try {
      return o.get(k).getAsInt();
    } catch (Exception e) {
      return 0;
    }
  }

  public static double d(JsonObject o, String k) {
    try {
      return o.get(k).getAsDouble();
    } catch (Exception e) {
      return 0;
    }
  }

  private Jsons() {}
}
