package eff.runtime;

import com.google.gson.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;

/** Fixed, bounded bytecode recipe. It never compiles user source or writes executable files. */
public final class EngineFactory {
  private static final Set<String> DESCRIPTOR_KEYS =
      Set.of("schema", "role", "generation", "parent", "ruleset", "id");
  private static final Set<String> PACKET_KEYS =
      Set.of("descriptor", "artifact", "bytecodeSHA256", "className");
  private static final AtomicLong LOADERS = new AtomicLong();

  private static void require(boolean valid, String error) {
    if (!valid) throw new IllegalArgumentException(error);
  }

  private static String string(JsonObject o, String key) {
    JsonElement e = o.get(key);
    require(
        e != null && e.isJsonPrimitive() && e.getAsJsonPrimitive().isString(),
        "ENGINE_DESCRIPTOR_TYPE");
    return e.getAsString();
  }

  private static int integer(JsonObject o, String key) {
    JsonElement e = o.get(key);
    require(
        e != null && e.isJsonPrimitive() && e.getAsJsonPrimitive().isNumber(),
        "ENGINE_DESCRIPTOR_TYPE");
    String raw = e.getAsString();
    require(raw.matches("0|[1-9][0-9]?"), "ENGINE_DESCRIPTOR_INTEGER");
    return Integer.parseInt(raw);
  }

