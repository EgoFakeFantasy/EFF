package eff.minecraft.mixin;

import eff.minecraft.PlayerLifetime;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.world.entity.Entity;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Cancel health-slot mutation before storage and update callbacks, never repair afterwards. */
@Mixin(SynchedEntityData.class)
public abstract class PlayerHealthDataMixin {
  @Shadow @Final private Entity entity;

  @Inject(method = "set(Lnet/minecraft/network/syncher/EntityDataAccessor;Ljava/lang/Object;Z)V",
      at = @At("HEAD"), cancellable = true, require = 1)
  private <T> void eff$preservePlayerHealth(EntityDataAccessor<T> accessor, T value,
      boolean force, CallbackInfo ci) {
    if (PlayerLifetime.rejectHealthDataWrite(entity, accessor)) ci.cancel();
  }
}
