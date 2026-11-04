package eff.minecraft.mixin;

import eff.minecraft.lab.AttackTraceBridge;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Pseudo;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Pseudo
@Mixin(targets = "com.wzz.forever_love_sword.items.ItemForeverLoveSword", remap = false)
public abstract class ForeverLoveAttackTraceMixin {
  @Inject(
      method =
          "onLeftClickEntity(Lnet/minecraft/world/item/ItemStack;Lnet/minecraft/world/entity/player/Player;Lnet/minecraft/world/entity/Entity;)Z",
      at = @At("HEAD"),
      require = 1,
      remap = false)
  private void eff$observeSwordEntry(
      ItemStack stack, Player player, Entity target, CallbackInfoReturnable<Boolean> ci) {
    AttackTraceBridge.swordEntry(this, stack, player, target);
  }

  @Inject(
      method =
          "onLeftClickEntity(Lnet/minecraft/world/item/ItemStack;Lnet/minecraft/world/entity/player/Player;Lnet/minecraft/world/entity/Entity;)Z",
      at = @At("RETURN"),
      require = 1,
      remap = false)
  private void eff$observeSwordReturn(
      ItemStack stack, Player player, Entity target, CallbackInfoReturnable<Boolean> ci) {
    AttackTraceBridge.swordExit(this);
  }
}
