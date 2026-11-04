package eff.minecraft;

import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.MobCategory;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.decoration.ArmorStand;
import net.minecraft.world.phys.Vec3;

/** Loader bindings register this same type and its attributes before a world can instantiate it. */
public final class EffEntities {
  public static final EntityType<ArmorStand> PROJECTION =
      EntityType.Builder.<ArmorStand>of(EffProjection::new, MobCategory.MISC)
          .sized(0.5F, 1.975F)
          .clientTrackingRange(10)
          .build("eff:projection");

  public static AttributeSupplier.Builder attributes() {
    return LivingEntity.createLivingAttributes();
  }

  public static ArmorStand createProjection(ServerLevel level, Vec3 position) {
    ArmorStand entity = PROJECTION.create(level);
    if (entity == null) throw new IllegalStateException("PROJECTION_FACTORY_FAILED");
    entity.moveTo(position.x, position.y, position.z, 0, 0);
    return entity;
  }

  private EffEntities() {}
}
