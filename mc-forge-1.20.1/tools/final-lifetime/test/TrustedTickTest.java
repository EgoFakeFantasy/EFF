package eff.finalgate;
import java.nio.file.*;
import java.util.*;
import java.util.jar.*;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;

public final class TrustedTickTest implements Opcodes {
  static final String OWNER=TrustedTickTransform.OWNER;
  static void check(boolean yes,String reason){if(!yes)throw new AssertionError(reason);}
  static ClassNode read(byte[] b){ClassNode n=new ClassNode();new ClassReader(b).accept(n,ClassReader.EXPAND_FRAMES);return n;}
  static byte[] bytes(ClassNode n){ClassWriter w=new ClassWriter(ClassWriter.COMPUTE_MAXS);n.accept(w);return w.toByteArray();}
  static MethodNode tick(ClassNode n){return n.methods.stream().filter(m->m.name.equals("m_9933_")).findFirst().orElseThrow();}
  static byte[] canceled(byte[] b){ClassNode n=read(b);MethodNode m=tick(n);m.instructions.clear();m.tryCatchBlocks.clear();m.localVariables=null;
    m.instructions.add(new VarInsnNode(ALOAD,0));m.instructions.add(new InsnNode(DUP));m.instructions.add(new FieldInsnNode(GETFIELD,OWNER,"foreignCalls","I"));
    m.instructions.add(new InsnNode(ICONST_1));m.instructions.add(new InsnNode(IADD));m.instructions.add(new FieldInsnNode(PUTFIELD,OWNER,"foreignCalls","I"));
    m.instructions.add(new InsnNode(RETURN));m.maxLocals=1;return bytes(n);}
  static void verify(byte[] input,Path fixtures,boolean guardMustThrow)throws Exception{
    ClassLoader loader=new ClassLoader(TrustedTickTest.class.getClassLoader()){
      @Override protected Class<?> findClass(String name)throws ClassNotFoundException{try{
        byte[] b=name.equals(OWNER.replace('/','.'))?input:Files.readAllBytes(fixtures.resolve(name.replace('.','/')+".class"));return defineClass(name,b,0,b.length);
      }catch(Exception e){throw new ClassNotFoundException(name,e);}}
    };
    Class<?> type=loader.loadClass(OWNER.replace('/','.')),player=loader.loadClass("net.minecraft.server.level.ServerPlayer");
    Object connection=type.getConstructor().newInstance(),original=type.getField("f_9743_").get(connection);
    var invoke=type.getMethod("m_9933_");
    // Non-owned original tail stays exactly as supplied.
    invoke.invoke(connection);check(type.getField("foreignCalls").getInt(connection)==1,"ordinary callback retained");
    check(player.getField("ticks").getInt(original)==0,"ordinary original not secretly ticked");
    player.getField("owned").setBoolean(original,true);
    if(guardMustThrow){
      loader.loadClass("eff.lifetime.FieldWriteGate").getField("fail").setBoolean(null,true);
      try{invoke.invoke(connection);throw new AssertionError("foreign handler swallowed ownership failure");}
      catch(java.lang.reflect.InvocationTargetException expected){check(expected.getCause() instanceof IllegalStateException,"guard exception preserved");}
      check(type.getField("foreignCalls").getInt(connection)==1,"exception never entered foreign body");return;
    }
    for(int i=0;i<3;i++)invoke.invoke(connection);
    check(player.getField("ticks").getInt(original)==3,"original receives exactly one normal tick per call");
    check(type.getField("keepAlives").getInt(connection)==3,"normal connection work retained");
    check(type.getField("foreignCalls").getInt(connection)==1,"claimed original avoids canceled tail");
    check(original==type.getField("f_9743_").get(connection),"original reference retained");
    player.getField("owned").setBoolean(original,false);invoke.invoke(connection);
    check(type.getField("foreignCalls").getInt(connection)==2,"release restores supplied flow");
    check(player.getField("ticks").getInt(original)==3,"release never replays ticks");
  }
  public static void main(String[] args)throws Exception{
    if(args.length==1&&args[0].equals("--pin-negative")){
      try{TrustedTickTransform.transform(new byte[0]);throw new AssertionError("tampered template accepted");}
      catch(SecurityException expected){check(expected.getMessage().equals("TRUSTED_TICK_TEMPLATE_HASH"),"hash checked before template parsing");}
      System.out.println("TRUSTED_TICK_BAD_TEMPLATE_REJECTED");return;
    }
    Path fixtures=Path.of(args[0]);byte[] trusted=Files.readAllBytes(fixtures.resolve(OWNER+".class")),hostile=canceled(trusted);
    byte[] sealed=TrustedTickTransform.apply(hostile,trusted);verify(sealed,fixtures,false);
    check(Arrays.equals(sealed,TrustedTickTransform.apply(sealed,trusted)),"idempotent exact executable head");
    ClassNode source=read(hostile),result=read(sealed);check(source.methods.size()==result.methods.size()&&source.fields.size()==result.fields.size(),"no schema added");
    // Retaining markers while changing a tick call cannot authorize a corrupted head.
    ClassNode changed=read(sealed);boolean edited=false;
    for(AbstractInsnNode insn:tick(changed).instructions)if(insn instanceof MethodInsnNode call&&call.name.equals("m_9240_")){call.name="fakeTick";edited=true;break;}
    check(edited,"mutated actual protected call");byte[] restored=TrustedTickTransform.apply(bytes(changed),trusted);verify(restored,fixtures,false);
    check(Arrays.equals(restored,TrustedTickTransform.apply(restored,trusted)),"reasserted head is idempotent");
    // A handler spanning a retained exact prefix must not catch the new ownership check.
    changed=read(sealed);MethodNode m=tick(changed);LabelNode start=new LabelNode(),end=new LabelNode(),handler=new LabelNode();
    m.instructions.insert(start);m.instructions.add(end);m.instructions.add(handler);
    m.instructions.add(new FrameNode(F_NEW,1,new Object[]{OWNER},1,new Object[]{"java/lang/Throwable"}));
    m.instructions.add(new InsnNode(POP));m.instructions.add(new InsnNode(RETURN));m.tryCatchBlocks.add(new TryCatchBlockNode(start,end,handler,"java/lang/Throwable"));
    verify(TrustedTickTransform.apply(bytes(changed),trusted),fixtures,true);
    // A changed receiver schema is a refused candidate, not a guessed repair.
    changed=read(hostile);changed.fields.removeIf(f->f.name.equals("f_9743_"));
    try{TrustedTickTransform.apply(bytes(changed),trusted);throw new AssertionError("missing player field accepted");}catch(IllegalStateException expected){}
    byte[] real;try(JarFile jar=new JarFile(args[1])){real=jar.getInputStream(jar.getJarEntry(OWNER+".class")).readAllBytes();}
    byte[] actual=TrustedTickTransform.transform(real);
    check(Arrays.equals(actual,TrustedTickTransform.transform(actual)),"actual Forge template idempotence");
    ClassNode actualNode=read(actual);check(read(real).methods.size()==actualNode.methods.size()&&read(real).fields.size()==actualNode.fields.size(),"actual Forge schema retained");
    Files.write(Path.of(args[2]),actual,StandardOpenOption.CREATE_NEW);
    System.out.println("TRUSTED_TICK_OFFLINE_OK syntheticExecution=true actualForgeShape=true mcExecuted=false");
  }
}
