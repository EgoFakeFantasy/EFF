package eff.minecraft.mixin;

import net.minecraft.world.entity.LivingEntity;
import net.minecraft.network.syncher.EntityDataAccessor;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

@Mixin(LivingEntity.class)
public interface HealthIdProbeAccessor {
  @Accessor("DATA_HEALTH_ID") static EntityDataAccessor<Float> eff$probeHealthId() {
    throw new IllegalStateException("HEALTH_PROBE_ACCESSOR_NOT_APPLIED");
  }
}
