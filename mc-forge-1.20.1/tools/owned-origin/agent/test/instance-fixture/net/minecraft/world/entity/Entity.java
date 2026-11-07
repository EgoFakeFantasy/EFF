package net.minecraft.world.entity;
public class Entity implements eff.lifetime.LifetimeTarget {
    public boolean owned,released;
    public enum RemovalReason {KILLED,DISCARDED}
    public RemovalReason removalReason;
    public net.minecraft.world.phys.Vec3 position=new net.minecraft.world.phys.Vec3();
    public net.minecraft.world.phys.Vec3 deltaMovement=new net.minecraft.world.phys.Vec3();
    public net.minecraft.world.phys.Vec3 stuckSpeedMultiplier=new net.minecraft.world.phys.Vec3();
    public net.minecraft.world.phys.AABB bb=new net.minecraft.world.phys.AABB();
    public java.util.UUID uuid=java.util.UUID.randomUUID();
    public int id=19;
    public int unrelated;
    public boolean canUpdate=true;
    public boolean rejectLifetimeMutation(){return owned&&!released;}
    public boolean isRemoved(){return removalReason!=null;}
    public net.minecraft.world.phys.AABB getBoundingBox(){return bb;}
}
