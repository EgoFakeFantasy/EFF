package eff.lifetime.test;

import eff.lifetime.StaticArgumentIsolationService;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.Set;
import java.util.jar.JarEntry;
import java.util.jar.JarOutputStream;
import org.objectweb.asm.ClassWriter;
import org.objectweb.asm.Opcodes;

/** Selection must depend on bytecode, must keep original jars intact, and must be bounded. */
public final class StaticArgumentIsolationServiceTest implements Opcodes {
  public static void run() throws Exception {
    var directory = Files.createTempDirectory("eff-argument-scan-");
    var jarPath = directory.resolve("arbitrary-name.jar");
    try (var jar = new JarOutputStream(Files.newOutputStream(jarPath))) {
      jar.putNextEntry(new JarEntry("unrelated/CallScratch.class"));
      jar.write(fixture("unrelated/CallScratch", true)); jar.closeEntry();
      jar.putNextEntry(new JarEntry("unrelated/OrdinaryState.class"));
      jar.write(fixture("unrelated/OrdinaryState", false)); jar.closeEntry();
    }
    byte[] original = Files.readAllBytes(jarPath);
    var scan = StaticArgumentIsolationService.scan(directory);
    Set<String> targets = scan.targets();
    if (!targets.equals(Set.of("unrelated.CallScratch"))) throw new AssertionError("STRUCTURAL_TARGET_SELECTION:" + targets);
    if (scan.jars() != 1 || scan.classes() != 2 || scan.bytes() <= 0 || scan.elapsedMillis() < 0)
      throw new AssertionError("SCAN_MEASUREMENTS_INVALID:" + scan);
    if (!Arrays.equals(original, Files.readAllBytes(jarPath))) throw new AssertionError("SCANNER_MUTATED_JAR");
    try (var files = Files.list(directory)) {
      if (files.count() != 1) throw new AssertionError("SCANNER_EXTRACTED_OR_WROTE_FILES");
    }
    if (!StaticArgumentIsolationService.scanTargets(directory.resolve("absent")).isEmpty())
      throw new AssertionError("MISSING_MODS_NOT_EMPTY");
    try (var jar = new JarOutputStream(Files.newOutputStream(directory.resolve("oversized.jar")))) {
      jar.putNextEntry(new JarEntry("TooBig.class"));
      jar.write(new byte[4 * 1024 * 1024 + 1]); jar.closeEntry();
    }
    try { StaticArgumentIsolationService.scanTargets(directory); throw new AssertionError("SCAN_BUDGET_IGNORED"); }
    catch (java.io.IOException expected) {
      if (!expected.getMessage().equals("ARGUMENT_SCAN_BYTE_BUDGET")) throw expected;
    }
    System.out.println("ARGUMENT_ISOLATION_SERVICE_SCAN_OK artifacts=" + directory);
  }

  private static byte[] fixture(String name, boolean privateField) {
    ClassWriter writer = new ClassWriter(ClassWriter.COMPUTE_FRAMES);
    writer.visit(V17, ACC_PUBLIC, name, null, "java/lang/Object", null);
    writer.visitField(ACC_STATIC | (privateField ? ACC_PRIVATE : ACC_PUBLIC), "scratch", "Ljava/lang/Object;", null, null).visitEnd();
    var method = writer.visitMethod(ACC_PUBLIC | ACC_STATIC, "identity", "(Ljava/lang/Object;)Ljava/lang/Object;", null, null);
    method.visitCode(); method.visitVarInsn(ALOAD, 0);
    method.visitFieldInsn(PUTSTATIC, name, "scratch", "Ljava/lang/Object;");
    method.visitFieldInsn(GETSTATIC, name, "scratch", "Ljava/lang/Object;");
    method.visitInsn(ARETURN); method.visitMaxs(0, 0); method.visitEnd(); writer.visitEnd();
    return writer.toByteArray();
  }
}
