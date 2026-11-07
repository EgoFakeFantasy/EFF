package net.minecraft.world.entity;
import net.minecraft.world.phys.Vec3;
public class Entity {
  public enum RemovalReason { DISCARDED }
  public Vec3 position=new Vec3(1,2,3);
  public net.minecraft.core.BlockPos blockPosition=new net.minecraft.core.BlockPos(1,2,3);
  public net.minecraft.world.level.ChunkPos chunkPosition=new net.minecraft.world.level.ChunkPos(0,0);
  public net.minecraft.core.BlockPos f_19826_=blockPosition;
  public net.minecraft.world.level.ChunkPos f_185933_=chunkPosition;
  public RemovalReason removalReason;
  public boolean owned;
  public int unrelated;
}
