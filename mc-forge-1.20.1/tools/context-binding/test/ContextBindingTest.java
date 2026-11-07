import java.lang.reflect.*;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;
import org.lwjgl.glfw.GLFW;

public final class ContextBindingTest implements Opcodes {
    static final class Loader extends ClassLoader {
        Class<?> define(byte[] bytes) { return defineClass(null, bytes, 0, bytes.length); }
    }
    static byte[] fixture(boolean direct) {
        ClassWriter writer = new ClassWriter(0);
        writer.visit(V17, ACC_PUBLIC, "proof/BindingFixture", null, "java/lang/Object", null);
        MethodNode method = ContextBindingPatch.helper(); method.name = "bind"; method.access = ACC_PUBLIC | ACC_STATIC;
        if (direct) {
            method = new MethodNode(ACC_PUBLIC | ACC_STATIC, "bind", "(J)V", null, null);
            method.visitCode(); method.visitVarInsn(LLOAD, 0);
            method.visitMethodInsn(INVOKESTATIC, ContextBindingPatch.GLFW, "glfwMakeContextCurrent", "(J)V", false);
            method.visitInsn(RETURN); method.visitMaxs(2, 2); method.visitEnd();
        }
        method.accept(writer); writer.visitEnd(); return writer.toByteArray();
    }
    static void check(Method method, long start, long target, int expectedCalls) throws Exception {
        GLFW.current.set(start); GLFW.calls = 0; method.invoke(null, target);
        if (GLFW.calls != expectedCalls || GLFW.current.get() != target) throw new AssertionError("BIND_RESULT");
    }
    public static void main(String[] args) throws Exception {
        Method direct = new Loader().define(fixture(true)).getMethod("bind", long.class);
        Method guarded = new Loader().define(fixture(false)).getMethod("bind", long.class);
        check(direct, 42, 42, 1); // Negative control: original invokes native API redundantly.
        check(guarded, 42, 42, 0); check(guarded, 99, 42, 1);
        check(guarded, 0, 42, 1); check(guarded, 42, 0, 1); check(guarded, 0, 0, 0);
        GLFW.current.set(99L); GLFW.calls = 0;
        RuntimeException sentinel = new IllegalStateException("synthetic-native-failure"); GLFW.failure = sentinel;
        try { guarded.invoke(null, 42L); throw new AssertionError("EXCEPTION_SWALLOWED"); }
        catch (InvocationTargetException expected) { if (expected.getCause() != sentinel) throw expected; }
        finally { GLFW.failure = null; }
        if (GLFW.calls != 1 || GLFW.current.get() != 99) throw new AssertionError("FAILURE_PATH_CHANGED");
        GLFW.current.set(42L);
        Throwable[] failure = {null};
        Thread other = new Thread(() -> { try { check(guarded, 0, 42, 1); } catch (Throwable t) { failure[0] = t; } });
        other.start(); other.join(); if (failure[0] != null) throw new AssertionError(failure[0]);
        if (GLFW.current.get() != 42) throw new AssertionError("NOT_THREAD_LOCAL");
        System.out.println("PASS real ASM bytecode executed under -Xverify:all: original negative control; same/different/empty contexts; detach; exact exception propagation; thread-local ownership");
    }
}
