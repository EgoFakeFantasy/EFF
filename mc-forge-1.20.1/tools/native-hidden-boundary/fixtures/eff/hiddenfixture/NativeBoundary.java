package eff.hiddenfixture;
import java.security.ProtectionDomain;
public final class NativeBoundary {
  public static native Class<?> define(Class<?> lookup,byte[] bytes,ProtectionDomain domain,boolean init,int flags,Object data);
  public static native void uninstall();
}
