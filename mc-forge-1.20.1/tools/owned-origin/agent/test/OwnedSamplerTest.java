import java.lang.instrument.*;
import java.lang.reflect.*;
import java.nio.file.*;
import java.security.ProtectionDomain;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;
import proof.ControlAgent;
import sun.misc.Unsafe;

/** Actual sampler code, actual installed boundary; synthetic late callback and writes only. */
public final class OwnedSamplerTest implements Opcodes {
  static final String NAME="eff/minecraft/lab/LabThreadSampler";
  static Map<String,byte[]> classes;
  static final AtomicInteger callbacks=new AtomicInteger();
  static class Loader extends ClassLoader {
    protected Class<?> findClass(String name)throws ClassNotFoundException {
      if(!name.equals(NAME.replace('/','.'))&&!name.startsWith(NAME.replace('/','.')+"$"))throw new ClassNotFoundException(name);
      byte[] bytes=classes.get(name.replace('.','/')+".class");
      if(bytes==null)throw new ClassNotFoundException(name);
      return defineClass(name,bytes,0,bytes.length);
    }
  }
  static byte[] changed(byte[] input) {
    ClassNode node=new ClassNode();new ClassReader(input).accept(node,0);
    for(MethodNode m:node.methods)if(m.name.equals("enabled")&&m.desc.equals("()Z")||m.name.equals("prepare")&&m.desc.equals("()V")) {
      m.instructions.clear();m.tryCatchBlocks.clear();if(m.localVariables!=null)m.localVariables.clear();
      if(m.desc.equals("()Z")){m.instructions.add(new InsnNode(ICONST_0));m.instructions.add(new InsnNode(IRETURN));}
      else m.instructions.add(new InsnNode(RETURN));
      m.maxStack=1;m.maxLocals=0;
    }
    ClassWriter writer=new ClassWriter(0);node.accept(writer);return writer.toByteArray();
  }
  static void require(boolean ok,String why){if(!ok)throw new AssertionError(why);}
  static Field field(Class<?> owner,String name)throws Exception{Field f=owner.getDeclaredField(name);f.setAccessible(true);return f;}
  static boolean enabled(Class<?> type)throws Exception{Method m=type.getDeclaredMethod("enabled");m.setAccessible(true);return (boolean)m.invoke(null);}
  public static void main(String[] args)throws Exception {
    classes=OwnedOriginPatch.entries(Path.of(args[0]));
    System.setProperty("eff.entityGuardSelftest","true");
    ClassFileTransformer late=new ClassFileTransformer(){public byte[] transform(ClassLoader l,String n,Class<?> c,ProtectionDomain d,byte[] b){
      if(NAME.equals(n)){callbacks.incrementAndGet();return changed(b);}return null;
    }};
    var inst=ControlAgent.instrumentation;inst.addTransformer(late,true);
    Loader loader=new Loader();Class<?> sampler=Class.forName(NAME.replace('/','.'),true,loader);
    require(enabled(sampler),"INITIAL_FALSE_RETURN_SURVIVED");
    int before=callbacks.get();inst.redefineClasses(new ClassDefinition(sampler,changed(classes.get(NAME+".class"))));
    require(callbacks.get()>before&&enabled(sampler),"REDEFINE_FALSE_RETURN_SURVIVED");
    before=callbacks.get();inst.retransformClasses(sampler);
    require(callbacks.get()>before&&enabled(sampler),"RETRANSFORM_FALSE_RETURN_SURVIVED");
    sampler.getMethod("prepare").invoke(null);
    Field prepared=field(sampler,"preparedProbe"),started=field(sampler,"preparationStarted");
    long end=System.nanoTime()+3_000_000_000L;
    while(prepared.get(null)==null&&System.nanoTime()<end)Thread.sleep(10);
    Object probe=prepared.get(null);
    require(probe!=null&&started.getBoolean(null),"PREPARE_EARLY_RETURN_SURVIVED_OR_DIRECT_PUTSTATIC_BLOCKED");
    prepared.set(null,null);started.setBoolean(null,false);
    require(prepared.get(null)==probe&&started.getBoolean(null),"REFLECTION_STATIC_RESET_SUCCEEDED");
    Field uf=Unsafe.class.getDeclaredField("theUnsafe");uf.setAccessible(true);Unsafe u=(Unsafe)uf.get(null);
    u.putObjectVolatile(u.staticFieldBase(prepared),u.staticFieldOffset(prepared),null);
    u.putBoolean(u.staticFieldBase(started),u.staticFieldOffset(started),false);
    require(prepared.get(null)==probe&&started.getBoolean(null),"UNSAFE_STATIC_RESET_SUCCEEDED");
    for(String nested:List.of("$Probe","$Session"))Class.forName(NAME.replace('/','.')+nested,false,loader);
    Class<?> foreign=Class.forName(NAME.replace('/','.'),true,new Loader());
    require(!enabled(foreign),"OTHER_LOADER_TRANSFORM_FILTERED");
    Field foreignStarted=field(foreign,"preparationStarted");foreignStarted.setBoolean(null,true);
    require(foreignStarted.getBoolean(null),"OTHER_LOADER_STATIC_WRITE_BLOCKED");
    require(inst.removeTransformer(late),"REMOVE_TEST_CALLBACK_FAILED");
    System.out.println("OWNED_SAMPLER_AGENT_OK initialFalseReturn=true redefine=true retransform=true prepareExecutes=true directStaticUpdates=true reflectionResetDenied=true unsafeResetDenied=true nestedLoaded=true otherLoaderUnchanged=true callbacks="+callbacks.get());
  }
}
