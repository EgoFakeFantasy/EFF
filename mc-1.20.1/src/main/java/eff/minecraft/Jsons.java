package eff.minecraft;

import com.google.gson.*;

public final class Jsons {
  public static final Gson GSON = new Gson();

  public static JsonObject obj(Object... pairs) {
    JsonObject o = new JsonObject();
    if ((pairs.length & 1) != 0) throw new IllegalArgumentException("JSON_PAIRS_REQUIRED");
    for (int i = 0; i < pairs.length; i += 2) {
      Object value = pairs[i + 1];
      // Already-typed protocol trees must not pass through a mutable serializer registry again.
      o.add((String) pairs[i], value instanceof JsonElement element
          ? element.deepCopy() : GSON.toJsonTree(value));
    }
    return o;
  }

  public static JsonObject o(JsonObject o, String k) {
    JsonElement value = o == null ? null : o.get(k);
    return value instanceof JsonObject object ? object : new JsonObject();
  }

  public static JsonArray a(JsonObject o, String k) {
    JsonElement value = o == null ? null : o.get(k);
    return value instanceof JsonArray array ? array : new JsonArray();
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
