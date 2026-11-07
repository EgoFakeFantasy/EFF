import java.lang.reflect.*;
import java.nio.file.*;
import java.util.*;
import sun.misc.Unsafe;

public final class OwnedStaticWriteTest {
    static Map<String,byte[]> classes;
    static final class Loader extends ClassLoader{
        protected Class<?> findClass(String name)throws ClassNotFoundException{
            if(!name.startsWith("eff.minecraft."))throw new ClassNotFoundException(name);
            byte[] bytes=classes.get(name.replace('.','/')+".class");if(bytes==null)throw new ClassNotFoundException(name);return defineClass(name,bytes,0,bytes.length);
        }
    }
    static class Other {static int number=5;static Object reference="before";}
    static void require(boolean ok,String why){if(!ok)throw new AssertionError(why);}
    static Field field(Class<?> owner,String name)throws Exception{Field f=owner.getDeclaredField(name);f.setAccessible(true);return f;}
    public static void main(String[] args)throws Exception{
        classes=OwnedOriginPatch.entries(Path.of(args[0]));Field ufield=Unsafe.class.getDeclaredField("theUnsafe");ufield.setAccessible(true);Unsafe u=(Unsafe)ufield.get(null);
        Loader loader=new Loader();Class<?> type=Class.forName("eff.minecraft.BootstrapDiagnostics",true,loader);
        Field reports=field(type,"reports"),signature=field(type,"projectionSignature");
        require(reports.getInt(null)==0&&signature.get(null).equals(""),"DIRECT_CLINIT_STATIC_WRITE_BLOCKED");
        // Actual owned method performs reports++ before its diagnostic try block; null error prevents file IO.
        System.setProperty("eff.entityGuardSelftest","true");type.getMethod("failure",String.class,Throwable.class,java.util.concurrent.ExecutorService.class).invoke(null,"offline",null,null);System.clearProperty("eff.entityGuardSelftest");
        require(reports.getInt(null)==1,"DIRECT_PUTSTATIC_BLOCKED");
        reports.setInt(null,0);signature.set(null,null);
        require(reports.getInt(null)==1&&signature.get(null).equals(""),"REFLECTION_RESET_SUCCEEDED");
        Object base=u.staticFieldBase(reports);long off=u.staticFieldOffset(reports),ref=u.staticFieldOffset(signature);
        u.putInt(base,off,0);u.putIntVolatile(base,off,0);u.putOrderedInt(base,off,0);
        require(!u.compareAndSwapInt(base,off,1,0),"DENIED_CAS_REPORTED_SUCCESS");
        require(u.getAndSetInt(base,off,0)==1&&u.getAndAddInt(base,off,5)==1,"DENIED_RMW_OLD_VALUE_WRONG");
        u.putObject(base,ref,null);u.putObjectVolatile(base,ref,null);u.putOrderedObject(base,ref,null);
        require(!u.compareAndSwapObject(base,ref,signature.get(null),null),"DENIED_OBJECT_CAS_SUCCESS");
        require(u.getAndSetObject(base,ref,null).equals(""),"DENIED_OBJECT_RMW_OLD_VALUE_WRONG");
        u.putByte(base,off+1,(byte)0x7f);u.setMemory(base,off,4,(byte)0);
        u.copyMemory(new byte[4],u.arrayBaseOffset(byte[].class),base,off,4);
        require(reports.getInt(null)==1&&signature.get(null).equals(""),"UNSAFE_RESET_SUCCEEDED");
        Field other=field(Other.class,"number");other.setInt(null,8);u.putInt(u.staticFieldBase(other),u.staticFieldOffset(other),9);require(Other.number==9,"UNOWNED_WRITE_BLOCKED");
        Class<?> alternate=Class.forName(type.getName(),true,new Loader());Field alternateReports=field(alternate,"reports");alternateReports.setInt(null,6);u.putInt(u.staticFieldBase(alternateReports),u.staticFieldOffset(alternateReports),7);require(alternateReports.getInt(null)==7,"WRONG_LOADER_WRITE_BLOCKED");
        Class<?> reader=Class.forName("eff.minecraft.RawHealthProbe$Reader",true,loader);Object object=reader.getConstructor(Class.class,Class.class,Class.class,Class.class,Class.class).newInstance(Object.class,Object.class,Object.class,Object.class,Object.class);
        Field attempted=field(reader,"attempted");attempted.setBoolean(object,true);require(attempted.getBoolean(object),"OWNED_INSTANCE_FIELD_BLOCKED");
        System.out.println("OWNED_STATIC_WRITE_TEST_OK reflection=true unsafePlainVolatileOrdered=true casFalse=true rmwActualOldValue=true partialRange=true copySetMemory=true directJavaStaticUpdates=true unownedAndDifferentLoaderAllowed=true instanceFieldAllowed=true");
    }
}
