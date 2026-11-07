package net.minecraft.world.entity;
public class LivingEntity extends Entity {
    public int deathTime;
    public boolean dead, f_20890_;
    public float getHealth(){return 20;}
    public boolean isAlive(){return !isRemoved();}
    public boolean isDeadOrDying(){return false;}
}
