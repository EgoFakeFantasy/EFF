package eff.minecraft.mixin;

import com.mojang.blaze3d.vertex.PoseStack;
import eff.minecraft.client.ProjectionRenderBoundary;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.renderer.LevelRenderer;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.culling.Frustum;
import net.minecraft.client.renderer.entity.EntityRenderDispatcher;
import net.minecraft.world.entity.Entity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Redirect;

@Mixin(LevelRenderer.class)
public abstract class ProjectionRenderMixin {
  @Redirect(method = "renderLevel", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/multiplayer/ClientLevel;entitiesForRendering()Ljava/lang/Iterable;"))
  private Iterable<Entity> eff$currentRenderCandidates(ClientLevel level) {
    return ProjectionRenderBoundary.entities(level);
  }

  @Redirect(method = "renderLevel", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/renderer/entity/EntityRenderDispatcher;shouldRender(Lnet/minecraft/world/entity/Entity;Lnet/minecraft/client/renderer/culling/Frustum;DDD)Z"))
  private boolean eff$projectionFrustum(EntityRenderDispatcher dispatcher, Entity entity, Frustum frustum, double x, double y, double z) {
    return ProjectionRenderBoundary.shouldRender(dispatcher, entity, frustum, x, y, z);
  }

  @Redirect(method = "renderEntity", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/renderer/entity/EntityRenderDispatcher;render(Lnet/minecraft/world/entity/Entity;DDDFFLcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/MultiBufferSource;I)V"))
  private void eff$projectionDispatch(EntityRenderDispatcher dispatcher, Entity entity, double x, double y, double z,
      float yaw, float partialTick, PoseStack pose, MultiBufferSource buffers, int light) {
    ProjectionRenderBoundary.render(dispatcher, entity, x, y, z, yaw, partialTick, pose, buffers, light);
  }
}
