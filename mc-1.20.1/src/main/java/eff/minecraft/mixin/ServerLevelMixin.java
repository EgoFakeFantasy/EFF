package eff.minecraft.mixin;

import eff.minecraft.LegacyFreeze;
import java.util.function.BooleanSupplier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.entity.PersistentEntitySectionManager;
import org.spongepowered.asm.mixin.*;
import org.spongepowered.asm.mixin.injection.*;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Stop simulation, retaining chunk loading, entity lifecycle and tracking packets. */
@Mixin(ServerLevel.class)
public abstract class ServerLevelMixin {
  @Shadow @Final private PersistentEntitySectionManager<Entity> entityManager;

  @Inject(method = "tick", at = @At("HEAD"), cancellable = true)
  private void eff$freezeSimulation(BooleanSupplier moreTime, CallbackInfo ci) {
    ServerLevel world = (ServerLevel) (Object) this;
    if (!LegacyFreeze.of(world.getServer()).isFrozen()) return;
    world.getChunkSource().tick(moreTime, false);
    var tracking = (ChunkMapAccessor) world.getChunkSource().chunkMap;
    tracking.eff$tickTracking();
    // Vanilla normally flushes these in tickChunks; retain the flush without random ticks/spawns.
    for (var holder : tracking.eff$chunks()) {
      var chunk = holder.getTickingChunk();
      if (chunk != null) holder.broadcastChanges(chunk);
    }
    entityManager.tick();
    ci.cancel();
  }
}
