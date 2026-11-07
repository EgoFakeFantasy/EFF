package eff.hiddenfixture;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.phys.Vec3;
public class PlainOps {
  public static int write(Entity target,Vec3 value) { target.position=value;target.removalReason=Entity.RemovalReason.DISCARDED;var living=(net.minecraft.world.entity.LivingEntity)target;living.dead=true;living.f_20890_=true;living.deathTime=31;living.f_20919_=31;target.unrelated++;return 73; }
}
