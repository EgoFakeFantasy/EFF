import java.io.*;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.zip.*;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;

/** Builds a private ModLauncher copy whose SPI discovery completes before constructors run.
 * Does not filter, rename, prioritize, or replace any provider; error handling remains upstream.
 */
public final class FreezeServiceProviders implements Opcodes {
  public static final String ENTRY = "cpw/mods/modlauncher/util/ServiceLoaderUtils.class";
  public static byte[] transform(byte[] original) {
    ClassNode node = new ClassNode(); new ClassReader(original).accept(node, 0);
    if (!node.name.equals("cpw/mods/modlauncher/util/ServiceLoaderUtils")) throw new IllegalArgumentException("UNEXPECTED_CLASS");
    int patched = 0;
    for (MethodNode method : node.methods) {
      if (!method.name.equals("streamWithErrorHandling")
          || !method.desc.equals("(Ljava/util/ServiceLoader;Ljava/util/function/Consumer;)Ljava/util/stream/Stream;")) continue;
      for (AbstractInsnNode instruction : method.instructions)
        if (instruction instanceof MethodInsnNode call && call.owner.equals("java/util/stream/Stream")
            && call.name.equals("toList")) throw new IllegalArgumentException("ALREADY_SNAPSHOTTED_OR_CHANGED_UPSTREAM");
      for (AbstractInsnNode instruction : method.instructions.toArray()) {
        if (instruction instanceof MethodInsnNode call && call.getOpcode() == INVOKEVIRTUAL
            && call.owner.equals("java/util/ServiceLoader") && call.name.equals("stream")
            && call.desc.equals("()Ljava/util/stream/Stream;")) {
          // Provider metadata discovery is eager; Provider.get remains in the original map.
          // Its order, error consumer and null filtering are unchanged.
          InsnList snapshot = new InsnList();
          snapshot.add(new MethodInsnNode(INVOKEINTERFACE, "java/util/stream/Stream", "toList", "()Ljava/util/List;", true));
          snapshot.add(new MethodInsnNode(INVOKEINTERFACE, "java/util/List", "stream", "()Ljava/util/stream/Stream;", true));
          method.instructions.insert(call, snapshot); patched++;
        }
      }
    }
    if (patched != 1) throw new IllegalArgumentException("UPSTREAM_DISCOVERY_SHAPE_CHANGED:" + patched);
    // Stack shape at every existing boundary is unchanged; no new locals or control flow.
    ClassWriter writer = new ClassWriter(ClassWriter.COMPUTE_MAXS); node.accept(writer);
    return writer.toByteArray();
  }
  static String hash(byte[] bytes) throws Exception {
    return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
  }
  public static void main(String[] args) throws Exception {
    if (args.length != 3) throw new IllegalArgumentException("INPUT OUTPUT EXPECTED_SHA256");
    Path input = Path.of(args[0]), output = Path.of(args[1]);
    String before = hash(Files.readAllBytes(input));
    if (!before.equals(args[2])) throw new IllegalArgumentException("UPSTREAM_SHA_MISMATCH");
    int count = 0, entries = 0; String sourceClass = "", resultClass = "";
    try (ZipFile zip = new ZipFile(input.toFile());
         ZipOutputStream out = new ZipOutputStream(Files.newOutputStream(output, StandardOpenOption.CREATE_NEW))) {
      var inventory = zip.entries();
      while (inventory.hasMoreElements()) {
        ZipEntry entry = inventory.nextElement(); String name = entry.getName();
        if (name.matches("(?i)META-INF/[^/]+\\.(SF|RSA|DSA|EC)")) throw new IllegalArgumentException("SIGNED_UPSTREAM_REQUIRES_SEPARATE_REVIEW");
        byte[] bytes;
        try (InputStream stream = zip.getInputStream(entry)) { bytes = stream.readAllBytes(); }
        if (name.equals(ENTRY)) { sourceClass = hash(bytes); bytes = transform(bytes); resultClass = hash(bytes); count++; }
        ZipEntry target = new ZipEntry(name); target.setTime(0); out.putNextEntry(target); out.write(bytes); out.closeEntry(); entries++;
      }
    }
    if (count != 1) throw new IllegalArgumentException("UPSTREAM_CLASS_COUNT:" + count);
    int differences = 0;
    try (ZipFile source = new ZipFile(input.toFile()); ZipFile result = new ZipFile(output.toFile())) {
      if (source.size() != result.size()) throw new IllegalStateException("JAR_ENTRY_COUNT_CHANGED");
      var inventory = source.entries();
      while (inventory.hasMoreElements()) {
        ZipEntry entry = inventory.nextElement(); ZipEntry replacement = result.getEntry(entry.getName());
        if (replacement == null) throw new IllegalStateException("JAR_ENTRY_MISSING");
        try (InputStream a = source.getInputStream(entry); InputStream b = result.getInputStream(replacement)) {
          if (!Arrays.equals(a.readAllBytes(), b.readAllBytes())) {
            if (!entry.getName().equals(ENTRY)) throw new IllegalStateException("UNRELATED_JAR_ENTRY_CHANGED");
            differences++;
          }
        }
      }
    }
    if (differences != 1) throw new IllegalStateException("EXPECTED_ONE_ENTRY_DIFF");
    if (!before.equals(hash(Files.readAllBytes(input)))) throw new IllegalStateException("UPSTREAM_CHANGED_DURING_BUILD");
    System.out.println("PATCHED_SERVICE_DISCOVERY sourceSHA256=" + before + " patchedSHA256=" + hash(Files.readAllBytes(output))
        + " sourceClassSHA256=" + sourceClass + " patchedClassSHA256=" + resultClass + " entries=" + entries + " changedEntries=1");
  }
}
