package eff.minecraft.mixin;

import java.util.List;
import java.util.Set;
import org.objectweb.asm.tree.ClassNode;
import org.spongepowered.asm.mixin.extensibility.IMixinConfigPlugin;
import org.spongepowered.asm.mixin.extensibility.IMixinInfo;

/** Foreign observers require two explicit lab flags. Manual mode observes only our gate and Entity removal. */
public final class LabTraceMixinPlugin implements IMixinConfigPlugin {
  @Override
  public void onLoad(String mixinPackage) {}

  @Override
  public String getRefMapperConfig() {
    return null;
  }

  @Override
  public boolean shouldApplyMixin(String targetClassName, String mixinClassName) {
    if (mixinClassName.equals("eff.minecraft.mixin.LabEntityRemovalTraceMixin"))
      return "pig2".equals(System.getProperty("eff.manualCombat"))
          || "foreverlove".equals(System.getProperty("eff.manualCombat"))
          || Boolean.getBoolean("eff.labAttackTrace")
              && (Boolean.getBoolean("eff.pig2Lab") || Boolean.getBoolean("eff.foreverLoveLab"));
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
