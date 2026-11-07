package eff.lifetime;

/** An opted-in renderer lease. The opaque owner permits its own resource reloads. */
public interface LifetimeRenderer {
  boolean lifetimeRendererOwned();
  Object lifetimeRendererOwner();
}
