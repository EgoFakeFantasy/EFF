package eff.minecraft.mixin;

import eff.minecraft.EffProjection;
import net.minecraft.world.level.entity.EntityAccess;
import net.minecraft.world.level.entity.EntityLookup;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.*;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Reject removal before the UUID/id indices change; does not reinsert a lost entity. */
@Mixin(EntityLookup.class)
public abstract class ProjectionLookupMixin {
  @Inject(method = "remove", at = @At("HEAD"), cancellable = true, require = 1)
  private void eff$preserveLookup(EntityAccess entity, CallbackInfo ci) {
    if (entity instanceof EffProjection projection && projection.rejectLifetimeMutation()
        || eff.minecraft.PlayerLifetime.rejectOperation(entity, "player:lookup-remove")) ci.cancel();
  }
}
