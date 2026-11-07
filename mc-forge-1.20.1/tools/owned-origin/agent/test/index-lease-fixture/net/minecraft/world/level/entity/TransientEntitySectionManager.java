package net.minecraft.world.level.entity;
public class TransientEntitySectionManager {public final EntityLookup entityStorage; public final LevelEntityGetter entityGetter; public TransientEntitySectionManager(EntityLookup lookup){entityStorage=lookup;entityGetter=new LevelEntityGetterAdapter(lookup);} }
