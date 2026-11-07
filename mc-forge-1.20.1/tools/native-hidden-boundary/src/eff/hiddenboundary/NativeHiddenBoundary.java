package eff.hiddenboundary;
/** JNI contract only. Caller must verify/load a sealed library and prewarm its provider. */
public final class NativeHiddenBoundary {
  private NativeHiddenBoundary() {}
  public static native void install(Class<?> provider);
  public static native long[] stats();
  /** Bounded, read-only JVMTI metadata/bytecode comparison; never repairs VM state. */
  public static native void auditMethods();
  /** Fixed MC tick allowlist, 32 calls per JVM; data only, never invokes the target. */
  public static native String inspectTick(Class<?> target);
}
