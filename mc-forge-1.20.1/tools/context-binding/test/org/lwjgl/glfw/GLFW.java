package org.lwjgl.glfw;
/** Offline boundary stub. Never packaged in the renderer JAR. */
public final class GLFW {
    public static final ThreadLocal<Long> current = ThreadLocal.withInitial(() -> 0L);
    public static int calls;
    public static RuntimeException failure;
    public static long glfwGetCurrentContext() { return current.get(); }
    public static void glfwMakeContextCurrent(long target) {
        calls++; if (failure != null) throw failure; current.set(target);
    }
}
