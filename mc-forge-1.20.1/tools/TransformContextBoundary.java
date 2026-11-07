import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;

/** Every transformation callback resolves resources through the loader defining this class. */
public final class TransformContextBoundary implements Opcodes {
  public static final String ENTRY = "cpw/mods/modlauncher/TransformingClassLoader.class";
  public static final String OWNER = "cpw/mods/modlauncher/TransformingClassLoader";
  public static final String DELEGATE = "eff$transformBytesDelegate";
  public static final String DESCRIPTOR = "([BLjava/lang/String;Ljava/lang/String;)[B";
  public static byte[] transform(byte[] original) {
    ClassNode node = new ClassNode(); new ClassReader(original).accept(node, 0);
    if (!node.name.equals(OWNER)) throw new IllegalArgumentException("TRANSFORM_LOADER_OWNER_CHANGED");
    MethodNode target = null;
    for (MethodNode method : node.methods) {
      if (method.name.equals(DELEGATE)) throw new IllegalArgumentException("ALREADY_SCOPED");
      if (method.name.equals("maybeTransformClassBytes") && method.desc.equals(DESCRIPTOR)) {
        if (target != null || (method.access & ACC_STATIC) != 0) throw new IllegalArgumentException("TRANSFORM_METHOD_CHANGED"); target = method;
      }
    }
    if (target == null) throw new IllegalArgumentException("TRANSFORM_METHOD_MISSING");
    int calls = 0;
    for (AbstractInsnNode instruction : target.instructions) if (instruction instanceof MethodInsnNode call && call.owner.equals("cpw/mods/modlauncher/ClassTransformer") && call.name.equals("transform") && call.desc.equals(DESCRIPTOR)) calls++;
    if (calls != 1) throw new IllegalArgumentException("TRANSFORM_DELEGATE_CHANGED");
    MethodNode wrapper = new MethodNode(target.access, target.name, target.desc, target.signature, target.exceptions.toArray(String[]::new));
    target.name = DELEGATE; target.access = ACC_PRIVATE | ACC_SYNTHETIC;
    InsnList code = wrapper.instructions;
    code.add(new MethodInsnNode(INVOKESTATIC, "java/lang/Thread", "currentThread", "()Ljava/lang/Thread;", false)); code.add(new VarInsnNode(ASTORE, 4));
    code.add(new VarInsnNode(ALOAD, 4)); code.add(new MethodInsnNode(INVOKEVIRTUAL, "java/lang/Thread", "getContextClassLoader", "()Ljava/lang/ClassLoader;", false)); code.add(new VarInsnNode(ASTORE, 5));
    code.add(new VarInsnNode(ALOAD, 4)); code.add(new VarInsnNode(ALOAD, 0)); code.add(new MethodInsnNode(INVOKEVIRTUAL, "java/lang/Thread", "setContextClassLoader", "(Ljava/lang/ClassLoader;)V", false));
    LabelNode start = new LabelNode(), end = new LabelNode(), handler = new LabelNode(); code.add(start);
    for (int slot=0;slot<4;slot++) code.add(new VarInsnNode(ALOAD, slot));
    code.add(new MethodInsnNode(INVOKESPECIAL, OWNER, DELEGATE, DESCRIPTOR, false)); code.add(new VarInsnNode(ASTORE, 6)); code.add(end);
    restore(code); code.add(new VarInsnNode(ALOAD, 6)); code.add(new InsnNode(ARETURN));
    code.add(handler); code.add(new VarInsnNode(ASTORE, 7)); restore(code); code.add(new VarInsnNode(ALOAD, 7)); code.add(new InsnNode(ATHROW));
    wrapper.tryCatchBlocks.add(new TryCatchBlockNode(start, end, handler, null)); node.methods.add(wrapper);
    ClassWriter writer = new ClassWriter(ClassWriter.COMPUTE_FRAMES | ClassWriter.COMPUTE_MAXS); node.accept(writer); return writer.toByteArray();
  }
  private static void restore(InsnList code) {
    code.add(new VarInsnNode(ALOAD, 4)); code.add(new VarInsnNode(ALOAD, 5)); code.add(new MethodInsnNode(INVOKEVIRTUAL, "java/lang/Thread", "setContextClassLoader", "(Ljava/lang/ClassLoader;)V", false));
  }
}
