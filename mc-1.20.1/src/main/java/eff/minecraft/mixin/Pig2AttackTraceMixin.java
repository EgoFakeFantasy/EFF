package eff.minecraft.mixin;

import eff.minecraft.lab.AttackTraceBridge;
import net.minecraft.world.entity.Entity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Pseudo;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Pseudo
@Mixin(targets = "kakiku.pig2mod.entity.Pig2", remap = false)
public abstract class Pig2AttackTraceMixin {
  @Shadow(remap = false)
  private Entity mEnemy1st;

  @Shadow(remap = false)
  private int mTickCounterLevel3;

  @Inject(method = "tickLevel3()V", at = @At("HEAD"), require = 1, remap = false)
  private void eff$observeInitialLevel3(CallbackInfo ci) {
    AttackTraceBridge.pigLevel3Entry(this, mEnemy1st, mTickCounterLevel3);
  }

  @Inject(
      method = "tickLevel3()V",
      at =
          @At(
              value = "INVOKE",
              target =
                  "Lkakiku/pig2mod/MyHelper;removeTheEnemiesInTheServerLevel(Ljava/util/Set;Lnet/minecraft/server/level/ServerLevel;)V",
              remap = false),
      require = 1,
      remap = false)
  private void eff$observeRemovalDispatch(CallbackInfo ci) {
    AttackTraceBridge.pigLevel3Dispatch(this, mEnemy1st, mTickCounterLevel3);
  }

  @Inject(method = "tickLevel3()V", at = @At("RETURN"), require = 1, remap = false)
  private void eff$observeLevel3Return(CallbackInfo ci) {
    AttackTraceBridge.pigLevel3Exit(this);
  }
}
