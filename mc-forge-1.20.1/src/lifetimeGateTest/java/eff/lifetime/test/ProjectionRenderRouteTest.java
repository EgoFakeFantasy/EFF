package eff.lifetime.test;

import eff.lifetime.FieldWriteGate;
import eff.finalgate.FinalLifetimeTransform;
import java.util.*;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;

/** Executable call-site regression. No Minecraft classes or renderer execute. */
public final class ProjectionRenderRouteTest implements Opcodes {
  private static final String LEVEL="net/minecraft/client/multiplayer/ClientLevel";
  private static final String DISPATCH="net/minecraft/client/renderer/entity/EntityRenderDispatcher";
  private static final String WORLD="net/minecraft/client/renderer/LevelRenderer";
  private static final String HELPER="eff/minecraft/client/ProjectionRenderBoundary";
  private static final String ENTITY="net/minecraft/world/entity/Entity";
  private static final String FRUSTUM="net/minecraft/client/renderer/culling/Frustum";
  private static final String POSE="com/mojang/blaze3d/vertex/PoseStack";
  private static final String BUFFER="net/minecraft/client/renderer/MultiBufferSource";
  private static final String SHOULD="(L"+ENTITY+";L"+FRUSTUM+";DDD)Z";
  private static final String DRAW="(L"+ENTITY+";DDDFFL"+POSE+";L"+BUFFER+";I)V";
  private static void check(boolean ok,String name){if(!ok)throw new AssertionError(name);}
  private static ClassNode type(String name){
    ClassNode node=new ClassNode();node.version=V17;node.access=ACC_PUBLIC;node.name=name;node.superName="java/lang/Object";
    MethodNode init=new MethodNode(ACC_PUBLIC,"<init>","()V",null,null);
    init.instructions.add(new VarInsnNode(ALOAD,0));init.instructions.add(new MethodInsnNode(INVOKESPECIAL,"java/lang/Object","<init>","()V",false));init.instructions.add(new InsnNode(RETURN));node.methods.add(init);return node;
  }
  private static byte[] bytes(ClassNode node){ClassWriter w=new ClassWriter(ClassWriter.COMPUTE_MAXS);node.accept(w);return w.toByteArray();}
  private static String withReceiver(String owner,String desc){return "(L"+owner+";"+desc.substring(1);}
  private static MethodNode caller(String method,String owner,String name,String desc,int opcode){
    MethodNode result=new MethodNode(ACC_PUBLIC|ACC_STATIC,method,withReceiver(owner,desc),null,null);
    int slot=0;for(Type arg:Type.getArgumentTypes(result.desc)){result.instructions.add(new VarInsnNode(arg.getOpcode(ILOAD),slot));slot+=arg.getSize();}
    result.instructions.add(new MethodInsnNode(opcode,owner,name,desc,false));
    result.instructions.add(new InsnNode(Type.getReturnType(desc).getOpcode(IRETURN)));return result;
  }
  private static ClassNode fixture(boolean mapped){
    ClassNode node=type(WORLD);
    node.methods.add(caller("enumerate",LEVEL,mapped?"m_104735_":"entitiesForRendering","()Ljava/lang/Iterable;",INVOKEVIRTUAL));
    node.methods.add(caller("cull",DISPATCH,mapped?"m_114397_":"shouldRender",SHOULD,INVOKEVIRTUAL));
    node.methods.add(caller("draw",DISPATCH,mapped?"m_114384_":"render",DRAW,INVOKEVIRTUAL));return node;
  }
  private static MethodNode body(String name,String desc,int access,int result){
    MethodNode method=new MethodNode(access,name,desc,null,null);method.instructions.add(new InsnNode(result));
    method.instructions.add(new InsnNode(Type.getReturnType(desc).getOpcode(IRETURN)));return method;
  }
  private static void increment(MethodNode method,String owner){
    method.instructions.add(new FieldInsnNode(GETSTATIC,owner,"calls","I"));method.instructions.add(new InsnNode(ICONST_1));method.instructions.add(new InsnNode(IADD));method.instructions.add(new FieldInsnNode(PUTSTATIC,owner,"calls","I"));
  }
  private static void execute(ClassNode routed)throws Exception{
    Map<String,byte[]> definitions=new HashMap<>();
    for(String name:List.of(ENTITY,FRUSTUM,POSE,BUFFER))definitions.put(name,bytes(type(name)));
    ClassNode level=type(LEVEL);level.methods.add(body("entitiesForRendering","()Ljava/lang/Iterable;",ACC_PUBLIC,ACONST_NULL));level.methods.add(body("m_104735_","()Ljava/lang/Iterable;",ACC_PUBLIC,ACONST_NULL));definitions.put(LEVEL,bytes(level));
    ClassNode dispatcher=type(DISPATCH);dispatcher.fields.add(new FieldNode(ACC_PUBLIC|ACC_STATIC,"calls","I",null,null));
    for(String name:List.of("shouldRender","m_114397_"))dispatcher.methods.add(body(name,SHOULD,ACC_PUBLIC,ICONST_0));
    for(String name:List.of("render","m_114384_")){MethodNode method=new MethodNode(ACC_PUBLIC,name,DRAW,null,null);increment(method,DISPATCH);method.instructions.add(new InsnNode(RETURN));dispatcher.methods.add(method);}definitions.put(DISPATCH,bytes(dispatcher));
    ClassNode helper=type(HELPER);helper.fields.add(new FieldNode(ACC_PUBLIC|ACC_STATIC,"calls","I",null,null));helper.fields.add(new FieldNode(ACC_PUBLIC|ACC_STATIC,"receiver","Ljava/lang/Object;",null,null));helper.fields.add(new FieldNode(ACC_PUBLIC|ACC_STATIC,"x","D",null,null));
    MethodNode enumeration=new MethodNode(ACC_PUBLIC|ACC_STATIC,"entities",withReceiver(LEVEL,"()Ljava/lang/Iterable;"),null,null);enumeration.instructions.add(new MethodInsnNode(INVOKESTATIC,"java/util/Collections","emptyList","()Ljava/util/List;",false));enumeration.instructions.add(new InsnNode(ARETURN));helper.methods.add(enumeration);
    helper.methods.add(body("shouldRender",withReceiver(DISPATCH,SHOULD),ACC_PUBLIC|ACC_STATIC,ICONST_1));
    MethodNode render=new MethodNode(ACC_PUBLIC|ACC_STATIC,"render",withReceiver(DISPATCH,DRAW),null,null);increment(render,HELPER);render.instructions.add(new VarInsnNode(ALOAD,0));render.instructions.add(new FieldInsnNode(PUTSTATIC,HELPER,"receiver","Ljava/lang/Object;"));render.instructions.add(new VarInsnNode(DLOAD,2));render.instructions.add(new FieldInsnNode(PUTSTATIC,HELPER,"x","D"));render.instructions.add(new InsnNode(RETURN));helper.methods.add(render);definitions.put(HELPER,bytes(helper));definitions.put(WORLD,bytes(routed));
    ClassLoader loader=new ClassLoader(ProjectionRenderRouteTest.class.getClassLoader()){
      @Override protected synchronized Class<?> loadClass(String name,boolean resolve)throws ClassNotFoundException{
        String key=name.replace('.','/');if(!definitions.containsKey(key))return super.loadClass(name,resolve);Class<?> type=findLoadedClass(name);if(type==null){byte[] data=definitions.get(key);type=defineClass(name,data,0,data.length);}if(resolve)resolveClass(type);return type;
      }
    };
    Class<?> world=loader.loadClass(WORLD.replace('/','.')),lc=loader.loadClass(LEVEL.replace('/','.')),dc=loader.loadClass(DISPATCH.replace('/','.')),ec=loader.loadClass(ENTITY.replace('/','.')),fc=loader.loadClass(FRUSTUM.replace('/','.')),pc=loader.loadClass(POSE.replace('/','.')),bc=loader.loadClass(BUFFER.replace('/','.')),hc=loader.loadClass(HELPER.replace('/','.'));
    Object l=lc.getConstructor().newInstance(),d=dc.getConstructor().newInstance(),e=ec.getConstructor().newInstance(),f=fc.getConstructor().newInstance();
    check(world.getMethod("enumerate",lc).invoke(null,l) instanceof List,"ROUTED_ENUMERATION_EXECUTED");
    check(Boolean.TRUE.equals(world.getMethod("cull",dc,ec,fc,double.class,double.class,double.class).invoke(null,d,e,f,1d,2d,3d)),"ROUTED_CULL_EXECUTED");
    world.getMethod("draw",dc,ec,double.class,double.class,double.class,float.class,float.class,pc,bc,int.class).invoke(null,d,e,12.5d,2d,3d,4f,5f,null,null,6);
    check(hc.getField("calls").getInt(null)==1&&dc.getField("calls").getInt(null)==0,"ROUTED_DRAW_ONLY");
    check(hc.getField("receiver").get(null)==d&&hc.getField("x").getDouble(null)==12.5d,"RECEIVER_AND_WIDE_STACK_PRESERVED");
  }
  public static void run()throws Exception{
    eventRoutes();
    for(boolean mapped:new boolean[]{false,true}){
      ClassNode node=fixture(mapped);check(FieldWriteGate.routeProjectionRenderCalls(node)==3,"EXACT_RENDER_ROUTE_COUNT");byte[] once=bytes(node);
      check(FieldWriteGate.routeProjectionRenderCalls(node)==0&&Arrays.equals(once,bytes(node)),"RENDER_ROUTE_IDEMPOTENT");execute(node);
      ClassNode throughInstrument=fixture(mapped);check(FieldWriteGate.instrument(throughInstrument)==3,"INSTRUMENT_CALLS_RENDER_PASS");
      byte[] original=bytes(fixture(mapped));var finalResult=FinalLifetimeTransform.transform(original);
      check(finalResult.methods()==3,"FINAL_RENDER_ROUTE_COUNT");ClassNode finalNode=new ClassNode();new ClassReader(finalResult.bytes()).accept(finalNode,0);execute(finalNode);
      var repeated=FinalLifetimeTransform.transform(finalResult.bytes());check(repeated.methods()==0&&Arrays.equals(repeated.bytes(),finalResult.bytes()),"FINAL_RENDER_ROUTE_IDEMPOTENT");
      var alreadyRouted=FinalLifetimeTransform.transform(once);check(alreadyRouted.methods()==0&&Arrays.equals(once,alreadyRouted.bytes()),"FINAL_ACCEPTS_EXISTING_GATE_ROUTES");
      ClassNode foreign=fixture(mapped);foreign.name="fixture/UnrelatedRenderer";byte[] before=bytes(foreign);check(FieldWriteGate.routeProjectionRenderCalls(foreign)==0&&Arrays.equals(before,bytes(foreign)),"NON_TARGET_CLASS_UNCHANGED");
    }
    ClassNode untouched=type(WORLD);untouched.methods.add(caller("wrongName",DISPATCH,"other",SHOULD,INVOKEVIRTUAL));untouched.methods.add(caller("special",DISPATCH,"shouldRender",SHOULD,INVOKESPECIAL));untouched.methods.add(caller("wrongDescriptor",DISPATCH,"shouldRender","()Z",INVOKEVIRTUAL));untouched.methods.add(caller("wrongOwner","fixture/OtherDispatcher","shouldRender",SHOULD,INVOKEVIRTUAL));byte[] before=bytes(untouched);check(FieldWriteGate.routeProjectionRenderCalls(untouched)==0&&Arrays.equals(before,bytes(untouched)),"OTHER_OPERATIONS_UNCHANGED");
    ClassNode removed=type(WORLD);check(FieldWriteGate.routeProjectionRenderCalls(removed)==0,"ABSENT_CALL_NOT_FABRICATED");
    for(String missing:List.of("enumerate","cull","draw")){
      ClassNode absent=fixture(true);absent.methods.removeIf(method->method.name.equals(missing));boolean refused=false;
      try{FinalLifetimeTransform.transform(bytes(absent));}catch(IllegalStateException expected){refused=expected.getMessage().startsWith("FINAL_RENDER_ROUTE_MISSING:");}
      check(refused,"FINAL_MISSING_ROUTE_REFUSED_"+missing);
    }
    System.out.println("PROJECTION_RENDER_ROUTE_OK mapped=true named=true executableStack=true idempotent=true nonTargetsUnchanged=true absentCallNotRecreated=true finalMissingRoutesRefused=true finalAgentIntegrationNotAsserted=true");
  }
  public static void main(String[] args)throws Exception{run();}

