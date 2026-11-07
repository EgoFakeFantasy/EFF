package net.minecraft.world.entity.player;
public class Player {
  public void attack(proof.ItemHook item,net.minecraft.world.entity.Entity target,java.lang.invoke.MethodHandle kill) throws Throwable {
    net.minecraftforge.common.ForgeHooks.onPlayerAttackTarget(item,target,kill);
  }
}
