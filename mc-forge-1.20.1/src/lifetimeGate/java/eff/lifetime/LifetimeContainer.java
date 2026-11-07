package eff.lifetime;

/** Read actual existing entries; never substitutes a fabricated view of lost entities. */
public interface LifetimeContainer {
  Iterable<?> lifetimeEntries();
}
