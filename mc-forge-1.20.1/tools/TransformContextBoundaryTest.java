import java.lang.reflect.*;
import java.net.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.zip.*;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;

/** Executes the production wrapper, substituting only the transform delegate and test loader setup. */
public final class TransformContextBoundaryTest implements Opcodes {
  static Method invoke;
  static Object nested;
  static AtomicInteger callbacks = new AtomicInteger();
  static final RuntimeException FAILURE = new RuntimeException("delegate-failure");
  static void require(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
  public static byte[] callback(ClassLoader loader, byte[] input, String name, String reason) throws Throwable {
    callbacks.incrementAndGet();
    require(Thread.currentThread().getContextClassLoader() == loader, "delegate sees real defining loader");
    require(Class.forName("fixture.ContextPlugin", true, Thread.currentThread().getContextClassLoader()).getClassLoader() == loader, "plugin loads through defining loader");
    try (var stream = Thread.currentThread().getContextClassLoader().getResourceAsStream("fixture-refmap.json")) {
      require(stream != null && new String(stream.readAllBytes()).equals("{\"mapped\":true}"), "refmap resolves through defining loader");
    }
    if (name.equals("nested")) {
      byte[] result = call(nested, input, "simple"); require(result == input, "nested return preserved");
      require(Thread.currentThread().getContextClassLoader() == loader, "nested different loader restores outer context");
      try { call(nested, input, "fail"); throw new AssertionError("error lost"); }
      catch (RuntimeException expected) { require(expected == FAILURE, "same error object propagates"); }
      require(Thread.currentThread().getContextClassLoader() == loader, "nested exception restores outer context");
    }
    if (name.equals("fail")) throw FAILURE;
    return input;
  }
  static byte[] call(Object loader, byte[] bytes, String name) throws Throwable {
    try { return (byte[]) invoke.invoke(loader, bytes, name, "unchanged-reason"); }
    catch (InvocationTargetException failure) { throw failure.getCause(); }
  }
  static byte[] fixture(byte[] production) {
    ClassNode node = new ClassNode(); new ClassReader(production).accept(node, 0);
    node.superName = "java/net/URLClassLoader"; node.fields.clear(); node.innerClasses.clear(); node.nestMembers = null; node.nestHostClass = null;
    node.methods.removeIf(method -> !method.name.equals(TransformContextBoundary.DELEGATE) && !method.name.equals("maybeTransformClassBytes"));
    for (MethodNode method : node.methods) if (method.name.equals(TransformContextBoundary.DELEGATE)) {
      method.instructions.clear(); method.tryCatchBlocks.clear(); if(method.localVariables!=null)method.localVariables.clear();
      for(int slot=0;slot<4;slot++)method.instructions.add(new VarInsnNode(ALOAD,slot));
      method.instructions.add(new MethodInsnNode(INVOKESTATIC,"TransformContextBoundaryTest","callback","(Ljava/lang/ClassLoader;[BLjava/lang/String;Ljava/lang/String;)[B",false)); method.instructions.add(new InsnNode(ARETURN));
    }
    MethodNode init = new MethodNode(ACC_PUBLIC,"<init>","([Ljava/net/URL;)V",null,null);
    init.instructions.add(new VarInsnNode(ALOAD,0));init.instructions.add(new VarInsnNode(ALOAD,1));init.instructions.add(new MethodInsnNode(INVOKESPECIAL,"java/net/URLClassLoader","<init>","([Ljava/net/URL;)V",false));init.instructions.add(new InsnNode(RETURN));node.methods.add(init);
    ClassWriter writer = new ClassWriter(ClassWriter.COMPUTE_FRAMES | ClassWriter.COMPUTE_MAXS);node.accept(writer);return writer.toByteArray();
  }
  public static void main(String[] args) throws Throwable {
    Path resources=Path.of(args[1]);Files.createDirectories(resources.resolve("fixture"));
    ClassWriter marker=new ClassWriter(0);marker.visit(V17,ACC_PUBLIC,"fixture/ContextPlugin",null,"java/lang/Object",null);marker.visitEnd();Files.write(resources.resolve("fixture/ContextPlugin.class"),marker.toByteArray(),StandardOpenOption.CREATE_NEW);
    Files.writeString(resources.resolve("fixture-refmap.json"),"{\"mapped\":true}",StandardOpenOption.CREATE_NEW);
    byte[] production;try(ZipFile jar=new ZipFile(args[0])){try(var in=jar.getInputStream(jar.getEntry(TransformContextBoundary.ENTRY))){production=in.readAllBytes();}}
    byte[] bytes=fixture(production);
    Class<?> type=new ClassLoader(TransformContextBoundaryTest.class.getClassLoader()){Class<?> define(){return defineClass(TransformContextBoundary.OWNER.replace('/','.'),bytes,0,bytes.length);}}.define();
    invoke=type.getDeclaredMethod("maybeTransformClassBytes",byte[].class,String.class,String.class);invoke.setAccessible(true);
    URL[] urls={resources.toUri().toURL()};Object first=type.getConstructor(URL[].class).newInstance((Object)urls);nested=type.getConstructor(URL[].class).newInstance((Object)urls);
    ClassLoader prior=Thread.currentThread().getContextClassLoader();ClassLoader wrong=new ClassLoader(null){};
    Thread.currentThread().setContextClassLoader(wrong);
    try{
      byte[] payload={1,2,3};require(call(first,payload,"nested")==payload,"return identity preserved");require(Thread.currentThread().getContextClassLoader()==wrong,"caller restored");
      try{call(first,payload,"fail");throw new AssertionError("exception missing");}catch(RuntimeException expected){require(expected==FAILURE,"exception identity preserved");}
      require(Thread.currentThread().getContextClassLoader()==wrong,"exception caller restored");
      ExecutorService workers=Executors.newFixedThreadPool(2);CountDownLatch start=new CountDownLatch(1);List<Future<?>> results=new ArrayList<>();
      for(Object loader:new Object[]{first,nested})results.add(workers.submit(()->{ClassLoader sentinel=new ClassLoader(null){};Thread.currentThread().setContextClassLoader(sentinel);try{start.await();for(int i=0;i<30;i++){call(loader,new byte[]{4},"simple");require(Thread.currentThread().getContextClassLoader()==sentinel,"parallel caller restored");}}catch(Throwable error){throw new RuntimeException(error);}}));
      start.countDown();for(var result:results)result.get(10,TimeUnit.SECONDS);workers.shutdown();require(workers.awaitTermination(10,TimeUnit.SECONDS),"workers stopped");
      require(callbacks.get()==64,"all delegate callbacks executed exactly once");
    }finally{Thread.currentThread().setContextClassLoader(prior);((URLClassLoader)first).close();((URLClassLoader)nested).close();}
    System.out.println("TRANSFORM_CONTEXT_TEST_OK callbacks=64 realWrapper=true pluginClassAndRefmap=true nestedDifferentLoader=true sameException=true parallelWorkers=2 callerContextRestored=true");
  }
}
