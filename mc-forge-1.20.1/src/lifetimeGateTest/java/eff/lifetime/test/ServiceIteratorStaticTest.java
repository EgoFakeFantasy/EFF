package eff.lifetime.test;

import java.util.List;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;
import org.objectweb.asm.tree.analysis.*;

/** Independent data-only model of a documented bad emitter, not a specimen transformer.
 * Reads JDK bytes; never defines generated classes, invokes the placeholder, or loads a mod.
 * This diagnoses an invalid stack; it is NOT runtime defense or an opponent JAR repair.
 */
public final class ServiceIteratorStaticTest implements Opcodes {
  private static byte[] emission(byte[] original, boolean surplus) {
    ClassReader reader = new ClassReader(original);
    ClassWriter writer = new ClassWriter(reader, surplus ? ClassWriter.COMPUTE_MAXS : ClassWriter.COMPUTE_FRAMES) {
      @Override protected String getCommonSuperClass(String a, String b) {
        if (!a.startsWith("java/") || !b.startsWith("java/"))
          throw new AssertionError("NON_JDK_TYPE_RESOLUTION_NOT_ALLOWED");
        return super.getCommonSuperClass(a, b);
      }
    };
    reader.accept(new ClassVisitor(ASM9, writer) {
      @Override public MethodVisitor visitMethod(int access, String name, String desc, String sig, String[] errors) {
        MethodVisitor next = super.visitMethod(access, name, desc, sig, errors);
        if (!name.equals("hasNext") || !desc.equals("()Z")) return next;
        return new MethodVisitor(ASM9, next) {
          Label first;
          @Override public void visitLabel(Label label) {
            super.visitLabel(label); if (first == null) first = label;
          }
          @Override public void visitMethodInsn(int op, String owner, String method, String type, boolean itf) {
            super.visitMethodInsn(op, owner, method, type, itf);
            if (op != INVOKEINTERFACE || !owner.equals("java/util/Iterator") || !method.equals("next")) return;
            mv.visitVarInsn(ASTORE, 10); mv.visitVarInsn(ALOAD, 10); mv.visitInsn(DUP);
            mv.visitMethodInsn(INVOKESTATIC, "offline/PredicateNotExecuted", "blocked", "(Ljava/lang/Object;)Z", false);
            Label allow = new Label(); mv.visitJumpInsn(IFEQ, allow); mv.visitInsn(POP);
            if (first == null) throw new AssertionError("EXPECTED_OUTER_LOOP_LABEL");
            mv.visitJumpInsn(GOTO, first); mv.visitLabel(allow);
            if (surplus) mv.visitVarInsn(ALOAD, 10);
          }
        };
      }
    }, ClassReader.EXPAND_FRAMES);
    return writer.toByteArray();
  }

  private static String failure(byte[] bytes) throws Exception {
    ClassNode node = new ClassNode(); new ClassReader(bytes).accept(node, 0);
    for (MethodNode method : node.methods) if (method.name.equals("hasNext") && method.desc.equals("()Z")) {
      try { new Analyzer<BasicValue>(new BasicVerifier()).analyze(node.name, method); }
      catch (AnalyzerException error) { return error.getMessage(); }
    }
    return null;
  }

  public static void run() throws Exception {
    for (String suffix : List.of("ModuleServicesLookupIterator", "LayerLookupIterator", "LazyClassPathLookupIterator")) {
      String resource = "java/util/ServiceLoader$" + suffix + ".class";
      byte[] original;
      try (var in = ClassLoader.getSystemResourceAsStream(resource)) {
        if (in == null) throw new AssertionError("JDK17_ITERATOR_REQUIRED");
        original = in.readAllBytes();
      }
      if (failure(original) != null) throw new AssertionError("UNMODIFIED_JDK_INVALID");
      String bad = failure(emission(original, true));
      if (suffix.startsWith("Lazy")) {
        if (bad != null) throw new AssertionError("DELEGATING_METHOD_SHOULD_BE_UNCHANGED");
      } else if (bad == null || !bad.contains("Incompatible stack heights"))
        throw new AssertionError("MALFORMED_LOOP_NOT_DETECTED:" + bad);
      if (failure(emission(original, false)) != null) throw new AssertionError("BALANCED_FIXTURE_INVALID");
      System.out.println("STATIC_ITERATOR_AUDIT " + suffix + " malformed=" + (bad != null) + " balanced=true");
    }
  }
}
