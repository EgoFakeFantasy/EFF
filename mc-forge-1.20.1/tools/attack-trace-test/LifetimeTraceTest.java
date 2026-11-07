import com.wzz.forever_love_sword.util.ForeverUtils;
import eff.minecraft.lab.AttackTraceBridge;
import eff.lifetime.*;
import eff.finalgate.FinalLifetimeTransform;
import it.unimi.dsi.fastutil.ints.Int2ObjectMap;

/** Real hidden fixture -> real transformed fastutil callee -> production gate -> production audit. */
public final class LifetimeTraceTest {
  private static int checks;
  public static final class Target extends net.minecraft.world.entity.Entity implements LifetimeTarget {
    boolean owned = true;
    int receipts;
    public boolean rejectLifetimeMutation() { return owned; }
    public void lifetimeOperationRejected(String operation) {
      receipts++;
      AttackTraceBridge.lifetimeOperationRejected(this, operation);
    }
  }
  private static void check(boolean ok, String message) { checks++; if (!ok) throw new AssertionError(message); }
  private static boolean seen() { return AttackTraceBridge.snapshot("run").get("swordAttackObserved").getAsBoolean(); }
  private static void watch(Target original) { AttackTraceBridge.watch("foreverlove", original, "uuid", "run", new Object(), new Object(), new Object()); }
  private static void arm(Target target) { AttackTraceBridge.beginDirectAttack("run", target); }
  private static void end(Target target) { AttackTraceBridge.endDirectAttack("run", target); }
  private static int diagnostic(String field) { return AttackTraceBridge.snapshot("run").get(field).getAsInt(); }
  private static void boundHiddenAttribution(Target target,Target other) throws Throwable {
    var item=proof.BoundItem.hidden();var wrongItem=proof.BoundItem.hidden();
    var kill=proof.BoundItem.unknownKill();var player=new net.minecraft.server.level.ServerPlayer();
    target.owned=true;
    AttackTraceBridge.watch("foreverlove",target,"uuid","run",item,player,new Object());
    player.attack(item,target,kill);check(!seen(),"bound chain outside window rejected");
    arm(target);
    kill.invokeExact((net.minecraft.world.entity.Entity)target);check(!seen(),"Unknown hidden kill alone rejected");
    item.onLeftClickEntity(target,kill);check(!seen(),"exact item without normal Forge chain rejected");
    net.minecraftforge.common.ForgeHooks.onPlayerAttackTarget(item,target,kill);check(!seen(),"Forge call without Player/ServerPlayer rejected");
    new net.minecraft.world.entity.player.Player().attack(item,target,kill);check(!seen(),"missing ServerPlayer frame rejected");
    player.attack(wrongItem,target,kill);check(!seen(),"wrong hidden item Class rejected");
    player.attack(item,other,kill);check(!seen(),"bound item wrong original target rejected");
    Throwable[] failure=new Throwable[1];Thread thread=new Thread(() -> {try{player.attack(item,target,kill);}catch(Throwable error){failure[0]=error;}});
    thread.start();thread.join();if(failure[0]!=null)throw failure[0];check(!seen(),"bound item wrong thread rejected");
    check(AttackTraceBridge.firstAttackNanos("run")==0,"all rejected Unknown routes cannot start clock");
    Object before=target.position;player.attack(item,target,kill);end(target);
    check(target.position==before,"bound unknown hidden actual PUTFIELD prevented");
    check(seen()==AttackTraceBridge.enabled(),"exact item plus complete ordered Forge chain attribution");
    if(AttackTraceBridge.enabled()) {
      var receipt=AttackTraceBridge.snapshot("run");
      check(receipt.get("lifetimePreventedWrites").getAsInt()==1,"only complete bound chain counts");
      check(receipt.get("lifetimeAttributionKind").getAsString().equals("bound-item-hidden-kill"),"new explicit attribution kind");
      check(receipt.get("lifetimeAttackFrame").getAsString().contains("<Unknown>/0x"),"actual Unknown hidden name");
      check(receipt.get("lifetimeBoundItemClass").getAsString().equals(item.getClass().getName()),"bound exact item class recorded");
      check(receipt.get("lifetimeItemFrame").getAsString().equals(item.getClass().getName()+".onLeftClickEntity"),"actual bound item frame");
      check(receipt.get("lifetimeExactItemClassVerified").getAsBoolean()&&receipt.get("lifetimeKillFrameHiddenVerified").getAsBoolean()&&receipt.get("lifetimeNormalAttackChainVerified").getAsBoolean(),"class identity and normal chain verified");
    }
    // Same binary name in a different loader must not impersonate the watched Class.
    var named=new proof.BoundItem();byte[] bytes=proof.BoundItem.bytes();
    class ForeignLoader extends ClassLoader {ForeignLoader(){super(LifetimeTraceTest.class.getClassLoader());}Class<?> define(){return defineClass("proof.BoundItem",bytes,0,bytes.length);}}
    var foreign=(proof.ItemHook)new ForeignLoader().define().getConstructor().newInstance();
    check(foreign.getClass().getName().equals(named.getClass().getName())&&foreign.getClass()!=named.getClass(),"same-name foreign-loader fixture");
    AttackTraceBridge.watch("foreverlove",target,"uuid","run",named,player,new Object());arm(target);
    player.attack(foreign,target,kill);check(!seen(),"same name different loader rejected");
    player.attack(named,target,kill);end(target);check(seen()==AttackTraceBridge.enabled(),"actual named item Class still accepted");
    AttackTraceBridge.clear("run");
  }
  private static com.google.gson.JsonArray diagnosticFrames() { return AttackTraceBridge.snapshot("run").getAsJsonArray("lifetimeMissingFramesDiagnosticOnly"); }
  private static void deepDiagnostic(Target target,int depth) {
    if(depth>0)deepDiagnostic(target,depth-1);else diagnostic_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx(target);
  }
  private static void diagnostic_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx(Target target) {
    AttackTraceBridge.lifetimeOperationRejected(target,"field-write:position");
  }
  private static void diagnostics(Target target,Target other) throws Throwable {
    AttackTraceBridge.clear("run");
    AttackTraceBridge.lifetimeOperationRejected(new Object(),"private-unknown-operation");
    check(!AttackTraceBridge.snapshot("run").has("lifetimeCallbackCount"),"no context produces no diagnostics");
    check(!AttackTraceBridge.snapshot("run").has("lifetimeMissingFramesDiagnosticOnly"),"unbound no frame capture");
    watch(target);
    if(!AttackTraceBridge.enabled()) {
      AttackTraceBridge.lifetimeOperationRejected(target,"field-write:position");
      check(!AttackTraceBridge.snapshot("run").has("lifetimeCallbackCount"),"disabled produces no diagnostics");
      check(!AttackTraceBridge.snapshot("run").has("lifetimeMissingFramesDiagnosticOnly"),"disabled no frame capture");
      AttackTraceBridge.clear("run");return;
    }
    AttackTraceBridge.lifetimeOperationRejected(target,"field-write:position");
    check(diagnostic("lifetimeCallbackCount")==1&&diagnostic("lifetimeNotArmed")==1,"unarmed diagnostic");
    arm(target);
    AttackTraceBridge.lifetimeOperationRejected(other,"field-write:position");
    AttackTraceBridge.lifetimeOperationRejected(target,"private-unknown-operation");
    Thread wrong=new Thread(() -> AttackTraceBridge.lifetimeOperationRejected(target,"field-write:position"));
    wrong.start();wrong.join();
    check(diagnosticFrames().isEmpty(),"unarmed/wrong target/wrong thread/unsupported operation never capture frames");
    AttackTraceBridge.lifetimeOperationRejected(target,"field-write:position");
    check(diagnostic("lifetimeCallbackCount")==5,"callback count includes rejected callbacks");
    check(diagnostic("lifetimeWrongThread")==1&&diagnostic("lifetimeWrongTarget")==1,"thread and target diagnostics");
    check(diagnostic("lifetimeUnsupportedOperation")==1&&diagnostic("lifetimeMissingFrame")==1,"operation and missing frame diagnostics");
    check(!seen()&&AttackTraceBridge.firstAttackNanos("run")==0,"diagnostics cannot verify attack or start clock");
    check(diagnostic("lifetimePreventedWrites")==0,"diagnostics cannot create write receipt");
    check(!AttackTraceBridge.snapshot("other-run").has("lifetimeCallbackCount"),"diagnostics are run scoped");
    String json=AttackTraceBridge.snapshot("run").toString();
    check(!json.contains("private-unknown-operation"),"unbound operation content not recorded");
    check(diagnosticFrames().size()>0&&diagnosticFrames().size()<=16,"bound missing frame captures only capped stack");
    String firstCapture=diagnosticFrames().toString();
    deepDiagnostic(target,32);
    check(diagnosticFrames().toString().equals(firstCapture),"subsequent calls never replace or expand first capture");
    check(!AttackTraceBridge.snapshot("other-run").has("lifetimeMissingFramesDiagnosticOnly"),"wrong run no frames");
    end(target);
    watch(target);arm(target);deepDiagnostic(target,32);end(target);
    check(diagnosticFrames().size()==16,"deep stack capped to sixteen frames");
    boolean truncated=false;
    for(var value:diagnosticFrames()) {
      String frame=value.getAsString();
      check(frame.length()<=256&&frame.contains(";isHidden="),"frame length bounded with explicit hidden flag");
      check(!frame.contains(".java")&&!frame.contains("(")&&!frame.contains("private-unknown-operation"),"frame excludes file line and parameter content");
      if(frame.length()==256)truncated=true;
    }
    check(truncated,"long method name truncated to item cap");
    check(!seen()&&AttackTraceBridge.firstAttackNanos("run")==0,"bound frame diagnostics remain unverified");
    watch(target);arm(target);
    Thread[] writers=new Thread[4];
    for(int i=0;i<writers.length;i++)writers[i]=new Thread(() -> {for(int n=0;n<32;n++)AttackTraceBridge.lifetimeOperationRejected(target,"field-write:position");});
    for(Thread writer:writers)writer.start();for(Thread writer:writers)writer.join();
    check(diagnostic("lifetimeCallbackCount")==128&&diagnostic("lifetimeWrongThread")==128,"concurrent diagnostics retain counts");
    for(int i=0;i<5000;i++)AttackTraceBridge.lifetimeOperationRejected(target,"private-unknown-operation");
    check(diagnostic("lifetimeCallbackCount")==4096&&diagnostic("lifetimeUnsupportedOperation")==4096,"diagnostics saturate at fixed bound");
    check(!seen()&&AttackTraceBridge.firstAttackNanos("run")==0,"saturated diagnostics remain unverified");
    end(target);AttackTraceBridge.clear("run");
    check(!AttackTraceBridge.snapshot("run").has("lifetimeCallbackCount"),"clear removes diagnostic context");
  }
  @SuppressWarnings("unchecked") private static Int2ObjectMap<Object> map() throws Exception {
    String name = "it.unimi.dsi.fastutil.ints.Int2ObjectOpenHashMap";
    ClassLoader loader = new ClassLoader(LifetimeTraceTest.class.getClassLoader()) {
      @Override protected Class<?> loadClass(String requested, boolean resolve) throws ClassNotFoundException {
        if (!requested.equals(name) && !requested.startsWith(name + "$")) return super.loadClass(requested, resolve);
        synchronized (getClassLoadingLock(requested)) {
          Class<?> found = findLoadedClass(requested);
          if (found == null) try (var in = getParent().getResourceAsStream(requested.replace('.', '/') + ".class")) {
            if (in == null) throw new ClassNotFoundException(requested);
            byte[] bytes = in.readAllBytes();
            if (requested.equals(name)) {
              var result = FinalLifetimeTransform.transform(bytes);
              if (result.methods() < 2) throw new AssertionError("REAL_MAP_CALLEE_NOT_TRANSFORMED");
              bytes = result.bytes();
            }
            found = defineClass(requested, bytes, 0, bytes.length);
          } catch (java.io.IOException error) { throw new ClassNotFoundException(requested, error); }
          if (resolve) resolveClass(found); return found;
        }
      }
    };
    return (Int2ObjectMap<Object>)loader.loadClass(name).getConstructor().newInstance();
  }
  public static void main(String[] args) throws Throwable {
    var hidden = ForeverUtils.hiddenKill();
    var map = map(); Target target = new Target(), other = new Target();
    map.put(7,target);map.put(8,other);
    watch(target);
    hidden.invoke(map,7);check(!seen(),"not armed");
    arm(target);check(!seen(),"arm alone");
    FieldWriteGate.rejectQuery(target);FieldWriteGate.remember(target);check(!seen(),"queries/remember");
    int receipts = target.receipts;
    map.defaultReturnValue(target);hidden.invoke(map,99);
    check(target.receipts == receipts && !seen(),"absent defaultReturnValue must not count");
    map.remove(7);check(!seen(),"no attack frame");
    hidden.invoke(map,8);check(!seen(),"wrong original target");
    Throwable[] threadError = new Throwable[1];
    Thread wrong = new Thread(() -> { try { hidden.invoke(map,7); } catch(Throwable error) { threadError[0]=error; } });
    wrong.start();wrong.join();if(threadError[0]!=null)throw threadError[0];check(!seen(),"wrong thread");
    end(target);hidden.invoke(map,7);check(!seen(),"ended window");
    if (AttackTraceBridge.enabled()) {
      boolean rejected=false;try{AttackTraceBridge.beginDirectAttack("old",target);}catch(IllegalStateException expected){rejected=true;}
      check(rejected,"wrong run arm rejected");
      hidden.invoke(map,7);check(!seen(),"wrong run cannot arm");
      rejected=false;try{arm(other);}catch(IllegalStateException expected){rejected=true;}
      check(rejected,"wrong target arm rejected");
    }
    target.owned=false;arm(target);hidden.invoke(map,7);
    check(!seen() && !map.containsKey(7),"released actual removal is not a rejection");end(target);
    target.owned=true;map.put(7,target);arm(target);hidden.invoke(map,7);end(target);
    check(map.get(7)==target,"real callee prewrite rejection preserved original entry");
    check(seen()==AttackTraceBridge.enabled(),"hidden kill receipt respects opt-in");
    if(AttackTraceBridge.enabled()) {
      var snapshot=AttackTraceBridge.snapshot("run");
      check(snapshot.get("instrumentationMode").getAsString().equals("observational-lifetime-gate"),"strict mode");
      check(snapshot.get("lifetimePreventedWrites").getAsInt()==1,"only valid hidden call counted");
      check(snapshot.get("lifetimeAttackFrame").getAsString().contains("ForeverUtils/0x"),"real hidden class on walker stack");
      check(AttackTraceBridge.firstAttackNanos("run")>0,"clock anchored at actual rejection");
      check(!AttackTraceBridge.snapshot("other").get("swordAttackObserved").getAsBoolean(),"snapshot run separation");
    }
    watch(target);arm(target);ForeverUtils.killEntity(map,7);end(target);
    check(seen()==AttackTraceBridge.enabled(),"ordinary kill frame also accepted");
    var hiddenField = ForeverUtils.hiddenFieldKill();
    watch(target);hiddenField.invoke(target,0);check(!seen(),"field outside window");
    arm(target);hiddenField.invoke(other,0);check(!seen(),"field wrong target");
    Throwable[] fieldThreadError=new Throwable[1];
    Thread fieldWrong=new Thread(() -> {try{hiddenField.invoke(target,0);}catch(Throwable error){fieldThreadError[0]=error;}});
    fieldWrong.start();fieldWrong.join();if(fieldThreadError[0]!=null)throw fieldThreadError[0];
    check(!seen(),"field wrong thread");
    hiddenField.invoke(target,2);hiddenField.invoke(target,3);check(!seen(),"query or unknown operation");end(target);
    for(int operation=0;operation<2;operation++) {
      watch(target);arm(target);Object before=target.position;hiddenField.invoke(target,operation);end(target);
      check(target.position==before && target.removalReason==null,"actual hidden PUTFIELD blocked");
      check(seen()==AttackTraceBridge.enabled(),"field receipt opt-in");
      if(AttackTraceBridge.enabled()) {
        var snapshot=AttackTraceBridge.snapshot("run");
        check(snapshot.get("lifetimePreventedWrites").getAsInt()==1,"single rejected field receipt");
        check(snapshot.get("lifetimePreventedOperation").getAsString().equals(operation==0?"field-write:position":"field-write:removalReason"),"canonical exact field name");
        check(snapshot.get("lifetimeFieldWriteVerified").getAsBoolean()&&!snapshot.get("lifetimePresentEntryVerified").getAsBoolean(),"field not mislabelled map");
      }
    }
    watch(target);target.owned=false;arm(target);hiddenField.invoke(target,0);end(target);
    check(Double.isNaN(target.position.x)&&!seen(),"released actual field write not counted");
    AttackTraceBridge.clear("run");check(!seen(),"clear invalidates receipt");
    diagnostics(target,other);
    boundHiddenAttribution(target,other);
    System.out.println("PASS "+checks+" lifetime audit checks; optIn="+AttackTraceBridge.enabled()+"; synthetic hidden fixture only; no opponent executed");
  }
}
