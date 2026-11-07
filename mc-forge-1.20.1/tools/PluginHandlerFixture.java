import java.nio.file.*;
import java.util.zip.*;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;

/** Test-only classpath SPI source and module filename substitution; never shipped. */
public final class PluginHandlerFixture implements Opcodes {
  public static void main(String[] args) throws Exception {
    byte[] bytes;
    try (var zip = new ZipFile(args[0])) { try (var in = zip.getInputStream(zip.getEntry(ProtectLaunchPlugins.ENTRY))) { bytes = in.readAllBytes(); } }
    ClassNode node = new ClassNode(); new ClassReader(bytes).accept(node, 0);
    int count = 0, filename = 0;
    for (MethodNode method : node.methods) for (var instruction : method.instructions.toArray()) {
      if (instruction instanceof MethodInsnNode call && call.owner.equals("cpw/mods/modlauncher/util/ServiceLoaderUtils") && call.name.equals("fileNameFor")) {
        method.instructions.insertBefore(call, new InsnNode(POP));
        method.instructions.set(call, new LdcInsnNode("offline-classpath-provider")); filename++;
      }
    }
    for (MethodNode method : node.methods) if (method.name.equals("lambda$new$0") && method.desc.endsWith("Ljava/util/ServiceLoader;")) {
      method.instructions.clear(); method.tryCatchBlocks.clear(); if (method.localVariables != null) method.localVariables.clear();
      method.instructions.add(new LdcInsnNode(Type.getObjectType("cpw/mods/modlauncher/serviceapi/ILaunchPluginService")));
      method.instructions.add(new MethodInsnNode(INVOKESTATIC, "java/util/ServiceLoader", "load", "(Ljava/lang/Class;)Ljava/util/ServiceLoader;", false));
      method.instructions.add(new InsnNode(ARETURN)); count++;
    }
    if (count != 1 || filename != 1) throw new IllegalStateException("FIXTURE_SUPPLIER_SHAPE_CHANGED");
    ClassWriter writer = new ClassWriter(ClassWriter.COMPUTE_MAXS); node.accept(writer);
    Path output = Path.of(args[1], ProtectLaunchPlugins.ENTRY); Files.createDirectories(output.getParent()); Files.write(output, writer.toByteArray(), StandardOpenOption.CREATE_NEW);
    Path service = Path.of(args[1], "META-INF/services/cpw.mods.modlauncher.serviceapi.ILaunchPluginService"); Files.createDirectories(service.getParent());
    Files.writeString(service, "cpw.mods.modlauncher.EffRetainedPluginRegistryTest$First\ncpw.mods.modlauncher.EffRetainedPluginRegistryTest$Peer\n", StandardOpenOption.CREATE_NEW);
  }
}