  public static String sha256(byte[] bytes) {
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    } catch (GeneralSecurityException e) {
      throw new IllegalStateException("ENGINE_HASH_UNAVAILABLE", e);
    }
  }

  public static JsonObject descriptor(JsonObject supplied) {
    require(supplied.keySet().equals(DESCRIPTOR_KEYS), "ENGINE_DESCRIPTOR_KEYS");
    require(integer(supplied, "schema") == 1, "ENGINE_DESCRIPTOR_SCHEMA");
    String role = string(supplied, "role");
    require(role.equals("policy") || role.equals("execution"), "ENGINE_ROLE");
    int generation = integer(supplied, "generation");
    require(generation <= 16, "ENGINE_GENERATION_BUDGET");
    String parent = string(supplied, "parent"), ruleset = string(supplied, "ruleset");
    require(
        generation == 0 ? parent.equals("GENESIS") : parent.matches("[0-9a-f]{64}"),
        "ENGINE_PARENT");
    require(ruleset.matches("[0-9a-f]{64}"), "ENGINE_RULESET");
    String id =
        sha256(
            ("eff-engine-v1\n" + role + "\n" + ruleset + "\n" + generation + "\n" + parent)
                .getBytes(StandardCharsets.UTF_8));
    require(id.equals(string(supplied, "id")), "ENGINE_ID_MISMATCH");
    JsonObject canonical = new JsonObject();
    canonical.addProperty("schema", 1);
    canonical.addProperty("role", role);
    canonical.addProperty("generation", generation);
    canonical.addProperty("parent", parent);
    canonical.addProperty("ruleset", ruleset);
    canonical.addProperty("id", id);
    return canonical;
  }

  public static JsonObject successor(JsonObject parent) {
    JsonObject before = descriptor(parent);
    int generation = before.get("generation").getAsInt() + 1;
    require(generation <= 16, "ENGINE_GENERATION_BUDGET");
    String role = before.get("role").getAsString(), ruleset = before.get("ruleset").getAsString();
    String previous = before.get("id").getAsString();
    JsonObject next = before.deepCopy();
    next.addProperty("generation", generation);
    next.addProperty("parent", previous);
    next.addProperty(
        "id",
        sha256(
            ("eff-engine-v1\n" + role + "\n" + ruleset + "\n" + generation + "\n" + previous)
                .getBytes(StandardCharsets.UTF_8)));
    return descriptor(next);
  }

  public static String className(JsonObject canonical) {
    return "eff.generated.E" + canonical.get("id").getAsString();
  }

  private static void utf(DataOutputStream out, String text) throws IOException {
    out.writeByte(1);
    out.writeUTF(text);
  }

  /** Only a no-argument constructor embedding a validated descriptor is emitted. */
  public static byte[] bytecode(JsonObject supplied) {
    JsonObject d = descriptor(supplied);
    try {
      ByteArrayOutputStream bytes = new ByteArrayOutputStream();
      DataOutputStream out = new DataOutputStream(bytes);
      out.writeInt(0xCAFEBABE);
      out.writeShort(0);
      out.writeShort(61); // Java 17
      out.writeShort(13);
      utf(out, className(d).replace('.', '/')); // 1
      out.writeByte(7);
      out.writeShort(1); // 2 class
      utf(out, "eff/runtime/EngineLayer"); // 3
      out.writeByte(7);
      out.writeShort(3); // 4 superclass
      utf(out, "<init>"); // 5
      utf(out, "()V"); // 6
      utf(out, "Code"); // 7
      utf(out, d.toString()); // 8
      out.writeByte(8);
      out.writeShort(8); // 9 string
      utf(out, "(Ljava/lang/String;)V"); // 10
      out.writeByte(12);
      out.writeShort(5);
      out.writeShort(10); // 11 name/type
      out.writeByte(10);
      out.writeShort(4);
      out.writeShort(11); // 12 super ctor
      out.writeShort(0x0031); // public final super
      out.writeShort(2);
      out.writeShort(4);
      out.writeShort(0); // interfaces
      out.writeShort(0); // fields
      out.writeShort(1); // methods
      out.writeShort(0x0001);
      out.writeShort(5);
      out.writeShort(6);
      out.writeShort(1);
      out.writeShort(7);
      out.writeInt(19);
      out.writeShort(2);
      out.writeShort(1);
      out.writeInt(7);
      out.writeByte(0x2a); // aload_0
      out.writeByte(0x12);
      out.writeByte(9); // ldc descriptor
      out.writeByte(0xb7);
      out.writeShort(12); // invokespecial
      out.writeByte(0xb1); // return
      out.writeShort(0);
      out.writeShort(0); // exception table, code attributes
      out.writeShort(0); // class attributes
      out.flush();
      return bytes.toByteArray();
    } catch (IOException e) {
      throw new IllegalStateException("ENGINE_BYTECODE_FAILURE", e);
    }
  }

  public static JsonObject prepare(JsonObject supplied) {
    JsonObject d = descriptor(supplied);
    byte[] bytes = bytecode(d);
    JsonObject packet = new JsonObject();
    packet.add("descriptor", d);
    packet.addProperty("artifact", Base64.getEncoder().encodeToString(bytes));
    packet.addProperty("bytecodeSHA256", sha256(bytes));
    packet.addProperty("className", className(d));
    return packet;
  }

  private static byte[] validatePacket(JsonObject packet) {
    require(packet.keySet().equals(PACKET_KEYS), "ENGINE_PACKET_KEYS");
    require(
        packet.get("descriptor") != null && packet.get("descriptor").isJsonObject(),
        "ENGINE_DESCRIPTOR_TYPE");
    JsonObject d = descriptor(packet.getAsJsonObject("descriptor"));
    String encoded = string(packet, "artifact");
    require(encoded.length() <= 8192, "ENGINE_ARTIFACT_BUDGET");
    byte[] bytes;
    try {
      bytes = Base64.getDecoder().decode(encoded);
    } catch (IllegalArgumentException e) {
      throw new IllegalArgumentException("ENGINE_ARTIFACT_ENCODING");
    }
    require(Base64.getEncoder().encodeToString(bytes).equals(encoded), "ENGINE_ARTIFACT_ENCODING");
    require(MessageDigest.isEqual(bytecode(d), bytes), "ENGINE_ARTIFACT_MISMATCH");
    require(sha256(bytes).equals(string(packet, "bytecodeSHA256")), "ENGINE_ARTIFACT_HASH");
    require(className(d).equals(string(packet, "className")), "ENGINE_CLASS_NAME");
    return bytes;
  }

  public static JsonObject verify(JsonObject parent, JsonObject packet) {
    byte[] bytes = validatePacket(packet);
    JsonObject d = descriptor(packet.getAsJsonObject("descriptor"));
    if (parent == null) require(d.get("generation").getAsInt() == 0, "ENGINE_GENESIS_REQUIRED");
    else require(successor(parent).equals(d), "ENGINE_ANCESTRY_MISMATCH");
    JsonObject result = new JsonObject();
    result.addProperty("verified", true);
    result.add("descriptor", d);
    result.addProperty("bytecodeSHA256", sha256(bytes));
    result.addProperty("className", className(d));
    return result;
  }

  private static final class Loader extends ClassLoader {
    final long id = LOADERS.incrementAndGet();

    Loader() {
      super(EngineLayer.class.getClassLoader());
    }

    Class<?> materialize(String name, byte[] bytes) {
      return defineClass(name, bytes, 0, bytes.length);
    }
  }

  public record Loaded(EngineLayer layer, JsonObject proof) {}

  public static Loaded load(JsonObject packet, String role) {
    byte[] bytes = validatePacket(packet);
    JsonObject d = descriptor(packet.getAsJsonObject("descriptor"));
    require(d.get("role").getAsString().equals(role), "ENGINE_ROLE_MISMATCH");
    try {
      Loader loader = new Loader();
      Class<?> type = loader.materialize(className(d), bytes);
      EngineLayer layer = (EngineLayer) type.getConstructor().newInstance();
      require(type.getClassLoader() == loader, "ENGINE_LOADER_MISMATCH");
      require(layer.descriptor().equals(d), "ENGINE_INSTANCE_MISMATCH");
      JsonObject proof = new JsonObject();
      proof.add("descriptor", d);
      proof.addProperty("bytecodeSHA256", sha256(bytes));
      proof.addProperty("className", type.getName());
      proof.addProperty(
          "loaderId",
          ProcessHandle.current().pid()
              + ":"
              + loader.id
              + ":"
              + Integer.toUnsignedString(System.identityHashCode(type.getClassLoader())));
      return new Loaded(layer, proof);
    } catch (ReflectiveOperationException | LinkageError e) {
      throw new IllegalStateException("ENGINE_CLASS_LOAD_FAILED", e);
    }
  }

  private EngineFactory() {}
}
