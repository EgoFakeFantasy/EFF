import java.lang.instrument.*;
import java.lang.reflect.*;
import java.nio.file.*;
import java.security.ProtectionDomain;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;
import proof.ControlAgent;
import proof.SyntheticNativeRedefiner;
import proof.SyntheticNativeTail;

public final class OwnedManagerTest implements Opcodes {
    static final String NAME="eff/minecraft/RawHealthProbe";
    static Map<String,byte[]> classes;static AtomicInteger lateCalls=new AtomicInteger();
    static byte[] changed(byte[] input){
        ClassNode node=new ClassNode();new ClassReader(input).accept(node,0);
        for(MethodNode m:node.methods)if(m.name.equals("typeName")&&m.desc.equals("(Ljava/lang/Object;)Ljava/lang/String;")){
            m.instructions.clear();m.tryCatchBlocks.clear();if(m.localVariables!=null)m.localVariables.clear();
            m.instructions.add(new LdcInsnNode("late-overwrite"));m.instructions.add(new InsnNode(ARETURN));m.maxLocals=1;m.maxStack=1;
        }
        ClassWriter writer=new ClassWriter(0);node.accept(writer);return writer.toByteArray();
    }
    static final class Loader extends ClassLoader {
        Class<?> define(String name,byte[] bytes){return defineClass(name.replace('/','.'),bytes,0,bytes.length);}
        @Override protected Class<?> findClass(String name)throws ClassNotFoundException{
            if(!name.startsWith("eff.minecraft.RawHealthProbe$"))throw new ClassNotFoundException(name);
            byte[] bytes=classes.get(name.replace('.','/')+".class");if(bytes==null)throw new ClassNotFoundException(name);return define(name,bytes);
        }
    }
    static void require(boolean ok,String why){if(!ok)throw new AssertionError(why);}
    static String behavior(Class<?> type)throws Exception{return(String)type.getMethod("typeName",Object.class).invoke(null,new Object[]{null});}
    public static void main(String[] args)throws Exception{
        classes=OwnedOriginPatch.entries(Path.of(args[0]));byte[] original=classes.get(NAME+".class");
        Instrumentation inst=ControlAgent.instrumentation;
        ClassFileTransformer late=new ClassFileTransformer(){@Override public byte[] transform(ClassLoader l,String name,Class<?> c,ProtectionDomain d,byte[] b){
            if(NAME.equals(name)||"net/minecraft/fixture/ExternalWorld".equals(name)){lateCalls.incrementAndGet();return changed(b);}return null;
        }};
        inst.addTransformer(late,true); // AFTER manager boundary and existing normalizer are installed.
        Loader primary=new Loader();
        try{primary.define(NAME,changed(original));throw new AssertionError("FIRST_BAD_HASH_ACCEPTED");}
        catch(ClassFormatError expected){System.out.println("FIRST_BAD_HASH_REJECTED "+expected.getClass().getSimpleName());}
        Class<?> own=primary.define(NAME,original.clone());require(behavior(own).equals("null"),"LATE_JAVA_CFT_OVERRIDES_INITIAL");
        int before=lateCalls.get();inst.redefineClasses(new ClassDefinition(own,changed(original)));
        require(lateCalls.get()>before&&behavior(own).equals("null"),"REDEFINE_NOT_RESTORED");
        before=lateCalls.get();inst.retransformClasses(own);require(lateCalls.get()>before&&behavior(own).equals("null"),"RETRANSFORM_NOT_RESTORED");
        Loader other=new Loader();Class<?> otherOwn=other.define(NAME,original.clone());require(behavior(otherOwn).equals("late-overwrite"),"CROSS_LOADER_PROTECTION_LEAK");
        inst.redefineClasses(new ClassDefinition(otherOwn,original.clone()));require(behavior(otherOwn).equals("late-overwrite"),"CROSS_CLASS_IDENTITY_LEAK");
        ClassWriter writer=new ClassWriter(0);writer.visit(V17,ACC_PUBLIC,"net/minecraft/fixture/ExternalWorld",null,"java/lang/Object",null);
        var method=writer.visitMethod(ACC_PUBLIC|ACC_STATIC,"typeName","(Ljava/lang/Object;)Ljava/lang/String;",null,null);method.visitCode();method.visitLdcInsn("original-mc-fixture");method.visitInsn(ARETURN);method.visitMaxs(1,1);method.visitEnd();writer.visitEnd();
        Class<?> world=new Loader().define("net/minecraft/fixture/ExternalWorld",writer.toByteArray());require(behavior(world).equals("late-overwrite"),"NONOWNED_TRANSFORM_FILTERED");
        if(args.length>1){
            System.load(args[1]);int error=SyntheticNativeRedefiner.redefine(own,changed(original));require(error==0,"NATIVE_REDEFINE_ERROR_"+error);require(behavior(own).equals("null"),"NATIVE_REDEFINE_NOT_RESTORED");System.out.println("SYNTHETIC_NATIVE_REDEFINE_OK code=0");
            if(args.length>2){
                System.load(args[2]);require(SyntheticNativeTail.install(own,changed(original))==0,"TAIL_INSTALL_FAILED");
                require(SyntheticNativeRedefiner.redefine(own,original)==0,"TAIL_REDEFINE_FAILED");
                require(behavior(own).equals("late-overwrite"),"EXPECTED_NATIVE_BOUNDARY_COUNTEREXAMPLE_NOT_OBSERVED");
                System.out.println("LATE_NATIVE_CLASSFILEHOOK_COUNTEREXAMPLE confirmed=true protected=false");
                require(SyntheticNativeTail.uninstall()==0,"TAIL_UNINSTALL_FAILED");
                inst.retransformClasses(own);require(behavior(own).equals("null"),"REPAIR_AFTER_COUNTEREXAMPLE_FAILED");
            }
        }
        require(inst.removeTransformer(late),"LATE_CFT_REMOVE_FAILED");
        System.out.println("OWNED_MANAGER_TEST_OK initialLateTransformer=true callbacks="+lateCalls.get()+" redefine=true retransform=true differentLoaderUnprotected=true nonOwnedUnfiltered=true classSchemaPreserved=true");
    }
}
