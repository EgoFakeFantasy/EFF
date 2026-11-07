package eff.minecraft;
import java.nio.file.*;
import java.util.stream.Stream;

public final class BootstrapDiagnosticsTest {
  public static void main(String[] args) throws Exception {
    Path directory = Path.of("entity-guard-proof");
    BootstrapDiagnostics.state("disabled", Jsons.obj("ready", false));
    if (Files.exists(directory)) throw new AssertionError("opt-in required");
    System.setProperty("eff.manualCombat", "foreverlove");
    for(int i=0;i<100;i++) BootstrapDiagnostics.state("pending", Jsons.obj("ready", false));
    if(count(directory)!=1) throw new AssertionError("same-state writes must be bounded");
    BootstrapDiagnostics.state("pending", Jsons.obj("ready", true));
    if(count(directory)!=2) throw new AssertionError("transition must be recorded");
    BootstrapDiagnostics.state("../../invalid", Jsons.obj("ready", false));
    BootstrapDiagnostics.state("oversized", Jsons.obj("detail", "x".repeat(25000)));
    BootstrapDiagnostics.state("null-observation", null);
    if(count(directory)!=2) throw new AssertionError("invalid observations must not write");
    for(int i=0;i<100;i++) BootstrapDiagnostics.state("changes", Jsons.obj("revision", i));
    if(count(directory)!=32) throw new AssertionError("global cap");
    System.out.println("BOOTSTRAP_DIAGNOSTICS_OK opt-in dedup transitions invalid-input cap");
  }
  private static long count(Path path) throws Exception {
    try(Stream<Path> files=Files.list(path)) {return files.count();}
  }
}
