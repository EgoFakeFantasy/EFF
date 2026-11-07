package eff.lifetime;

/** Shared only with the bootstrap write gate; not a native memory isolation boundary. */
public interface LifetimeTarget {
  boolean rejectLifetimeMutation();
  default Object lifetimeKey() { return null; }
  /** Moving players retain vanilla navigation; stationary EFF projections do not. */
  default boolean lifetimeAllowsMovement() { return false; }
  /** The owner may bound movable entities to their active play area. No write-back. */
  default boolean lifetimeAllowsPosition(double x, double y, double z) { return true; }
  default void lifetimeOperationRejected(String operation) {}
  default void lifetimeBooleanWriteRejected(String field, boolean value) {}
}
