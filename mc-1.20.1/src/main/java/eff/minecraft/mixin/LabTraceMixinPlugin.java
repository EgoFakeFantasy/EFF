package eff.minecraft.mixin;

import java.util.List;
import java.util.Set;
import org.objectweb.asm.tree.ClassNode;
import org.spongepowered.asm.mixin.extensibility.IMixinConfigPlugin;
import org.spongepowered.asm.mixin.extensibility.IMixinInfo;

/** Existing EFF mixins remain enabled. Foreign observers require two explicit lab flags. */
public final class LabTraceMixinPlugin implements IMixinConfigPlugin {
  @Override
  public void onLoad(String mixinPackage) {}

  @Override
  public String getRefMapperConfig() {
    return null;
  }

  @Override
  public boolean shouldApplyMixin(String targetClassName, String mixinClassName) {
    if (mixinClassName.equals("eff.minecraft.mixin.Pig2AttackTraceMixin")
        || mixinClassName.equals("eff.minecraft.mixin.Pig2RemovalTraceMixin"))
      return Boolean.getBoolean("eff.labAttackTrace") && Boolean.getBoolean("eff.pig2Lab");
    if (mixinClassName.equals("eff.minecraft.mixin.ForeverLoveAttackTraceMixin")
        || mixinClassName.equals("eff.minecraft.mixin.ForeverLoveDeathTraceMixin"))
      return Boolean.getBoolean("eff.labAttackTrace") && Boolean.getBoolean("eff.foreverLoveLab");
    return true;
  }

  @Override
  public void acceptTargets(Set<String> myTargets, Set<String> otherTargets) {}

  @Override
  public List<String> getMixins() {
    return null;
  }

  @Override
  public void preApply(String target, ClassNode node, String mixin, IMixinInfo info) {}

  @Override
  public void postApply(String target, ClassNode node, String mixin, IMixinInfo info) {}
}
