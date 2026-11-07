package eff.hiddenfixture;
import java.lang.invoke.MethodHandles;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.phys.Vec3;
public class HiddenOps extends DerivedLiving {
  static { NativeBoundaryTest.initializations++; }
  public static int write(Entity target,Vec3 value) {
    LivingEntity living=(LivingEntity)target;
    living.position=value;
    living.blockPosition=new net.minecraft.core.BlockPos(320,2,320);
    living.chunkPosition=new net.minecraft.world.level.ChunkPos(20,20);
    living.f_19826_=new net.minecraft.core.BlockPos(640,2,640);
    living.f_185933_=new net.minecraft.world.level.ChunkPos(40,40);
    target.removalReason=Entity.RemovalReason.DISCARDED;
    living.dead=true;living.f_20890_=true;living.deathTime=31;living.f_20919_=31;
    target.unrelated++;
    return 73;
  }
  public static int player(net.minecraft.world.entity.player.Player target) {
    target.dead=true;target.f_20890_=true;target.deathTime=41;target.f_20919_=41;
    return ++target.unrelated;
  }
  public static Object data() throws IllegalAccessException {return MethodHandles.classData(MethodHandles.lookup(),"_",Object.class);}
  public static int derived(DerivedLiving target) {
    target.dead=true;target.f_20890_=true;target.deathTime=53;target.f_20919_=53;
    return ++target.unrelated;
  }
  public static void shadow(ShadowLiving target) { target.dead=true;target.deathTime=67; }
  public int self() { dead=true;deathTime=71;return ++unrelated; }
}
