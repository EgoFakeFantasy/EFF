package eff.ownedboot;

import java.lang.reflect.*;
import java.util.*;
import sun.misc.Unsafe;

/** Prewrite check of exact authenticated class storage; direct Java static writes are untouched. */
public final class StaticWriteGuard {
    private static final Unsafe U=Unsafe.getUnsafe();
    private static final Set<String> REPORTED=new HashSet<>();
    private static final ClassValue<long[][]> SPANS=new ClassValue<>(){
        protected long[][] computeValue(Class<?> owner){
            ArrayList<long[]> result=new ArrayList<>();
            for(Field field:owner.getDeclaredFields())if(Modifier.isStatic(field.getModifiers())){
                if(U.staticFieldBase(field)!=owner)throw new IllegalStateException("UNSUPPORTED_STATIC_STORAGE");
                Class<?> type=field.getType();int size=type==boolean.class||type==byte.class?1:type==char.class||type==short.class?2:type==long.class||type==double.class?8:type.isPrimitive()?4:U.arrayIndexScale(Object[].class);
                long offset=U.staticFieldOffset(field);result.add(new long[]{offset,offset+size});
            }
            return result.toArray(long[][]::new);
        }
    };
    public static void preload(){SPANS.get(Warm.class);System.err.println("[EFF-OWNED-STATIC] helper-ready");}
    private static final class Warm {private static Object field;}
    public static boolean denyField(Field field,Object receiver){
        Class<?> owner=field.getDeclaringClass();
        if(Modifier.isStatic(field.getModifiers())&&OwnedBoundary.owns(owner)){
            report(owner,"reflection",field.getName());
            return true;
        }
        return InstanceWriteGuard.denyField(field,receiver);
    }
    public static boolean denyUnsafe(Object base,long offset,long size){
        if(ObjectHeaderGuard.deny(base,offset,size))return true;
        if(!(base instanceof Class<?> owner)||size<=0||!OwnedBoundary.owns(owner))return InstanceWriteGuard.denyUnsafe(base,offset,size);
        // Overflowing/negative offsets remain invalid for any claimed owned storage operation.
        if(offset<0||offset>Long.MAX_VALUE-size){report(owner,"unsafe","invalid-range");return true;}
        long end=offset+size;
        for(long[] span:SPANS.get(owner))if(offset<span[1]&&end>span[0]){
            report(owner,"unsafe","offset="+offset+",size="+size);
            return true;
        }
        return false;
    }
    public static int referenceWidth(){return U.arrayIndexScale(Object[].class);}
    public static Object deniedObjectValue(Object base,long offset){
        // A klass word is metadata, not an oop. Never interpret it as a Java reference.
        return ObjectHeaderGuard.overlaps(offset,referenceWidth())?null:U.getObject(base,offset);
    }
    private static void report(Class<?> owner,String route,String field){
        String key=owner.getName()+":"+route+":"+field;
        synchronized(REPORTED){if(REPORTED.size()<128&&REPORTED.add(key))System.err.println("[EFF-OWNED-STATIC] rejected class="+owner.getName()+" route="+route+" field="+field);}
    }
}
