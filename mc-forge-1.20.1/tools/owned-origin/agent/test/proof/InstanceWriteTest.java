package proof;
import java.lang.invoke.MethodHandles;
import java.lang.reflect.*;
import java.nio.file.*;
import java.util.*;
import java.util.jar.JarFile;
import sun.misc.Unsafe;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;

public final class InstanceWriteTest {
    static void check(boolean value,String message){if(!value)throw new AssertionError(message);}
    public static final class Other {public Object position;public int id=4;}
    public static void main(String[] args)throws Exception{
        // Load both authentic gate classes from the exact pinned JAR before first admission.
        Class<?> gate=Class.forName("eff.lifetime.FieldWriteGate");Class.forName("eff.lifetime.LifetimeTarget");
        Method sourcePath=Class.forName("eff.ownedagent.InstanceGateBridge").getDeclaredMethod("sourcePath",java.net.URI.class);sourcePath.setAccessible(true);
        Path source=Path.of(args[0]).toAbsolutePath();
        check(sourcePath.invoke(null,source.toUri()).equals(source),"file gate source parsed exactly");
        check(sourcePath.invoke(null,java.net.URI.create("union:"+source.toUri().getRawPath()+"%230!/")).equals(source),"securejar union source parsed exactly");
        Field u=Unsafe.class.getDeclaredField("theUnsafe");u.setAccessible(true);Unsafe unsafe=(Unsafe)u.get(null);
        byte[] hiddenBytes;try(var in=InstanceWriteTest.class.getResourceAsStream("HiddenInstanceCaller.class")){hiddenBytes=in.readAllBytes();}
        Class<?> hidden=MethodHandles.lookup().defineHiddenClass(hiddenBytes,true).lookupClass();check(hidden.isHidden(),"actual hidden caller required");
        Method ref=hidden.getMethod("writeReference",Object.class,Field.class,Object.class,Unsafe.class),integer=hidden.getMethod("writeInt",Object.class,Field.class,int.class,Unsafe.class);
        Entity owned=new Entity();owned.owned=true;
        Field removal=Entity.class.getField("removalReason"),id=Entity.class.getField("id");
        ref.invoke(null,owned,removal,Entity.RemovalReason.DISCARDED,unsafe);integer.invoke(null,owned,id,0,unsafe);
        check(owned.removalReason==null&&owned.id==19,"hidden reflection and Unsafe prewrite denial");
        for(String name:List.of("position","deltaMovement","stuckSpeedMultiplier","bb","uuid")){
            Field field=Entity.class.getField(name);Object old=field.get(owned);ref.invoke(null,owned,field,null,unsafe);check(field.get(owned)==old,"identity preserved "+name);
        }
        Entity.class.getField("canUpdate").setBoolean(owned,false);check(owned.canUpdate,"typed reflect boolean denied");
        long offset=unsafe.objectFieldOffset(id);unsafe.putByte(owned,offset+1,(byte)127);check(owned.id==19,"partial overlap denied");
        check(!unsafe.compareAndSwapInt(owned,offset,19,0),"CAS fails without write");check(unsafe.getAndAddInt(owned,offset,5)==19&&owned.id==19,"RMW returns actual old");
        unsafe.setMemory(owned,offset,4,(byte)0);unsafe.copyMemory(new byte[4],unsafe.arrayBaseOffset(byte[].class),owned,offset,4);check(owned.id==19,"range operations denied");
        LivingEntity living=new LivingEntity();living.owned=true;integer.invoke(null,living,LivingEntity.class.getField("deathTime"),500,unsafe);check(living.deathTime==0,"declared living field denied");
        Method booleanWrite=hidden.getMethod("writeBoolean",Object.class,Field.class,boolean.class,Unsafe.class);
        for(String name:List.of("dead","f_20890_")) {
            Field field=LivingEntity.class.getField(name);
            booleanWrite.invoke(null,living,field,true,unsafe);check(!field.getBoolean(living),"raw dead write denied "+name);
            LivingEntity ordinaryLiving=new LivingEntity();booleanWrite.invoke(null,ordinaryLiving,field,true,unsafe);
            check(field.getBoolean(ordinaryLiving),"unowned raw dead write executes "+name);
            ordinaryLiving.owned=true;booleanWrite.invoke(null,ordinaryLiving,field,false,unsafe);
            check(field.getBoolean(ordinaryLiving),"no revival of already dead object "+name);
        }
        owned.released=true;integer.invoke(null,owned,id,28,unsafe);check(owned.id==28,"released object writable");
        Entity unowned=new Entity();integer.invoke(null,unowned,id,29,unsafe);check(unowned.id==29,"unowned object writable");
        Other ordinary=new Other();Other.class.getField("id").setInt(ordinary,31);unsafe.putInt(ordinary,unsafe.objectFieldOffset(Other.class.getField("id")),32);check(ordinary.id==32,"unrelated same field name writable");
        Map<String,byte[]> definitions=new HashMap<>();
        for(String name:List.of("net.minecraft.world.entity.Entity","net.minecraft.world.entity.Entity$RemovalReason"))try(var in=InstanceWriteTest.class.getResourceAsStream("/"+name.replace('.','/')+".class")){definitions.put(name,in.readAllBytes());}
        var foreignGateLoader=new java.net.URLClassLoader(new java.net.URL[]{source.toUri().toURL()},null);
        Class<?> foreignTarget=foreignGateLoader.loadClass("eff.lifetime.LifetimeTarget");check(foreignTarget!=eff.lifetime.LifetimeTarget.class,"same authentic jar in another loader is distinct");
        ClassLoader foreign=new ClassLoader(InstanceWriteTest.class.getClassLoader()){
            protected Class<?> loadClass(String name,boolean resolve)throws ClassNotFoundException{synchronized(getClassLoadingLock(name)){if(name.equals("eff.lifetime.LifetimeTarget"))return foreignTarget;if(definitions.containsKey(name)){Class<?> found=findLoadedClass(name);if(found==null){byte[] b=definitions.get(name);found=defineClass(name,b,0,b.length);}if(resolve)resolveClass(found);return found;}return super.loadClass(name,resolve);}}
        };
        Class<?> foreignEntity=foreign.loadClass("net.minecraft.world.entity.Entity");Object other=foreignEntity.getConstructor().newInstance();foreignEntity.getField("owned").setBoolean(other,true);foreignEntity.getField("id").setInt(other,35);check(foreignEntity.getField("id").getInt(other)==35,"wrong interface loader not protected");
        check(gate.getClassLoader()==Entity.class.getClassLoader(),"actual authentic gate loader used");
        Entity bypass=new Entity();bypass.owned=true;hidden.getMethod("writeDirect",Entity.class).invoke(null,bypass);check(bypass.id==0,"expected hidden direct PUTFIELD gap remains observable");
        System.out.println("HIDDEN_DIRECT_PUTFIELD_COUNTEREXAMPLE protected=false actualStoredId="+bypass.id);
        foreignGateLoader.close();
        System.out.println("INSTANCE_WRITE_TEST_OK hiddenCaller=true reflect=true unsafe=true typedFields=true actualOffsetOverlap=true cas=false rmwOld=true copySet=true releasedAllowed=true unownedAllowed=true ordinaryAllowed=true foreignInterfaceLoaderAllowed=true directJavaUpdatesAllowed=true");
    }
}
