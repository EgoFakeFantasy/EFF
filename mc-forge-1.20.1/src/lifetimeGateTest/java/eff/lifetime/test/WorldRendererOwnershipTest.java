package eff.lifetime.test;

import eff.lifetime.*;
import java.util.*;
import org.objectweb.asm.*;

/** A renderer service lease follows actual stored ownership, including before entity claim. */
public final class WorldRendererOwnershipTest implements Opcodes {
  private static final String DISPATCHER = "net/minecraft/client/renderer/entity/EntityRenderDispatcher";
  private static final String WORLD = "net/minecraft/client/renderer/LevelRenderer";
  private static byte[] fixture(String name, String parent, String field, String descriptor) {
    ClassWriter c = new ClassWriter(0);
    c.visit(V17, ACC_PUBLIC, name, null, parent, null);
    c.visitField(ACC_PUBLIC, field, descriptor, null, null).visitEnd();
    var m = c.visitMethod(ACC_PUBLIC, "<init>", "()V", null, null);
    m.visitCode(); m.visitVarInsn(ALOAD, 0);
    m.visitMethodInsn(INVOKESPECIAL, parent, "<init>", "()V", false);
    m.visitInsn(RETURN); m.visitMaxs(1, 1); m.visitEnd(); c.visitEnd();
    return c.toByteArray();
  }
  private static void check(boolean value, String message) {
    if (!value) throw new AssertionError(message);
  }
  public static void run() throws Exception {
    for (boolean mapped : new boolean[] {false, true}) {
      String mapName = mapped ? "f_114362_" : "renderers";
      String field = mapped ? "f_109463_" : "entityRenderDispatcher";
      Map<String, byte[]> definitions = Map.of(
          DISPATCHER, fixture(DISPATCHER, "java/lang/Object", mapName, "Ljava/util/Map;"),
          WORLD, fixture(WORLD, "java/lang/Object", field, "L" + DISPATCHER + ";"),
          "fixture/ChildWorld", fixture("fixture/ChildWorld", WORLD, field, "Ljava/lang/Object;"),
          "fixture/Unrelated", fixture("fixture/Unrelated", "java/lang/Object", field, "L" + DISPATCHER + ";"));
      ClassLoader loader = new ClassLoader(WorldRendererOwnershipTest.class.getClassLoader()) {
        @Override protected Class<?> loadClass(String name, boolean resolve) throws ClassNotFoundException {
          byte[] bytes = definitions.get(name.replace('.', '/'));
          if (bytes == null) return super.loadClass(name, resolve);
          Class<?> type = findLoadedClass(name);
          if (type == null) type = defineClass(name, bytes, 0, bytes.length);
          if (resolve) resolveClass(type);
          return type;
        }
      };
      Class<?> dispatcherClass = loader.loadClass(DISPATCHER.replace('/', '.'));
      Class<?> worldClass = loader.loadClass(WORLD.replace('/', '.'));
      Object dispatcher = dispatcherClass.getConstructor().newInstance();
      Map<Object,Object> renderers = new HashMap<>();
      dispatcherClass.getField(mapName).set(dispatcher, renderers);
      class Renderer implements LifetimeRenderer {
        Object owner = new Object();
        public Object lifetimeRendererOwner() { return owner; }
        public boolean lifetimeRendererOwned() { return false; }
      }
      Renderer renderer = new Renderer(); renderers.put("original", renderer);
      Object world = worldClass.getConstructor().newInstance();
      check(!FieldWriteGate.isOwnedRuntimeObject(world), "NULL_WORLD_DISPATCHER_PROTECTED");
      worldClass.getField(field).set(world, dispatcher);
      check(FieldWriteGate.isOwnedRuntimeObject(world), "PRECLAIM_WORLD_RENDERER_UNPROTECTED:" + mapped);
      Object child = loader.loadClass("fixture.ChildWorld").getConstructor().newInstance();
      child.getClass().getDeclaredField(field).set(child, new Object());
      worldClass.getField(field).set(child, dispatcher);
      check(FieldWriteGate.isOwnedRuntimeObject(child), "SHADOW_FIELD_HID_REAL_WORLD_OWNER");
      Object unrelated = loader.loadClass("fixture.Unrelated").getConstructor().newInstance();
      unrelated.getClass().getField(field).set(unrelated, dispatcher);
      check(!FieldWriteGate.isOwnedRuntimeObject(unrelated), "UNRELATED_FIELD_NAME_ESTABLISHED_OWNERSHIP");
      renderers.clear();
      check(!FieldWriteGate.isOwnedRuntimeObject(world), "EMPTY_WORLD_LEASE_RETAINED");
      renderers.put("original", renderer); renderer.owner = null;
      check(!FieldWriteGate.isOwnedRuntimeObject(world), "RELEASED_WORLD_LEASE_RETAINED");
    }
    System.out.println("WORLD_RENDERER_OWNERSHIP_TEST_OK mappings=true preclaim=true declaredField=true release=true");
  }
}
