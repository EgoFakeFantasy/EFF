import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.zip.*;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;

/** Private ModLauncher patch: eager SPI discovery plus typed retained provider ownership. */
public final class ProtectServiceRegistry implements Opcodes {
  public static final String ENTRY = "cpw/mods/modlauncher/TransformationServicesHandler.class";
  public static final String OWNER = "cpw/mods/modlauncher/TransformationServicesHandler";
  public static final String REGISTRY = "cpw/mods/modlauncher/EffRetainedServiceRegistry";
  public static byte[] transform(byte[] bytes) {
    ClassNode node = new ClassNode(); new ClassReader(bytes).accept(node, 0);
    if (!node.name.equals(OWNER)) throw new IllegalArgumentException("UNEXPECTED_REGISTRY_OWNER");
    int fields = 0, reads = 0, writes = 0;
    for (FieldNode field : node.fields) if (field.name.equals("serviceLookup")) {
      if (!field.desc.equals("Ljava/util/Map;")) throw new IllegalArgumentException("REGISTRY_ALREADY_PATCHED_OR_CHANGED");
      field.desc = "L" + REGISTRY + ";"; field.signature = null; fields++;
    }
    for (MethodNode method : node.methods) for (AbstractInsnNode instruction : method.instructions.toArray()) {
      if (!(instruction instanceof FieldInsnNode field) || !field.owner.equals(OWNER)
          || !field.name.equals("serviceLookup") || !field.desc.equals("Ljava/util/Map;")) continue;
      if (field.getOpcode() == PUTFIELD) {
        if (!method.name.equals("discoverServices")) throw new IllegalArgumentException("UNEXPECTED_REGISTRY_WRITE_SITE");
        method.instructions.insertBefore(field, new MethodInsnNode(INVOKESTATIC, REGISTRY, "admit",
            "(Ljava/util/Map;)L" + REGISTRY + ";", false));
        writes++;
      } else if (field.getOpcode() == GETFIELD) reads++;
      else throw new IllegalArgumentException("UNEXPECTED_REGISTRY_ACCESS");
      field.desc = "L" + REGISTRY + ";";
    }
    if (fields != 1 || writes != 1 || reads < 10) throw new IllegalArgumentException("REGISTRY_SHAPE_CHANGED:" + fields + ":" + writes + ":" + reads);
    ClassWriter writer = new ClassWriter(ClassWriter.COMPUTE_MAXS); node.accept(writer); return writer.toByteArray();
  }
  public static void main(String[] args) throws Exception {
    if (args.length != 4) throw new IllegalArgumentException("INPUT OUTPUT EXPECTED_SHA256 HELPER_CLASSES");
    Path input = Path.of(args[0]), output = Path.of(args[1]), helpers = Path.of(args[3]);
    String before = FreezeServiceProviders.hash(Files.readAllBytes(input));
    if (!before.equals(args[2])) throw new IllegalArgumentException("UPSTREAM_SHA_MISMATCH");
    List<String> changes = new ArrayList<>(), additions = new ArrayList<>();
    try (ZipFile zip = new ZipFile(input.toFile()); ZipOutputStream out = new ZipOutputStream(Files.newOutputStream(output, StandardOpenOption.CREATE_NEW))) {
      var inventory = zip.entries();
      while (inventory.hasMoreElements()) {
        ZipEntry entry = inventory.nextElement(); String name = entry.getName();
        if (name.matches("(?i)META-INF/[^/]+\\.(SF|RSA|DSA|EC)")) throw new IllegalArgumentException("SIGNED_UPSTREAM_REQUIRES_SEPARATE_REVIEW");
        byte[] bytes; try (InputStream stream = zip.getInputStream(entry)) { bytes = stream.readAllBytes(); }
        if (name.equals(FreezeServiceProviders.ENTRY)) { bytes = FreezeServiceProviders.transform(bytes); changes.add(name); }
        if (name.equals(ENTRY)) { bytes = transform(bytes); changes.add(name); }
        ZipEntry target = new ZipEntry(name); target.setTime(0); out.putNextEntry(target); out.write(bytes); out.closeEntry();
      }
      try (var files = Files.list(helpers.resolve("cpw/mods/modlauncher"))) {
        for (Path helper : files.filter(p -> p.getFileName().toString().matches("EffRetainedServiceRegistry(?:\\$[0-9]+)*\\.class")).sorted().toList()) {
          String name = "cpw/mods/modlauncher/" + helper.getFileName();
          ZipEntry target = new ZipEntry(name); target.setTime(0); out.putNextEntry(target); out.write(Files.readAllBytes(helper)); out.closeEntry(); additions.add(name);
        }
      }
    }
    if (changes.size() != 2 || additions.isEmpty()) throw new IllegalStateException("REGISTRY_PATCH_INCOMPLETE");
    List<String> actualChanges = new ArrayList<>();
    try (ZipFile source = new ZipFile(input.toFile()); ZipFile result = new ZipFile(output.toFile())) {
      if (source.size() + additions.size() != result.size()) throw new IllegalStateException("JAR_ENTRY_COUNT_CHANGED");
      var inventory = source.entries();
      while (inventory.hasMoreElements()) {
        var entry = inventory.nextElement(); var replacement = result.getEntry(entry.getName());
        if (replacement == null) throw new IllegalStateException("JAR_ENTRY_MISSING");
        try (var a = source.getInputStream(entry); var b = result.getInputStream(replacement)) {
          if (!Arrays.equals(a.readAllBytes(), b.readAllBytes())) actualChanges.add(entry.getName());
        }
      }
    }
    if (!new HashSet<>(actualChanges).equals(new HashSet<>(changes))) throw new IllegalStateException("UNRELATED_ENTRY_CHANGED");
    if (!before.equals(FreezeServiceProviders.hash(Files.readAllBytes(input)))) throw new IllegalStateException("UPSTREAM_CHANGED");
    System.out.println("PROTECTED_SERVICE_REGISTRY sourceSHA256=" + before + " patchedSHA256=" + FreezeServiceProviders.hash(Files.readAllBytes(output))
        + " changed=" + changes + " added=" + additions);
  }
}
