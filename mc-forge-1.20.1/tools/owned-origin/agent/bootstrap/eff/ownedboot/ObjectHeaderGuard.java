package eff.ownedboot;
import java.lang.ref.WeakReference;
import java.util.*;
import java.util.function.BiFunction;
import sun.misc.Unsafe;

/** Fixed compressed-class-pointer header check. Stored klass words are diagnostic only. */
public final class ObjectHeaderGuard {
    private static final Unsafe U=Unsafe.getUnsafe();
    private static volatile BiFunction<Object,Boolean,Boolean> ownership;
    private static final ArrayList<Pin> PINS=new ArrayList<>();
    private static final Set<String> REPORTED=new HashSet<>();
    private static long denied;
    private static final class Pin {
        final WeakReference<Object> object;final Class<?> type;final int klass;
        Pin(Object value){object=new WeakReference<>(value);type=value.getClass();klass=U.getInt(value,8L);}
    }
    public static synchronized void install(BiFunction<Object,Boolean,Boolean> predicate){
        if(ownership!=null||predicate==null)throw new IllegalStateException("HEADER_GUARD_ALREADY_SET");
        if(U.addressSize()!=8||java.nio.ByteOrder.nativeOrder()!=java.nio.ByteOrder.LITTLE_ENDIAN)throw new IllegalStateException("HEADER_LAYOUT_UNSUPPORTED");
        ownership=predicate;new Pin(new Object());System.err.println("[EFF-OBJECT-HEADER] layout=compressed-klass-8-12 diagnosticOnly=true");
    }
    public static boolean overlaps(long offset,long size){return size>0&&offset>=0&&offset<Long.MAX_VALUE-size&&offset<12&&offset+size>8;}
    private static Pin pin(Object value,boolean create){
        synchronized(PINS){
            for(int i=0;i<PINS.size();i++){Pin p=PINS.get(i);Object referent=p.object.get();if(referent==null){PINS.remove(i--);continue;}if(referent==value)return p;}
            if(!create||PINS.size()>=1024)return null;
            Pin p=new Pin(value);PINS.add(p);return p;
        }
    }
    public static boolean deny(Object value,long offset,long size){
        if(value==null||ownership==null||!overlaps(offset,size))return false;
        boolean owned;
        try{owned=Boolean.TRUE.equals(ownership.apply(value,Boolean.TRUE));}catch(Throwable unavailable){if(pin(value,false)==null){report("UNVERIFIED_ACTIVITY",value.getClass());return false;}owned=true;}
        if(!owned)return false;
        Pin initial=pin(value,true);
        if(initial!=null&&(initial.type!=value.getClass()||initial.klass!=U.getInt(value,8L)))report("ALREADY_DIVERGED_NO_REPAIR",initial.type);
        for(Class<?> c=value.getClass();c!=null;c=c.getSuperclass())if(c.getName().equals("net.minecraft.client.renderer.entity.EntityRenderDispatcher")&&c!=value.getClass())report("NONCANONICAL_DISPATCHER_AT_BINDING",value.getClass());
        synchronized(PINS){denied++;}
        report("DENIED",value.getClass());return true;
    }
    public static long deniedCount(){synchronized(PINS){return denied;}}
    private static void report(String code,Class<?> type){String name=type.getName();if(name.length()>256)name=name.substring(0,256);String key=code+":"+name;synchronized(REPORTED){if(REPORTED.size()<64&&REPORTED.add(key))System.err.println("[EFF-OBJECT-HEADER] code="+code+" class="+name);}}
}
