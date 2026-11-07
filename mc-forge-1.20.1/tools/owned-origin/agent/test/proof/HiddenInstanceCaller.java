package proof;
import java.lang.reflect.Field;
import sun.misc.Unsafe;
/** Loaded exclusively as a genuine hidden class by the test. */
public final class HiddenInstanceCaller {
    public static void writeReference(Object target,Field field,Object value,Unsafe unsafe)throws Exception{
        field.set(target,value);unsafe.putObjectVolatile(target,unsafe.objectFieldOffset(field),value);
    }
    public static void writeInt(Object target,Field field,int value,Unsafe unsafe)throws Exception{
        field.setInt(target,value);unsafe.putInt(target,unsafe.objectFieldOffset(field),value);
    }
    public static void writeDirect(net.minecraft.world.entity.Entity target){target.id=0;}
    public static void writeBoolean(Object target,Field field,boolean value,Unsafe unsafe)throws Exception{
        field.setBoolean(target,value);unsafe.putBooleanVolatile(target,unsafe.objectFieldOffset(field),value);
    }
}
