package proof;
public final class HiddenIndexWriter {
 public static void write(Object receiver,java.lang.reflect.Field field,Object next,sun.misc.Unsafe unsafe)throws Exception {
  field.set(receiver,next);unsafe.putObjectVolatile(receiver,unsafe.objectFieldOffset(field),next);
 }
}
