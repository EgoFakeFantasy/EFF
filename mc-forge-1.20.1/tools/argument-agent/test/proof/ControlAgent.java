package proof;
import java.lang.instrument.Instrumentation;
/** Test-only capability holder; never bundled in the candidate agent. */
public final class ControlAgent {
  public static Instrumentation instrumentation;
  public static void premain(String unused,Instrumentation value){instrumentation=value;}
}
