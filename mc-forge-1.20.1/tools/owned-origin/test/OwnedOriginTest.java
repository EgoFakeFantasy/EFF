import java.lang.reflect.*;
import java.nio.file.*;
import java.util.*;
import java.util.jar.*;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;

/** Executes both real production wrappers; replaces only the innermost plugin delegate. */
public final class OwnedOriginTest implements Opcodes {
    static int callbacks;static byte[] lastTransformed;static Method invoke;static Object instance;
    static final RuntimeException FAILURE=new RuntimeException("synthetic-pipeline-failure");
    static byte[] call(byte[] bytes,String name,String reason)throws Throwable{
        try{return(byte[])invoke.invoke(instance,bytes,name,reason);}catch(InvocationTargetException e){throw e.getCause();}
    }
    public static byte[] callback(ClassLoader loader,byte[] input,String name,String reason)throws Throwable{
        callbacks++;require(Thread.currentThread().getContextClassLoader()==loader,"CONTEXT_NOT_PRESERVED");
        if(reason.equals("fail"))throw FAILURE;
        if(reason.equals("replace")){
            ClassNode node=new ClassNode();new ClassReader(input).accept(node,0);
            MethodNode target=node.methods.stream().filter(m->m.name.equals("typeName")&&m.desc.equals("(Ljava/lang/Object;)Ljava/lang/String;")).findFirst().orElseThrow();
            target.instructions.clear();target.tryCatchBlocks.clear();if(target.localVariables!=null)target.localVariables.clear();
            target.instructions.add(new LdcInsnNode("tampered"));target.instructions.add(new InsnNode(ARETURN));target.maxStack=1;target.maxLocals=1;
            ClassWriter writer=new ClassWriter(0);node.accept(writer);lastTransformed=writer.toByteArray();
            Arrays.fill(input,(byte)0x5a);return lastTransformed;
        }
        if(reason.equals("sampler-replace")) {
            ClassNode node=new ClassNode();new ClassReader(input).accept(node,0);
            for(MethodNode m:node.methods)if(m.name.equals("enabled")&&m.desc.equals("()Z") || m.name.equals("prepare")&&m.desc.equals("()V")) {
                m.instructions.clear();m.tryCatchBlocks.clear();if(m.localVariables!=null)m.localVariables.clear();
                if(m.desc.equals("()Z")) { m.instructions.add(new InsnNode(ICONST_0));m.instructions.add(new InsnNode(IRETURN)); }
                else m.instructions.add(new InsnNode(RETURN));
                m.maxStack=1;m.maxLocals=0;
            }
            ClassWriter writer=new ClassWriter(0);node.accept(writer);lastTransformed=writer.toByteArray();return lastTransformed;
        }
        if(reason.equals("arena-empty-roster")) {
            ClassNode node=new ClassNode();new ClassReader(input).accept(node,0);
            MethodNode roster=node.methods.stream().filter(m->m.name.equals("sceneActors")&&m.desc.equals("()Ljava/util/List;")).findFirst().orElseThrow();
            roster.instructions.clear();roster.tryCatchBlocks.clear();if(roster.localVariables!=null)roster.localVariables.clear();
            roster.instructions.add(new TypeInsnNode(NEW,"java/util/ArrayList"));roster.instructions.add(new InsnNode(DUP));
            roster.instructions.add(new MethodInsnNode(INVOKESPECIAL,"java/util/ArrayList","<init>","()V",false));
            roster.instructions.add(new InsnNode(ARETURN));roster.maxStack=2;roster.maxLocals=1;
            ClassWriter writer=new ClassWriter(0);node.accept(writer);lastTransformed=writer.toByteArray();return lastTransformed;
        }
        if(reason.equals("mc-change")){
            ClassNode node=new ClassNode();new ClassReader(input).accept(node,0);
            // Add a harmless diagnostic attribute to a real MC class, representing an arbitrary plugin result.
            node.sourceFile="synthetic-plugin-changed.java";ClassWriter writer=new ClassWriter(0);node.accept(writer);
            lastTransformed=writer.toByteArray();return lastTransformed;
        }
        lastTransformed=input;return input;
    }
    static void require(boolean ok,String why){if(!ok)throw new AssertionError(why);}
    static byte[] fixture(byte[] production){
        ClassNode node=new ClassNode();new ClassReader(production).accept(node,0);
        node.superName="java/lang/ClassLoader";node.fields.clear();node.innerClasses.clear();node.nestMembers=null;node.nestHostClass=null;
        Set<String> retained=Set.of("maybeTransformClassBytes",OwnedOriginPatch.DELEGATE,"eff$transformBytesDelegate");
        node.methods.removeIf(m->!retained.contains(m.name));
        for(MethodNode m:node.methods)if(m.name.equals("eff$transformBytesDelegate")){
            m.instructions.clear();m.tryCatchBlocks.clear();if(m.localVariables!=null)m.localVariables.clear();
            for(int i=0;i<4;i++)m.instructions.add(new VarInsnNode(ALOAD,i));
            m.instructions.add(new MethodInsnNode(INVOKESTATIC,"OwnedOriginTest","callback","(Ljava/lang/ClassLoader;[BLjava/lang/String;Ljava/lang/String;)[B",false));m.instructions.add(new InsnNode(ARETURN));
        }
        MethodNode ctor=new MethodNode(ACC_PUBLIC,"<init>","()V",null,null);ctor.instructions.add(new VarInsnNode(ALOAD,0));ctor.instructions.add(new MethodInsnNode(INVOKESPECIAL,"java/lang/ClassLoader","<init>","()V",false));ctor.instructions.add(new InsnNode(RETURN));node.methods.add(ctor);
        ClassWriter writer=new ClassWriter(ClassWriter.COMPUTE_FRAMES|ClassWriter.COMPUTE_MAXS);node.accept(writer);return writer.toByteArray();
    }
    static Map<String,byte[]> effClasses;
    static class Loader extends ClassLoader {
        Class<?> define(String name,byte[] b){return defineClass(name,b,0,b.length);}
        protected Class<?> findClass(String name)throws ClassNotFoundException{
            if(!name.startsWith("eff.minecraft.RawHealthProbe$")&&!name.startsWith("eff.minecraft.lab.LabThreadSampler$"))throw new ClassNotFoundException(name);
            byte[] bytes=effClasses.get(name.replace('.','/')+".class");if(bytes==null)throw new ClassNotFoundException(name);return define(name,bytes);
        }
    }
    static Object typeName(byte[] bytes)throws Exception{return new Loader().define(OwnedOriginPatch.RAW.replace('/','.'),bytes).getMethod("typeName",Object.class).invoke(null,new Object[]{null});}
    // Execute the exact getter body in a tiny holder. The actual MC class is not
    // initialized; only its GETFIELD owner is remapped to the same-layout fixture.
    static List<?> roster(byte[] bytes,List<?> originals)throws Exception {
        ClassNode source=new ClassNode();new ClassReader(bytes).accept(source,0);
        MethodNode method=source.methods.stream().filter(m->m.name.equals("sceneActors")&&m.desc.equals("()Ljava/util/List;")).findFirst().orElseThrow();
        String name="fixture/ArenaRoster";
        for(AbstractInsnNode insn:method.instructions)if(insn instanceof FieldInsnNode field&&field.owner.equals(source.name)){
            require(field.name.equals("actors")&&field.desc.equals("Ljava/util/List;"),"UNREVIEWED_ROSTER_FIELD");field.owner=name;
        }
        method.localVariables=null;
        ClassWriter writer=new ClassWriter(ClassWriter.COMPUTE_FRAMES|ClassWriter.COMPUTE_MAXS);
        writer.visit(V17,ACC_PUBLIC,name,null,"java/lang/Object",null);
        writer.visitField(ACC_PRIVATE|ACC_FINAL,"actors","Ljava/util/List;",null,null).visitEnd();
        var ctor=writer.visitMethod(ACC_PUBLIC,"<init>","(Ljava/util/List;)V",null,null);ctor.visitCode();
        ctor.visitVarInsn(ALOAD,0);ctor.visitMethodInsn(INVOKESPECIAL,"java/lang/Object","<init>","()V",false);
        ctor.visitVarInsn(ALOAD,0);ctor.visitVarInsn(ALOAD,1);ctor.visitFieldInsn(PUTFIELD,name,"actors","Ljava/util/List;");ctor.visitInsn(RETURN);ctor.visitMaxs(0,0);ctor.visitEnd();
        method.accept(writer);writer.visitEnd();
        Class<?> type=new Loader().define(name.replace('/','.'),writer.toByteArray());Object holder=type.getConstructor(List.class).newInstance(originals);
        return (List<?>)type.getMethod("sceneActors").invoke(holder);
    }
    static void canonicalNegativeControls(Map<String,byte[]> library,byte[] source,byte[] canonical)throws Exception {
        String key="eff/minecraft/EffArena",resource="META-INF/eff-owned-origin/archive/"+key+".class";
        for(boolean missing:new boolean[]{false,true}) {
            byte[] corrupt=canonical.clone();corrupt[corrupt.length-1]^=1;
            ClassLoader isolated=new ClassLoader(OwnedOriginTest.class.getClassLoader()){
                @Override protected Class<?> loadClass(String name,boolean resolve)throws ClassNotFoundException {
                    if(!name.equals("cpw.mods.modlauncher.EffOwnedOrigin")&&!name.equals("cpw.mods.modlauncher.EffOwnedOriginCatalog"))return super.loadClass(name,resolve);
                    Class<?> type=findLoadedClass(name);if(type==null){byte[] bytes=library.get(name.replace('.','/')+".class");type=defineClass(name,bytes,0,bytes.length);}if(resolve)resolveClass(type);return type;
                }
                @Override public java.io.InputStream getResourceAsStream(String name){if(name.equals(resource))return missing?null:new java.io.ByteArrayInputStream(corrupt);return super.getResourceAsStream(name);}
            };
            Class<?> helper=isolated.loadClass("cpw.mods.modlauncher.EffOwnedOrigin");
            byte[] snapshot=(byte[])helper.getMethod("snapshot",byte[].class,String.class).invoke(null,source.clone(),key);
            require(Arrays.equals(source,snapshot),"RAW_SOURCE_SNAPSHOT_CHANGED");
            try{helper.getMethod("snapshot",byte[].class,String.class).invoke(null,canonical.clone(),key);throw new AssertionError("CANONICAL_ACCEPTED_AS_RAW_SOURCE");}
            catch(InvocationTargetException expected){require(expected.getCause() instanceof SecurityException&&expected.getCause().getMessage().startsWith("EFF_OWNED_ORIGIN_MISMATCH:"),"SOURCE_CANONICAL_PINS_CONFUSED");}
            try{helper.getMethod("finish",byte[].class,byte[].class,String.class).invoke(null,snapshot,source.clone(),key);throw new AssertionError("BAD_CANONICAL_ACCEPTED");}
            catch(InvocationTargetException expected){require(expected.getCause() instanceof SecurityException&&expected.getCause().getMessage().startsWith(missing?"EFF_OWNED_CANONICAL_MISSING:":"EFF_OWNED_CANONICAL_MISMATCH:"),"CANONICAL_NEGATIVE_CONTROL_WRONG_FAILURE");}
        }
        System.out.println("OWNED_ARENA_DUAL_PIN_NEGATIVE_OK canonicalNotAcceptedAsSource=true canonicalCorruptionRejected=true canonicalMissingRejected=true");
    }
    public static void main(String[] args)throws Throwable{
        Map<String,byte[]> lib=OwnedOriginPatch.entries(Path.of(args[0])),eff=OwnedOriginPatch.entries(Path.of(args[1]));
        effClasses=eff;
        Class<?> type=new Loader().define(OwnedOriginPatch.OWNER.replace('/','.'),fixture(lib.get(OwnedOriginPatch.ENTRY)));
        instance=type.getConstructor().newInstance();invoke=type.getDeclaredMethod("maybeTransformClassBytes",byte[].class,String.class,String.class);invoke.setAccessible(true);
        byte[] original=eff.get(OwnedOriginPatch.RAW+".class"),input=original.clone();
        ClassLoader prior=Thread.currentThread().getContextClassLoader();
        byte[] recovered=call(input,OwnedOriginPatch.RAW.replace('/','.'),"replace");
        require(callbacks==1,"PLUGIN_SKIPPED");require(Arrays.equals(recovered,original),"OWNED_NOT_RECOVERED");
        require(recovered!=input&&recovered!=lastTransformed,"ARRAY_ALIAS");
        require(typeName(lastTransformed).equals("tampered"),"EARLY_RETURN_NEGATIVE_CONTROL");
        require(typeName(recovered).equals("null"),"RECOVERED_BEHAVIOR_WRONG");
        require(Thread.currentThread().getContextClassLoader()==prior,"CONTEXT_NOT_RESTORED");
        String sampler="eff/minecraft/lab/LabThreadSampler";
        byte[] samplerOriginal=eff.get(sampler+".class");int samplerBefore=callbacks;
        byte[] samplerRecovered=call(samplerOriginal.clone(),sampler,"sampler-replace");
        require(callbacks==samplerBefore+1,"SAMPLER_PLUGIN_SKIPPED");
        require(Arrays.equals(samplerOriginal,samplerRecovered),"SAMPLER_EARLY_RETURN_NOT_RESTORED");
        System.setProperty("eff.entityGuardSelftest","true");
        Class<?> badSampler=new Loader().define(sampler.replace('/','.'),lastTransformed);
        Method badEnabled=badSampler.getDeclaredMethod("enabled");badEnabled.setAccessible(true);
        require(Boolean.FALSE.equals(badEnabled.invoke(null)),"SAMPLER_FALSE_NEGATIVE_CONTROL");
        Class<?> goodSampler=new Loader().define(sampler.replace('/','.'),samplerRecovered);
        Method goodEnabled=goodSampler.getDeclaredMethod("enabled");goodEnabled.setAccessible(true);
        require(Boolean.TRUE.equals(goodEnabled.invoke(null)),"SAMPLER_ENABLED_NOT_RESTORED");
        for(String nested:List.of("$Probe","$Session")) {
            byte[] nestedOriginal=eff.get(sampler+nested+".class");
            require(nestedOriginal!=null,"SAMPLER_NESTED_MISSING");
            require(Arrays.equals(nestedOriginal,call(nestedOriginal.clone(),sampler+nested,"pass")),"SAMPLER_NESTED_CHANGED");
            byte[] corrupt=nestedOriginal.clone();corrupt[corrupt.length-1]^=1;
            try{call(corrupt,sampler+nested,"pass");throw new AssertionError("SAMPLER_NESTED_NOT_AUTHENTICATED");}catch(SecurityException expected){}
        }
        System.clearProperty("eff.entityGuardSelftest");
        System.out.println("OWNED_SAMPLER_ORIGIN_OK callbacksRetained=true falseReturnRestored=true prepareReturnRestoredBytes=true nestedAuthenticated=true");
        String arena="eff/minecraft/EffArena";byte[] arenaOriginal=eff.get(arena+".class");
        require(arenaOriginal!=null,"ARENA_REVIEWED_CLASS_MISSING");int arenaBefore=callbacks;
        byte[] arenaResult=call(arenaOriginal.clone(),arena,"arena-empty-roster"),arenaTampered=lastTransformed.clone();
        require(callbacks==arenaBefore+1,"ARENA_TRANSFORMER_SKIPPED");
        require(Arrays.equals(lib.get("META-INF/eff-owned-origin/archive/"+arena+".class"),arenaResult),"ARENA_CANONICAL_NOT_RESTORED_BYTE_EXACT");
        require(!Arrays.equals(arenaOriginal,arenaResult),"ARENA_NECESSARY_GATE_STRIPPED");
        var originals=new ArrayList<Object>(List.of(new Object(),new Object(),new Object()));
        require(roster(arenaTampered,originals).isEmpty(),"EMPTY_LIST_NEGATIVE_CONTROL_FAILED");
        var snapshot=roster(arenaResult,originals);require(snapshot.size()==3&&originals.size()==3,"ORIGINAL_ROSTER_LOST");
        for(int i=0;i<3;i++)require(snapshot.get(i)==originals.get(i),"ORIGINAL_ENTITY_IDENTITY_SUBSTITUTED");
        originals.remove(0);require(snapshot.size()==3&&roster(arenaResult,originals).size()==2,"ROSTER_SNAPSHOT_STALE_OR_ALIAS");
        try{snapshot.clear();throw new AssertionError("ORIGINAL_ROSTER_SNAPSHOT_MUTABLE");}catch(UnsupportedOperationException expected){}
        byte[] arenaWrong=arenaOriginal.clone();arenaWrong[arenaWrong.length-1]^=1;int beforeWrongArena=callbacks;
        try{call(arenaWrong,arena,"pass");throw new AssertionError("ARENA_BAD_HASH_ACCEPTED");}catch(SecurityException expected){}
        require(callbacks==beforeWrongArena,"UNAUTHENTICATED_ARENA_TRANSFORMED");
        byte[] placement=eff.get(arena+"$Placement.class");require(placement!=null&&Arrays.equals(placement,call(placement.clone(),arena+"$Placement","pass")),"ARENA_RECORD_CHANGED");
        canonicalNegativeControls(lib,arenaOriginal,arenaResult);
        System.out.println("OWNED_ARENA_ROSTER_ORIGIN_OK callbacksRetained=true emptyListNegativeControl=true restoredByteExact=true originalEntityIdentity=true liveReadImmutableSnapshot=true wrongHashRejected=true schemaUnchanged=true gameInitialized=false");
        byte[] wrong=original.clone();wrong[wrong.length-1]^=1;int before=callbacks;
        try{call(wrong,OwnedOriginPatch.RAW,"pass");throw new AssertionError("WRONG_HASH_ACCEPTED");}catch(SecurityException expected){require(expected.getMessage().startsWith("EFF_OWNED_ORIGIN_MISMATCH:"),"WRONG_FAILURE");}
        require(callbacks==before,"UNAUTHENTICATED_INPUT_REACHED_PIPELINE");
        try{call(original.clone(),OwnedOriginPatch.RAW,"fail");throw new AssertionError("PIPELINE_FAILURE_SWALLOWED");}catch(RuntimeException expected){require(expected==FAILURE,"FAILURE_IDENTITY_CHANGED");}
        require(Thread.currentThread().getContextClassLoader()==prior,"EXCEPTION_CONTEXT_NOT_RESTORED");
        Map<String,byte[]> mc=OwnedOriginPatch.entries(Path.of(args[2]));String mcName="net/minecraft/world/entity/Entity";byte[] mcInput=mc.get(mcName+".class");
        byte[] mcResult=call(mcInput.clone(),mcName,"mc-change");require(mcResult==lastTransformed,"MC_RESULT_NOT_PASSTHROUGH");require(!Arrays.equals(mcInput,mcResult),"MC_PLUGIN_DID_NOT_CHANGE");
        // Actual sample transformer bytecode is not allowlisted or changed. Do not execute its native-dependent entry.
        Map<String,byte[]> sample=OwnedOriginPatch.entries(Path.of(args[3]));String sampleName="com/wzz/forever_love_sword/core/transformer/TryCatchWrapperTransformer";byte[] sampleInput=sample.get(sampleName+".class");
        require(sampleInput!=null,"SAMPLE_CLASS_MISSING");require(call(sampleInput,sampleName,"pass")==sampleInput,"SAMPLE_NOT_PASSTHROUGH");
        byte[] second=call(original.clone(),OwnedOriginPatch.RAW,"pass");recovered[0]=0;require(Arrays.equals(second,original),"RETURN_BUFFER_REUSED");
        System.out.println("OWNED_ORIGIN_TEST_OK actualOuterAndContextWrappers=true pluginsInvoked=true earlyReturnRestored=true wrongHashRejected=true noArrayAlias=true identicalException=true actualMinecraftClassResultUnchanged=true originalSampleClassPassthrough=true nativeSampleExecuted=false");
    }
}
