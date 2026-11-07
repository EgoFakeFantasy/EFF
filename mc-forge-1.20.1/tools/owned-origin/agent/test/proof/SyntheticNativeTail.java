package proof;
/** Offline negative-control fixture only; not packaged in any runtime agent. */
public final class SyntheticNativeTail {
    public static native int install(Class<?> target,byte[] replacement);
    public static native int uninstall();
}
