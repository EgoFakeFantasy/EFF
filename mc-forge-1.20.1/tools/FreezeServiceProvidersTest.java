import java.io.*;
import java.net.*;
import java.nio.file.*;
import java.util.*;
import java.util.function.Consumer;
import java.util.jar.*;
import java.util.stream.Stream;

/** Controlled classloader fault only; no agent, target specimen execution, or host change. */
public final class FreezeServiceProvidersTest {
  public interface Service { String name(); }
  public static volatile boolean initialized;
  public static final class First implements Service {
    public First() { initialized = true; }
    public String name() { return "first"; }
  }
  public static final class Peer implements Service {
    public Peer() {}
    public String name() { return "peer"; }
  }
  static ClassLoader fixture(Path serviceConfig) throws Exception {
    String first = First.class.getName(), peer = Peer.class.getName();
    return new ClassLoader(FreezeServiceProvidersTest.class.getClassLoader()) {
      @Override public Enumeration<URL> getResources(String name) throws IOException {
        if (name.equals("META-INF/services/" + Service.class.getName()))
          return Collections.enumeration(List.of(serviceConfig.toUri().toURL()));
        return super.getResources(name);
      }
      @Override protected Class<?> loadClass(String name, boolean resolve) throws ClassNotFoundException {
        if (!name.equals(first) && !name.equals(peer)) return super.loadClass(name, resolve);
        Class<?> loaded = findLoadedClass(name);
        if (loaded == null) {
          // Models metadata access becoming unavailable after the first constructor runs.
          if (name.equals(peer) && initialized) throw new ClassNotFoundException("PEER_DISCOVERY_DISABLED_AFTER_CONSTRUCTOR");
          try (InputStream in = getParent().getResourceAsStream(name.replace('.', '/') + ".class")) {
            byte[] bytes = in.readAllBytes(); loaded = defineClass(name, bytes, 0, bytes.length);
          } catch (IOException error) { throw new ClassNotFoundException(name, error); }
        }
        if (resolve) resolveClass(loaded); return loaded;
      }
    };
  }
  static List<String> invoke(byte[] utility, Path config) throws Exception {
    initialized = false;
    Class<?> type = new ClassLoader(FreezeServiceProvidersTest.class.getClassLoader()) {
      Class<?> define() { return defineClass("cpw.mods.modlauncher.util.ServiceLoaderUtils", utility, 0, utility.length); }
    }.define();
    var loader = ServiceLoader.load(Service.class, fixture(config));
    @SuppressWarnings("unchecked") Stream<Service> stream = (Stream<Service>)type
        .getMethod("streamWithErrorHandling", ServiceLoader.class, Consumer.class)
        .invoke(null, loader, (Consumer<ServiceConfigurationError>)error -> { throw error; });
    return stream.map(Service::name).toList();
  }
  public static void main(String[] args) throws Exception {
    byte[] original;
    try (var jar = new JarFile(args[0]); var input = jar.getInputStream(jar.getJarEntry(FreezeServiceProviders.ENTRY))) {
      original = input.readAllBytes();
    }
    Path config = Path.of(args[1]);
    Files.writeString(config, First.class.getName() + "\n" + Peer.class.getName() + "\n", StandardOpenOption.CREATE_NEW);
    boolean reproduced = false;
    try { invoke(original, config); }
    catch (ServiceConfigurationError missingPeer) { reproduced = true; }
    if (!reproduced) throw new AssertionError("LAZY_DISCOVERY_FAILURE_NOT_REPRODUCED");
    List<String> result = invoke(FreezeServiceProviders.transform(original), config);
    if (!result.equals(List.of("first", "peer"))) throw new AssertionError("SNAPSHOT_LOST_OR_REORDERED_PROVIDER:" + result);
    if (!initialized) throw new AssertionError("PROVIDER_CONSTRUCTOR_SUPPRESSED");
    System.out.println("EAGER_PROVIDER_SNAPSHOT_TEST_OK original=metadata-loss patched=" + result + " constructors=executed");
  }
}
