package cpw.mods.modlauncher;

import cpw.mods.modlauncher.serviceapi.ILaunchPluginService;
import java.util.*;
import java.util.function.*;

/** One append-only plugin registry per platform layer manager, shared by handler instances.
 * New providers may register normally. Existing providers cannot be removed or replaced.
 * No provider class/name is privileged; native writes to this registry remain out of scope.
 */
public final class EffRetainedPluginRegistry extends AbstractMap<String, ILaunchPluginService> {
  private static final Map<Object, EffRetainedPluginRegistry> BY_LAYER = new WeakHashMap<>();
  private static final Map<Object, EffRetainedPluginRegistry> BY_HANDLER = new WeakHashMap<>();
  private final Map<String, ILaunchPluginService> admitted = new LinkedHashMap<>();
  private long denied;
  private EffRetainedPluginRegistry(Map<String, ILaunchPluginService> initial) { admitted.putAll(initial); }
  static synchronized EffRetainedPluginRegistry findExisting(Object layerManager) { return BY_LAYER.get(layerManager); }
  static synchronized void remember(Object handler, Object layerManager) {
    EffRetainedPluginRegistry registry = BY_LAYER.get(layerManager);
    if (registry == null) throw new IllegalStateException("PLUGIN_REGISTRY_NOT_ADMITTED");
    BY_HANDLER.put(handler, registry);
  }
  /** Bind a replacement at its real Launcher owner read, never infer a layer from a peer map. */
  static synchronized LaunchPluginHandler bindActive(LaunchPluginHandler handler, Object layerManager) {
    Objects.requireNonNull(handler);
    EffRetainedPluginRegistry registry = BY_LAYER.get(layerManager);
    if (registry == null) throw new IllegalStateException("PLUGIN_OWNER_LAYER_NOT_ADMITTED");
    EffRetainedPluginRegistry previous = BY_HANDLER.get(handler);
    if (previous != null && previous != registry)
      throw new IllegalStateException("PLUGIN_HANDLER_LAYER_MISMATCH");
    BY_HANDLER.put(handler, registry);
    return handler;
  }
  static synchronized Map<String, ILaunchPluginService> resolve(Object handler, Map<String, ILaunchPluginService> proposed) {
    EffRetainedPluginRegistry registry = BY_HANDLER.get(handler);
    if (registry == null) throw new IllegalStateException("PLUGIN_HANDLER_NOT_ADMITTED");
    // Keep the public Map-shaped registration surface. A reflected batch replacement may
    // add peers; reconcile at the existing platform read boundary, without changing that map.
    if (proposed != registry && proposed != null) registry.putAll(proposed);
    return registry;
  }
  static synchronized EffRetainedPluginRegistry admit(Object layerManager, Map<String, ILaunchPluginService> initial) {
    Objects.requireNonNull(layerManager);
    EffRetainedPluginRegistry registry = BY_LAYER.get(layerManager);
    if (registry == null) { registry = new EffRetainedPluginRegistry(initial); BY_LAYER.put(layerManager, registry); }
    else registry.putAll(initial);
    return registry;
  }
  private synchronized EffRetainedServiceRegistry<String, ILaunchPluginService> snapshot() {
    return EffRetainedServiceRegistry.admit(admitted);
  }
  @Override public synchronized int size() { return admitted.size(); }
  @Override public synchronized boolean containsKey(Object key) { return admitted.containsKey(key); }
  @Override public synchronized ILaunchPluginService get(Object key) { return admitted.get(key); }
  @Override public synchronized ILaunchPluginService put(String key, ILaunchPluginService plugin) {
    Objects.requireNonNull(key); Objects.requireNonNull(plugin);
    var original = admitted.get(key);
    if (original == null) admitted.put(key, plugin);
    else if (original != plugin) denied++;
    return original;
  }
  @Override public void putAll(Map<? extends String, ? extends ILaunchPluginService> input) { input.forEach(this::put); }
  @Override public synchronized ILaunchPluginService putIfAbsent(String key, ILaunchPluginService plugin) { return put(key, plugin); }
  @Override public synchronized ILaunchPluginService remove(Object key) { if (containsKey(key)) denied++; return null; }
  @Override public synchronized boolean remove(Object key, Object plugin) { if (containsKey(key)) denied++; return false; }
  @Override public synchronized void clear() { if (!admitted.isEmpty()) denied++; }
  @Override public synchronized ILaunchPluginService replace(String key, ILaunchPluginService plugin) { denied++; return get(key); }
  @Override public synchronized boolean replace(String key, ILaunchPluginService old, ILaunchPluginService next) { denied++; return false; }
  @Override public synchronized void replaceAll(BiFunction<? super String, ? super ILaunchPluginService, ? extends ILaunchPluginService> fn) { Objects.requireNonNull(fn); denied++; }
  @Override public synchronized ILaunchPluginService computeIfAbsent(String key, Function<? super String, ? extends ILaunchPluginService> fn) {
    Objects.requireNonNull(fn); var original = get(key); if (original != null) return original;
    var result = fn.apply(key); if (result != null) put(key, result); return result;
  }
  @Override public synchronized ILaunchPluginService compute(String key, BiFunction<? super String, ? super ILaunchPluginService, ? extends ILaunchPluginService> fn) {
    Objects.requireNonNull(fn); if (containsKey(key)) { denied++; return get(key); }
    var result = fn.apply(key, null); if (result != null) put(key, result); return result;
  }
  @Override public synchronized ILaunchPluginService computeIfPresent(String key, BiFunction<? super String, ? super ILaunchPluginService, ? extends ILaunchPluginService> fn) { Objects.requireNonNull(fn); if (containsKey(key)) denied++; return get(key); }
  @Override public synchronized ILaunchPluginService merge(String key, ILaunchPluginService value, BiFunction<? super ILaunchPluginService, ? super ILaunchPluginService, ? extends ILaunchPluginService> fn) { Objects.requireNonNull(fn); Objects.requireNonNull(value); put(key, value); return get(key); }
  // Iteration is a stable callback snapshot. A newly admitted plugin appears in the next dispatch.
  @Override public Set<Entry<String, ILaunchPluginService>> entrySet() { return snapshot().entrySet(); }
  @Override public Set<String> keySet() { return snapshot().keySet(); }
  @Override public Collection<ILaunchPluginService> values() { return snapshot().values(); }
  public synchronized long directlyDeniedMutations() { return denied; }
}
