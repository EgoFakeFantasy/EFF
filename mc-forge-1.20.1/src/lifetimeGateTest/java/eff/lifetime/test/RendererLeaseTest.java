package eff.lifetime.test;

import eff.lifetime.*;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;
import java.util.*;

/** Execute the emitted map write, including legal refresh and release. */
public final class RendererLeaseTest {
  public static class Renderer implements LifetimeRenderer {
    final Object owner;
    boolean owned = true;
    Renderer(Object owner) { this.owner = owner; }
    public boolean lifetimeRendererOwned() { return owned; }
    public Object lifetimeRendererOwner() { return owner; }
  }
  public static void run() throws Exception {
    for (String field : List.of("renderers", "f_114362_")) {
      String name = "net/minecraft/client/renderer/entity/EntityRenderDispatcher";
      ClassWriter c = new ClassWriter(ClassWriter.COMPUTE_FRAMES);
      c.visit(Opcodes.V17, Opcodes.ACC_PUBLIC, name, null, "java/lang/Object", null);
      c.visitField(Opcodes.ACC_PUBLIC, field, "Ljava/util/Map;", null, null).visitEnd();
      var ctor = c.visitMethod(Opcodes.ACC_PUBLIC, "<init>", "()V", null, null);
      ctor.visitCode(); ctor.visitVarInsn(Opcodes.ALOAD, 0);
      ctor.visitMethodInsn(Opcodes.INVOKESPECIAL, "java/lang/Object", "<init>", "()V", false);
      ctor.visitInsn(Opcodes.RETURN); ctor.visitMaxs(0, 0); ctor.visitEnd();
      var set = c.visitMethod(Opcodes.ACC_PUBLIC, "replace", "(Ljava/util/Map;)V", null, null);
      set.visitCode(); set.visitVarInsn(Opcodes.ALOAD, 0); set.visitVarInsn(Opcodes.ALOAD, 1);
      set.visitFieldInsn(Opcodes.PUTFIELD, name, field, "Ljava/util/Map;");
      set.visitInsn(Opcodes.RETURN); set.visitMaxs(0, 0); set.visitEnd(); c.visitEnd();
      ClassNode node = new ClassNode(); new ClassReader(c.toByteArray()).accept(node, 0);
      if (FieldWriteGate.instrument(node) != 1) throw new AssertionError("RENDER_FIELD_MAPPING");
      ClassWriter out = new ClassWriter(ClassWriter.COMPUTE_FRAMES); node.accept(out);
      Class<?> type = new ClassLoader(RendererLeaseTest.class.getClassLoader()) {
        Class<?> define() { byte[] b = out.toByteArray(); return defineClass(name.replace('/', '.'), b, 0, b.length); }
      }.define();
      Object instance = type.getConstructor().newInstance(); var write = type.getMethod("replace", Map.class);
      Object owner = new Object(); Renderer original = new Renderer(owner);
      Map<String,Object> first = Map.of("owned", original, "other", new Object());
      write.invoke(instance, first);
      Map<String,Object> foreign = Map.of("owned", new Object());
      long denied = FieldWriteGate.deniedRendererWrites();
      write.invoke(instance, foreign);
      if (type.getField(field).get(instance) != first || FieldWriteGate.deniedRendererWrites() != denied + 1)
        throw new AssertionError("EMPTY_RENDERER_REPLACEMENT_ALLOWED");
      write.invoke(instance, new Object[]{null});
      if (type.getField(field).get(instance) != first) throw new AssertionError("RENDERER_MAP_CLEAR_ALLOWED");
      Map<String,Object> changedOther = Map.of("owned", original, "other", new Object());
      write.invoke(instance, changedOther);
      if (type.getField(field).get(instance) != changedOther) throw new AssertionError("UNRELATED_RENDERER_BLOCKED");
      Renderer refreshed = new Renderer(owner); Map<String,Object> reload = Map.of("owned", refreshed);
      write.invoke(instance, reload);
      if (type.getField(field).get(instance) != reload) throw new AssertionError("OWNED_RESOURCE_RELOAD_BLOCKED");
      write.invoke(instance, Map.of("owned", new Renderer(new Object())));
      if (type.getField(field).get(instance) != reload) throw new AssertionError("DIFFERENT_OWNER_ADMITTED");
      refreshed.owned = false; write.invoke(instance, foreign);
      if (type.getField(field).get(instance) != foreign) throw new AssertionError("RENDERER_RELEASE_BLOCKED");
    }
  }
}
