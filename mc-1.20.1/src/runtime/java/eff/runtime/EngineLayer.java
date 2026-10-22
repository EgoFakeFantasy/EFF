package eff.runtime;

import static eff.minecraft.Jsons.*;

import com.google.gson.*;

/** The generated class is a real JVM layer; its deterministic rules remain the sealed Kernel. */
public class EngineLayer {
  private final JsonObject descriptor;

  public EngineLayer(String canonicalDescriptor) {
    descriptor =
        EngineFactory.descriptor(JsonParser.parseString(canonicalDescriptor).getAsJsonObject());
  }

  public final JsonObject descriptor() {
    return descriptor.deepCopy();
  }

  public final JsonObject generate() {
    return EngineFactory.prepare(EngineFactory.successor(descriptor));
  }

  public final JsonObject dispatch(JsonObject body, String role) {
    if (!s(descriptor, "role").equals(role))
      throw new IllegalArgumentException("ENGINE_ROLE_MISMATCH");
    switch (s(body, "op")) {
      case "initial":
        return Kernel.initial();
      case "snapshot":
        return Kernel.snapshot(o(body, "state"));
      case "transition":
        JsonObject calculated = Kernel.run(body);
        if (role.equals("policy") && body.has("candidate")) {
          if (!calculated.equals(o(body, "candidate")))
            throw new IllegalArgumentException("POLICY_TRANSITION_MISMATCH");
          return obj("verified", true);
        }
        return calculated;
      default:
        throw new IllegalArgumentException("UNKNOWN_WORKER_OP");
    }
  }
}
