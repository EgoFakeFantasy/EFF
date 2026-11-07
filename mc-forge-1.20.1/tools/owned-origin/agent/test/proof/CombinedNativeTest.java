package proof;
import java.lang.instrument.ClassDefinition;
import java.lang.reflect.*;
import java.nio.file.*;
import java.security.*;
import java.util.*;
import net.minecraft.world.entity.*;
import net.minecraft.world.phys.Vec3;
import eff.hiddenfixture.NativeBoundary;
import it.unimi.dsi.fastutil.ints.*;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;

public final class CombinedNativeTest implements Opcodes {
    public static class Derived extends LivingEntity {}
    static void check(boolean good,String why){if(!good)throw new AssertionError(why);}
    static byte[] bootstrapListOps(){
        ClassWriter writer=new ClassWriter(ClassWriter.COMPUTE_MAXS);
        writer.visit(V17,ACC_PUBLIC,"java/util/EffHiddenCollectionFixture",null,"java/lang/Object",null);
        for(boolean indexed:new boolean[]{false,true}){
            String desc=indexed?"(Ljava/util/List;I)Ljava/lang/Object;":"(Ljava/util/List;Ljava/lang/Object;)Z";
            var method=writer.visitMethod(ACC_PUBLIC|ACC_STATIC,indexed?"removeIndex":"removeList",desc,null,null);
            method.visitCode();method.visitVarInsn(ALOAD,0);method.visitVarInsn(indexed?ILOAD:ALOAD,1);
            method.visitMethodInsn(INVOKEINTERFACE,"java/util/List","remove",indexed?"(I)Ljava/lang/Object;":"(Ljava/lang/Object;)Z",true);
            method.visitInsn(indexed?ARETURN:IRETURN);method.visitMaxs(0,0);method.visitEnd();
        }
        writer.visitEnd();return writer.toByteArray();
    }
    static byte[] bypass(byte[] bytes){ClassNode n=new ClassNode();new ClassReader(bytes).accept(n,0);for(MethodNode m:n.methods)if(m.name.equals("apply")){m.instructions.clear();m.tryCatchBlocks.clear();if(m.localVariables!=null)m.localVariables.clear();m.instructions.add(new VarInsnNode(ALOAD,1));m.instructions.add(new InsnNode(ARETURN));m.maxLocals=2;m.maxStack=1;}ClassWriter w=new ClassWriter(0);n.accept(w);return w.toByteArray();}
    public static void main(String[] args)throws Exception{
        System.load(Path.of(args[0]).toAbsolutePath().toString());
        // The real MC startup failure involved a bootstrap-hidden Set.remove lambda.
        Class.forName("java.lang.SecurityManager",true,null);
        Class<?> nativeApi=Class.forName("eff.hiddenboundary.NativeHiddenBoundary");
        check(Arrays.stream(nativeApi.getDeclaredMethods()).noneMatch(m->m.getName().equals("uninstall")),"production API has no uninstall");
        Class<?> provider=Class.forName("eff.hiddenboundary.HiddenWriteTransform");byte[] providerBytes;
        try(var in=provider.getResourceAsStream("/eff/hiddenboundary/HiddenWriteTransform.class")){providerBytes=in.readAllBytes();}
        ControlAgent.instrumentation.redefineClasses(new ClassDefinition(provider,bypass(providerBytes)));
        byte[] ops=Files.readAllBytes(Path.of(args[1]));
        ProtectionDomain domain=new ProtectionDomain(new CodeSource(new java.net.URL("file:/eff-native-combined-fixture/"),(java.security.cert.Certificate[])null),new Permissions());
        Class<?> hidden=NativeBoundary.define(CombinedNativeTest.class,ops,domain,false,3,new Object());
        check(hidden.isHidden()&&hidden.getClassLoader()==CombinedNativeTest.class.getClassLoader()&&hidden.getNestHost()==CombinedNativeTest.class&&hidden.getProtectionDomain()==domain,"real export preserves hidden identity");
        Method write=hidden.getMethod("write",Entity.class,Vec3.class),inherited=hidden.getMethod("inherited",LivingEntity.class,Vec3.class);
        Entity target=new Entity();target.owned=true;Vec3 original=target.position,nan=new Vec3();nan.x=Double.NaN;
        check(write.invoke(null,target,nan).equals(73)&&target.position==original&&target.removalReason==null&&target.unrelated==1,"owned hidden direct writes blocked, rest caller runs");
        LivingEntity living=new LivingEntity();living.owned=true;Vec3 initial=living.position;
        check(inherited.invoke(null,living,nan).equals(74)&&living.position==initial&&living.removalReason==null&&living.unrelated==1,"inherited LivingEntity symbolic owner guarded");
        Derived derived=new Derived();derived.owned=true;Vec3 derivedInitial=derived.position;
        check(hidden.getMethod("derived",Derived.class,Vec3.class).invoke(null,derived,nan).equals(75)
            &&derived.position==derivedInitial&&derived.removalReason==null&&derived.unrelated==1,"arbitrary subclass declaration checked at actual write");
        Entity ordinary=new Entity();write.invoke(null,ordinary,nan);check(ordinary.position==nan&&ordinary.removalReason==Entity.RemovalReason.DISCARDED,"ordinary writes remain");
        Entity released=new Entity();released.owned=true;released.released=true;write.invoke(null,released,nan);check(released.position==nan&&released.removalReason==Entity.RemovalReason.DISCARDED,"released writes remain");
        Entity broken=new Entity();broken.owned=true;broken.position=nan;broken.removalReason=Entity.RemovalReason.DISCARDED;write.invoke(null,broken,new Vec3());check(broken.position==nan&&broken.removalReason==Entity.RemovalReason.DISCARDED,"already destroyed state stays destroyed");
        try{write.invoke(null,null,nan);throw new AssertionError("NULL_FAILURE_LOST");}catch(InvocationTargetException e){check(e.getCause() instanceof NullPointerException,"original null failure");}
        Method remove=hidden.getMethod("remove",Int2ObjectMap.class,int.class),clear=hidden.getMethod("clear",Int2ObjectMap.class);
        for(Int2ObjectMap<Object> map:List.<Int2ObjectMap<Object>>of(new Int2ObjectOpenHashMap<>(),new Int2ObjectLinkedOpenHashMap<>())){
            map.put(12,target);remove.invoke(null,map,12);check(map.get(12)==target,"actual hidden map remove guarded");clear.invoke(null,map);check(map.get(12)==target,"actual hidden map clear guarded");
            target.released=true;remove.invoke(null,map,12);check(!map.containsKey(12),"released map removal allowed");target.released=false;
            map.defaultReturnValue(target);remove.invoke(null,map,99);check(!map.containsKey(99),"absent key not invented");
        }
        Method removeList=hidden.getMethod("removeList",List.class,Object.class),removeIndex=hidden.getMethod("removeIndex",List.class,int.class);
        var members=new ArrayList<Object>();members.add(target);members.add(ordinary);
        check(Boolean.FALSE.equals(removeList.invoke(null,members,target))&&members.size()==2&&members.get(0)==target,"native hidden list removal blocked before mutation");
        check(removeIndex.invoke(null,members,0)==null&&members.get(0)==target,"native hidden index removal blocked before mutation");
        check(Boolean.TRUE.equals(removeList.invoke(null,members,ordinary))&&members.size()==1,"native hidden ordinary removal allowed");
        target.released=true;check(removeIndex.invoke(null,members,0)==target&&members.isEmpty(),"native hidden released removal allowed");target.released=false;
        try{removeList.invoke(null,null,target);throw new AssertionError("HIDDEN_LIST_NULL_LOST");}catch(InvocationTargetException e){check(e.getCause() instanceof NullPointerException,"hidden list null failure");}
        try{removeIndex.invoke(null,members,-1);throw new AssertionError("HIDDEN_LIST_INDEX_LOST");}catch(InvocationTargetException e){check(e.getCause() instanceof IndexOutOfBoundsException,"hidden list index failure");}
        Class<?> bootstrapHidden=NativeBoundary.define(ArrayList.class,bootstrapListOps(),null,false,3,null);
        System.out.println("BOOTSTRAP_HIDDEN_DIAGNOSTIC hidden="+bootstrapHidden.isHidden()+" loader="+bootstrapHidden.getClassLoader()+" module="+bootstrapHidden.getModule()+" nest="+bootstrapHidden.getNestHost()+" name="+bootstrapHidden.getName());
        // The raw JVM export with a null name uses the bootstrap unnamed module,
        // while preserving the requested nest. Do not invent java.base membership.
        check(bootstrapHidden.isHidden()&&bootstrapHidden.getClassLoader()==null&&bootstrapHidden.getNestHost()==ArrayList.class,"real bootstrap hidden fixture");
        Method bootstrapRemove=bootstrapHidden.getMethod("removeList",List.class,Object.class),bootstrapIndex=bootstrapHidden.getMethod("removeIndex",List.class,int.class);
        members.add(target);members.add("ordinary");
        check(Boolean.FALSE.equals(bootstrapRemove.invoke(null,members,target))&&members.get(0)==target,"bootstrap hidden original retained");
        check(bootstrapIndex.invoke(null,members,0)==null&&members.get(0)==target,"bootstrap hidden index protected");
        check(Boolean.TRUE.equals(bootstrapRemove.invoke(null,members,"ordinary")),"bootstrap ordinary JDK value allowed");
        target.released=true;check(bootstrapIndex.invoke(null,members,0)==target&&members.isEmpty(),"bootstrap released removal allowed");target.released=false;
        long[] stats=(long[])nativeApi.getMethod("stats").invoke(null);check(stats[0]>0&&stats[1]>0&&stats[2]==0,"actual native hook counters");
        try{nativeApi.getMethod("install",Class.class).invoke(null,provider);throw new AssertionError("NATIVE_REINSTALL_ACCEPTED");}catch(InvocationTargetException e){check(e.getCause() instanceof IllegalStateException,"production install frozen");}
        System.out.println("COMBINED_NATIVE_TEST_OK directJvmExport=true sameLoaderNestPD=true providerRedefineProtected=true ownedRawWritesDenied=true inheritedOwner=true remainingCallerExecuted=true unownedReleasedAllowed=true noRevival=true nullFailure=true hiddenMapRemoveClear=true hiddenListObjectIndex=true bootstrapHiddenList=true jdkStartup=true productionExportsOnly=true counters="+Arrays.toString(stats));
    }
}
