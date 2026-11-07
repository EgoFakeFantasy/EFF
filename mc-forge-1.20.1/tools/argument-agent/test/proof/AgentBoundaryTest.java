package proof;
import java.lang.instrument.*;
import java.util.concurrent.*;
import java.security.ProtectionDomain;

public final class AgentBoundaryTest {
  static void require(boolean ok,String reason){if(!ok)throw new AssertionError(reason);}
  static byte[] original(Class<?> c)throws Exception {try(var in=c.getResourceAsStream("/"+c.getName().replace('.','/')+".class")){return in.readAllBytes();}}
  static void concurrent(boolean isolated)throws Exception {
    Object a=new Object(),b=new Object();Object[] result=new Object[2];Throwable[] errors=new Throwable[2];
    CountDownLatch first=new CountDownLatch(1),second=new CountDownLatch(1),release=new CountDownLatch(1);
    Thread one=new Thread(()->{try{result[0]=ConcurrentScratch.invoke(a,first,release);}catch(Throwable e){errors[0]=e;}});
    Thread two=new Thread(()->{try{result[1]=ConcurrentScratch.invoke(b,second,release);}catch(Throwable e){errors[1]=e;}});
    try {one.start();require(first.await(3,TimeUnit.SECONDS),"FIRST_STALLED");two.start();require(second.await(3,TimeUnit.SECONDS),"SECOND_STALLED");release.countDown();one.join(3000);two.join(3000);
      require(!one.isAlive()&&!two.isAlive()&&errors[0]==null&&errors[1]==null,"THREAD_FAILURE");require(result[0]==(isolated?a:b)&&result[1]==b,"ARGUMENT_IDENTITY:"+isolated);
    }finally{release.countDown();one.interrupt();two.interrupt();}
  }
  static void check(String phase,boolean isolated)throws Exception {
    concurrent(isolated);require(RecursiveScratch.invoke(7)==(isolated?7:0),"RECURSIVE_IDENTITY:"+phase);
    Object value=new Object();require(MergeScratch.invoke(value,true)==value&&MergeScratch.invoke(value,false)==value,"MERGE_IDENTITY");
    require(MergeScratch.invoke(null,true) instanceof String[]&&MergeScratch.invoke(null,false) instanceof Integer[],"ARRAY_MERGE_TYPE");
    System.out.println("BOUNDARY_PHASE_OK "+phase+" isolated="+isolated);
  }
  public static void main(String[] args)throws Exception {
    var instrumentation=ControlAgent.instrumentation;require(instrumentation!=null,"CONTROL_AGENT_MISSING");
    check("initial-define",true);
    byte[] concurrent=original(ConcurrentScratch.class),recursive=original(RecursiveScratch.class);
    instrumentation.redefineClasses(new ClassDefinition(ConcurrentScratch.class,concurrent),new ClassDefinition(RecursiveScratch.class,recursive),new ClassDefinition(MergeScratch.class,original(MergeScratch.class)));
    check("java-redefine-original-bytes",true);
    instrumentation.retransformClasses(ConcurrentScratch.class,RecursiveScratch.class,MergeScratch.class);check("java-retransform",true);
    if(args.length==1){System.load(args[0]);require(SyntheticNativeRedefiner.redefine(ConcurrentScratch.class,concurrent)==0,"NATIVE_REDEFINE_CONCURRENT_FAILED");require(SyntheticNativeRedefiner.redefine(RecursiveScratch.class,recursive)==0,"NATIVE_REDEFINE_RECURSIVE_FAILED");check("native-jvmti-redefine-original-bytes",true);}
    // Deliberately demonstrate that a later callback can replace our output again.
    ClassFileTransformer late=new ClassFileTransformer(){@Override public byte[] transform(ClassLoader l,String n,Class<?> c,ProtectionDomain d,byte[] b){return n.equals("proof/ConcurrentScratch")?concurrent:n.equals("proof/RecursiveScratch")?recursive:null;}};
    instrumentation.addTransformer(late,true);
    try{instrumentation.redefineClasses(new ClassDefinition(ConcurrentScratch.class,concurrent),new ClassDefinition(RecursiveScratch.class,recursive));check("later-transformer-overwrite-counterexample",false);}finally{require(instrumentation.removeTransformer(late),"TEST_TRANSFORMER_NOT_REMOVED");}
    instrumentation.retransformClasses(ConcurrentScratch.class,RecursiveScratch.class);check("repair-after-counterexample",true);
    System.out.println("ARGUMENT_AGENT_BOUNDARY_TEST_OK; later callbacks and direct native mutation remain outside the guarantee");
  }
}
