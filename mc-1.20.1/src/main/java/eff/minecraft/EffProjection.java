package eff.minecraft;

import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.decoration.ArmorStand;
import net.minecraft.world.level.Level;
import net.minecraft.world.damagesource.DamageSource;

/** A registered EFF projection, identifiable as a mod entity by native combat mods. */
public final class EffProjection extends ArmorStand {
  // Integrated server and client have different entity objects. Share only the server's
  // lifetime claim, never an entity replacement or a repaired health/registration value.
  private static final java.util.concurrent.ConcurrentHashMap<java.util.UUID,
      java.lang.ref.WeakReference<EffProjection>> claimed = new java.util.concurrent.ConcurrentHashMap<>();
  // A cooperative API boundary, not protection against reflection/Unsafe/JNI in this JVM.
  // Only the owning research adapter keeps the opaque release capability.
  private volatile Object lifetimeOwner;
  private volatile boolean lifetimeReleased;
  private java.util.UUID claimedUUID;
  private boolean clientLifetimeAdmitted;
  private int deniedMutations;

  public EffProjection(EntityType<? extends ArmorStand> type, Level level) {
    super(type, level);
  }

  public final void claimLifetime(Object owner) {
    if (owner == null || lifetimeOwner != null || isRemoved() || !isAlive())
      throw new IllegalStateException("LIFETIME_CLAIM_INVALID");
    lifetimeOwner = owner;
    if (!level().isClientSide) {
      claimedUUID = getUUID();
      var reference = new java.lang.ref.WeakReference<>(this);
      var existing = claimed.putIfAbsent(claimedUUID, reference);
      if (existing != null && existing.get() != this) {
        lifetimeOwner = null;
        throw new IllegalStateException("DUPLICATE_PROJECTION_LIFETIME");
      }
    }
  }

  public final void releaseLifetime(Object owner) {
    if (owner == null || owner != lifetimeOwner)
      throw new IllegalStateException("LIFETIME_OWNER_REQUIRED");
    lifetimeReleased = true;
    if (claimedUUID != null) claimed.computeIfPresent(claimedUUID,
        (id, reference) -> reference.get() == this ? null : reference);
  }

  public static boolean hasClaimedLifetimes() {
    for (var reference : claimed.values()) {
      var entity = reference.get();
      if (entity != null && entity.lifetimeOwner != null && !entity.lifetimeReleased) return true;
    }
    return false;
  }

  public final boolean rejectLifetimeMutation() {
    boolean owned = lifetimeOwner != null && !lifetimeReleased;
    if (!owned && level() != null && level().isClientSide) {
      // Spawn packets must set identity/position and insert the original client object first.
      // Once admitted, losing the lookup must never reopen this initialization allowance.
      if (!clientLifetimeAdmitted) {
        // isRemoved/getHealth are themselves guarded reads: calling them from this
        // predicate would recurse through FieldWriteGate. This check only admits an
        // already indexed identity; health/removal remain separately observed raw data.
        if (level().getEntity(getId()) != this) return false;
        clientLifetimeAdmitted = true;
      }
      var reference = claimed.get(getUUID());
      var serverOriginal = reference == null ? null : reference.get();
      owned = serverOriginal != null && serverOriginal != this
          && serverOriginal.lifetimeOwner != null && !serverOriginal.lifetimeReleased
          && serverOriginal.getType() == getType()
          && serverOriginal.level().dimension().equals(level().dimension());
    }
    if (!owned) return false;
    if (deniedMutations < 1000000) deniedMutations++;
    return true;
  }

  public final int deniedLifetimeMutations() { return deniedMutations; }
  public final Object lifetimeKey() { return getUUID(); }
  public final void lifetimeOperationRejected(String operation) {
    eff.minecraft.lab.AttackTraceBridge.lifetimeOperationRejected(this, operation);
  }

  public final void lifetimeBooleanWriteRejected(String field, boolean value) {
    eff.minecraft.lab.AttackTraceBridge.protectedWriteRejected(this, field, value);
  }

  @Override public void kill() {
    if (!rejectLifetimeMutation()) super.kill();
  }

  @Override public void remove(RemovalReason reason) {
    if (!rejectLifetimeMutation()) super.remove(reason);
  }

  @Override public boolean hurt(DamageSource source, float amount) {
    return !rejectLifetimeMutation() && super.hurt(source, amount);
  }

  @Override public void die(DamageSource source) {
    if (!rejectLifetimeMutation()) super.die(source);
  }

  @Override public void setHealth(float health) {
    if (!rejectLifetimeMutation()) super.setHealth(health);
  }

  @Override public void setInvisible(boolean invisible) {
    if (!invisible || !rejectLifetimeMutation()) super.setInvisible(invisible);
  }

  @Override protected void setSharedFlag(int flag, boolean value) {
    // Flag 5 is vanilla invisibility. Other flags and unowned entities retain vanilla behavior.
    if (flag != 5 || !value || !rejectLifetimeMutation()) super.setSharedFlag(flag, value);
  }

  @Override public boolean isInvisible() {
    // Preserve the actual synchronized flag, not an unconditional visible result.
    // A write that bypasses the API still produces true and fails visual acceptance.
    if (rejectLifetimeMutation()) return (entityData.get(DATA_SHARED_FLAGS_ID) & 0x20) != 0;
    return super.isInvisible();
  }
}
