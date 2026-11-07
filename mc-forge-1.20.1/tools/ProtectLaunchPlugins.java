import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.zip.*;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;

/** Adds canonical plugin ownership; preserves the normal handler callbacks and late admission. */
public final class ProtectLaunchPlugins implements Opcodes {
  public static final String ENTRY = "cpw/mods/modlauncher/LaunchPluginHandler.class";
  public static final String LAUNCHER_ENTRY = "cpw/mods/modlauncher/Launcher.class";
  private static final String OWNER = "cpw/mods/modlauncher/LaunchPluginHandler";
  private static final String REGISTRY = "cpw/mods/modlauncher/EffRetainedPluginRegistry";
  public static byte[] bindLauncherReads(byte[] original) {
    ClassReader reader = new ClassReader(original); ClassNode node = new ClassNode(); reader.accept(node, 0);
    String launcher = "cpw/mods/modlauncher/Launcher";
    if (!node.name.equals(launcher)) throw new IllegalArgumentException("LAUNCHER_OWNER_CHANGED");
    long layers = node.fields.stream().filter(f -> f.name.equals("moduleLayerHandler") && f.desc.equals("Lcpw/mods/modlauncher/ModuleLayerHandler;")).count();
    int reads = 0;
    for (MethodNode method : node.methods) for (AbstractInsnNode insn : method.instructions.toArray()) {
      if (!(insn instanceof FieldInsnNode field) || field.getOpcode()!=GETFIELD || !field.owner.equals(launcher)
          || !field.name.equals("launchPlugins") || !field.desc.equals("L"+OWNER+";")) continue;
      method.instructions.insertBefore(field, new InsnNode(DUP));
      InsnList bind = new InsnList(); bind.add(new InsnNode(SWAP));
      bind.add(new FieldInsnNode(GETFIELD, launcher, "moduleLayerHandler", "Lcpw/mods/modlauncher/ModuleLayerHandler;"));
      bind.add(new MethodInsnNode(INVOKESTATIC, REGISTRY, "bindActive", "(L"+OWNER+";Ljava/lang/Object;)L"+OWNER+";", false));
      method.instructions.insert(field, bind); reads++;
    }
    if(layers!=1 || reads<3)throw new IllegalArgumentException("LAUNCHER_PLUGIN_READ_SHAPE_CHANGED");
    ClassWriter writer=new ClassWriter(reader,ClassWriter.COMPUTE_MAXS);node.accept(writer);return writer.toByteArray();
  }
  public static byte[] transform(byte[] original) {
    ClassNode node = new ClassNode(); new ClassReader(original).accept(node, 0);
    if (!node.name.equals(OWNER)) throw new IllegalArgumentException("PLUGIN_OWNER_CHANGED");
    int fields = 0, writes = 0, reads = 0;
    for (FieldNode field : node.fields) if (field.name.equals("plugins")) {
      if (!field.desc.equals("Ljava/util/Map;")) throw new IllegalArgumentException("PLUGIN_FIELD_CHANGED");
      fields++;
    }
    for (MethodNode method : node.methods) {
      boolean constructor = method.name.equals("<init>") && method.desc.equals("(Lcpw/mods/modlauncher/ModuleLayerHandler;)V");
      LabelNode reused = new LabelNode(); MethodInsnNode superCall = null;
      for (AbstractInsnNode instruction : method.instructions.toArray()) {
        if (constructor && instruction instanceof MethodInsnNode call && call.getOpcode() == INVOKESPECIAL
            && call.owner.equals("java/lang/Object") && call.name.equals("<init>")) superCall = call;
        if (!(instruction instanceof FieldInsnNode field) || !field.owner.equals(OWNER)
            || !field.name.equals("plugins") || !field.desc.equals("Ljava/util/Map;")) continue;
        if (field.getOpcode() == PUTFIELD) {
          if (!constructor) throw new IllegalArgumentException("UNEXPECTED_PLUGIN_WRITE");
          InsnList bind = new InsnList(); bind.add(new VarInsnNode(ALOAD, 1)); bind.add(new InsnNode(SWAP));
          bind.add(new MethodInsnNode(INVOKESTATIC, REGISTRY, "admit", "(Ljava/lang/Object;Ljava/util/Map;)L" + REGISTRY + ";", false));
          method.instructions.insertBefore(field, bind);
          InsnList remember = new InsnList(); remember.add(reused); remember.add(new VarInsnNode(ALOAD, 0)); remember.add(new VarInsnNode(ALOAD, 1));
          remember.add(new MethodInsnNode(INVOKESTATIC, REGISTRY, "remember", "(Ljava/lang/Object;Ljava/lang/Object;)V", false));
          method.instructions.insert(field, remember); writes++;
        } else if (field.getOpcode() == GETFIELD) {
          method.instructions.insertBefore(field, new InsnNode(DUP));
          method.instructions.insert(field, new MethodInsnNode(INVOKESTATIC, REGISTRY, "resolve", "(Ljava/lang/Object;Ljava/util/Map;)Ljava/util/Map;", false));
          reads++;
        }
        else throw new IllegalArgumentException("UNEXPECTED_PLUGIN_ACCESS");
      }
      if (constructor) {
        if (superCall == null || writes != 1) throw new IllegalArgumentException("PLUGIN_CONSTRUCTOR_CHANGED");
        LabelNode discover = new LabelNode(); InsnList reuse = new InsnList();
        reuse.add(new VarInsnNode(ALOAD, 1));
        reuse.add(new MethodInsnNode(INVOKESTATIC, REGISTRY, "findExisting", "(Ljava/lang/Object;)L" + REGISTRY + ";", false));
        reuse.add(new InsnNode(DUP)); reuse.add(new JumpInsnNode(IFNULL, discover));
        reuse.add(new VarInsnNode(ALOAD, 0)); reuse.add(new InsnNode(SWAP));
        reuse.add(new FieldInsnNode(PUTFIELD, OWNER, "plugins", "Ljava/util/Map;"));
        reuse.add(new JumpInsnNode(GOTO, reused)); reuse.add(discover); reuse.add(new InsnNode(POP));
        method.instructions.insert(superCall, reuse);
      }
    }
    if (fields != 1 || writes != 1 || reads < 5) throw new IllegalArgumentException("PLUGIN_SHAPE_CHANGED");
    // Constructor gains a branch, so recalculate all frames with real launcher dependencies.
    ClassWriter writer = new ClassWriter(ClassWriter.COMPUTE_FRAMES); node.accept(writer); return writer.toByteArray();
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
        var entry = inventory.nextElement(); String name = entry.getName();
        if (name.matches("(?i)META-INF/[^/]+\\.(SF|RSA|DSA|EC)")) throw new IllegalArgumentException("SIGNED_UPSTREAM_REQUIRES_REVIEW");
        byte[] bytes; try (var stream = zip.getInputStream(entry)) { bytes = stream.readAllBytes(); }
        if (name.equals(FreezeServiceProviders.ENTRY)) { bytes = FreezeServiceProviders.transform(bytes); changes.add(name); }
        if (name.equals(ProtectServiceRegistry.ENTRY)) { bytes = ProtectServiceRegistry.transform(bytes); changes.add(name); }
        if (name.equals(ENTRY)) { bytes = transform(bytes); changes.add(name); }
        if (name.equals(LAUNCHER_ENTRY)) { bytes = bindLauncherReads(bytes); changes.add(name); }
        if (name.equals(TransformContextBoundary.ENTRY)) { bytes = TransformContextBoundary.transform(bytes); changes.add(name); }
        var target = new ZipEntry(name); target.setTime(0); out.putNextEntry(target); out.write(bytes); out.closeEntry();
      }
      try (var files = Files.list(helpers.resolve("cpw/mods/modlauncher"))) {
        for (Path helper : files.filter(p -> p.getFileName().toString().matches("EffRetained(?:Service|Plugin)Registry(?:\\$[0-9]+)*\\.class")).sorted().toList()) {
          String name = "cpw/mods/modlauncher/" + helper.getFileName();
          var target = new ZipEntry(name); target.setTime(0); out.putNextEntry(target); out.write(Files.readAllBytes(helper)); out.closeEntry(); additions.add(name);
        }
      }
    }
    if (changes.size() != 5 || additions.isEmpty()) throw new IllegalStateException("PLUGIN_PATCH_INCOMPLETE");
    List<String> actual = new ArrayList<>();
    try (ZipFile source = new ZipFile(input.toFile()); ZipFile result = new ZipFile(output.toFile())) {
      if (source.size() + additions.size() != result.size()) throw new IllegalStateException("ENTRY_COUNT_CHANGED");
      var entries = source.entries();
      while (entries.hasMoreElements()) {
        var entry = entries.nextElement(); var replacement = result.getEntry(entry.getName());
        if (replacement == null) throw new IllegalStateException("ENTRY_MISSING");
        try (var a = source.getInputStream(entry); var b = result.getInputStream(replacement)) {
          if (!Arrays.equals(a.readAllBytes(), b.readAllBytes())) actual.add(entry.getName());
        }
      }
    }
    if (!new HashSet<>(actual).equals(new HashSet<>(changes))) throw new IllegalStateException("UNRELATED_ENTRY_CHANGED");
    if (!before.equals(FreezeServiceProviders.hash(Files.readAllBytes(input)))) throw new IllegalStateException("UPSTREAM_CHANGED");
    System.out.println("PROTECTED_PLUGIN_REGISTRY sourceSHA256=" + before + " patchedSHA256=" + FreezeServiceProviders.hash(Files.readAllBytes(output))
        + " changed=" + changes + " added=" + additions);
  }
}
