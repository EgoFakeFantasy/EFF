package eff.ownedboot;

import java.lang.reflect.*;
import java.util.*;
import java.util.function.Predicate;
import sun.misc.Unsafe;

/** Exact instance storage spans; no state repair and no caller-based classification. */
public final class InstanceWriteGuard {
    private static final Unsafe U=Unsafe.getUnsafe();
    private static volatile Predicate<Object> activity;
    private static volatile java.util.function.BiPredicate<Object,Object> collectionActivity;
    private static final Set<String> REPORTED=new HashSet<>();
    private static final Map<String,String> ENTITY=Map.ofEntries(
      Map.entry("removalReason","net.minecraft.world.entity.Entity$RemovalReason"),Map.entry("f_146795_","net.minecraft.world.entity.Entity$RemovalReason"),
      Map.entry("position","net.minecraft.world.phys.Vec3"),Map.entry("f_19825_","net.minecraft.world.phys.Vec3"),
      Map.entry("blockPosition","net.minecraft.core.BlockPos"),Map.entry("f_19826_","net.minecraft.core.BlockPos"),
      Map.entry("chunkPosition","net.minecraft.world.level.ChunkPos"),Map.entry("f_185933_","net.minecraft.world.level.ChunkPos"),
      Map.entry("bb","net.minecraft.world.phys.AABB"),Map.entry("f_19828_","net.minecraft.world.phys.AABB"),
      Map.entry("deltaMovement","net.minecraft.world.phys.Vec3"),Map.entry("f_19827_","net.minecraft.world.phys.Vec3"),
      Map.entry("stuckSpeedMultiplier","net.minecraft.world.phys.Vec3"),Map.entry("f_19865_","net.minecraft.world.phys.Vec3"),
      Map.entry("uuid","java.util.UUID"),Map.entry("f_19820_","java.util.UUID"),Map.entry("id","int"),Map.entry("f_19848_","int"),Map.entry("canUpdate","boolean"));
    private static final Map<String,String> LIVING=Map.of("deathTime","int","f_20919_","int","dead","boolean","f_20890_","boolean");
    private static boolean selected(Field f){
        if(Modifier.isStatic(f.getModifiers()))return false;
        String owner=f.getDeclaringClass().getName();Map<String,String> fields=owner.equals("net.minecraft.world.entity.Entity")?ENTITY:owner.equals("net.minecraft.world.entity.LivingEntity")?LIVING:Map.of();
        return f.getType().getName().equals(fields.get(f.getName()));
    }
    // These are final ownership-bearing declarations in the reviewed 1.20.1 layout.
    // Do not trust a runtime ACC_FINAL bit: another transformer can remove it.
    // TickList active/passive/iterated are intentionally NOT representation leases.
    private static boolean indexReference(Field f){
        if(Modifier.isStatic(f.getModifiers()))return false;
        String owner=f.getDeclaringClass().getName(),name=f.getName(),type=f.getType().getName();
        if(owner.equals("net.minecraft.world.level.entity.EntityLookup"))
            return Set.of("byId","f_156807_").contains(name)&&type.equals("it.unimi.dsi.fastutil.ints.Int2ObjectMap")
                ||Set.of("byUuid","f_156808_").contains(name)&&type.equals("java.util.Map");
        if(owner.equals("net.minecraft.world.level.entity.PersistentEntitySectionManager"))
            return Set.of("visibleEntityStorage","f_157494_").contains(name)&&type.equals("net.minecraft.world.level.entity.EntityLookup")
                ||Set.of("entityGetter","f_157496_").contains(name)&&type.equals("net.minecraft.world.level.entity.LevelEntityGetter");
        if(owner.equals("net.minecraft.world.level.entity.TransientEntitySectionManager"))
            return Set.of("entityStorage","f_157637_").contains(name)&&type.equals("net.minecraft.world.level.entity.EntityLookup")
                ||Set.of("entityGetter","f_157640_").contains(name)&&type.equals("net.minecraft.world.level.entity.LevelEntityGetter");
        return owner.equals("net.minecraft.world.level.entity.LevelEntityGetterAdapter")
            &&Set.of("visibleEntities","f_156940_").contains(name)&&type.equals("net.minecraft.world.level.entity.EntityLookup");
    }
    private static boolean indexOwner(Class<?> type){
        return Set.of("net.minecraft.world.level.entity.EntityLookup",
            "net.minecraft.world.level.entity.PersistentEntitySectionManager",
            "net.minecraft.world.level.entity.TransientEntitySectionManager",
            "net.minecraft.world.level.entity.LevelEntityGetterAdapter").contains(type.getName());
    }
    private static final Field[] NO_INDEX_FIELDS=new Field[0];
    private static final ClassValue<Field[]> INDEX_REFERENCES=new ClassValue<>(){
        protected Field[] computeValue(Class<?> type){
            ArrayList<Field> fields=new ArrayList<>();
            for(Class<?> c=type;c!=null&&c!=Object.class;c=c.getSuperclass())if(indexOwner(c))
                for(Field f:c.getDeclaredFields())if(indexReference(f))fields.add(f);
            return fields.toArray(Field[]::new);
        }
    };
    private static Field[] indexFields(Class<?> type){
        // Avoid ClassValue work (and recursive JDK cache initialization) on unrelated
        // JVM hot writes. This cache retains only field metadata, never live contents.
        for(Class<?> c=type;c!=null&&c!=Object.class;c=c.getSuperclass())
            if(indexOwner(c))return INDEX_REFERENCES.get(type);
        return NO_INDEX_FIELDS;
    }
    private static Object stored(Object receiver,Field field){return U.getObject(receiver,U.objectFieldOffset(field));}
    private static boolean leasedIndex(Object receiver,Field field){
        return ownsContents(stored(receiver,field),field.getDeclaringClass().getClassLoader(),
            new IdentityHashMap<>(),0,new int[]{65536});
    }
    private static boolean ownsContents(Object value,ClassLoader ownerLoader,IdentityHashMap<Object,Boolean> seen,int depth,int[] budget){
        if(value==null||depth>8||--budget[0]<0||seen.size()>=64||seen.put(value,Boolean.TRUE)!=null)return false;
        if(value instanceof Map<?,?> map){
            // Authenticate each actual target through the existing pinned Predicate.
            // A same-name container from another loader cannot acquire its lease.
            try{
                for(Object entry:map.values()){
                    if(--budget[0]<0)return false;
                    if(entry!=null&&entry.getClass().getClassLoader()==ownerLoader&&activity.test(entry))return true;
                }
            }catch(RuntimeException unavailable){report(value.getClass().getName(),"index-observation-unavailable");}
            // A filtering view can conceal active entries. Read only its current,
            // typed delegate; never arbitrary object fields or cached old containers.
            for(Class<?> c=value.getClass();c!=null&&c!=Object.class;c=c.getSuperclass()){
                try{
                    Field delegate=c.getDeclaredField("delegate");
                    if(!Modifier.isStatic(delegate.getModifiers())&&Map.class.isAssignableFrom(delegate.getType())
                        &&ownsContents(stored(value,delegate),ownerLoader,seen,depth+1,budget))return true;
                }catch(NoSuchFieldException absent){ /* Ordinary maps have no delegate. */ }
            }
            return false;
        }
        for(Field f:indexFields(value.getClass()))if(f.getDeclaringClass().getClassLoader()==ownerLoader
            &&ownsContents(stored(value,f),ownerLoader,seen,depth+1,budget))return true;
        return false;
    }
    private static final ClassValue<long[][]> SPANS=new ClassValue<>(){
        protected long[][] computeValue(Class<?> type){
            ArrayList<long[]> values=new ArrayList<>();
            for(Class<?> c=type;c!=null&&c!=Object.class;c=c.getSuperclass())for(Field f:c.getDeclaredFields())if(selected(f)){
                Class<?> t=f.getType();long size=t==boolean.class||t==byte.class?1:t==char.class||t==short.class?2:t==long.class||t==double.class?8:t.isPrimitive()?4:U.arrayIndexScale(Object[].class);
                long offset=U.objectFieldOffset(f);values.add(new long[]{offset,offset+size});
            }
            return values.toArray(long[][]::new);
        }
    };
    public static synchronized void install(Predicate<Object> bridge){if(activity!=null||bridge==null)throw new IllegalStateException("INSTANCE_GATE_ALREADY_SET");activity=bridge;SPANS.get(Object.class);INDEX_REFERENCES.get(Object.class);}
    public static synchronized void installCollection(java.util.function.BiPredicate<Object,Object> bridge){
        if(collectionActivity!=null||bridge==null)throw new IllegalStateException("COLLECTION_GATE_ALREADY_SET");
        collectionActivity=bridge;
    }
    public static boolean rejectCollectionRemoval(Collection<?> values,Object target){
        if(values==null)throw new NullPointerException();
        var bridge=collectionActivity;
        if(bridge==null)throw new IllegalStateException("COLLECTION_GATE_NOT_INSTALLED");
        return bridge.test(values,target);
    }
    public static boolean rejectListIndexRemoval(List<?> values,int index){
        return rejectCollectionRemoval(values,values.get(index));
    }
    public static boolean denyField(Field field,Object receiver){
        if(receiver==null||activity==null||!field.getDeclaringClass().isInstance(receiver))return false;
        if(indexReference(field)&&leasedIndex(receiver,field)){report(field.getDeclaringClass().getName(),"index-lease:"+field.getName());return true;}
        if(!selected(field)||!activity.test(receiver))return false;
        report(field.getDeclaringClass().getName(),field.getName());return true;
    }
    public static boolean denyUnsafe(Object receiver,long offset,long size){
        if(receiver==null||receiver instanceof Class<?>||activity==null||size<=0)return false;
        if(offset<0||offset>Long.MAX_VALUE-size)return false;
        int referenceSize=U.arrayIndexScale(Object[].class);
        for(Field f:indexFields(receiver.getClass())){
            long start=U.objectFieldOffset(f);
            if(offset<start+referenceSize&&offset+size>start&&leasedIndex(receiver,f)){
                report(f.getDeclaringClass().getName(),"index-lease:"+f.getName());return true;
            }
        }
        boolean entity=false;for(Class<?> c=receiver.getClass();c!=null;c=c.getSuperclass())if(c.getName().equals("net.minecraft.world.entity.Entity")){entity=true;break;}if(!entity)return false;
        for(long[] span:SPANS.get(receiver.getClass()))if(offset<span[1]&&offset+size>span[0]&&activity.test(receiver)){report(receiver.getClass().getName(),"offset="+offset+",size="+size);return true;}
        return false;
    }
    private static void report(String name,String field){String key=name+":"+field;synchronized(REPORTED){if(REPORTED.size()<64&&REPORTED.add(key))System.err.println("[EFF-INSTANCE-WRITE] rejected class="+name+" field="+field);}}
}
