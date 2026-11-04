package eff.minecraft.mixin;

import eff.minecraft.lab.AttackTraceBridge;
import java.util.Iterator;
import java.util.Set;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.Entity;
import org.objectweb.asm.Opcodes;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Pseudo;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.LocalCapture;

@Pseudo
@Mixin(targets = "kakiku.pig2mod.MyHelper", remap = false)
public abstract class Pig2RemovalTraceMixin {
  // Audited 2.8.3 bytecode: after player exclusion, local3=iterator, local4=affected entity.
  // Missing locals or changed instruction shape fails the instrumented trial; never skip a check.
  @Inject(
      method =
          "removeTheEnemiesInTheServerLevel(Ljava/util/Set;Lnet/minecraft/server/level/ServerLevel;)V",
      at =
          @At(
              value = "FIELD",
              target = "Lnet/minecraft/world/entity/Entity;canUpdate:Z",
              opcode = Opcodes.PUTFIELD,
              shift = At.Shift.AFTER,
              remap = false),
      locals = LocalCapture.CAPTURE_FAILHARD,
      require = 1,
      remap = false)
  private void eff$observeRemovalEffect(
      Set<Entity> enemies,
      ServerLevel level,
      CallbackInfo ci,
      Iterator<Entity> iterator,
      Entity affected) {
    AttackTraceBridge.pigRemovalEffect(affected);
  }
}
