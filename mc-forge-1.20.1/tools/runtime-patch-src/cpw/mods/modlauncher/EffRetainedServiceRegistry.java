package cpw.mods.modlauncher;

import java.util.*;
import java.util.function.*;

/** Platform-owned admitted providers. All entries keep their original identity for this launch.
 * A concrete field type also rejects incompatible reflective Map replacement before mutation.
 * This is ordinary JVM type/ownership protection, not an Unsafe/JNI or redefinition boundary.
 */
public final class EffRetainedServiceRegistry<K, V> extends AbstractMap<K, V> {
  private final Map<K, V> admitted;
  private long denied;
  private EffRetainedServiceRegistry(Map<K, V> source) {
    admitted = Collections.unmodifiableMap(new LinkedHashMap<>(source));
  }
  static <K, V> EffRetainedServiceRegistry<K, V> admit(Map<K, V> source) {
    return new EffRetainedServiceRegistry<>(source);
  }
  private synchronized void deny() { denied++; }
  public synchronized long deniedMutations() { return denied; }
  @Override public V get(Object key) { return admitted.get(key); }
  @Override public boolean containsKey(Object key) { return admitted.containsKey(key); }
  @Override public int size() { return admitted.size(); }
  @Override public V put(K key, V value) { deny(); return admitted.get(key); }
  @Override public void putAll(Map<? extends K, ? extends V> values) { if (!values.isEmpty()) deny(); }
  @Override public V remove(Object key) { if (containsKey(key)) deny(); return null; }
  @Override public boolean remove(Object key, Object value) { if (containsKey(key)) deny(); return false; }
  @Override public void clear() { if (!isEmpty()) deny(); }
  @Override public V putIfAbsent(K key, V value) { deny(); return admitted.get(key); }
  @Override public boolean replace(K key, V before, V after) { deny(); return false; }
  @Override public V replace(K key, V value) { deny(); return admitted.get(key); }
  @Override public void replaceAll(BiFunction<? super K, ? super V, ? extends V> function) { Objects.requireNonNull(function); deny(); }
  @Override public V compute(K key, BiFunction<? super K, ? super V, ? extends V> function) { Objects.requireNonNull(function); deny(); return get(key); }
  @Override public V computeIfAbsent(K key, Function<? super K, ? extends V> function) { Objects.requireNonNull(function); deny(); return get(key); }
  @Override public V computeIfPresent(K key, BiFunction<? super K, ? super V, ? extends V> function) { Objects.requireNonNull(function); deny(); return get(key); }
  @Override public V merge(K key, V value, BiFunction<? super V, ? super V, ? extends V> function) { Objects.requireNonNull(function); Objects.requireNonNull(value); deny(); return get(key); }

  private <T> Collection<T> retainedView(Collection<T> values) {
    return new AbstractCollection<>() {
      public int size() { return values.size(); }
      public boolean contains(Object value) { return values.contains(value); }
      public Iterator<T> iterator() {
        Iterator<T> source = values.iterator();
        return new Iterator<>() {
          public boolean hasNext() { return source.hasNext(); }
          public T next() { return source.next(); }
          public void remove() { deny(); }
        };
      }
      public boolean remove(Object value) { if (values.contains(value)) deny(); return false; }
      public boolean removeIf(Predicate<? super T> predicate) {
        Objects.requireNonNull(predicate);
        for (T value : values) if (predicate.test(value)) deny();
        return false;
      }
      public boolean removeAll(Collection<?> items) { Objects.requireNonNull(items); for (T value : values) if (items.contains(value)) deny(); return false; }
      public boolean retainAll(Collection<?> items) { Objects.requireNonNull(items); for (T value : values) if (!items.contains(value)) deny(); return false; }
      public void clear() { if (!values.isEmpty()) deny(); }
    };
  }
  private <T> Set<T> retainedSet(Collection<T> values) {
    Collection<T> view = retainedView(values);
    return new AbstractSet<>() {
      public int size() { return view.size(); }
      public boolean contains(Object value) { return view.contains(value); }
      public Iterator<T> iterator() { return view.iterator(); }
      public boolean remove(Object value) { return view.remove(value); }
      public boolean removeIf(Predicate<? super T> predicate) { return view.removeIf(predicate); }
      public boolean removeAll(Collection<?> items) { return view.removeAll(items); }
      public boolean retainAll(Collection<?> items) { return view.retainAll(items); }
      public void clear() { view.clear(); }
    };
  }
  @Override public Set<K> keySet() { return retainedSet(admitted.keySet()); }
  @Override public Collection<V> values() { return retainedView(admitted.values()); }
  @Override public Set<Entry<K, V>> entrySet() {
    List<Entry<K, V>> values = new ArrayList<>();
    for (var entry : admitted.entrySet()) values.add(new SimpleImmutableEntry<>(entry) {
      @Override public V setValue(V value) { deny(); return getValue(); }
    });
    return retainedSet(values);
  }
}
