package eff.minecraft.client;

import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.vertex.PoseStack;
import eff.minecraft.EffProjection;
import eff.minecraft.PlayerLifetime;
import net.minecraftforge.client.event.RenderLivingEvent;
import net.minecraftforge.eventbus.api.Event;
import net.minecraftforge.eventbus.api.IEventBus;

/** Owned projections keep their real animation and lifecycle state. Third-party render
 * observers still execute, but receive a separate transform stack, not write access to
 * the projection's draw transform. This is not a sandbox for arbitrary native code. */
public final class ProjectionRenderEvents {
  @SuppressWarnings({"rawtypes", "unchecked"})
  public static boolean post(IEventBus bus, Event event) {
    if (!(event instanceof RenderLivingEvent living)
        || !(event instanceof RenderLivingEvent.Pre || event instanceof RenderLivingEvent.Post))
      return bus.post(event);
    Object target = living.getEntity();
    boolean projection = target instanceof EffProjection entity && entity.rejectLifetimeMutation()
        && living.getRenderer() == ProjectionRenderBoundary.renderer();
    boolean player = PlayerLifetime.active(target)
        && living.getRenderer() instanceof net.minecraft.client.renderer.entity.player.PlayerRenderer;
    if (!projection && !player) return bus.post(event);

    PoseStack original = living.getPoseStack();
    PoseStack isolated = new PoseStack();
    isolated.last().pose().set(original.last().pose());
    isolated.last().normal().set(original.last().normal());
    float[] color = RenderSystem.getShaderColor().clone();
    boolean pre = event instanceof RenderLivingEvent.Pre;
    Event notification = pre
        ? new RenderLivingEvent.Pre(living.getEntity(), living.getRenderer(), living.getPartialTick(), isolated,
            living.getMultiBufferSource(), living.getPackedLight())
        : new RenderLivingEvent.Post(living.getEntity(), living.getRenderer(), living.getPartialTick(), isolated,
            living.getMultiBufferSource(), living.getPackedLight());
    boolean cancelled = false;
    try {
      cancelled = bus.post(notification);
      // Cancellation from an observer is not proof of death. Recheck the actual
      // original object's current registration and raw lifecycle after callbacks.
      return pre && !(projection ? ProjectionRenderBoundary.current((EffProjection) target) : PlayerLifetime.current(target));
    } finally {
      boolean poseChanged;
      try { poseChanged = !isolated.last().pose().equals(original.last().pose())
          || !isolated.last().normal().equals(original.last().normal()) || !isolated.clear(); }
      catch (RuntimeException damagedObserverStack) { poseChanged = true; }
      boolean shaderChanged = !java.util.Arrays.equals(color, RenderSystem.getShaderColor());
      RenderSystem.setShaderColor(color[0], color[1], color[2], color[3]);
      if (projection) ProjectionRenderBoundary.observedRenderEvent((EffProjection) target, poseChanged, shaderChanged, cancelled);
      else if (poseChanged || shaderChanged || cancelled) PlayerLifetime.operationRejected(target, "player:render-observer-transform");
    }
  }
  private ProjectionRenderEvents() {}
}
