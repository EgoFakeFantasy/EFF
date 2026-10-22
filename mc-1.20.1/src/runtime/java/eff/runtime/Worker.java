package eff.runtime;

import static eff.minecraft.Jsons.*;

import com.google.gson.*;
import java.io.*;
import java.nio.charset.StandardCharsets;

/** A single role per OS process. The controller owns input/output and all persistence. */
public final class Worker {
  public static void main(String[] args) throws Exception {
    if (args.length != 1 || !(args[0].equals("policy") || args[0].equals("execution")))
      throw new IllegalArgumentException("ENGINE_ROLE");
    String role = args[0];
    EngineLayer active = null;
    try (var input = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
        var output =
            new PrintWriter(new OutputStreamWriter(System.out, StandardCharsets.UTF_8), true)) {
      String line;
      while ((line = input.readLine()) != null) {
        if (line.length() > 262144) break;
        JsonObject r = JsonParser.parseString(line).getAsJsonObject();
        JsonObject reply = obj("id", s(r, "id"), "epoch", i(r, "epoch"));
        try {
          JsonObject body = o(r, "body");
          String op = s(body, "op");
          if (op.equals("prepareEngine")) {
            reply.add("result", EngineFactory.prepare(o(body, "descriptor")));
          } else if (op.equals("verifyEngine")) {
            JsonObject parent =
                body.has("parent") && !body.get("parent").isJsonNull()
                    ? body.getAsJsonObject("parent")
                    : null;
            reply.add("result", EngineFactory.verify(parent, o(body, "packet")));
          } else if (op.equals("bootEngine")) {
            if (active != null) throw new IllegalArgumentException("ENGINE_ALREADY_BOOTED");
            EngineFactory.Loaded loaded = EngineFactory.load(o(body, "packet"), role);
            active = loaded.layer();
            reply.add("result", loaded.proof());
          } else {
            if (active == null) throw new IllegalArgumentException("ENGINE_NOT_BOOTED");
            reply.add(
                "result",
                op.equals("generateEngine") ? active.generate() : active.dispatch(body, role));
          }
          reply.addProperty("ok", true);
        } catch (Exception e) {
          reply.addProperty("ok", false);
          reply.addProperty("error", e.getMessage());
        }
        output.println(reply);
      }
    }
  }
}