  private static void eventRoutes() throws Exception {
    String target="net/minecraft/client/renderer/entity/LivingEntityRenderer";
    String bus="net/minecraftforge/eventbus/api/IEventBus", event="net/minecraftforge/eventbus/api/Event";
    String helper="eff/minecraft/client/ProjectionRenderEvents", desc="(L"+event+";)Z";
    ClassNode original=type(target);
    for(String name:List.of("pre","post")) {
      MethodNode m=caller(name,bus,"post",desc,INVOKEINTERFACE);
      for(AbstractInsnNode i:m.instructions)if(i instanceof MethodInsnNode call)call.itf=true;
      InsnList create=new InsnList();String eventType="net/minecraftforge/client/event/RenderLivingEvent$"+(name.equals("pre")?"Pre":"Post");
      create.add(new TypeInsnNode(NEW,eventType));create.add(new InsnNode(DUP));create.add(new MethodInsnNode(INVOKESPECIAL,eventType,"<init>","()V",false));create.add(new InsnNode(POP));m.instructions.insert(create);
      original.methods.add(m);
    }
    byte[] input=bytes(original);
    check(FieldWriteGate.routeProjectionRenderEvents(original)==2,"EARLY_EVENT_ROUTES");
    check(FieldWriteGate.routeProjectionRenderEvents(original)==0,"EARLY_EVENT_IDEMPOTENT");
    var result=FinalLifetimeTransform.transform(input);
    check(result.methods()==2,"FINAL_EVENT_ROUTES");
    check(FinalLifetimeTransform.transform(result.bytes()).methods()==0,"FINAL_EVENT_IDEMPOTENT");
    check(FinalLifetimeTransform.transform(bytes(original)).methods()==0,"FINAL_ACCEPTS_EARLY_EVENT_ROUTES");
    ClassNode shared=new ClassNode();new ClassReader(input).accept(shared,0);
    for(MethodNode m:shared.methods)for(AbstractInsnNode i:m.instructions.toArray())if(i instanceof MethodInsnNode c&&c.owner.equals(bus))
      m.instructions.set(c,new MethodInsnNode(INVOKESTATIC,target,"sharedDispatch",withReceiver(bus,desc),false));
    MethodNode common=caller("sharedDispatch",bus,"post",desc,INVOKEINTERFACE);
    for(AbstractInsnNode i:common.instructions)if(i instanceof MethodInsnNode c)c.itf=true;shared.methods.add(common);
    var sharedResult=FinalLifetimeTransform.transform(bytes(shared));check(sharedResult.methods()==1,"SHARED_PRE_POST_DISPATCH_ACCEPTED");
    check(FinalLifetimeTransform.transform(sharedResult.bytes()).methods()==0,"SHARED_DISPATCH_IDEMPOTENT");
    // A detached post method is not coverage for a creator that never reaches it.
    ClassNode detached=new ClassNode();new ClassReader(input).accept(detached,0);
    for(MethodNode m:detached.methods)if(m.name.equals("post"))for(AbstractInsnNode i:m.instructions.toArray())if(i instanceof MethodInsnNode c&&c.owner.equals(bus)){
      InsnList drop=new InsnList();drop.add(new InsnNode(POP2));drop.add(new InsnNode(ICONST_0));m.instructions.insertBefore(c,drop);m.instructions.remove(c);}
    boolean unconnected=false;try{FinalLifetimeTransform.transform(bytes(detached));}catch(IllegalStateException expected){unconnected=expected.getMessage().contains("unconnected");}check(unconnected,"DETACHED_POST_REFUSED");
    ClassNode absent=type(target);boolean refused=false;
    try{FinalLifetimeTransform.transform(bytes(absent));}catch(IllegalStateException expected){refused=expected.getMessage().startsWith("FINAL_RENDER_EVENTS_MISSING:");}
    check(refused,"ABSENT_EVENT_ROUTES_REFUSED");
    original.name="fixture/UnrelatedLivingRenderer";
    check(FieldWriteGate.routeProjectionRenderEvents(original)==0,"UNRELATED_EVENTS_UNCHANGED");
    Map<String,byte[]> definitions=new HashMap<>();
    ClassNode bc=new ClassNode();bc.version=V17;bc.access=ACC_PUBLIC|ACC_INTERFACE|ACC_ABSTRACT;bc.name=bus;bc.superName="java/lang/Object";
    bc.methods.add(new MethodNode(ACC_PUBLIC|ACC_ABSTRACT,"post",desc,null,null));definitions.put(bus,bytes(bc));definitions.put(event,bytes(type(event)));
    for(String phase:List.of("Pre","Post")) {String name="net/minecraftforge/client/event/RenderLivingEvent$"+phase;definitions.put(name,bytes(type(name)));}
    ClassNode hc=type(helper);MethodNode pass=caller("post",bus,"post",desc,INVOKEINTERFACE);
    for(AbstractInsnNode i:pass.instructions)if(i instanceof MethodInsnNode call)call.itf=true;
    hc.methods.add(pass);definitions.put(helper,bytes(hc));definitions.put(target,sharedResult.bytes());
    ClassLoader loader=new ClassLoader(ProjectionRenderRouteTest.class.getClassLoader()) {
      @Override protected synchronized Class<?> loadClass(String name,boolean resolve)throws ClassNotFoundException{
        byte[] b=definitions.get(name.replace('.','/'));if(b==null)return super.loadClass(name,resolve);
        Class<?> c=findLoadedClass(name);if(c==null)c=defineClass(name,b,0,b.length);if(resolve)resolveClass(c);return c;
      }
    };
    Class<?> busClass=loader.loadClass(bus.replace('/','.')),eventClass=loader.loadClass(event.replace('/','.')),rendererClass=loader.loadClass(target.replace('/','.'));
    Object originalEvent=eventClass.getConstructor().newInstance();int[] called={0};
    Object busObject=java.lang.reflect.Proxy.newProxyInstance(loader,new Class<?>[]{busClass},(p,m,args)->{check(args[0]==originalEvent,"EVENT_REFERENCE_PRESERVED");called[0]++;return true;});
    for(String name:List.of("pre","post"))check(Boolean.TRUE.equals(rendererClass.getMethod(name,busClass,eventClass).invoke(null,busObject,originalEvent)),"EVENT_STACK_AND_RESULT_EXECUTE");
    check(called[0]==2,"BOTH_ORIGINAL_CALLBACKS_EXECUTED");
    System.out.println("PROJECTION_RENDER_EVENTS_ROUTE_OK receiverPreserved=true executable=true idempotent=true absentRefused=true");
  }
}
