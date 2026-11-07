package eff.minecraft.mixin;

import eff.minecraft.EffProjection;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.entity.EntityTickList;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.*;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(EntityTickList.class)
public abstract class ProjectionTickListMixin {
  @Inject(method = "remove", at = @At("HEAD"), cancellable = true, require = 1)
  private void eff$preserveTicking(Entity entity, CallbackInfo ci) {
    if (entity instanceof EffProjection projection && projection.rejectLifetimeMutation()
        || eff.minecraft.PlayerLifetime.rejectOperation(entity, "player:tick-list-remove")) ci.cancel();
  }
}
