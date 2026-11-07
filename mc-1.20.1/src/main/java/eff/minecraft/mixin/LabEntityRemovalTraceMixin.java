package eff.minecraft.mixin;

import eff.minecraft.lab.AttackTraceBridge;
import net.minecraft.world.entity.Entity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Lab-only observation; never cancels, redirects, or changes removal. */
@Mixin(Entity.class)
public abstract class LabEntityRemovalTraceMixin {
  @Inject(method = "setRemoved", at = @At("HEAD"), require = 1)
  private void eff$observeRemovalCaller(Entity.RemovalReason reason, CallbackInfo ci) {
    AttackTraceBridge.entityRemovalCall(this, reason.name());
  }
}
