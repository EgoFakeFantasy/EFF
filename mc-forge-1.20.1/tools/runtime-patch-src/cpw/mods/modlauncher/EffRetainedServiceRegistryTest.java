package cpw.mods.modlauncher;

import java.util.*;

public final class EffRetainedServiceRegistryTest {
  public static final class Holder {
    public EffRetainedServiceRegistry<String, Object> serviceLookup;
  }
  public static void main(String[] args) throws Exception {
    Object first = new Object(), peer = new Object(), opponent = new Object();
    var source = new LinkedHashMap<String, Object>();
    source.put("first", first); source.put("peer", peer); source.put("opponent", opponent);
    var registry = EffRetainedServiceRegistry.admit(source);
    Holder holder = new Holder(); holder.serviceLookup = registry;
    if (!new ArrayList<>(registry.keySet()).equals(List.of("first", "peer", "opponent")))
      throw new AssertionError("ADMITTED_ORDER_CHANGED");
    if (registry.values() instanceof Set<?>) throw new AssertionError("VALUES_NOT_COLLECTION");
    source.clear();
    registry.remove("peer"); registry.remove("peer", peer); registry.clear();
    registry.keySet().remove("peer"); registry.keySet().removeIf(key -> true);
    registry.values().removeIf(value -> true); registry.entrySet().removeIf(entry -> true);
    registry.values().removeAll(List.of(peer)); registry.keySet().retainAll(List.of());
    var iterator = registry.entrySet().iterator(); iterator.next(); iterator.remove();
    registry.entrySet().iterator().next().setValue(new Object());
    registry.put("peer", new Object()); registry.put("extra", new Object());
    registry.compute("peer", (key, value) -> null); registry.replaceAll((key, value) -> null);
    registry.merge("peer", new Object(), (oldValue, newValue) -> newValue);
    if (registry.size() != 3 || registry.get("first") != first || registry.get("peer") != peer
        || registry.get("opponent") != opponent || registry.deniedMutations() < 10)
      throw new AssertionError("ADMITTED_IDENTITY_LOST");
    try {
      Holder.class.getDeclaredField("serviceLookup").set(holder, new HashMap<>(Map.of("first", first)));
      throw new AssertionError("INCOMPATIBLE_REFLECTIVE_REPLACEMENT_ACCEPTED");
    } catch (IllegalArgumentException expected) { }
    if (holder.serviceLookup != registry || registry.get("opponent") != opponent)
      throw new AssertionError("REFLECTIVE_REPLACEMENT_MUTATED_FIELD");
    RuntimeException expected = new IllegalStateException("PROVIDER_VALIDATION_FAILURE");
    try { registry.values().forEach(value -> { if (value == peer) throw expected; }); throw new AssertionError("VALIDATION_SUPPRESSED"); }
    catch (RuntimeException actual) { if (actual != expected) throw actual; }
    if (registry.values().stream().count() != 3) throw new AssertionError("PROVIDER_NOT_ITERATED");
    System.out.println("RETAINED_SERVICE_REGISTRY_TEST_OK admitted=3 sameObjects=true ordered=true mutationDenied=true reflectiveReplacement=type-rejected validationFailure=propagated");
  }
}
