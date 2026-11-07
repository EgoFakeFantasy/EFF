package eff.minecraft;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.function.BooleanSupplier;

/** Original-object leases only. Never creates, repairs or substitutes a game object. */
public final class PlayerLifetimeRegistry<T> {
  public record Bounds(double minX, double minY, double minZ, double maxX, double maxY, double maxZ) {
    public Bounds {
      if (!Double.isFinite(minX) || !Double.isFinite(minY) || !Double.isFinite(minZ)
          || !Double.isFinite(maxX) || !Double.isFinite(maxY) || !Double.isFinite(maxZ)
          || minX > maxX || minY > maxY || minZ > maxZ) throw new IllegalArgumentException("INVALID_PLAYER_BOUNDS");
    }
    public boolean contains(double x, double y, double z) {
      return Double.isFinite(x) && Double.isFinite(y) && Double.isFinite(z)
          && x >= minX && x <= maxX && y >= minY && y <= maxY && z >= minZ && z <= maxZ;
    }
  }
  private final Map<UUID, Claim<T>> claims = new HashMap<>();
  private static final class Claim<T> {
    final T original;
    final Object owner, world;
    T client;
    long denied;
    final long[] tickBoundaries = new long[5];
    final long[] tickDecisions = new long[12];
    Bounds bounds;
    Claim(T original, Object owner, Object world) {
      this.original = original; this.owner = owner; this.world = world;
    }
  }

  public synchronized void claim(T original, UUID id, Object world, Object owner) {
    claim(original, id, world, owner, null);
  }

  public synchronized void claim(T original, UUID id, Object world, Object owner, Bounds bounds) {
    if (original == null || id == null || world == null || owner == null || claims.containsKey(id))
      throw new IllegalStateException("PLAYER_LIFETIME_CLAIM_INVALID");
    var claim = new Claim<>(original, owner, world); claim.bounds = bounds;
    claims.put(id, claim);
  }

  public synchronized void updateBounds(T original, UUID id, Object owner, Bounds bounds) {
    Claim<T> claim = claims.get(id);
    if (claim == null || owner == null || claim.owner != owner || claim.original != original || bounds == null)
      throw new IllegalStateException("PLAYER_SPATIAL_OWNER_REQUIRED");
    claim.bounds = bounds;
  }

  public synchronized boolean positionAllowed(T object, UUID id, double x, double y, double z) {
    Claim<T> claim = claims.get(id);
    return claim != null && (claim.original == object || claim.client == object)
        && Double.isFinite(x) && Double.isFinite(y) && Double.isFinite(z)
        && (claim.bounds == null || claim.bounds.contains(x, y, z));
  }

  public synchronized void release(T original, UUID id, Object owner) {
    Claim<T> claim = claims.get(id);
    if (claim == null || owner == null || claim.owner != owner || claim.original != original)
      throw new IllegalStateException("PLAYER_LIFETIME_OWNER_REQUIRED");
    claims.remove(id);
  }

  public synchronized boolean active(T object, UUID id, Object world, boolean client,
      BooleanSupplier currentlyIndexed) {
    Claim<T> claim = claims.get(id);
    if (object == null || claim == null || !claim.world.equals(world)) return false;
    if (!client) return claim.original == object;
    if (object == claim.original) return false;
    // Admit the actual indexed client counterpart once. Losing registration or a new
    // object with the same UUID must never cause silent re-admission/replacement.
    if (claim.client == null && currentlyIndexed.getAsBoolean()) claim.client = object;
    return claim.client == object;
  }

  public synchronized void rejected(T object, UUID id) {
    Claim<T> claim = claims.get(id);
    if (claim != null && (claim.original == object || claim.client == object)
        && claim.denied < Long.MAX_VALUE) claim.denied++;
  }

  public synchronized long denied(T object, UUID id) {
    Claim<T> claim = claims.get(id);
    return claim != null && (claim.original == object || claim.client == object) ? claim.denied : 0;
  }

  /** Diagnostic counts only: no game field writes or new object admission. */
  public synchronized void observeTickBoundary(T object, int boundary) {
    if (object == null || boundary < 0 || boundary >= 5) return;
    for (Claim<T> claim : claims.values()) if (claim.original == object) {
      if (claim.tickBoundaries[boundary] < Long.MAX_VALUE) claim.tickBoundaries[boundary]++;
      return;
    }
  }

  public synchronized long[] tickBoundaries(T object) {
    for (Claim<T> claim : claims.values()) if (claim.original == object) return claim.tickBoundaries.clone();
    return new long[5];
  }

  public synchronized void observeTickDecision(T object, int decision, boolean result) {
    if (object == null || decision < 0 || decision >= 6) return;
    for (Claim<T> claim : claims.values()) if (claim.original == object) {
      int slot=decision*2+(result?1:0);
      if (claim.tickDecisions[slot] < Long.MAX_VALUE) claim.tickDecisions[slot]++;
      return;
    }
  }

  public synchronized long[] tickDecisions(T object) {
    for (Claim<T> claim : claims.values()) if (claim.original == object) return claim.tickDecisions.clone();
    return new long[12];
  }
}
