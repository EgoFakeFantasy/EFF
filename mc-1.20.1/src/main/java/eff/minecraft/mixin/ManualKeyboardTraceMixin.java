package eff.minecraft.mixin;

import eff.minecraft.client.ManualKeyboardObserver;
import net.minecraft.client.KeyboardHandler;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(KeyboardHandler.class)
public abstract class ManualKeyboardTraceMixin {
  @Inject(method = "keyPress", at = @At("RETURN"))
  private void eff$observeKeyReturn(long window, int key, int scan, int action,
      int modifiers, CallbackInfo ci) {
    ManualKeyboardObserver.returned(window, key, scan, action, modifiers);
  }
}
