package eff.minecraft.mixin;

import net.minecraft.world.entity.Entity;
import net.minecraft.network.syncher.SynchedEntityData;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

@Mixin(Entity.class)
public interface EntityDataProbeAccessor {
  @Accessor("entityData") SynchedEntityData eff$probeData();
}
