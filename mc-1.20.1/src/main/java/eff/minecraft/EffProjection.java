package eff.minecraft;

import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.decoration.ArmorStand;
import net.minecraft.world.level.Level;

/** A registered EFF projection, identifiable as a mod entity by native combat mods. */
public final class EffProjection extends ArmorStand {
  public EffProjection(EntityType<? extends ArmorStand> type, Level level) {
    super(type, level);
  }
}
