package eff.minecraft.mixin;

import eff.minecraft.client.NativeTheatre;
import net.minecraft.client.renderer.GameRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.*;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(GameRenderer.class)
public abstract class GameRendererMixin {
  @Inject(method = "render", at = @At("TAIL"))
  private void eff$captureMinecraftFrame(CallbackInfo ci) {
    NativeTheatre.captureFrame(((GameRenderer) (Object) this).mainRenderTarget());
  }
}
