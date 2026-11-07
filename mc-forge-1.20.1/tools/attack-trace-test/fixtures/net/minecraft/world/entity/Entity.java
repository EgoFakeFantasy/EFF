package net.minecraft.world.entity;
public class Entity {
 public net.minecraft.world.phys.Vec3 position=new net.minecraft.world.phys.Vec3(1,2,3);
 public RemovalReason removalReason;
 public enum RemovalReason { KILLED }
}
