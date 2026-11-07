package eff.minecraft.mixin;

import net.minecraft.network.syncher.SynchedEntityData;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

@Mixin(SynchedEntityData.DataItem.class)
public interface DataItemProbeAccessor {
  @Accessor("value") Object eff$probeValue();
}
