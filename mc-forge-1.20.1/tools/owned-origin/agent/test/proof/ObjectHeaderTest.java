package proof;
import java.lang.invoke.*;
import java.lang.instrument.*;
import java.lang.reflect.*;
import java.security.ProtectionDomain;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import sun.misc.Unsafe;
import eff.lifetime.*;
import net.minecraft.world.entity.Entity;
import net.minecraft.client.renderer.entity.EntityRenderDispatcher;
import net.minecraft.client.renderer.LevelRenderer;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;

public final class ObjectHeaderTest implements Opcodes {
    public static final class Renderer implements LifetimeRenderer {public Object owner=new Object();public int ordinary;public boolean lifetimeRendererOwned(){return false;}public Object lifetimeRendererOwner(){return owner;}}
    static void check(boolean v,String why){if(!v)throw new AssertionError(why);}
    static byte[] changed(byte[] b){ClassNode n=new ClassNode();new ClassReader(b).accept(n,0);for(MethodNode m:n.methods)if(m.name.equals("isOwnedRuntimeObject")){m.instructions.clear();m.tryCatchBlocks.clear();if(m.localVariables!=null)m.localVariables.clear();m.instructions.add(new InsnNode(ICONST_0));m.instructions.add(new InsnNode(IRETURN));m.maxStack=1;m.maxLocals=1;}ClassWriter w=new ClassWriter(0);n.accept(w);return w.toByteArray();}
    public static void main(String[] args)throws Throwable{
        Class<?> gate=Class.forName("eff.lifetime.FieldWriteGate");Class.forName("eff.lifetime.LifetimeTarget");Class.forName("eff.lifetime.LifetimeRenderer");
        Field f=Unsafe.class.getDeclaredField("theUnsafe");f.setAccessible(true);Unsafe u=(Unsafe)f.get(null);
        MethodHandle put=MethodHandles.lookup().findVirtual(Unsafe.class,"putIntVolatile",MethodType.methodType(void.class,Object.class,long.class,int.class)).bindTo(u);
        Method count=Class.forName("eff.ownedboot.ObjectHeaderGuard",false,null).getMethod("deniedCount");
        Renderer renderer=new Renderer();EntityRenderDispatcher dispatcher=new EntityRenderDispatcher();dispatcher.renderers.put("original",renderer);
        LevelRenderer worldRenderer=new LevelRenderer(dispatcher);
        Entity entity=new Entity();entity.owned=true;Map<Object,Object> index=new HashMap<>();index.put(19,entity);
        for(Object target:List.of(renderer,dispatcher,worldRenderer,dispatcher.renderers,entity,index)){
            int original=u.getInt(target,8L);Class<?> originalClass=target.getClass();long before=(long)count.invoke(null);
            put.invokeExact(target,8L,original);
            check((long)count.invoke(null)>before&&target.getClass()==originalClass&&u.getInt(target,8L)==original,"actual MH header write withheld");
            check(!u.compareAndSwapInt(target,8L,original,original),"CAS same value must be refused for managed header");
            u.putByte(target,11L,u.getByte(target,11L));check(target.getClass()==originalClass,"partial klass overlap");
        }
        long ordinaryOffset=u.objectFieldOffset(Renderer.class.getField("ordinary"));u.putInt(renderer,ordinaryOffset,17);check(renderer.ordinary==17,"ordinary field allowed");
        Object ordinary=new Object();int ordinaryKlass=u.getInt(ordinary,8L);check(u.compareAndSwapInt(ordinary,8L,ordinaryKlass,ordinaryKlass),"ordinary same-value header CAS remains native");
        entity.released=true;entity.owned=false;int entityKlass=u.getInt(entity,8L);check(u.compareAndSwapInt(entity,8L,entityKlass,entityKlass),"released entity header allowed");
        AtomicInteger lateCalls=new AtomicInteger();ClassFileTransformer late=new ClassFileTransformer(){public byte[] transform(ClassLoader l,String n,Class<?> c,ProtectionDomain d,byte[] b){if(n.equals("eff/lifetime/FieldWriteGate")){lateCalls.incrementAndGet();return changed(b);}return null;}};
        ControlAgent.instrumentation.addTransformer(late,true);ControlAgent.instrumentation.retransformClasses(gate);
        check(lateCalls.get()>0&&FieldWriteGate.isOwnedRuntimeObject(dispatcher),"late gate rewrite restored");int klass=u.getInt(dispatcher,8L);check(!u.compareAndSwapInt(dispatcher,8L,klass,klass),"header protection survives gate rewrite");
        byte[] gateBytes;try(var in=gate.getResourceAsStream("/eff/lifetime/FieldWriteGate.class")){gateBytes=in.readAllBytes();}
        Class<?> foreign=new ClassLoader(ObjectHeaderTest.class.getClassLoader()){Class<?> define(){return defineClass("eff.lifetime.FieldWriteGate",gateBytes,0,gateBytes.length);}}.define();
        check(!(boolean)foreign.getMethod("isOwnedRuntimeObject",Object.class).invoke(null,dispatcher),"another gate loader retains foreign rewrite");
        renderer.owner=null;check(u.compareAndSwapInt(dispatcher,8L,klass,klass),"renderer lease release allows same-value header write");
        int worldKlass=u.getInt(worldRenderer,8L);check(u.compareAndSwapInt(worldRenderer,8L,worldKlass,worldKlass),"world renderer lease release allows same-value header write");
        System.out.println("OBJECT_HEADER_TEST_OK actualCompressedKlassLayout=true actualMethodHandle=true sameValueOnly=true casShowsPrewriteRejection=true preclaimRendererDispatcher=true originalMapIdentity=true ordinaryFieldAllowed=true ordinaryAndReleasedAllowed=true gateLateRewriteRestored=true otherGateLoaderUnfiltered=true diagnosticPinsOnly=true");
    }
}
