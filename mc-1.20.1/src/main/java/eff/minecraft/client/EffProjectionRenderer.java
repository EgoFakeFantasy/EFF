package eff.minecraft.client;

import eff.minecraft.EffProjection;
import net.minecraft.client.renderer.entity.ArmorStandRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;

/** The original registered renderer, with a lifetime lease shared across resource reloads. */
public final class EffProjectionRenderer extends ArmorStandRenderer {
  private static final Object OWNER = new Object();
  public EffProjectionRenderer(EntityRendererProvider.Context context) {
    super(context);
    ProjectionRenderBoundary.registered(this);
  }
  public boolean lifetimeRendererOwned() { return EffProjection.hasClaimedLifetimes(); }
  public Object lifetimeRendererOwner() { return OWNER; }
}
