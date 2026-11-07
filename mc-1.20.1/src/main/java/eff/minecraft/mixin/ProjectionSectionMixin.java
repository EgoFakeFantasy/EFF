package eff.minecraft.mixin;

import eff.minecraft.EffProjection;
import net.minecraft.world.level.entity.EntityAccess;
import net.minecraft.world.level.entity.EntitySection;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.*;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(EntitySection.class)
public abstract class ProjectionSectionMixin {
  @Inject(method = "remove", at = @At("HEAD"), cancellable = true, require = 1)
  private void eff$preserveSection(EntityAccess entity, CallbackInfoReturnable<Boolean> ci) {
    if (entity instanceof EffProjection projection && projection.rejectLifetimeMutation()) ci.setReturnValue(false);
  }
}
