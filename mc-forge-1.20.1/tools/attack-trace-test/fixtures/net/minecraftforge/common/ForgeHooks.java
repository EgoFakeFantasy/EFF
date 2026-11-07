package net.minecraftforge.common;
public final class ForgeHooks {
  public static void onPlayerAttackTarget(proof.ItemHook item,net.minecraft.world.entity.Entity target,java.lang.invoke.MethodHandle kill) throws Throwable {
    item.onLeftClickEntity(target,kill);
  }
}
