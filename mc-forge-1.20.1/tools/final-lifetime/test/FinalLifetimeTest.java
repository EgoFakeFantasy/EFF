import eff.finalgate.FinalLifetimeTransform;
import java.nio.file.*;
import java.lang.reflect.*;
import java.util.*;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;

public final class FinalLifetimeTest {
  static void check(boolean good,String message){if(!good)throw new AssertionError(message);}
  public static void main(String[] args)throws Exception {
    Path fixtures=Path.of(args[0]);Map<String,byte[]> definitions=new HashMap<>();
    try(var files=Files.walk(fixtures)){for(Path p:files.filter(p->p.toString().endsWith(".class")).toList()){
      byte[] input=Files.readAllBytes(p);String name=new ClassReader(input).getClassName();
      var transformed=FinalLifetimeTransform.transform(input);
      if(FinalLifetimeTransform.supports(name)){
        check(transformed.methods()>0,"guard target count "+name);
        check(FinalLifetimeTransform.transform(transformed.bytes()).methods()==0,"idempotence "+name);
        if(name.equals("net/minecraft/world/entity/Entity")) {
          ClassNode late=new ClassNode();new ClassReader(transformed.bytes()).accept(late,ClassReader.EXPAND_FRAMES);
          for(MethodNode method:late.methods)if(method.name.equals("getBoundingBox")){
            LabelNode start=new LabelNode(),end=new LabelNode(),handler=new LabelNode();
            method.instructions.insert(start);method.instructions.add(end);method.instructions.add(handler);
            method.instructions.add(new FrameNode(Opcodes.F_NEW,1,new Object[]{late.name},1,new Object[]{"java/lang/RuntimeException"}));
            method.instructions.add(new InsnNode(Opcodes.POP));method.instructions.add(new InsnNode(Opcodes.ACONST_NULL));method.instructions.add(new InsnNode(Opcodes.ARETURN));
            method.tryCatchBlocks.add(new TryCatchBlockNode(start,end,handler,"java/lang/RuntimeException"));
          }
          ClassWriter writer=new ClassWriter(ClassWriter.COMPUTE_MAXS);late.accept(writer);
          transformed=FinalLifetimeTransform.transform(writer.toByteArray());
          check(transformed.methods()==1,"unchanged opcodes with foreign exception edge must be repaired");
          check(FinalLifetimeTransform.transform(transformed.bytes()).methods()==0,"retained body handler outside new head remains idempotent");
        }
        if(name.endsWith("LivingEntity")) {
          ClassNode late=new ClassNode();new ClassReader(transformed.bytes()).accept(late,0);
          for(MethodNode method:late.methods)if(method.name.equals("getHealth")){
            InsnList head=new InsnList();head.add(new InsnNode(Opcodes.FCONST_0));head.add(new InsnNode(Opcodes.FRETURN));method.instructions.insert(head);
          }
          ClassWriter writer=new ClassWriter(ClassWriter.COMPUTE_FRAMES|ClassWriter.COMPUTE_MAXS);late.accept(writer);
          transformed=FinalLifetimeTransform.transform(writer.toByteArray());
          check(transformed.methods()==1,"later CFT head repair limited to changed head");
        }
        if(name.endsWith("EntityLookup")) {
          // Keep the marker but poison the guard inside its prefix. Previously the
          // first LDC alone caused this altered query to be mistaken for intact code.
          ClassNode late=new ClassNode();new ClassReader(transformed.bytes()).accept(late,0);
          for(MethodNode method:late.methods)if(method.name.equals("getEntity")&&method.desc.startsWith("(I)")){
            for(AbstractInsnNode n:method.instructions.toArray())if(n instanceof MethodInsnNode call&&call.name.equals("rejectQuery")){
              method.instructions.insert(call,new InsnNode(Opcodes.ICONST_0));
              method.instructions.insert(call,new InsnNode(Opcodes.POP));break;
            }
          }
          ClassWriter writer=new ClassWriter(ClassWriter.COMPUTE_MAXS);late.accept(writer);
          transformed=FinalLifetimeTransform.transform(writer.toByteArray());
          check(transformed.methods()==1,"retained marker cannot hide changed query prefix");
          check(FinalLifetimeTransform.transform(transformed.bytes()).methods()==0,"repaired prefix remains idempotent");
        }
      }
      definitions.put(name.replace('/','.'),transformed.bytes());
    }}
    ClassLoader loader=new ClassLoader(FinalLifetimeTest.class.getClassLoader()){
      @Override protected Class<?> findClass(String name)throws ClassNotFoundException{byte[] b=definitions.get(name);if(b==null)throw new ClassNotFoundException(name);return defineClass(name,b,0,b.length);}
    };
    Class<?> living=loader.loadClass("net.minecraft.world.entity.LivingEntity"),entity=loader.loadClass("net.minecraft.world.entity.Entity");
    Class<?> player=loader.loadClass("net.minecraft.world.entity.player.Player");Object guardedPlayer=player.getConstructor().newInstance();
    entity.getField("owned").setBoolean(guardedPlayer,true);
    for(String operation:List.of("hurt","die","kill","setHealth","remove")) {
      Method action=Arrays.stream(player.getDeclaredMethods()).filter(m->m.getName().equals(operation)).findFirst().orElseThrow();
      Object[] arguments=Arrays.stream(action.getParameterTypes()).map(t->t==float.class?(Object)0f:null).toArray();
      Object result=action.invoke(guardedPlayer,arguments);
      if(action.getReturnType()==boolean.class)check(Boolean.FALSE.equals(result),"player damage falsely acknowledged");
    }
    check(player.getField("calls").getInt(guardedPlayer)==0&&living.getField("rawHealth").getFloat(guardedPlayer)==20,"final player mutation not rejected before callbacks");
    entity.getField("owned").setBoolean(guardedPlayer,false);player.getMethod("kill").invoke(guardedPlayer);
    check(player.getField("calls").getInt(guardedPlayer)==1,"released player original method suppressed");
    System.out.println("PASS final player operation frames verified by real JVM; original health retained, body not run, release preserves original body");
    Object owned=living.getConstructor().newInstance(),ordinary=living.getConstructor().newInstance();
    entity.getField("owned").setBoolean(owned,true);
    Method health=living.getMethod("getHealth"),alive=living.getMethod("isAlive"),dying=living.getMethod("isDeadOrDying"),removed=entity.getMethod("isRemoved"),bounds=entity.getMethod("getBoundingBox");
    check((float)health.invoke(owned)==20,"real stored health");check((float)health.invoke(ordinary)==0,"foreign callback preserved ordinary");
    check(!(boolean)removed.invoke(owned),"raw removal null");check((boolean)removed.invoke(ordinary),"foreign removal ordinary");
    check(bounds.invoke(owned)==entity.getField("bb").get(owned),"actual bounds identity");
    Field queryFailure=loader.loadClass("eff.lifetime.FieldWriteGate").getField("queryFailure");
    queryFailure.setBoolean(null,true);
    try {bounds.invoke(owned);throw new AssertionError("foreign handler swallowed failed ownership check");}
    catch(InvocationTargetException failure){check(failure.getCause() instanceof IllegalStateException,"failed ownership check propagates outside foreign handler");}
    finally {queryFailure.setBoolean(null,false);}
    check((boolean)alive.invoke(owned),"alive from actual health/removal");
    living.getField("rawHealth").setFloat(owned,0);check((float)health.invoke(owned)==0&&!(boolean)alive.invoke(owned)&&(boolean)dying.invoke(owned),"zero remains dead");
    living.getField("rawHealth").setFloat(owned,Float.NaN);check(Float.isNaN((float)health.invoke(owned))&&!(boolean)alive.invoke(owned),"NaN not forged healthy");
    living.getField("rawHealth").setFloat(owned,20);
    Field removal=entity.getDeclaredField("removalReason");removal.setAccessible(true);removal.set(owned,loader.loadClass("net.minecraft.world.entity.Entity$RemovalReason").getEnumConstants()[0]);
    check((boolean)removed.invoke(owned)&&!(boolean)alive.invoke(owned),"real removal not hidden");
    removal.set(owned,null);
    Class<?> lookup=loader.loadClass("net.minecraft.world.level.entity.EntityLookup");Object index=lookup.getConstructor().newInstance();
    Map<Object,Object> byUuid=(Map<Object,Object>)lookup.getField("byUuid").get(index);Map<Object,Object> byId=(Map<Object,Object>)lookup.getField("byId").get(index);UUID id=UUID.randomUUID();byUuid.put(id,owned);byId.put(12,owned);
    check(lookup.getMethod("getEntity",UUID.class).invoke(index,id)==owned&&lookup.getMethod("getEntity",int.class).invoke(index,12)==owned,"existing owned map entry identity");
    entity.getField("index").set(owned,index);lookup.getField("hide").setBoolean(index,false);
    check(lookup.getMethod("getEntity",int.class).invoke(index,12)==owned&&entity.getField("admitted").getBoolean(owned),"recursive initial admission uses original actual lookup");
    lookup.getField("hide").setBoolean(index,true);entity.getField("admitted").setBoolean(owned,false);
    check(lookup.getMethod("getEntity",int.class).invoke(index,12)==null&&!entity.getField("admitted").getBoolean(owned),"initial admission cannot forge filtered original registration");
    entity.getField("admitted").setBoolean(owned,true);
    byUuid.clear();byId.clear();check(lookup.getMethod("getEntity",UUID.class).invoke(index,id)==null&&lookup.getMethod("getEntity",int.class).invoke(index,12)==null,"absent map entry cannot be resurrected");
    byUuid.put(id,ordinary);check(lookup.getMethod("getEntity",UUID.class).invoke(index,id)==null,"ordinary lookup filtering preserved");
    Class<?> client=loader.loadClass("net.minecraft.client.multiplayer.ClientLevel");Object level=client.getConstructor().newInstance();Object clientIndex=client.getField("index").get(level);
    Map<Object,Object> clientMap=(Map<Object,Object>)lookup.getField("byId").get(clientIndex);Method getEntity=client.getMethod("getEntity",int.class);
    clientMap.put(12,owned);check(getEntity.invoke(level,12)==owned,"public client query retains raw authoritative entry despite outer filter");
    clientMap.clear();check(getEntity.invoke(level,12)==null,"public client absent entry remains absent");clientMap.put(12,ordinary);check(getEntity.invoke(level,12)==null,"public client ordinary outer filter preserved");
    Class<?> server=loader.loadClass("net.minecraft.server.level.ServerLevel");Object serverLevel=server.getConstructor().newInstance();
    Class<?> observer=loader.loadClass("eff.minecraft.PlayerLifetime");
    long[] observed=(long[])observer.getField("observed").get(null);
    Method dispatch=server.getMethod("m_184063_",loader.loadClass("net.minecraft.util.profiling.ProfilerFiller"),entity);
    server.getField("skipDispatch").setBoolean(serverLevel,true);dispatch.invoke(serverLevel,null,owned);
    check(Arrays.equals(observed,new long[]{1,0,0,0,0})&&entity.getField("tickCount").getInt(owned)==0,"dispatch gate distinguished without fake tick");
    server.getField("skipDispatch").setBoolean(serverLevel,false);server.getField("cancelTick").setBoolean(serverLevel,true);dispatch.invoke(serverLevel,null,owned);
    check(Arrays.equals(observed,new long[]{2,1,0,1,1})&&entity.getField("tickCount").getInt(owned)==0,"tick entry cancellation distinguished without fake tick");
    server.getField("cancelTick").setBoolean(serverLevel,false);dispatch.invoke(serverLevel,null,owned);
    check(Arrays.equals(observed,new long[]{3,2,1,2,2})&&entity.getField("tickCount").getInt(owned)==1&&observer.getField("lastObserved").get(null)==owned,"normal original tick executes exactly once");
    long[] decisions=(long[])observer.getField("decisions").get(null);
    check(decisions[0]==3&&decisions[1]==0&&decisions[2]==2&&decisions[3]==1&&decisions[5]==2,"actual branch results recorded");
    Object distance=server.getField("distance").get(serverLevel);Class<?> distanceClass=distance.getClass();
    distanceClass.getField("enabled").setBoolean(distance,false);dispatch.invoke(serverLevel,null,owned);
    check(decisions[4]==1&&decisions[5]==2&&observed[1]==2&&distanceClass.getField("calls").getInt(distance)==3,"false chunk predicate observed exactly once without forcing dispatch");
    distanceClass.getField("enabled").setBoolean(distance,true);server.getField("skipGuard").setBoolean(serverLevel,true);dispatch.invoke(serverLevel,null,owned);
    check(observed[3]==3&&observed[4]==3&&observed[1]==2,"guard callback cancellation distinguished from skipped guard call");
    Object vehicle=living.getConstructor().newInstance();entity.getField("owned").setBoolean(vehicle,true);entity.getField("riding").setBoolean(vehicle,true);entity.getField("vehicle").set(owned,vehicle);
    dispatch.invoke(serverLevel,null,owned);check(decisions[6]==1&&decisions[9]==1&&observed[3]==3,"vehicle branch preserved and recorded");
    entity.getField("vehicle").set(owned,null);dispatch.invoke(serverLevel,null,ordinary);
    check(decisions[1]==1&&observed[3]==3&&entity.getField("tickCount").getInt(owned)==1,"removed ordinary entity stays skipped; no diagnostic repair");
    server.getField("skipGuard").setBoolean(serverLevel,false);
    System.out.println("PASS world dispatch / tick-entry / counter-write observations distinguish early returns without changing original tick behavior");
    Object serverIndex=server.getField("index").get(serverLevel);
    Map<Object,Object> serverMap=(Map<Object,Object>)lookup.getField("byId").get(serverIndex);Method serverGet=server.getMethod("getEntity",int.class);
    serverMap.put(12,owned);check(serverGet.invoke(serverLevel,12)==owned,"public server query returns existing owned entry despite outer filter");
    serverMap.clear();check(serverGet.invoke(serverLevel,12)==null,"server absent entry remains absent");
    serverMap.put(12,ordinary);check(serverGet.invoke(serverLevel,12)==null,"server ordinary filtering remains unchanged");
    Method interaction=server.getMethod("getEntityOrPart",int.class);
    Map<Object,Object> parts=(Map<Object,Object>)server.getField("parts").get(serverLevel);
    Field bodyCalls=server.getField("interactionBodyCalls");
    serverMap.put(12,owned);parts.put(12,ordinary);
    check(interaction.invoke(serverLevel,12)==owned&&bodyCalls.getInt(serverLevel)==0,
        "interaction query returns currently registered original before a competing fallback");
    check(interaction.invoke(serverLevel,12)==owned&&serverMap.get(12)==owned,
        "repeated interaction preserves same reference without reinsertion");
    serverMap.clear();
    check(interaction.invoke(serverLevel,12)==ordinary&&serverMap.isEmpty()&&bodyCalls.getInt(serverLevel)==1,
        "lost original is not resurrected; multipart fallback still runs");
    parts.clear();check(interaction.invoke(serverLevel,12)==null&&serverMap.isEmpty(),
        "absent interaction remains absent");
    serverMap.put(12,ordinary);parts.put(12,ordinary);
    check(interaction.invoke(serverLevel,12)==ordinary&&bodyCalls.getInt(serverLevel)==3,
        "ordinary interaction follows original body");
    serverMap.put(12,owned);entity.getField("owned").setBoolean(owned,false);
    check(interaction.invoke(serverLevel,12)==ordinary&&bodyCalls.getInt(serverLevel)==4,
        "released original no longer bypasses original interaction behavior");
    entity.getField("owned").setBoolean(owned,true);
    System.out.println("PASS server interaction original identity / repeated lookup / absence not resurrected / multipart fallback / ordinary and released behavior");
    System.out.println("PASS final Java-CFT head / idempotence / actual health zero NaN removal bounds / actual map identity and absence / ordinary callbacks");
  }
}
