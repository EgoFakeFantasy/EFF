package net.minecraft.world.level.entity;
public class LevelEntityGetterAdapter implements LevelEntityGetter { public final EntityLookup visibleEntities; public LevelEntityGetterAdapter(EntityLookup lookup){visibleEntities=lookup;} }
