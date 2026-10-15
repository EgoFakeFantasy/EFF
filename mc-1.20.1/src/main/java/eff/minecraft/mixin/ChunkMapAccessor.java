package eff.minecraft.mixin;

import net.minecraft.server.level.ChunkMap;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Invoker;

@Mixin(ChunkMap.class)
public interface ChunkMapAccessor {
  @Invoker("getChunks")
  Iterable<net.minecraft.server.level.ChunkHolder> eff$chunks();

  @Invoker("tick")
  void eff$tickTracking();
}
