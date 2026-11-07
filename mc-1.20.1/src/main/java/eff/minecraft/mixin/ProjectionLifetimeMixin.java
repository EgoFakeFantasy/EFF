package eff.minecraft.mixin;

import eff.minecraft.EffProjection;
import net.minecraft.world.entity.Entity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Cover the final setRemoved API as well as virtual removal. No opponent identifiers. */
@Mixin(Entity.class)
public abstract class ProjectionLifetimeMixin {
  @Inject(method = "setRemoved", at = @At("HEAD"), cancellable = true, require = 1)
  private void eff$guardLifetime(Entity.RemovalReason reason, CallbackInfo ci) {
    if ((Object) this instanceof EffProjection projection && projection.rejectLifetimeMutation()
        || eff.minecraft.PlayerLifetime.rejectOperation(this, "player:setRemoved"))
      ci.cancel();
  }
}
