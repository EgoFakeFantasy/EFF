import java.nio.file.*;
import java.util.*;
import net.minecraftforge.coremod.api.ASMAPI;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;

public final class FieldRedirectCompatibilityTest implements Opcodes {
  static int sequence;
  static void require(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
  static MethodNode method(ClassNode node, String name, String descriptor) {
    MethodNode method = new MethodNode(ACC_PUBLIC, name, descriptor, null, null); node.methods.add(method); return method;
  }
  static ClassNode fixture(int visibility) {
    ClassNode node = new ClassNode(); node.version = V17; node.access = ACC_PUBLIC; node.name = "fixture/Redirect" + sequence++; node.superName = "java/lang/Object";
    node.fields.add(new FieldNode(visibility, "value", "I", null, null));
    MethodNode init = method(node, "<init>", "()V"); init.instructions.add(new VarInsnNode(ALOAD, 0)); init.instructions.add(new MethodInsnNode(INVOKESPECIAL, "java/lang/Object", "<init>", "()V", false)); init.instructions.add(new InsnNode(RETURN));
    MethodNode getter = method(node, "getter", "()I"); getter.instructions.add(new VarInsnNode(ALOAD, 0)); getter.instructions.add(new FieldInsnNode(GETFIELD, node.name, "value", "I")); getter.instructions.add(new IntInsnNode(BIPUSH, 100)); getter.instructions.add(new InsnNode(IADD)); getter.instructions.add(new InsnNode(IRETURN));
    MethodNode reader = method(node, "read", "(Z)I"); reader.instructions.add(new VarInsnNode(ALOAD, 0)); reader.instructions.add(new FieldInsnNode(GETFIELD, node.name, "value", "I")); reader.instructions.add(new InsnNode(IRETURN));
    MethodNode raw = method(node, "sameDescriptor", "()I"); raw.instructions.add(new VarInsnNode(ALOAD, 0)); raw.instructions.add(new FieldInsnNode(GETFIELD, node.name, "value", "I")); raw.instructions.add(new InsnNode(IRETURN));
    MethodNode writer = method(node, "write", "(I)V"); writer.instructions.add(new VarInsnNode(ALOAD, 0)); writer.instructions.add(new VarInsnNode(ILOAD, 1)); writer.instructions.add(new FieldInsnNode(PUTFIELD, node.name, "value", "I")); writer.instructions.add(new InsnNode(RETURN));
    return node;
  }
  static byte[] bytes(ClassNode node) { ClassWriter writer = new ClassWriter(ClassWriter.COMPUTE_FRAMES | ClassWriter.COMPUTE_MAXS); node.accept(writer); return writer.toByteArray(); }
  static final class Loader extends ClassLoader { Class<?> define(ClassNode node) { byte[] code = bytes(node); return defineClass(node.name.replace('/', '.'), code, 0, code.length); } }
  static void rejected(ClassNode node, String getter) {
    byte[] before = bytes(node);
    try { ASMAPI.redirectFieldToMethod(node, "value", getter); throw new AssertionError("invalid shape accepted"); }
    catch (IllegalStateException expected) { require(Arrays.equals(before, bytes(node)), "validation rejected before mutations"); }
  }
  static void runVisible(int visibility, boolean patched) throws Exception {
    ClassNode node = fixture(visibility);
    if (!patched && visibility != ACC_PRIVATE) { rejected(node, "getter"); return; }
    ASMAPI.redirectFieldToMethod(node, "value", "getter"); require(node.fields.get(0).access == visibility, "field visibility unchanged");
    Loader loader = new Loader(); Class<?> type = loader.define(node); Object instance = type.getConstructor().newInstance();
    type.getMethod("write", int.class).invoke(instance, 7);
    require(type.getMethod("read", boolean.class).invoke(instance, false).equals(107), "internal read calls original business getter");
    require(type.getMethod("getter").invoke(instance).equals(107), "getter not recursive");
    require(type.getMethod("sameDescriptor").invoke(instance).equals(7), "upstream same-descriptor exclusion unchanged");
    type.getMethod("write", int.class).invoke(instance, 9);
    require(type.getMethod("read", boolean.class).invoke(instance, true).equals(109), "write and subsequent reads preserved");
    if (visibility == ACC_PUBLIC) {
      ClassNode external = new ClassNode(); external.version = V17; external.access = ACC_PUBLIC; external.name = "fixture/External" + sequence++; external.superName = "java/lang/Object";
      MethodNode direct = method(external, "read", "(L" + node.name + ";)I"); direct.access |= ACC_STATIC;
      direct.instructions.add(new VarInsnNode(ALOAD, 0)); direct.instructions.add(new FieldInsnNode(GETFIELD, node.name, "value", "I")); direct.instructions.add(new InsnNode(IRETURN));
      Class<?> reader = loader.define(external);
      require(reader.getMethod("read", type).invoke(null, instance).equals(9), "external direct read remains direct");
    }
  }
  public static void main(String[] args) throws Exception {
    boolean patched = args[0].equals("patched");
    for (int visibility : new int[]{ACC_PRIVATE, ACC_PUBLIC, ACC_PROTECTED, 0}) runVisible(visibility, patched);
    rejected(fixture(ACC_STATIC | ACC_PRIVATE), "getter"); rejected(fixture(ACC_STATIC | ACC_PUBLIC), "getter");
    rejected(fixture(ACC_PUBLIC), "missing");
    ClassNode foreign = fixture(ACC_PUBLIC);
    ((FieldInsnNode) foreign.methods.get(2).instructions.get(1)).owner = "fixture/DifferentOwner";
    rejected(foreign, "getter");
    ClassNode staticGetter = fixture(ACC_PUBLIC); staticGetter.methods.get(1).access |= ACC_STATIC; rejected(staticGetter, "getter");
    ClassNode mismatch = fixture(ACC_PUBLIC); ((FieldInsnNode) mismatch.methods.get(2).instructions.get(1)).desc = "J"; rejected(mismatch, "getter");
    System.out.println("FIELD_REDIRECT_TEST_OK mode=" + args[0] + " privateUnchanged=true widened=" + patched + " staticRejected=true exactOwnerDescriptor=true getterCallsExecute=true noRecursiveGetter=true writesPreserved=true externalReadsPreserved=true");
  }
}
