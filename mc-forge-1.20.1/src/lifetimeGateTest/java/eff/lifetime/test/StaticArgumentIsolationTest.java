package eff.lifetime.test;

import eff.lifetime.StaticArgumentIsolation;
import java.util.*;
import java.util.concurrent.*;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;
import org.objectweb.asm.tree.analysis.*;

/** Executes independent emitted bytecode, including deterministic two-thread interference.
 * The optional JAR argument is inspected as data only; no specimen class is loaded or invoked.
 */
public final class StaticArgumentIsolationTest implements Opcodes {
  private static ClassNode fixture(String name, String descriptor, String fieldDescriptor) {
    ClassNode owner = new ClassNode();owner.version=V17;owner.access=ACC_PUBLIC;
    owner.name="proof/"+name;owner.superName="java/lang/Object";
    owner.fields.add(new FieldNode(ACC_PRIVATE|ACC_STATIC,"scratch",fieldDescriptor,null,null));
    owner.methods.add(new MethodNode(ACC_PUBLIC|ACC_STATIC,"invoke",descriptor,null,null));
    return owner;
  }
  private static ClassNode concurrentFixture() {
    ClassNode owner=fixture("ConcurrentScratch","(Ljava/lang/Object;Ljava/util/concurrent/CountDownLatch;Ljava/util/concurrent/CountDownLatch;)Ljava/lang/Object;","Ljava/lang/Object;");
    MethodNode m=owner.methods.get(0);m.maxLocals=3;m.maxStack=1;
    m.instructions.add(new VarInsnNode(ALOAD,0));m.instructions.add(new FieldInsnNode(PUTSTATIC,owner.name,"scratch","Ljava/lang/Object;"));
    m.instructions.add(new VarInsnNode(ALOAD,1));m.instructions.add(new MethodInsnNode(INVOKEVIRTUAL,"java/util/concurrent/CountDownLatch","countDown","()V",false));
    m.instructions.add(new VarInsnNode(ALOAD,2));m.instructions.add(new MethodInsnNode(INVOKEVIRTUAL,"java/util/concurrent/CountDownLatch","await","()V",false));
    m.instructions.add(new FieldInsnNode(GETSTATIC,owner.name,"scratch","Ljava/lang/Object;"));m.instructions.add(new InsnNode(ARETURN));return owner;
  }
  private static Class<?> define(ClassNode owner) {
    ClassWriter writer=new ClassWriter(ClassWriter.COMPUTE_FRAMES);owner.accept(writer);byte[] bytes=writer.toByteArray();
    return new ClassLoader(StaticArgumentIsolationTest.class.getClassLoader()) {
      Class<?> load(){return defineClass(owner.name.replace('/','.'),bytes,0,bytes.length);}
    }.load();
  }
  private static void require(boolean condition,String why){if(!condition)throw new AssertionError(why);}
  private static void concurrent(boolean normalize) throws Exception {
    ClassNode owner=concurrentFixture();
    if(normalize)require(StaticArgumentIsolation.instrument(owner).size()==1,"CONCURRENT_PATTERN_NOT_FOUND");
    var call=define(owner).getMethod("invoke",Object.class,CountDownLatch.class,CountDownLatch.class);
    Object first=new Object(),second=new Object();Object[] results=new Object[2];Throwable[] errors=new Throwable[2];
    CountDownLatch firstPublished=new CountDownLatch(1),secondPublished=new CountDownLatch(1),release=new CountDownLatch(1);
    Thread a=new Thread(()->{try{results[0]=call.invoke(null,first,firstPublished,release);}catch(Throwable error){errors[0]=error;}});
    Thread b=new Thread(()->{try{results[1]=call.invoke(null,second,secondPublished,release);}catch(Throwable error){errors[1]=error;}});
    try {
      a.start();require(firstPublished.await(3,TimeUnit.SECONDS),"FIRST_CALL_DID_NOT_PUBLISH");
      b.start();require(secondPublished.await(3,TimeUnit.SECONDS),"SECOND_CALL_DID_NOT_PUBLISH");release.countDown();
      a.join(3000);b.join(3000);require(!a.isAlive()&&!b.isAlive(),"CALL_STALLED");
      require(errors[0]==null&&errors[1]==null,"CALL_FAILED:"+Arrays.toString(errors));
      require(results[0]==(normalize?first:second)&&results[1]==second,"CONCURRENT_ARGUMENT_IDENTITY");
    }finally{release.countDown();a.interrupt();b.interrupt();}
  }
  private static void recursive() throws Exception {
    ClassNode owner=fixture("RecursiveScratch","(I)I","I");MethodNode m=owner.methods.get(0);m.maxLocals=1;m.maxStack=2;
    m.instructions.add(new VarInsnNode(ILOAD,0));m.instructions.add(new FieldInsnNode(PUTSTATIC,owner.name,"scratch","I"));
    LabelNode done=new LabelNode();m.instructions.add(new VarInsnNode(ILOAD,0));m.instructions.add(new JumpInsnNode(IFEQ,done));
    m.instructions.add(new VarInsnNode(ILOAD,0));m.instructions.add(new InsnNode(ICONST_1));m.instructions.add(new InsnNode(ISUB));
    m.instructions.add(new MethodInsnNode(INVOKESTATIC,owner.name,"invoke","(I)I",false));m.instructions.add(new InsnNode(POP));m.instructions.add(done);
    m.instructions.add(new FieldInsnNode(GETSTATIC,owner.name,"scratch","I"));m.instructions.add(new InsnNode(IRETURN));
    require(define(owner).getMethod("invoke",int.class).invoke(null,5).equals(0),"ORIGINAL_REENTRANT_INTERFERENCE");
    require(StaticArgumentIsolation.instrument(owner).size()==1,"REENTRANT_PATTERN_NOT_FOUND");
    require(define(owner).getMethod("invoke",int.class).invoke(null,5).equals(5),"REENTRANT_ARGUMENT_NOT_ISOLATED");
    require(StaticArgumentIsolation.instrument(owner).isEmpty(),"NOT_IDEMPOTENT");
  }
  private static void wide() throws Exception {
    ClassNode owner=fixture("WideScratch","(J)J","J");MethodNode m=owner.methods.get(0);m.maxLocals=2;m.maxStack=2;
    m.instructions.add(new VarInsnNode(LLOAD,0));m.instructions.add(new FieldInsnNode(PUTSTATIC,owner.name,"scratch","J"));
    m.instructions.add(new FieldInsnNode(GETSTATIC,owner.name,"scratch","J"));m.instructions.add(new InsnNode(LRETURN));
    require(StaticArgumentIsolation.instrument(owner).size()==1,"WIDE_ARGUMENT_REJECTED");
    require(define(owner).getMethod("invoke",long.class).invoke(null,Long.MIN_VALUE).equals(Long.MIN_VALUE),"WIDE_ARGUMENT_CORRUPTED");
  }
  private static void exceptional() throws Exception {
    ClassNode owner=fixture("ExceptionalScratch","(Ljava/lang/Object;Z)Ljava/lang/Object;","Ljava/lang/Object;");
    MethodNode m=owner.methods.get(0);m.maxLocals=3;m.maxStack=2;
    m.instructions.add(new VarInsnNode(ALOAD,0));m.instructions.add(new FieldInsnNode(PUTSTATIC,owner.name,"scratch","Ljava/lang/Object;"));
    LabelNode start=new LabelNode(),normal=new LabelNode(),end=new LabelNode(),handler=new LabelNode();m.instructions.add(start);
    m.instructions.add(new VarInsnNode(ILOAD,1));m.instructions.add(new JumpInsnNode(IFEQ,normal));
    m.instructions.add(new TypeInsnNode(NEW,"java/lang/IllegalStateException"));m.instructions.add(new InsnNode(DUP));
    m.instructions.add(new MethodInsnNode(INVOKESPECIAL,"java/lang/IllegalStateException","<init>","()V",false));m.instructions.add(new InsnNode(ATHROW));
    m.instructions.add(normal);m.instructions.add(new FieldInsnNode(GETSTATIC,owner.name,"scratch","Ljava/lang/Object;"));m.instructions.add(new InsnNode(ARETURN));m.instructions.add(end);
    m.instructions.add(handler);m.instructions.add(new VarInsnNode(ASTORE,2));m.instructions.add(new FieldInsnNode(GETSTATIC,owner.name,"scratch","Ljava/lang/Object;"));m.instructions.add(new InsnNode(ARETURN));
    m.tryCatchBlocks.add(new TryCatchBlockNode(start,end,handler,"java/lang/IllegalStateException"));
    require(StaticArgumentIsolation.instrument(owner).size()==1,"VALID_EXCEPTION_DOMINANCE_REJECTED");
    var invoke=define(owner).getMethod("invoke",Object.class,boolean.class);Object value=new Object();
    require(invoke.invoke(null,value,true)==value&&invoke.invoke(null,value,false)==value,"EXCEPTION_IDENTITY_CHANGED");
    // Moving the protected region before the write lets the handler read an old invocation.
    ClassNode rejected=concurrentFixture();MethodNode r=rejected.methods.get(0);LabelNode a=new LabelNode(),b=new LabelNode(),h=new LabelNode();
    r.instructions.insert(a);r.instructions.add(b);r.instructions.add(h);r.instructions.add(new InsnNode(POP));
    r.instructions.add(new FieldInsnNode(GETSTATIC,rejected.name,"scratch","Ljava/lang/Object;"));r.instructions.add(new InsnNode(ARETURN));
    r.tryCatchBlocks.add(new TryCatchBlockNode(a,b,h,"java/lang/Throwable"));require(StaticArgumentIsolation.instrument(rejected).isEmpty(),"PREWRITE_EXCEPTION_PATH_ACCEPTED");
  }
  private static void rejectedShapes() {
    ClassNode c=concurrentFixture();c.fields.get(0).access|=ACC_VOLATILE;require(StaticArgumentIsolation.instrument(c).isEmpty(),"VOLATILE_CHANNEL_REWRITTEN");
    c=concurrentFixture();c.nestHostClass="proof/Host";require(StaticArgumentIsolation.instrument(c).isEmpty(),"NESTMATE_ACCESS_IGNORED");
    c=concurrentFixture();MethodNode extra=new MethodNode(ACC_PUBLIC|ACC_STATIC,"observer","()Ljava/lang/Object;",null,null);
    extra.instructions.add(new FieldInsnNode(GETSTATIC,c.name,"scratch","Ljava/lang/Object;"));extra.instructions.add(new InsnNode(ARETURN));c.methods.add(extra);
    require(StaticArgumentIsolation.instrument(c).isEmpty(),"MULTIMETHOD_CHANNEL_REWRITTEN");
    c=concurrentFixture();InsnList early=new InsnList();early.add(new FieldInsnNode(GETSTATIC,c.name,"scratch","Ljava/lang/Object;"));early.add(new InsnNode(POP));c.methods.get(0).instructions.insert(early);
    require(StaticArgumentIsolation.instrument(c).isEmpty(),"READ_BEFORE_WRITE_REWRITTEN");
    c=concurrentFixture();c.methods.get(0).instructions.insert(new LdcInsnNode(new Handle(H_GETSTATIC,c.name,"scratch","Ljava/lang/Object;",false)));
    require(StaticArgumentIsolation.instrument(c).isEmpty(),"ESCAPED_HANDLE_IGNORED");
    c=concurrentFixture();InsnList write=new InsnList();write.add(new VarInsnNode(ALOAD,0));write.add(new FieldInsnNode(PUTSTATIC,c.name,"scratch","Ljava/lang/Object;"));c.methods.get(0).instructions.insert(write);
    require(StaticArgumentIsolation.instrument(c).isEmpty(),"MULTIWRITE_STATE_REWRITTEN");
    c=concurrentFixture();c.methods.get(0).instructions.set(c.methods.get(0).instructions.getFirst(),new InsnNode(ACONST_NULL));
    require(StaticArgumentIsolation.instrument(c).isEmpty(),"NONARGUMENT_STATE_REWRITTEN");
  }
  public static void run() throws Exception {
    concurrent(false);concurrent(true);recursive();wide();exceptional();rejectedShapes();
    System.out.println("STATIC_ARGUMENT_ISOLATION_SEMANTIC_TEST_OK");
  }
  public static void main(String[] args) throws Exception {
    run();
    if(args.length==1) {
      int classes=0,changedClasses=0,slots=0;
      try(var zip=new java.util.zip.ZipFile(args[0])) {
        for(var entries=zip.entries();entries.hasMoreElements();) {
          var entry=entries.nextElement();if(!entry.getName().endsWith(".class"))continue;
          ClassNode c=new ClassNode();try(var input=zip.getInputStream(entry)){new ClassReader(input).accept(c,0);}classes++;
          var changes=StaticArgumentIsolation.instrument(c);
          if(!changes.isEmpty()) {
            for(MethodNode method:c.methods) if(changes.stream().anyMatch(change->change.method().equals(method.name)&&change.descriptor().equals(method.desc)))
              new Analyzer<BasicValue>(new BasicVerifier()).analyze(c.name,method);
            changedClasses++;slots+=changes.size();
            System.out.println("STATIC_ONLY_CANDIDATE "+c.name+" "+changes);
          }
        }
      }
      System.out.println("STATIC_ONLY_SCAN classes="+classes+" changedClasses="+changedClasses+" slots="+slots+"; changed methods passed ASM BasicVerifier; specimen code was not executed");
    }
  }
}
