package eff.runtime;

import static eff.minecraft.Jsons.*;

import com.google.gson.*;
import java.io.*;
import java.nio.charset.StandardCharsets;

/** A single role per OS process. The controller owns input/output and all persistence. */
public final class Worker {
  public static void main(String[] args) throws Exception {
    String role = args[0];
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
          if (op.equals("initial")) reply.add("result", Kernel.initial());
          else if (op.equals("snapshot")) reply.add("result", Kernel.snapshot(o(body, "state")));
          else if (op.equals("transition")) {
            JsonObject calculated = Kernel.run(body);
            if (role.equals("policy") && body.has("candidate")) {
              if (!calculated.equals(o(body, "candidate")))
                throw new IllegalArgumentException("POLICY_TRANSITION_MISMATCH");
              reply.add("result", obj("verified", true));
            } else reply.add("result", calculated);
          } else throw new IllegalArgumentException("UNKNOWN_WORKER_OP");
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
