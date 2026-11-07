package eff.hiddenfixture;
import eff.hiddenboundary.HiddenWriteTransform;
import eff.hiddenboundary.NativeHiddenBoundary;
import java.nio.file.*;
import java.lang.reflect.*;
import java.security.*;
import java.util.*;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.phys.Vec3;

public final class NativeBoundaryTest {
  public static int initializations;
  public static int tickInitializations;
  static volatile boolean rejectProvider;
  static volatile boolean recurseProvider;
  static byte[] ops;
  static Object data=new Object();
  static ProtectionDomain domain;
  public static byte[] apply(Class<?> lookup,byte[] bytes) {
    if(rejectProvider)throw new IllegalArgumentException("SYNTHETIC_PROVIDER_FAILURE");
    if(recurseProvider)NativeBoundary.define(NativeBoundaryTest.class,ops,domain,false,3,data);
    return HiddenWriteTransform.apply(lookup,bytes);
  }
  private static void check(boolean value,String text){if(!value)throw new AssertionError(text);}
  private static Class<?> define(boolean init){return NativeBoundary.define(NativeBoundaryTest.class,ops,domain,init,3,data);}
  private static void identity(Class<?> cls) throws Exception {
    check(cls.isHidden(),"hidden identity");check(cls.getClassLoader()==NativeBoundaryTest.class.getClassLoader(),"same loader");
    check(cls.getNestHost()==NativeBoundaryTest.class,"nest host");check(cls.getProtectionDomain()==domain,"explicit protection domain");
    check(cls.getMethod("data").invoke(null)==data,"classData preserved");
  }
  private static void write(Class<?> cls,boolean owned,boolean guarded) throws Exception {
    Entity entity=new LivingEntity();entity.owned=owned;Vec3 before=entity.position,nan=new Vec3(Double.NaN,Double.NaN,Double.NaN);
    Object result=cls.getMethod("write",Entity.class,Vec3.class).invoke(null,entity,nan);
    if(cls.isHidden()) check(guarded
        ? entity.blockPosition.x()==1 && entity.chunkPosition.x()==0 && entity.f_19826_.x()==1 && entity.f_185933_.x()==0
        : entity.blockPosition.x()==320 && entity.chunkPosition.x()==20 && entity.f_19826_.x()==640 && entity.f_185933_.x()==40,
        "hidden position cache consistency, named and SRG");
    check(result.equals(73)&&entity.unrelated==1,"actual caller continues");
    check(guarded?(entity.position==before&&entity.removalReason==null):(entity.position==nan&&entity.removalReason==Entity.RemovalReason.DISCARDED),"raw fields");
    LivingEntity living=(LivingEntity)entity;
    check(guarded?(!living.dead&&!living.f_20890_&&living.deathTime==0&&living.f_20919_==0)
        :(living.dead&&living.f_20890_&&living.deathTime==31&&living.f_20919_==31),"raw primitive lifecycle fields, named and SRG");
    if(cls.isHidden()) {
      LivingEntity self=(LivingEntity)cls.getConstructor().newInstance();self.owned=owned;
      check(cls.getMethod("self").invoke(self).equals(1),"hidden self caller continues");
      check(guarded?(!self.dead&&self.deathTime==0):(self.dead&&self.deathTime==71),"hidden self symbolic owner");
      var derived=new DerivedLiving();derived.owned=owned;
      check(cls.getMethod("derived",DerivedLiving.class).invoke(null,derived).equals(1),"derived caller continues");
      check(guarded?(!derived.dead&&!derived.f_20890_&&derived.deathTime==0&&derived.f_20919_==0)
          :(derived.dead&&derived.f_20890_&&derived.deathTime==53&&derived.f_20919_==53),"subclass symbolic owner primitives");
      var shadow=new ShadowLiving();shadow.owned=owned;
      cls.getMethod("shadow",ShadowLiving.class).invoke(null,shadow);
      check(shadow.dead&&shadow.deathTime==67&&!((LivingEntity)shadow).dead,"shadow fields are unrelated and preserved");
      var player=new net.minecraft.world.entity.player.Player();player.owned=owned;
      check(cls.getMethod("player",player.getClass()).invoke(null,player).equals(1),"player caller continues");
      check(guarded?(!player.dead&&!player.f_20890_&&player.deathTime==0&&player.f_20919_==0)
          :(player.dead&&player.f_20890_&&player.deathTime==41&&player.f_20919_==41),"inherited Player symbolic owner primitives");
    }
  }
  public static void main(String[] args) throws Exception {
    System.load(Path.of(args[0]).toAbsolutePath().toString());System.load(Path.of(args[2]).toAbsolutePath().toString());ops=Files.readAllBytes(Path.of(args[1]));
    domain=new ProtectionDomain(new CodeSource(new java.net.URL("file:/eff-private-native-fixture/"),(java.security.cert.Certificate[])null),new Permissions());
    // Warm all Java/ASM dependencies before installing the process-local boundary.
    apply(NativeBoundaryTest.class,ops);new IllegalArgumentException("warm");Arrays.toString(new long[0]);
    Class<?> control=define(false);check(initializations==0,"init=false preserved");identity(control);write(control,true,false);
    check(initializations==1,"delayed clinit");
    final CountDownLatch ready=new CountDownLatch(4),start=new CountDownLatch(1);final AtomicInteger installs=new AtomicInteger(),refusals=new AtomicInteger();
    final Throwable[] installErrors=new Throwable[4];Thread[] installers=new Thread[4];
    for(int t=0;t<4;t++){final int index=t;installers[t]=new Thread(new Runnable(){public void run(){try{ready.countDown();start.await();NativeHiddenBoundary.install(NativeBoundaryTest.class);installs.incrementAndGet();}catch(IllegalStateException expected){if(expected.getMessage().equals("HIDDEN_BOUNDARY_INSTALL_ALREADY_ATTEMPTED"))refusals.incrementAndGet();else installErrors[index]=expected;}catch(Throwable error){installErrors[index]=error;}}});}
    for(Thread thread:installers)thread.start();ready.await();start.countDown();for(Thread thread:installers)thread.join();
    for(Throwable error:installErrors)if(error!=null)throw new AssertionError("concurrent install",error);
    check(installs.get()==1&&refusals.get()==3,"atomic single install");
    NativeHiddenBoundary.auditMethods();
    NativeHiddenBoundary.auditMethods();
    check(NativeHiddenBoundary.inspectTick(null).contains("NULL_CLASS"),"null diagnostic target explicit");
    check(NativeHiddenBoundary.inspectTick(String.class).contains("CLASS_NOT_ADMITTED"),"bounded class allowlist");
    Class<?> tickClass=Class.forName("net.minecraft.server.network.ServerGamePacketListenerImpl",false,NativeBoundaryTest.class.getClassLoader());
    tickClass.getDeclaredMethods(); // Prepare the fixture without initializing it; API must not do this.
    String tickBefore=NativeHiddenBoundary.inspectTick(tickClass),tickAfter=NativeHiddenBoundary.inspectTick(tickClass);
    check(tickBefore.equals(tickAfter),"read-only snapshots stable");
    check(tickBefore.contains("\"bytecodeError\":0")&&tickBefore.contains("\"bytecodeHex\":\"")
        &&tickBefore.contains("\"poolError\":0")&&tickBefore.contains("\"poolHex\":\"")
        &&tickBefore.contains("\"name\":\"m_9933_\"")&&!tickBefore.contains("\"name\":\"unrelated\""),"selected method and pool observed: "+tickBefore);
    check(tickInitializations==0,"inspection neither initializes nor executes target");
    Class<?> worldClass=Class.forName("net.minecraft.server.level.ServerLevel",false,NativeBoundaryTest.class.getClassLoader());
    worldClass.getDeclaredMethods();
    String worldBefore=NativeHiddenBoundary.inspectTick(worldClass),worldAfter=NativeHiddenBoundary.inspectTick(worldClass);
    check(worldBefore.equals(worldAfter),"read-only world snapshots stable");
    check(worldBefore.contains("\"name\":\"m_8647_\",\"descriptor\":\"(Lnet/minecraft/world/entity/Entity;)V\"")
        &&worldBefore.contains("\"name\":\"m_184063_\",\"descriptor\":\"(Lnet/minecraft/util/profiling/ProfilerFiller;Lnet/minecraft/world/entity/Entity;)V\"")
        &&!worldBefore.contains("\"descriptor\":\"()V\"")&&!worldBefore.contains("\"name\":\"unrelated\"")
        &&worldBefore.split("bytecodeHex",-1).length==3,"world exact methods and overloads: "+worldBefore);
    check(tickInitializations==0,"world inspection neither initializes nor executes target");
    for(int i=6;i<32;i++)check(!NativeHiddenBoundary.inspectTick(tickClass).contains("SAMPLE_LIMIT"),"within audit bound");
    check(NativeHiddenBoundary.inspectTick(tickClass).contains("SAMPLE_LIMIT"),"audit call bound explicit");
    check(tickInitializations==0,"bounded audit has no target side effects");
    System.out.println("READ_ONLY_TICK_AUDIT_OK synthetic=true mcExecuted=false");
    try {NativeHiddenBoundary.install(HiddenWriteTransform.class);throw new AssertionError("provider replacement accepted");}
    catch(IllegalStateException expected){check(expected.getMessage().equals("HIDDEN_BOUNDARY_INSTALL_ALREADY_ATTEMPTED"),"install once");}
    Class<?> guarded=define(false);check(initializations==1,"guarded init=false");identity(guarded);write(guarded,true,true);write(guarded,false,false);
    Class<?> eager=define(true);check(initializations==3,"init=true preserved");identity(eager);write(eager,true,true);
    // A preexisting destroyed target must stay destroyed, not become a claimed success.
    LivingEntity dead=new LivingEntity();dead.owned=true;dead.dead=true;dead.f_20890_=true;dead.deathTime=97;dead.f_20919_=97;dead.removalReason=Entity.RemovalReason.DISCARDED;dead.position=new Vec3(Double.NaN,0,0);
    guarded.getMethod("write",Entity.class,Vec3.class).invoke(null,dead,new Vec3(8,8,8));
    check(dead.removalReason==Entity.RemovalReason.DISCARDED&&Double.isNaN(dead.position.x()),"no fabricated revival");
    check(dead.dead&&dead.f_20890_&&dead.deathTime==97&&dead.f_20919_==97,"preexisting raw death state retained");
    try {guarded.getMethod("write",Entity.class,Vec3.class).invoke(null,null,new Vec3(8,8,8));throw new AssertionError("null write swallowed");}
    catch(InvocationTargetException expected){check(expected.getCause() instanceof NullPointerException,"original null target failure");}
    byte[] plain=Files.readAllBytes(Path.of(args[1]).resolveSibling("PlainOps.class"));
    long beforeNormal=NativeHiddenBoundary.stats()[0];
    try {NativeBoundary.define(NativeBoundaryTest.class,plain,domain,false,0,null);throw new AssertionError("VM flag validation swallowed");}
    catch(IllegalArgumentException expected){check(expected.getMessage().contains("strongly referenced"),"original VM validation");}
    Class<?> ordinary=NativeBoundary.define(NativeBoundaryTest.class,plain,domain,false,4,null);
    check(!ordinary.isHidden()&&ordinary.getName().equals("eff.hiddenfixture.PlainOps"),"normal flags preserved");write(ordinary,true,false);
    check(NativeHiddenBoundary.stats()[0]==beforeNormal,"normal definitions bypass provider");
    byte[] benign=Files.readAllBytes(Path.of(args[1]).resolveSibling("BenignOps.class"));
    check(HiddenWriteTransform.apply(NativeBoundaryTest.class,benign)==benign,"unrelated bytes unchanged");
    long beforeBenign=NativeHiddenBoundary.stats()[1];Class<?> harmless=NativeBoundary.define(NativeBoundaryTest.class,benign,domain,false,3,null);
    check(harmless.isHidden()&&harmless.getMethod("value").invoke(null).equals(31),"unrelated hidden class executes");
    check(NativeHiddenBoundary.stats()[1]==beforeBenign,"unrelated hidden bytes not rewritten");
    rejectProvider=true;try{define(false);throw new AssertionError("provider failure swallowed");}catch(IllegalArgumentException expected){check(expected.getMessage().equals("SYNTHETIC_PROVIDER_FAILURE"),"original exception");}finally{rejectProvider=false;}
    recurseProvider=true;try{define(false);throw new AssertionError("recursion bypass");}catch(IllegalStateException expected){check(expected.getMessage().equals("HIDDEN_BOUNDARY_REENTRANT_PROVIDER"),"recursive failure");}finally{recurseProvider=false;}
    final Throwable[] failures=new Throwable[4];Thread[] threads=new Thread[4];
    for(int t=0;t<threads.length;t++){final int index=t;threads[t]=new Thread(new Runnable(){public void run(){try{for(int i=0;i<8;i++){Class<?> cls=define(false);write(cls,true,true);write(cls,false,false);}}catch(Throwable e){failures[index]=e;}}},"hidden-fixture-"+t);}
    for(Thread thread:threads)thread.start();for(Thread thread:threads)thread.join();for(Throwable failure:failures)if(failure!=null)throw new AssertionError("concurrent definition",failure);
    long[] stats=NativeHiddenBoundary.stats();check(stats[0]>=36&&stats[1]>=34&&stats[2]==0,"hook counters");
    if(args[3].equals("fixture")){NativeBoundary.uninstall();Class<?> restored=define(false);identity(restored);write(restored,true,false);}
    else {try{NativeBoundary.uninstall();throw new AssertionError("production uninstall export present");}catch(UnsatisfiedLinkError expected){}write(guarded,true,true);}
    System.out.println("PASS "+args[3]+" native direct JVM_LookupDefineClass: baseline writes, hidden identity/nest/loader/PD/classData/init preserved, Entity and inherited LivingEntity symbolic-owner writes protected, install once/provider fixed, unowned writes and remaining caller run, destroyed state not revived, null failure preserved, normal definitions bypassed, benign hidden bytes unchanged, provider failure/recursion fail closed, concurrent 32 definitions; counters="+Arrays.toString(stats));
  }
}
