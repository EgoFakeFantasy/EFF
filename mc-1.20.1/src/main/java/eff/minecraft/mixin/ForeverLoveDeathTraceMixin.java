package eff.minecraft.mixin;

import eff.minecraft.lab.AttackTraceBridge;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Pseudo;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Pseudo
@Mixin(targets = "com.wzz.forever_love_sword.util.ForeverUtils", remap = false)
public abstract class ForeverLoveDeathTraceMixin {
  // Past the null/type/self/player-weapon/authorization early returns in the audited 2.2 sample.
  @Inject(
      method =
          "killEntity(Lnet/minecraft/world/entity/Entity;Lnet/minecraft/world/entity/LivingEntity;ZI)V",
      at =
          @At(
              value = "INVOKE",
              target =
                  "Lcom/wzz/forever_love_sword/list/DeathList;addDeath(Lnet/minecraft/world/entity/Entity;)V",
              shift = At.Shift.AFTER,
              remap = false),
      require = 1,
      remap = false)
  private void eff$observeDeathRegistration(
      Entity target, LivingEntity attacker, boolean lightning, int mode, CallbackInfo ci) {
    AttackTraceBridge.swordDeathListEffect(target, attacker);
  }
}
