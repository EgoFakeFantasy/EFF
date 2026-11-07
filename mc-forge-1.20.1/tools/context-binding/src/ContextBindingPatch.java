import java.nio.file.*;
import java.util.*;
import java.util.jar.*;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;

/** Offline patch of the renderer's redundant binding only. No native calls run here. */
public final class ContextBindingPatch implements Opcodes {
    static final String OWNER = "net/minecraftforge/fml/earlydisplay/DisplayWindow";
    static final String GLFW = "org/lwjgl/glfw/GLFW";
    static final String HELPER = "eff$makeContextCurrentIfNeeded";
    static ClassNode parse(byte[] bytes) {
        ClassNode node = new ClassNode(); new ClassReader(bytes).accept(node, 0); return node;
    }
    static byte[] methodBytes(MethodNode method) {
        ClassWriter writer = new ClassWriter(0);
        writer.visit(V17, ACC_PUBLIC, OWNER, null, "java/lang/Object", null);
        method.accept(writer); writer.visitEnd(); return writer.toByteArray();
    }
    static MethodNode helper() {
        MethodNode m = new MethodNode(ACC_PRIVATE | ACC_STATIC | ACC_SYNTHETIC, HELPER, "(J)V", null, null);
        Label done = new Label(); m.visitCode();
        m.visitMethodInsn(INVOKESTATIC, GLFW, "glfwGetCurrentContext", "()J", false);
        m.visitVarInsn(LLOAD, 0); m.visitInsn(LCMP); m.visitJumpInsn(IFEQ, done);
        m.visitVarInsn(LLOAD, 0);
        m.visitMethodInsn(INVOKESTATIC, GLFW, "glfwMakeContextCurrent", "(J)V", false);
        m.visitLabel(done); m.visitFrame(F_SAME, 0, null, 0, null);
        m.visitInsn(RETURN); m.visitMaxs(4, 2); m.visitEnd(); return m;
    }
    static byte[] patch(byte[] original) {
        ClassReader reader = new ClassReader(original); ClassNode node = parse(original);
        if (!OWNER.equals(node.name)) throw new IllegalArgumentException("WRONG_CLASS");
        if (node.methods.stream().anyMatch(m -> m.name.equals(HELPER))) throw new IllegalStateException("HELPER_COLLISION");
        MethodNode method = node.methods.stream().filter(m -> m.name.equals("renderThreadFunc") && m.desc.equals("()V")).findFirst().orElseThrow();
        int matches = 0;
        for (AbstractInsnNode insn : method.instructions.toArray()) {
            if (!(insn instanceof MethodInsnNode call) || call.getOpcode() != INVOKESTATIC || !call.owner.equals(GLFW)
                    || !call.name.equals("glfwMakeContextCurrent") || !call.desc.equals("(J)V")) continue;
            AbstractInsnNode prev = call.getPrevious();
            if (!(prev instanceof FieldInsnNode field) || field.getOpcode() != GETFIELD || !field.owner.equals(OWNER)
                    || !field.name.equals("window") || !field.desc.equals("J")) continue;
            if (!(prev.getPrevious() instanceof VarInsnNode load) || load.getOpcode() != ALOAD || load.var != 0)
                throw new IllegalStateException("UNEXPECTED_RECEIVER");
            call.owner = OWNER; call.name = HELPER; matches++;
        }
        if (matches != 1) throw new IllegalStateException("BINDING_SHAPE_COUNT_" + matches);
        node.methods.add(helper());
        // Preserve existing frames and constant pool. The caller retains the same stack effect.
        ClassWriter writer = new ClassWriter(reader, 0); node.accept(writer);
        byte[] result = writer.toByteArray(); verify(original, result); return result;
    }
    static void verify(byte[] original, byte[] patched) {
        ClassNode before = parse(original), after = parse(patched);
        if (after.methods.size() != before.methods.size() + 1) throw new AssertionError("METHOD_COUNT");
        int changed = 0;
        for (MethodNode left : before.methods) {
            MethodNode right = after.methods.stream().filter(m -> m.name.equals(left.name) && m.desc.equals(left.desc)).findFirst().orElseThrow();
            if (!Arrays.equals(methodBytes(left), methodBytes(right))) {
                if (!left.name.equals("renderThreadFunc") || !left.desc.equals("()V")) throw new AssertionError("UNEXPECTED_METHOD_CHANGE");
                changed++;
                int replacements = 0;
                for (AbstractInsnNode insn : right.instructions.toArray()) {
                    if (insn instanceof MethodInsnNode call && call.owner.equals(OWNER) && call.name.equals(HELPER)) {
                        call.owner = GLFW; call.name = "glfwMakeContextCurrent"; replacements++;
                    }
                }
                if (replacements != 1 || !Arrays.equals(methodBytes(left), methodBytes(right))) throw new AssertionError("CALLER_NOT_SINGLE_REPLACEMENT");
            }
        }
        if (changed != 1) throw new AssertionError("MISSING_CHANGE");
        // Removing the helper and reversing the single invocation must restore all class metadata.
        after.methods.removeIf(m -> m.name.equals(HELPER));
        ClassWriter a = new ClassWriter(0), b = new ClassWriter(0); before.accept(a); after.accept(b);
        if (!Arrays.equals(a.toByteArray(), b.toByteArray())) throw new AssertionError("UNEXPECTED_CLASS_CHANGE");
    }
    static Map<String, byte[]> entries(Path path) throws Exception {
        Map<String, byte[]> result = new TreeMap<>();
        try (JarFile jar = new JarFile(path.toFile())) {
            for (JarEntry entry : Collections.list(jar.entries())) {
                if (result.put(entry.getName(), jar.getInputStream(entry).readAllBytes()) != null) throw new IllegalStateException("DUPLICATE_ENTRY");
                if (entry.getName().matches("(?i)META-INF/[^/]+\\.(SF|RSA|DSA|EC)")) throw new IllegalStateException("SIGNED_JAR_REQUIRES_SEPARATE_REVIEW");
            }
        }
        return result;
    }
    public static void main(String[] args) throws Exception {
        Path input = Path.of(args[0]), output = Path.of(args[1]);
        Map<String, byte[]> before = entries(input); String target = OWNER + ".class";
        if (!before.containsKey(target)) throw new IllegalStateException("MISSING_TARGET");
        byte[] patched = patch(before.get(target));
        try (JarOutputStream out = new JarOutputStream(Files.newOutputStream(output, StandardOpenOption.CREATE_NEW))) {
            for (Map.Entry<String, byte[]> item : before.entrySet()) {
                JarEntry entry = new JarEntry(item.getKey()); entry.setTime(0); out.putNextEntry(entry);
                out.write(item.getKey().equals(target) ? patched : item.getValue()); out.closeEntry();
            }
        }
        Map<String, byte[]> after = entries(output);
        if (!before.keySet().equals(after.keySet())) throw new AssertionError("JAR_ENTRY_SET_CHANGED");
        int changed = 0;
        for (String name : before.keySet()) if (!Arrays.equals(before.get(name), after.get(name))) {
            if (!name.equals(target)) throw new AssertionError("UNEXPECTED_JAR_ENTRY_CHANGE"); changed++;
        }
        if (changed != 1) throw new AssertionError("JAR_CHANGE_COUNT");
        System.out.println("PASS jar entries unchanged except " + target + "; single invocation replacement and one private helper; all other methods/metadata equal");
    }
}
