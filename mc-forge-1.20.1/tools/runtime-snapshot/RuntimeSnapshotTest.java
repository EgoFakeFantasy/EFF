package eff.diagnostics;
public final class RuntimeSnapshotTest {
  public static void main(String[] args) {
    if(!RuntimeSnapshot.quote("a\n\"\\").equals("\"a\\u000a\\\"\\\\\"")) throw new AssertionError("escaping");
    if(!RuntimeSnapshot.bounded("abcdef",3).equals("abc[TRUNCATED]")) throw new AssertionError("bounded");
    String result=RuntimeSnapshot.collect(new Class<?>[]{eff.minecraft.RuntimeLink.class, RuntimeSnapshotTest.class});
    if(!result.contains("eff.minecraft.RuntimeLink.admitted\":\"true")) throw new AssertionError(result);
    if(eff.minecraft.RuntimeLink.CLIENT.get()!=17 || !eff.minecraft.RuntimeLink.admitted) throw new AssertionError("mutated");
    if(result.contains("PRIVATE_UNRELATED_VALUE")) throw new AssertionError("scope");
    System.out.println("PASS read-only snapshot escaping, bounds, field scope, no mutation");
  }
}
