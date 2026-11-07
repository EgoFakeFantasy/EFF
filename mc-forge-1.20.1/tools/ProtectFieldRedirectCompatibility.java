import java.nio.file.*;
import java.util.*;
import java.util.zip.*;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;

/** Narrow, version-pinned compatibility patch to the private-field precondition only. */
public final class ProtectFieldRedirectCompatibility implements Opcodes {
  public static final String ENTRY = "net/minecraftforge/coremod/api/ASMAPI.class";
  public static final String HELPER = "net/minecraftforge/coremod/api/EffFieldVisibilityCompatibility";
  public static byte[] transform(byte[] original) {
    ClassNode node = new ClassNode(); new ClassReader(original).accept(node, 0);
    if (!node.name.equals("net/minecraftforge/coremod/api/ASMAPI")) throw new IllegalArgumentException("ASMAPI_OWNER_CHANGED");
    int changed = 0;
    for (MethodNode method : node.methods) if (method.name.equals("redirectFieldToMethod") && method.desc.equals("(Lorg/objectweb/asm/tree/ClassNode;Ljava/lang/String;Ljava/lang/String;)V")) {
      for (AbstractInsnNode instruction : method.instructions.toArray()) {
        if (!(instruction instanceof MethodInsnNode call) || !call.owner.equals("java/lang/reflect/Modifier") || !call.name.equals("isPrivate") || !call.desc.equals("(I)Z")) continue;
        if (!(call.getPrevious() instanceof FieldInsnNode access) || !access.owner.equals("org/objectweb/asm/tree/FieldNode") || !access.name.equals("access") || !access.desc.equals("I")
            || !(access.getPrevious() instanceof VarInsnNode load) || load.getOpcode() != ALOAD || load.var != 4) throw new IllegalArgumentException("VISIBILITY_PREDICATE_CHANGED");
        InsnList replacement = new InsnList(); replacement.add(new VarInsnNode(ALOAD, 0)); replacement.add(new VarInsnNode(ALOAD, 4)); replacement.add(new VarInsnNode(ALOAD, 2));
        replacement.add(new MethodInsnNode(INVOKESTATIC, HELPER, "eligible", "(Lorg/objectweb/asm/tree/ClassNode;Lorg/objectweb/asm/tree/FieldNode;Ljava/lang/String;)Z", false));
        method.instructions.insertBefore(load, replacement); method.instructions.remove(load); method.instructions.remove(access); method.instructions.remove(call); changed++;
      }
    }
    if (changed != 1) throw new IllegalArgumentException("VISIBILITY_PREDICATE_COUNT");
    ClassWriter writer = new ClassWriter(ClassWriter.COMPUTE_MAXS); node.accept(writer); return writer.toByteArray();
  }
  public static void main(String[] args) throws Exception {
    if (args.length != 4) throw new IllegalArgumentException("INPUT OUTPUT EXPECTED_SHA256 HELPER_CLASSES");
    Path input = Path.of(args[0]), output = Path.of(args[1]); String sourceHash = FreezeServiceProviders.hash(Files.readAllBytes(input));
    if (!sourceHash.equals(args[2])) throw new IllegalArgumentException("UPSTREAM_SHA_MISMATCH");
    int changed = 0;
    try (ZipFile source = new ZipFile(input.toFile()); ZipOutputStream target = new ZipOutputStream(Files.newOutputStream(output, StandardOpenOption.CREATE_NEW))) {
      var entries = source.entries();
      while (entries.hasMoreElements()) {
        var entry = entries.nextElement(); String name = entry.getName();
        if (name.matches("(?i)META-INF/[^/]+\\.(SF|RSA|DSA|EC)")) throw new IllegalArgumentException("SIGNED_UPSTREAM_REQUIRES_REVIEW");
        byte[] bytes; try (var stream = source.getInputStream(entry)) { bytes = stream.readAllBytes(); }
        if (name.equals(ENTRY)) { bytes = transform(bytes); changed++; }
        var copy = new ZipEntry(name); copy.setTime(0); target.putNextEntry(copy); target.write(bytes); target.closeEntry();
      }
      var helper = new ZipEntry(HELPER + ".class"); helper.setTime(0); target.putNextEntry(helper); target.write(Files.readAllBytes(Path.of(args[3], HELPER + ".class"))); target.closeEntry();
    }
    if (changed != 1) throw new IllegalStateException("PATCH_INCOMPLETE");
    List<String> actual = new ArrayList<>();
    try (ZipFile source = new ZipFile(input.toFile()); ZipFile result = new ZipFile(output.toFile())) {
      if (result.size() != source.size() + 1) throw new IllegalStateException("ENTRY_COUNT_CHANGED");
      var entries = source.entries();
      while (entries.hasMoreElements()) {
        var entry = entries.nextElement(); var replacement = result.getEntry(entry.getName());
        if (replacement == null) throw new IllegalStateException("MISSING_ENTRY");
        try (var a = source.getInputStream(entry); var b = result.getInputStream(replacement)) {
          if (!Arrays.equals(a.readAllBytes(), b.readAllBytes())) actual.add(entry.getName());
        }
      }
    }
    if (!actual.equals(List.of(ENTRY)) || !sourceHash.equals(FreezeServiceProviders.hash(Files.readAllBytes(input)))) throw new IllegalStateException("UNRELATED_CHANGE");
    System.out.println("FIELD_REDIRECT_COMPAT sourceSHA256=" + sourceHash + " patchedSHA256=" + FreezeServiceProviders.hash(Files.readAllBytes(output)) + " changed=" + actual + " added=" + HELPER + ".class");
  }
}
