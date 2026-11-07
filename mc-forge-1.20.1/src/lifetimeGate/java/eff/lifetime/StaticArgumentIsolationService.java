package eff.lifetime;

import cpw.mods.modlauncher.api.IEnvironment;
import cpw.mods.modlauncher.api.ITransformationService;
import cpw.mods.modlauncher.api.ITransformer;
import cpw.mods.modlauncher.api.ITransformerVotingContext;
import cpw.mods.modlauncher.api.TransformerVoteResult;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.jar.JarFile;
import org.objectweb.asm.ClassReader;
import org.objectweb.asm.tree.ClassNode;

/** A normal ModLauncher transformation service, independent of the launch-plugin map.
 * It never loads a scanned class, changes an on-disk mod, suppresses a gameplay hook,
 * or recognizes an opponent name. Targets are selected by provable private spill structure.
 * Classes defined by a different/earlier loader and subsequent native rewriting are not covered.
 */
public final class StaticArgumentIsolationService implements ITransformationService {
  private Set<ITransformer.Target> targets = Set.of();
  public record ScanResult(Set<String> targets, int jars, int classes, long bytes, long elapsedMillis) {}

  public StaticArgumentIsolationService() {
    System.err.println("[EFF_ARGUMENT_ISOLATION] lifecycle=constructor");
  }

  @Override public String name() { return "eff_argument_isolation"; }
  @Override public void onLoad(IEnvironment environment, Set<String> otherServices) {
    System.err.println("[EFF_ARGUMENT_ISOLATION] lifecycle=onLoad");
  }
  @Override public void initialize(IEnvironment environment) {
    System.err.println("[EFF_ARGUMENT_ISOLATION] lifecycle=initialize-enter");
    Path game = environment.getProperty(IEnvironment.Keys.GAMEDIR.get()).orElse(null);
    if (game == null) throw new IllegalStateException("EFF_ARGUMENT_ISOLATION_GAMEDIR_MISSING");
    try {
      var found = new LinkedHashSet<ITransformer.Target>();
      ScanResult scan = scan(game.resolve("mods"));
      for (String name : scan.targets()) found.add(ITransformer.Target.targetClass(name));
      targets = Set.copyOf(found);
      System.err.println("[EFF_ARGUMENT_ISOLATION] initialized targets=" + targets.size()
          + " scannedJars=" + scan.jars() + " scannedClasses=" + scan.classes()
          + " scannedBytes=" + scan.bytes() + " scanElapsedMs=" + scan.elapsedMillis());
    } catch (IOException invalidInput) {
      throw new IllegalStateException("EFF_ARGUMENT_ISOLATION_SCAN_FAILED", invalidInput);
    }
  }

  /** Bounded read-only scan: no extraction, class definition, symlink traversal or recursive dirs. */
  public static Set<String> scanTargets(Path mods) throws IOException {
    return scan(mods).targets();
  }

  public static ScanResult scan(Path mods) throws IOException {
    long started = System.nanoTime();
    if (!Files.exists(mods, LinkOption.NOFOLLOW_LINKS)) return new ScanResult(Set.of(), 0, 0, 0, 0);
    if (!Files.isDirectory(mods, LinkOption.NOFOLLOW_LINKS)) throw new IOException("MODS_NOT_DIRECTORY");
    var names = new LinkedHashSet<String>();
    long byteBudget = 256L * 1024 * 1024;
    int entryBudget = 50000, jarBudget = 512, classCount = 0;
    List<Path> jars;
    try (var paths = Files.list(mods)) {
      jars = paths.filter(p -> p.getFileName().toString().endsWith(".jar"))
          .sorted().limit(jarBudget + 1L).toList();
    }
    if (jars.size() > jarBudget) throw new IOException("ARGUMENT_SCAN_JAR_BUDGET");
    for (Path file : jars) {
      if (!Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS)) throw new IOException("MOD_JAR_NOT_REGULAR");
      try (var jar = new JarFile(file.toFile(), false)) {
        var entries = jar.entries();
        while (entries.hasMoreElements()) {
          var entry = entries.nextElement();
          if (--entryBudget < 0) throw new IOException("ARGUMENT_SCAN_ENTRY_BUDGET");
          if (entry.isDirectory() || !entry.getName().endsWith(".class")
              || entry.getName().equals("module-info.class")
              || entry.getName().startsWith("META-INF/versions/")) continue;
          byte[] bytes;
          try (var input = jar.getInputStream(entry)) { bytes = input.readNBytes(4 * 1024 * 1024 + 1); }
          if (bytes.length > 4 * 1024 * 1024 || (byteBudget -= bytes.length) < 0)
            throw new IOException("ARGUMENT_SCAN_BYTE_BUDGET");
          ClassNode node = new ClassNode();
          try { new ClassReader(bytes).accept(node, 0); }
          catch (IllegalArgumentException invalidClass) {
            throw new IOException("ARGUMENT_SCAN_INVALID_CLASS:" + entry.getName(), invalidClass);
          }
          if (!entry.getName().equals(node.name + ".class"))
            throw new IOException("ARGUMENT_SCAN_CLASS_PATH_MISMATCH");
          classCount++;
          if (!StaticArgumentIsolation.instrument(node).isEmpty()) names.add(node.name.replace('/', '.'));
        }
      }
    }
    return new ScanResult(Set.copyOf(names), jars.size(), classCount,
        256L * 1024 * 1024 - byteBudget, (System.nanoTime() - started) / 1_000_000L);
  }

  @Override @SuppressWarnings("rawtypes") public List<ITransformer> transformers() {
    return List.of(new ITransformer<ClassNode>() {
      @Override public Set<Target> targets() { return targets; }
      @Override public TransformerVoteResult castVote(ITransformerVotingContext context) {
        return TransformerVoteResult.YES;
      }
      @Override public ClassNode transform(ClassNode input, ITransformerVotingContext context) {
        var changed = StaticArgumentIsolation.instrument(input);
        System.err.println("[EFF_ARGUMENT_ISOLATION] class=" + input.name + " isolatedFields=" + changed.size()
            + " rewrites=" + changed);
        return input;
      }
      @Override public String[] labels() { return new String[] {"private-static-argument-isolation"}; }
    });
  }
}
