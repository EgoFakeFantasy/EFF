import java.lang.instrument.*;
import java.lang.reflect.*;
import java.nio.file.*;
import java.security.ProtectionDomain;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;
import proof.ControlAgent;

public final class CombinedLifetimeTest implements Opcodes {
    static void check(boolean value,String reason){if(!value)throw new AssertionError(reason);}
    static final class Loader extends ClassLoader {
        final Map<String,byte[]> definitions;
        Loader(Map<String,byte[]> values){definitions=values;}
        Class<?> define(String n,byte[] b){return defineClass(n.replace('/','.'),b,0,b.length);}
        protected Class<?> findClass(String n)throws ClassNotFoundException{byte[] b=definitions.get(n.replace('.','/')+".class");if(b==null)throw new ClassNotFoundException(n);return define(n,b);}
    }
    static byte[] late(byte[] bytes){
        ClassNode node=new ClassNode();new ClassReader(bytes).accept(node,0);
        for(MethodNode method:node.methods)if(method.name.equals("getHealth")){
            method.instructions.clear();method.tryCatchBlocks.clear();if(method.localVariables!=null)method.localVariables.clear();
            method.instructions.add(new LdcInsnNode(-77f));method.instructions.add(new InsnNode(FRETURN));method.maxLocals=1;method.maxStack=1;
        }
        ClassWriter writer=new ClassWriter(0);node.accept(writer);return writer.toByteArray();
    }
    static byte[] brokenProvider(byte[] bytes){
        ClassNode node=new ClassNode();new ClassReader(bytes).accept(node,0);
        for(MethodNode method:node.methods)if(method.name.equals("apply")&&method.desc.equals("(Ljava/lang/String;[B)[B")){
            method.instructions.clear();method.tryCatchBlocks.clear();if(method.localVariables!=null)method.localVariables.clear();
            method.instructions.add(new InsnNode(ACONST_NULL));method.instructions.add(new InsnNode(ARETURN));method.maxLocals=3;method.maxStack=1;
        }
        ClassWriter writer=new ClassWriter(0);node.accept(writer);return writer.toByteArray();
    }
    public static void main(String[] args)throws Exception{
        // Fixture probe is intentionally in another loader. Claim authenticated production
        // probe first, without initializing it; do not weaken production hash acceptance.
        Map<String,byte[]> real=OwnedOriginPatch.entries(Path.of(args[0]));
        Loader trusted=new Loader(real);Class<?> claim=trusted.loadClass("eff.minecraft.ProjectionProbe");
        Map<String,byte[]> definitions=new HashMap<>();Path fixtures=Path.of(args[1]);
        try(var walk=Files.walk(fixtures)){for(Path p:walk.filter(p->p.toString().endsWith(".class")).toList())definitions.put(fixtures.relativize(p).toString().replace('\\','/'),Files.readAllBytes(p));}
        AtomicInteger callbacks=new AtomicInteger();
        ClassFileTransformer late=new ClassFileTransformer(){public byte[] transform(ClassLoader l,String n,Class<?> c,ProtectionDomain d,byte[] b){
            if("eff/ownedagent/LifetimeProvider".equals(n))return brokenProvider(b);
            if("net/minecraft/world/entity/Entity".equals(n)){b[0]=0;return null;}
            if("net/minecraft/world/entity/LivingEntity".equals(n)){callbacks.incrementAndGet();return late(b);}return null;
        }};
        Instrumentation inst=ControlAgent.instrumentation;inst.addTransformer(late,true);
        Class<?> provider=Class.forName("eff.ownedagent.LifetimeProvider");byte[] providerBytes;
        try(var in=provider.getResourceAsStream("/eff/ownedagent/LifetimeProvider.class")){providerBytes=in.readAllBytes();}
        inst.redefineClasses(new ClassDefinition(provider,brokenProvider(providerBytes)));
        Object callback=provider.getConstructor().newInstance();Method apply=provider.getMethod("apply",String.class,byte[].class);
        check(apply.invoke(callback,"net/minecraft/world/entity/LivingEntity",definitions.get("net/minecraft/world/entity/LivingEntity.class"))!=null,"provider redefine must retain callback");
        inst.retransformClasses(provider);check(apply.invoke(callback,"net/minecraft/world/entity/LivingEntity",definitions.get("net/minecraft/world/entity/LivingEntity.class"))!=null,"provider retransform must retain callback");
        Class<?> otherProvider=new Loader(Map.of()).define("eff/ownedagent/LifetimeProvider",providerBytes);
        check(otherProvider.getMethod("apply",String.class,byte[].class).invoke(otherProvider.getConstructor().newInstance(),"net/minecraft/world/entity/LivingEntity",definitions.get("net/minecraft/world/entity/LivingEntity.class"))==null,"other provider loader must stay unprotected");
        try{
            Class.forName("eff.ownedboot.OwnedBoundary",false,null).getMethod("installLifetime",java.util.function.BiFunction.class,Class[].class,byte[][].class).invoke(null,callback,new Class<?>[0],new byte[0][]);
            throw new AssertionError("LATE_REGISTRATION_ACCEPTED");
        }catch(InvocationTargetException expected){check(expected.getCause() instanceof IllegalStateException,"registry is frozen");}
        Loader loader=new Loader(definitions);Class<?> living=loader.loadClass("net.minecraft.world.entity.LivingEntity"),entity=loader.loadClass("net.minecraft.world.entity.Entity");
        Object owned=living.getConstructor().newInstance(),ordinary=living.getConstructor().newInstance();entity.getField("owned").setBoolean(owned,true);
        Method health=living.getMethod("getHealth"),alive=living.getMethod("isAlive");
        check(callbacks.get()>0&&(float)health.invoke(owned)==20f&&(float)health.invoke(ordinary)==-77f,"late callback executes; actual storage for owned only");
        check(!(boolean)entity.getMethod("isRemoved").invoke(owned)&&(boolean)entity.getMethod("isRemoved").invoke(ordinary),"null transformer result still guarded from isolated input");
        check(entity.getMethod("getBoundingBox").invoke(owned)==entity.getField("bb").get(owned),"actual bounds identity");
        living.getField("rawHealth").setFloat(owned,0);check((float)health.invoke(owned)==0&&!(boolean)alive.invoke(owned),"actual zero is not forged healthy");
        living.getField("rawHealth").setFloat(owned,Float.NaN);check(Float.isNaN((float)health.invoke(owned))&&!(boolean)alive.invoke(owned),"actual NaN preserved");living.getField("rawHealth").setFloat(owned,20);
        int before=callbacks.get();inst.retransformClasses(living);check(callbacks.get()>before&&(float)health.invoke(owned)==20f,"late retransform guarded");
        before=callbacks.get();inst.redefineClasses(new ClassDefinition(living,late(definitions.get("net/minecraft/world/entity/LivingEntity.class"))));check(callbacks.get()>before&&(float)health.invoke(owned)==20f,"late redefine guarded");
        Class<?> lookup=loader.loadClass("net.minecraft.world.level.entity.EntityLookup");Object index=lookup.getConstructor().newInstance();
        Map<Object,Object> entries=(Map<Object,Object>)lookup.getField("byId").get(index);entries.put(12,owned);check(lookup.getMethod("getEntity",int.class).invoke(index,12)==owned,"actual index identity");entries.clear();check(lookup.getMethod("getEntity",int.class).invoke(index,12)==null,"absent index not resurrected");
        Class<?> clientLevel=loader.loadClass("net.minecraft.client.multiplayer.ClientLevel");Object world=clientLevel.getConstructor().newInstance();
        Object clientIndex=clientLevel.getField("index").get(world);Map<Object,Object> clientEntries=(Map<Object,Object>)lookup.getField("byId").get(clientIndex);clientEntries.put(12,owned);
        check(clientLevel.getMethod("getEntity",int.class).invoke(world,12)==owned,"outer client getter returns raw registered identity");clientEntries.clear();check(clientLevel.getMethod("getEntity",int.class).invoke(world,12)==null,"outer client getter cannot resurrect absent");
        Class<?> serverLevel=loader.loadClass("net.minecraft.server.level.ServerLevel");Object serverWorld=serverLevel.getConstructor().newInstance();
        Object serverIndex=serverLevel.getField("index").get(serverWorld);Map<Object,Object> serverEntries=(Map<Object,Object>)lookup.getField("byId").get(serverIndex);serverEntries.put(12,owned);
        check(serverLevel.getMethod("getEntity",int.class).invoke(serverWorld,12)==owned,"outer server getter returns actual owned entry");serverEntries.clear();check(serverLevel.getMethod("getEntity",int.class).invoke(serverWorld,12)==null,"outer server getter cannot resurrect absent");serverEntries.put(12,ordinary);check(serverLevel.getMethod("getEntity",int.class).invoke(serverWorld,12)==null,"server ordinary callback preserved");
        // A malformed selected class must not silently load without a valid final pass.
        ClassWriter invalid=new ClassWriter(0);invalid.visit(V17,ACC_PUBLIC,"net/minecraft/world/entity/Entity",null,"java/lang/Object",null);invalid.visitEnd();
        try{new Loader(Map.of()).define("net/minecraft/world/entity/Entity",invalid.toByteArray());throw new AssertionError("MALFORMED_TARGET_ACCEPTED");}catch(ClassFormatError expected){}
        check(claim.getClassLoader()==trusted,"keep precise initial claim reachable");
        System.out.println("COMBINED_LIFETIME_TEST_OK lateCallbacks="+callbacks+" initial=true redefine=true retransform=true nullResultInput=true actualHealthZeroNaN=true actualIndexIdentity=true absentRemainsAbsent=true malformedFailClosed=true providerRedefineProtected=true providerOtherLoaderUnprotected=true providerRegistryFrozen=true");
    }
}
