package eff.finalgate;

import java.util.*;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;
import eff.lifetime.PlayerOperationTransform;

/** Final Java-CFT pass. Reads actual storage for an actively claimed instance only.
 * Does not replace classes, clear foreign lists, write game state, or resurrect absent entries.
 * Native hooks after the Java manager and replacement query wrappers remain outside this pass.
 */
public final class FinalLifetimeTransform implements Opcodes {
  private static final String ENTITY="net/minecraft/world/entity/Entity";
  private static final String LIVING="net/minecraft/world/entity/LivingEntity";
  private static final String LOOKUP="net/minecraft/world/level/entity/EntityLookup";
  private static final String CLIENT="net/minecraft/client/multiplayer/ClientLevel";
  private static final String SERVER="net/minecraft/server/level/ServerLevel";
  private static final String LEVEL_RENDERER="net/minecraft/client/renderer/LevelRenderer";
  private static final String LIVING_RENDERER="net/minecraft/client/renderer/entity/LivingEntityRenderer";
  private static final Set<String> INDEX_MAPS=Set.of("it/unimi/dsi/fastutil/ints/Int2ObjectLinkedOpenHashMap", "it/unimi/dsi/fastutil/ints/Int2ObjectOpenHashMap");
  private static final String BEGIN="EFF_FINAL_LIFETIME_V1_BEGIN", END="EFF_FINAL_LIFETIME_V1_END";
  public record Result(byte[] bytes,int methods) {}
  public static boolean supports(String name) { return TrustedTickTransform.supports(name)||ENTITY.equals(name)||LIVING.equals(name)||LOOKUP.equals(name)||CLIENT.equals(name)||SERVER.equals(name)||LEVEL_RENDERER.equals(name)||LIVING_RENDERER.equals(name)||INDEX_MAPS.contains(name)||PlayerOperationTransform.supports(name); }
  public static Result transform(byte[] input) {
    ClassReader reader=new ClassReader(input);
    if(!supports(reader.getClassName()))return new Result(input,0);
    if(TrustedTickTransform.supports(reader.getClassName())){
      byte[] result=TrustedTickTransform.transform(input);return new Result(result,Arrays.equals(input,result)?0:1);
    }
    ClassNode node=new ClassNode();reader.accept(node,ClassReader.EXPAND_FRAMES);
    if (LEVEL_RENDERER.equals(node.name)) return renderRoutes(node, input);
    if (LIVING_RENDERER.equals(node.name)) return renderEvents(node, input);
    int count=PlayerOperationTransform.instrumentOperations(node)+observeWorldTicks(node), matched=0;
    for(MethodNode method:node.methods) {
      String kind=kind(node.name,method);if(kind==null)continue;
      matched++;
      if((method.access&(ACC_STATIC|ACC_ABSTRACT|ACC_NATIVE))!=0)throw new IllegalStateException("FINAL_LIFETIME_METHOD_SHAPE:"+node.name+"#"+method.name);
      int previousLocals=method.maxLocals;
      // A later transformer may jump to, catch around, or reference any prior label.
      // Never remove the previous region: add a new dominating head and retain every
      // original label/frame/exception/local-variable reference. An unchanged head is
      // idempotent above. A new hostile head requires one additional guarded prefix.
      boolean named=!method.name.startsWith("m_");
      InsnList code=new InsnList();LabelNode ordinary=new LabelNode();
      code.add(new LdcInsnNode(BEGIN));code.add(new InsnNode(POP));
      if(kind.equals("mapremove")||kind.equals("mapclear")) {
        code.add(new VarInsnNode(ALOAD,0));
        if(kind.equals("mapremove"))code.add(new VarInsnNode(ILOAD,1));
        code.add(new MethodInsnNode(INVOKESTATIC,"eff/lifetime/FieldWriteGate",
            kind.equals("mapremove")?"rejectIntMapRemoval":"rejectMapClear",
            kind.equals("mapremove")?"(Ljava/util/Map;I)Z":"(Ljava/util/Map;)Z",false));
        code.add(new JumpInsnNode(IFEQ,ordinary));
        if(kind.equals("mapremove")){code.add(new InsnNode(ACONST_NULL));code.add(new InsnNode(ARETURN));}
        else code.add(new InsnNode(RETURN));
      } else if(kind.equals("id")||kind.equals("uuid")||kind.equals("clientid")||kind.equals("serverid")) {
        int slot=method.maxLocals;method.maxLocals++;
        code.add(new VarInsnNode(ALOAD,0));
        if(kind.equals("clientid")||kind.equals("serverid")) {
          code.add(new VarInsnNode(ILOAD,1));
          code.add(new MethodInsnNode(INVOKESTATIC,"eff/minecraft/ProjectionProbe",kind.equals("clientid")?"clientEntityById":"serverEntityById","(Ljava/lang/Object;I)L"+ENTITY+";",false));
        } else if(kind.equals("id")) {
          code.add(new FieldInsnNode(GETFIELD,LOOKUP,named?"byId":"f_156807_","Lit/unimi/dsi/fastutil/ints/Int2ObjectMap;"));
          code.add(new VarInsnNode(ILOAD,1));
          code.add(new MethodInsnNode(INVOKEINTERFACE,"it/unimi/dsi/fastutil/ints/Int2ObjectMap","get","(I)Ljava/lang/Object;",true));
        } else {
          code.add(new FieldInsnNode(GETFIELD,LOOKUP,named?"byUuid":"f_156808_","Ljava/util/Map;"));
          code.add(new VarInsnNode(ALOAD,1));
          code.add(new MethodInsnNode(INVOKEINTERFACE,"java/util/Map","get","(Ljava/lang/Object;)Ljava/lang/Object;",true));
        }
        code.add(new VarInsnNode(ASTORE,slot));code.add(new VarInsnNode(ALOAD,slot));reject(code);
        code.add(new JumpInsnNode(IFEQ,ordinary));code.add(new VarInsnNode(ALOAD,slot));
        code.add(new TypeInsnNode(CHECKCAST,kind.equals("clientid")||kind.equals("serverid")?ENTITY:"net/minecraft/world/level/entity/EntityAccess"));code.add(new InsnNode(ARETURN));
      } else {
        code.add(new VarInsnNode(ALOAD,0));reject(code);code.add(new JumpInsnNode(IFEQ,ordinary));
        if(kind.equals("health")) { health(code);code.add(new InsnNode(FRETURN)); }
        else if(kind.equals("bounds")) {
          code.add(new VarInsnNode(ALOAD,0));code.add(new FieldInsnNode(GETFIELD,ENTITY,named?"bb":"f_19828_","Lnet/minecraft/world/phys/AABB;"));code.add(new InsnNode(ARETURN));
        } else if(kind.equals("removed")) {
          LabelNode removed=new LabelNode();removal(code,named);code.add(new JumpInsnNode(IFNONNULL,removed));
          code.add(new InsnNode(ICONST_0));code.add(new InsnNode(IRETURN));code.add(removed);frame(code,node.name,kind);code.add(new InsnNode(ICONST_1));code.add(new InsnNode(IRETURN));
        } else if(kind.equals("alive")) {
          LabelNode dead=new LabelNode();code.add(new VarInsnNode(ALOAD,0));code.add(new MethodInsnNode(INVOKESPECIAL,ENTITY,named?"isRemoved":"m_213877_","()Z",false));code.add(new JumpInsnNode(IFNE,dead));
          health(code);code.add(new InsnNode(FCONST_0));code.add(new InsnNode(FCMPL));code.add(new JumpInsnNode(IFLE,dead));
          code.add(new InsnNode(ICONST_1));code.add(new InsnNode(IRETURN));code.add(dead);frame(code,node.name,kind);code.add(new InsnNode(ICONST_0));code.add(new InsnNode(IRETURN));
        } else {
          LabelNode healthy=new LabelNode();health(code);code.add(new InsnNode(FCONST_0));code.add(new InsnNode(FCMPG));code.add(new JumpInsnNode(IFGT,healthy));
          code.add(new InsnNode(ICONST_1));code.add(new InsnNode(IRETURN));code.add(healthy);frame(code,node.name,kind);code.add(new InsnNode(ICONST_0));code.add(new InsnNode(IRETURN));
        }
      }
      code.add(ordinary);frame(code,node.name,kind);code.add(new LdcInsnNode(END));code.add(new InsnNode(POP));
      // A marker is not a seal: later passes can retain it while changing field reads,
      // calls or jump destinations inside the prefix. Compare the complete executable
      // region and its control-flow edges before treating this method as unchanged.
      int scratch=method.maxLocals>previousLocals?previousLocals:-1;
      if(samePrefix(method,code,scratch)){method.maxLocals=previousLocals;continue;}
      method.instructions.insert(code);count++;
    }
    int expected=node.name.equals(CLIENT)?1:node.name.equals(SERVER)?2:node.name.equals(LIVING)?3
        :PlayerOperationTransform.supports(node.name)&&!node.name.equals(ENTITY)?0:2;
    if(matched!=expected)throw new IllegalStateException("FINAL_LIFETIME_MAPPING:"+node.name+":"+matched+"/"+expected);
    if(count==0)return new Result(input,0);
    // Preserve all existing frames and type merges. New branches use explicit initial-local
    // frames; the scratch lookup local is deliberately TOP after ordinary continuation.
    ClassWriter writer=new ClassWriter(ClassWriter.COMPUTE_MAXS);
    node.accept(writer);return new Result(writer.toByteArray(),count);
  }
  // Read-only execution and branch-result diagnostics. In particular,
  // observing the existing counter write must never increment the game counter.
  private static int observeWorldTicks(ClassNode node) {
    if(!SERVER.equals(node.name))return 0;
    int changed=0;
    for(MethodNode method:node.methods) {
      boolean dispatch=method.name.equals("m_184063_")&&method.desc.equals("(Lnet/minecraft/util/profiling/ProfilerFiller;L"+ENTITY+";)V");
      boolean tick=(method.name.equals("m_8647_")||method.name.equals("tickNonPassenger"))&&method.desc.equals("(L"+ENTITY+";)V");
      if(!dispatch&&!tick)continue;
      if((method.access&(ACC_STATIC|ACC_NATIVE|ACC_ABSTRACT))!=0)throw new IllegalStateException("WORLD_TICK_OBSERVER_SHAPE");
      if(dispatch)changed+=observeDispatchDecisions(method);
      FieldInsnNode counter=null;int writes=0;
      if(tick)for(AbstractInsnNode insn:method.instructions.toArray())if(insn instanceof FieldInsnNode field
          &&field.getOpcode()==PUTFIELD&&field.owner.equals(ENTITY)&&field.desc.equals("I")
          &&(field.name.equals("f_19797_")||field.name.equals("tickCount"))){counter=field;writes++;}
      if(tick&&writes!=1)throw new IllegalStateException("WORLD_TICK_COUNTER_SHAPE:"+writes);
      int slot=dispatch?2:1,phase=dispatch?0:1;
      boolean head=observed(method.instructions.getFirst(),slot,phase);
      boolean body=!tick||observed(counter.getPrevious()==null?null:counter.getPrevious().getPrevious()==null?null:counter.getPrevious().getPrevious().getPrevious(),1,2);
      if(head&&body)continue;
      // Relocate only exact owned three-instruction probes; retain every original
      // branch label, frame and handler. This avoids double-counting on retransforms.
      for(AbstractInsnNode insn:method.instructions.toArray())for(int p=0;p<3;p++)if(observed(insn,slot,p)) {
        AbstractInsnNode value=insn.getNext(),call=value.getNext();
        method.instructions.remove(insn);method.instructions.remove(value);method.instructions.remove(call);break;
      }
      method.instructions.insert(observation(slot,phase));
      if(tick)method.instructions.insertBefore(counter,observation(1,2));
      changed++;
    }
    return changed;
  }
  private static int observeDispatchDecisions(MethodNode method) {
    List<MethodInsnNode> calls=new ArrayList<>();List<Integer> phases=new ArrayList<>();
    MethodInsnNode guard=null;int removed=0,discard=0,chunk=0,passenger=0,guards=0;
    for(AbstractInsnNode insn:method.instructions.toArray())if(insn instanceof MethodInsnNode call&&call.getOpcode()==INVOKEVIRTUAL) {
      if(call.owner.equals(ENTITY)&&(call.name.equals("m_213877_")||call.name.equals("isRemoved"))&&call.desc.equals("()Z")) {
        int phase=switch(removed++){case 0->0;case 1->3;case 2->5;default->throw new IllegalStateException("WORLD_DISPATCH_REMOVED_SHAPE");};
        calls.add(call);phases.add(phase);
      }else if(call.owner.equals(SERVER)&&call.name.equals("m_143342_")&&call.desc.equals("(L"+ENTITY+";)Z")) {
        discard++;calls.add(call);phases.add(1);
      }else if(call.owner.equals("net/minecraft/server/level/DistanceManager")&&call.name.equals("m_183913_")&&call.desc.equals("(J)Z")) {
        chunk++;calls.add(call);phases.add(2);
      }else if(call.owner.equals(ENTITY)&&(call.name.equals("m_20363_")||call.name.equals("hasPassenger"))&&call.desc.equals("(L"+ENTITY+";)Z")) {
        passenger++;calls.add(call);phases.add(4);
      }else if((call.owner.equals(SERVER)||call.owner.equals("net/minecraft/world/level/Level"))
          &&call.name.equals("m_46653_")&&call.desc.equals("(Ljava/util/function/Consumer;L"+ENTITY+";)V")){guard=call;guards++;}
    }
    // Vanilla SRG has two removed checks; Forge adds the third before its part
    // entity check. Observe that additional predicate only when actually present.
    if((removed!=2&&removed!=3)||discard!=1||chunk!=1||passenger!=1||guards!=1)
      throw new IllegalStateException("WORLD_DISPATCH_DECISION_SHAPE:"+removed+":"+discard+":"+chunk+":"+passenger+":"+guards);
    boolean changed=false;
    for(int i=0;i<calls.size();i++) {
      MethodInsnNode call=calls.get(i);int phase=phases.get(i);
      if(decisionObserved(call.getNext(),phase))continue;
      InsnList code=new InsnList();code.add(new InsnNode(DUP));code.add(new VarInsnNode(ALOAD,2));
      code.add(new InsnNode(ICONST_0+phase));
      code.add(new MethodInsnNode(INVOKESTATIC,"eff/minecraft/PlayerLifetime","observeWorldDecision","(ZLjava/lang/Object;I)V",false));
      method.instructions.insert(call,code);changed=true;
    }
    AbstractInsnNode before=guard.getPrevious();
    if(!observed(before==null||before.getPrevious()==null?null:before.getPrevious().getPrevious(),2,3)) {
      method.instructions.insertBefore(guard,observation(2,3));changed=true;
    }
    if(!observed(guard.getNext(),2,4)){method.instructions.insert(guard,observation(2,4));changed=true;}
    return changed?1:0;
  }
  private static boolean decisionObserved(AbstractInsnNode insn,int phase) {
    if(insn==null||insn.getOpcode()!=DUP||!(insn.getNext() instanceof VarInsnNode variable)
        ||variable.getOpcode()!=ALOAD||variable.var!=2)return false;
    AbstractInsnNode value=variable.getNext();
    return value!=null&&value.getOpcode()==ICONST_0+phase&&value.getNext() instanceof MethodInsnNode call
        &&call.getOpcode()==INVOKESTATIC&&!call.itf&&call.owner.equals("eff/minecraft/PlayerLifetime")
        &&call.name.equals("observeWorldDecision")&&call.desc.equals("(ZLjava/lang/Object;I)V");
  }
  private static boolean observed(AbstractInsnNode insn,int slot,int phase) {
    if(!(insn instanceof VarInsnNode variable)||variable.getOpcode()!=ALOAD||variable.var!=slot)return false;
    AbstractInsnNode value=insn.getNext();
    return value!=null&&value.getOpcode()==ICONST_0+phase&&value.getNext() instanceof MethodInsnNode call
        &&call.getOpcode()==INVOKESTATIC&&!call.itf&&call.owner.equals("eff/minecraft/PlayerLifetime")
        &&call.name.equals("observeWorldTick")&&call.desc.equals("(Ljava/lang/Object;I)V");
  }
  private static InsnList observation(int slot,int phase) {
    InsnList out=new InsnList();out.add(new VarInsnNode(ALOAD,slot));out.add(new InsnNode(ICONST_0+phase));
    out.add(new MethodInsnNode(INVOKESTATIC,"eff/minecraft/PlayerLifetime","observeWorldTick","(Ljava/lang/Object;I)V",false));return out;
  }
  /** Same receiver-preserving call-site operation as FieldWriteGate, at the final
   * Java manager boundary. Preserve all other instructions and class schema.
   * Missing routes are an explicit refused candidate, never an invented renderer.
   */
  private static Result renderRoutes(ClassNode node, byte[] input) {
    String dispatcher="net/minecraft/client/renderer/entity/EntityRenderDispatcher";
    String helper="eff/minecraft/client/ProjectionRenderBoundary";
    String[] names={"entities","shouldRender","render"};
    String[] owners={CLIENT,dispatcher,dispatcher};
    String[] descriptors={"()Ljava/lang/Iterable;",
        "(Lnet/minecraft/world/entity/Entity;Lnet/minecraft/client/renderer/culling/Frustum;DDD)Z",
        "(Lnet/minecraft/world/entity/Entity;DDDFFLcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/MultiBufferSource;I)V"};
    String[] mapped={"m_104735_","m_114397_","m_114384_"};
    String[] named={"entitiesForRendering","shouldRender","render"};
    int[] seen=new int[3];int changed=0;
    for(MethodNode method:node.methods)for(AbstractInsnNode instruction:method.instructions.toArray()) {
      if(!(instruction instanceof MethodInsnNode call)||call.itf)continue;
      for(int i=0;i<3;i++) {
        String staticDescriptor="(L"+owners[i]+";"+descriptors[i].substring(1);
        if(call.getOpcode()==INVOKESTATIC&&call.owner.equals(helper)&&call.name.equals(names[i])&&call.desc.equals(staticDescriptor)) {
          seen[i]++;break;
        }
        if(call.getOpcode()!=INVOKEVIRTUAL||!call.owner.equals(owners[i])||!call.desc.equals(descriptors[i])
            ||!(call.name.equals(named[i])||call.name.equals(mapped[i])))continue;
        method.instructions.set(call,new MethodInsnNode(INVOKESTATIC,helper,names[i],staticDescriptor,false));
        seen[i]++;changed++;break;
      }
    }
    for(int i=0;i<seen.length;i++)if(seen[i]==0)
      throw new IllegalStateException("FINAL_RENDER_ROUTE_MISSING:"+names[i]);
    if(changed==0)return new Result(input,0);
    ClassWriter writer=new ClassWriter(ClassWriter.COMPUTE_MAXS);node.accept(writer);
    return new Result(writer.toByteArray(),changed);
  }
  private static Result renderEvents(ClassNode node, byte[] input) {
    String bus="net/minecraftforge/eventbus/api/IEventBus";
    String desc="(Lnet/minecraftforge/eventbus/api/Event;)Z";
    String helper="eff/minecraft/client/ProjectionRenderEvents", routed="(L"+bus+";"+desc.substring(1);
    int seen=0, changed=0;
    Map<String,Set<String>> edges=new HashMap<>();
    Map<String,Set<String>> creators=new HashMap<>();
    Set<String> routedMethods=new HashSet<>();
    for(MethodNode method:node.methods) for(AbstractInsnNode insn:method.instructions.toArray()) {
      if(!(insn instanceof MethodInsnNode call))continue;
      String key=method.name+method.desc;
      if(call.owner.equals(node.name))edges.computeIfAbsent(key,k->new HashSet<>()).add(call.name+call.desc);
      if(call.name.equals("<init>")&&(call.owner.equals("net/minecraftforge/client/event/RenderLivingEvent$Pre")
          ||call.owner.equals("net/minecraftforge/client/event/RenderLivingEvent$Post")))
        creators.computeIfAbsent(call.owner,k->new HashSet<>()).add(key);
      if(!call.name.equals("post"))continue;
      if(call.getOpcode()==INVOKESTATIC&&call.owner.equals(helper)&&call.desc.equals(routed)&&!call.itf) {seen++;routedMethods.add(key);continue;}
      if(call.getOpcode()!=INVOKEINTERFACE||!call.owner.equals(bus)||!call.desc.equals(desc)||!call.itf)continue;
      method.instructions.set(call,new MethodInsnNode(INVOKESTATIC,helper,"post",routed,false));seen++;changed++;routedMethods.add(key);
    }
    // A Mixin may share one redirect handler between Pre and Post. Verify both
    // construction paths can reach a routed dispatch in this class, not a count of
    // physical post instructions. This is call-graph coverage, not arbitrary CFG proof.
    if(seen==0)throw new IllegalStateException("FINAL_RENDER_EVENTS_MISSING:dispatch");
    for(String phase:List.of("Pre","Post")) {
      Set<String> roots=creators.get("net/minecraftforge/client/event/RenderLivingEvent$"+phase);
      if(roots==null||roots.isEmpty())throw new IllegalStateException("FINAL_RENDER_EVENTS_MISSING:"+phase);
      for(String root:roots) {
        Set<String> visited=new HashSet<>();ArrayDeque<String> todo=new ArrayDeque<>();todo.add(root);boolean found=false;
        while(!todo.isEmpty()){String key=todo.removeFirst();if(!visited.add(key))continue;
          if(routedMethods.contains(key)){found=true;break;}todo.addAll(edges.getOrDefault(key,Set.of()));}
        if(!found)throw new IllegalStateException("FINAL_RENDER_EVENTS_MISSING:"+phase+":unconnected");
      }
    }
    if(changed==0)return new Result(input,0);
    ClassWriter writer=new ClassWriter(ClassWriter.COMPUTE_MAXS);node.accept(writer);
    return new Result(writer.toByteArray(),changed);
  }
  private static String kind(String owner,MethodNode m) {
    if(owner.equals(ENTITY)) {
      if(m.desc.equals("()Z")&&Set.of("isRemoved","m_213877_").contains(m.name))return "removed";
      if(m.desc.equals("()Lnet/minecraft/world/phys/AABB;")&&Set.of("getBoundingBox","m_20191_").contains(m.name))return "bounds";
    } else if(owner.equals(LIVING)) {
      if(m.desc.equals("()F")&&Set.of("getHealth","m_21223_").contains(m.name))return "health";
      if(m.desc.equals("()Z")&&Set.of("isAlive","m_6084_").contains(m.name))return "alive";
      if(m.desc.equals("()Z")&&Set.of("isDeadOrDying","m_21224_").contains(m.name))return "dying";
    } else if(owner.equals(LOOKUP)) {
      if(m.desc.equals("(I)Lnet/minecraft/world/level/entity/EntityAccess;")&&Set.of("getEntity","m_156812_").contains(m.name))return "id";
      if(m.desc.equals("(Ljava/util/UUID;)Lnet/minecraft/world/level/entity/EntityAccess;")&&Set.of("getEntity","m_156819_").contains(m.name))return "uuid";
    } else if(owner.equals(CLIENT)) {
      if(m.desc.equals("(I)L"+ENTITY+";")&&Set.of("getEntity","m_6815_").contains(m.name))return "clientid";
    } else if(owner.equals(SERVER)) {
      if(m.desc.equals("(I)L"+ENTITY+";")&&Set.of("getEntity","m_6815_").contains(m.name))return "serverid";
      // Player interaction packets use this separate lookup, including a multipart
      // fallback. Guard only a currently registered, actively claimed original;
      // absent/ordinary IDs still execute the complete existing method body.
      if(m.desc.equals("(I)L"+ENTITY+";")&&Set.of("getEntityOrPart","m_143317_").contains(m.name))return "serverid";
    } else if(INDEX_MAPS.contains(owner)) {
      if(m.name.equals("remove")&&m.desc.equals("(I)Ljava/lang/Object;"))return "mapremove";
      if(m.name.equals("clear")&&m.desc.equals("()V"))return "mapclear";
    }
    return null;
  }
  private static void reject(InsnList code){code.add(new MethodInsnNode(INVOKESTATIC,"eff/lifetime/FieldWriteGate","rejectQuery","(Ljava/lang/Object;)Z",false));}
  private static void health(InsnList code){code.add(new VarInsnNode(ALOAD,0));code.add(new MethodInsnNode(INVOKESTATIC,"eff/minecraft/ProjectionProbe","storedHealth","(Lnet/minecraft/world/entity/LivingEntity;)Ljava/lang/Float;",false));code.add(new MethodInsnNode(INVOKEVIRTUAL,"java/lang/Float","floatValue","()F",false));}
  private static void removal(InsnList code,boolean named){code.add(new VarInsnNode(ALOAD,0));code.add(new FieldInsnNode(GETFIELD,ENTITY,named?"removalReason":"f_146795_","Lnet/minecraft/world/entity/Entity$RemovalReason;"));}
  private static void frame(InsnList code,String owner,String kind){Object[] locals=kind.equals("id")||kind.equals("clientid")||kind.equals("serverid")||kind.equals("mapremove")?new Object[]{owner,INTEGER}:kind.equals("uuid")?new Object[]{owner,"java/util/UUID"}:new Object[]{owner};code.add(new FrameNode(F_NEW,locals.length,locals,0,new Object[0]));}
  private static AbstractInsnNode executable(AbstractInsnNode n){while(n!=null&&n.getOpcode()<0)n=n.getNext();return n;}
  private static boolean samePrefix(MethodNode method,InsnList expected,int scratch) {
    InsnList actual=method.instructions;
    List<AbstractInsnNode> want=new ArrayList<>(),have=new ArrayList<>();
    for(AbstractInsnNode n:expected)if(n.getOpcode()>=0)want.add(n);
    for(AbstractInsnNode n:actual)if(n.getOpcode()>=0){have.add(n);if(have.size()==want.size())break;}
    if(have.size()!=want.size())return false;
    // Exception edges are executable control flow too. A later transformer can
    // retain every opcode while catching a failed ownership/storage check and
    // substituting a normal return. No foreign handler may cover this head.
    // Preserve handlers in the original body; prepend outside their ranges.
    var positions=new IdentityHashMap<AbstractInsnNode,Integer>();
    int position=0;for(AbstractInsnNode n:actual)positions.put(n,position++);
    int first=positions.get(have.get(0)),last=positions.get(have.get(have.size()-1));
    for(TryCatchBlockNode handler:method.tryCatchBlocks){
      Integer start=positions.get(handler.start),end=positions.get(handler.end);
      if(start==null||end==null)throw new IllegalStateException("FINAL_LIFETIME_HANDLER_LABEL");
      if(start<=last&&end>first)return false;
    }
    var wi=new IdentityHashMap<AbstractInsnNode,Integer>();var hi=new IdentityHashMap<AbstractInsnNode,Integer>();
    for(int i=0;i<want.size();i++){wi.put(want.get(i),i);hi.put(have.get(i),i);}
    int actualScratch=-1;
    for(int i=0;i<want.size();i++){
      AbstractInsnNode w=want.get(i),h=have.get(i);
      if(w.getOpcode()!=h.getOpcode()||w.getType()!=h.getType())return false;
      if(w instanceof VarInsnNode v){int av=((VarInsnNode)h).var;
        if(scratch>=0&&v.var==scratch){if(actualScratch<0){if(av<2||av>=scratch)return false;actualScratch=av;}if(av!=actualScratch)return false;}
        else if(av!=v.var)return false;
      } else if(w instanceof FieldInsnNode f){var a=(FieldInsnNode)h;if(!f.owner.equals(a.owner)||!f.name.equals(a.name)||!f.desc.equals(a.desc))return false;
      } else if(w instanceof MethodInsnNode m){var a=(MethodInsnNode)h;if(!m.owner.equals(a.owner)||!m.name.equals(a.name)||!m.desc.equals(a.desc)||m.itf!=a.itf)return false;
      } else if(w instanceof LdcInsnNode l){if(!Objects.equals(l.cst,((LdcInsnNode)h).cst))return false;
      } else if(w instanceof TypeInsnNode t){if(!t.desc.equals(((TypeInsnNode)h).desc))return false;
      } else if(w instanceof JumpInsnNode j){Integer destination=wi.get(executable(j.label)),observed=hi.get(executable(((JumpInsnNode)h).label));if(destination==null||!destination.equals(observed))return false;
      } else if(!(w instanceof InsnNode))return false;
    }
    return true;
  }
}
