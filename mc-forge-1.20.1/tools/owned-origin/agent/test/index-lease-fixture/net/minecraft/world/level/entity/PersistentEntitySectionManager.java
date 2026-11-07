package net.minecraft.world.level.entity;
public class PersistentEntitySectionManager {public final EntityLookup visibleEntityStorage; public final LevelEntityGetter entityGetter; public Object f_157496_; public PersistentEntitySectionManager(EntityLookup lookup){visibleEntityStorage=lookup;entityGetter=new LevelEntityGetterAdapter(lookup);} }
