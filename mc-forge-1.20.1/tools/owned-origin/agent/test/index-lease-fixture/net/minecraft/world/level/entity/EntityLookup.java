package net.minecraft.world.level.entity;
public class EntityLookup {
 public final java.util.Map<Object,Object> byUuid;
 public final it.unimi.dsi.fastutil.ints.Int2ObjectMap<Object> byId;
 public static java.util.Map<Object,Object> f_156808_;
 public EntityAccess getEntity(int id){return (EntityAccess)byId.get(id);}
 public EntityAccess getEntity(java.util.UUID uuid){return (EntityAccess)byUuid.get(uuid);}
 public EntityLookup(java.util.Map<Object,Object> values){byUuid=values;byId=new it.unimi.dsi.fastutil.ints.Int2ObjectOpenHashMap<>();}
}
