package eff.finalgate;

import java.util.*;
import java.security.MessageDigest;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;

/** Restores the reviewed Forge connection tick for a currently claimed original only.
 * This is normal tick execution, not a timer increment, replay, repair or extra tick.
 * Called at the existing final Java transformation boundary; no target class loading.
 */
public final class TrustedTickTransform implements Opcodes {
  public static final String OWNER="net/minecraft/server/network/ServerGamePacketListenerImpl";
  public static final String RESOURCE="/eff-owned/forge-47.4.20-connection-template.class";
  public static final String SHA256="8bcf74fa649eeec89b4f22726da82f64db2d7e6dbc05e96e300e349daca04649";
  private static final String PLAYER="Lnet/minecraft/server/level/ServerPlayer;";
  private static final String BEGIN="EFF_TRUSTED_CONNECTION_TICK_V1",END="EFF_TRUSTED_CONNECTION_TICK_END_V1";
  private TrustedTickTransform() {}
  public static boolean supports(String name){return OWNER.equals(name);}
  public static byte[] transform(byte[] input){
    try(var stream=TrustedTickTransform.class.getResourceAsStream(RESOURCE)){
      if(stream==null)throw new SecurityException("TRUSTED_TICK_TEMPLATE_MISSING");
      byte[] template=stream.readAllBytes();
      if(!HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(template)).equals(SHA256))
        throw new SecurityException("TRUSTED_TICK_TEMPLATE_HASH");
      return apply(input,template);
    }catch(java.io.IOException|java.security.NoSuchAlgorithmException error){throw new IllegalStateException("TRUSTED_TICK_TEMPLATE_READ",error);}
  }
  // Package-private pure transform for generated negative-control fixtures.
  static byte[] apply(byte[] input,byte[] trusted){
    ClassNode node=read(input),template=read(trusted);
    if(!OWNER.equals(node.name)||!OWNER.equals(template.name)||!Objects.equals(node.superName,template.superName))
      throw new IllegalStateException("TRUSTED_TICK_OWNER");
    MethodNode original=method(template,"m_9933_"),target=method(node,"m_9933_");
    if(!original.tryCatchBlocks.isEmpty())throw new IllegalStateException("TRUSTED_TICK_UNREVIEWED_HANDLERS");
    if(node.fields.stream().noneMatch(f->f.name.equals("f_9743_")&&f.desc.equals(PLAYER)&&(f.access&ACC_STATIC)==0))
      throw new IllegalStateException("TRUSTED_TICK_PLAYER_FIELD");
    // Referenced receiver members must still have the reviewed descriptors and staticness.
    for(AbstractInsnNode insn:original.instructions){
      if(insn instanceof FieldInsnNode f&&f.owner.equals(OWNER)&&node.fields.stream().noneMatch(v->
          v.name.equals(f.name)&&v.desc.equals(f.desc)&&((v.access&ACC_STATIC)!=0)==(f.getOpcode()==GETSTATIC||f.getOpcode()==PUTSTATIC)))
        throw new IllegalStateException("TRUSTED_TICK_FIELD_SCHEMA:"+f.name);
      if(insn instanceof MethodInsnNode m&&m.owner.equals(OWNER)&&node.methods.stream().noneMatch(v->
          v.name.equals(m.name)&&v.desc.equals(m.desc)&&((v.access&ACC_STATIC)!=0)==(m.getOpcode()==INVOKESTATIC)))
        throw new IllegalStateException("TRUSTED_TICK_METHOD_SCHEMA:"+m.name);
    }
    InsnList head=new InsnList();LabelNode ordinary=new LabelNode();
    head.add(new LdcInsnNode(BEGIN));head.add(new InsnNode(POP));
    head.add(new VarInsnNode(ALOAD,0));head.add(new FieldInsnNode(GETFIELD,OWNER,"f_9743_",PLAYER));
    head.add(new MethodInsnNode(INVOKESTATIC,"eff/lifetime/FieldWriteGate","rejectQuery","(Ljava/lang/Object;)Z",false));
    head.add(new JumpInsnNode(IFEQ,ordinary));
    Map<LabelNode,LabelNode> labels=new IdentityHashMap<>();
    for(AbstractInsnNode insn:original.instructions)if(insn instanceof LabelNode label)labels.put(label,new LabelNode());
    for(AbstractInsnNode insn:original.instructions)head.add(insn.clone(labels));
    head.add(ordinary);head.add(new FrameNode(F_NEW,1,new Object[]{OWNER},0,new Object[0]));
    head.add(new LdcInsnNode(END));head.add(new InsnNode(POP));
    if(sameHead(target,head))return input;
    // Retain foreign-tail labels and exception ranges. No handler may catch the new head.
    target.instructions.insert(head);target.maxLocals=Math.max(target.maxLocals,original.maxLocals);
    ClassWriter writer=new ClassWriter(ClassWriter.COMPUTE_MAXS);node.accept(writer);return writer.toByteArray();
  }
  private static ClassNode read(byte[] bytes){ClassNode n=new ClassNode();new ClassReader(bytes).accept(n,ClassReader.EXPAND_FRAMES);return n;}
  private static MethodNode method(ClassNode n,String name){
    List<MethodNode> found=n.methods.stream().filter(m->m.name.equals(name)&&m.desc.equals("()V")).toList();
    if(found.size()!=1||(found.get(0).access&(ACC_STATIC|ACC_ABSTRACT|ACC_NATIVE))!=0)
      throw new IllegalStateException("TRUSTED_TICK_METHOD_SHAPE");
    return found.get(0);
  }
  private static List<AbstractInsnNode> code(InsnList list){
    List<AbstractInsnNode> out=new ArrayList<>();for(AbstractInsnNode n:list)if(n.getOpcode()>=0||n instanceof FrameNode)out.add(n);return out;
  }
  private static Map<LabelNode,Integer> labelPositions(InsnList list){
    Map<LabelNode,Integer> out=new IdentityHashMap<>();int i=0;
    for(AbstractInsnNode n:list){if(n instanceof LabelNode l)out.put(l,i);if(n.getOpcode()>=0||n instanceof FrameNode)i++;}return out;
  }
  private static Object value(Object v,Map<LabelNode,Integer> labels){return v instanceof LabelNode l?Arrays.asList("label",labels.get(l)):v;}
  private static List<Object> values(List<Object> vs,Map<LabelNode,Integer> labels){
    if(vs==null)return List.of();List<Object> out=new ArrayList<>();for(Object v:vs)out.add(value(v,labels));return out;
  }
  private static Object key(AbstractInsnNode n,Map<LabelNode,Integer> labels){
    int op=n.getOpcode();
    if(n instanceof InsnNode)return List.of(op);
    if(n instanceof VarInsnNode v)return List.of(op,v.var);
    if(n instanceof IntInsnNode v)return List.of(op,v.operand);
    if(n instanceof IincInsnNode v)return List.of(op,v.var,v.incr);
    if(n instanceof TypeInsnNode v)return List.of(op,v.desc);
    if(n instanceof FieldInsnNode v)return List.of(op,v.owner,v.name,v.desc);
    if(n instanceof MethodInsnNode v)return List.of(op,v.owner,v.name,v.desc,v.itf);
    if(n instanceof LdcInsnNode v)return List.of(op,v.cst);
    if(n instanceof JumpInsnNode v)return Arrays.asList(op,labels.get(v.label));
    if(n instanceof FrameNode v)return List.of("frame",v.type,values(v.local,labels),values(v.stack,labels));
    // This reviewed tick has no switches, multidimensional allocations or indy.
    throw new IllegalStateException("TRUSTED_TICK_UNREVIEWED_OPCODE:"+n.getClass().getName());
  }
  private static boolean sameHead(MethodNode actual,InsnList expected){
    List<AbstractInsnNode> want=code(expected),have=code(actual.instructions);
    if(have.size()<want.size())return false;
    Map<LabelNode,Integer> wl=labelPositions(expected),hl=labelPositions(actual.instructions);
    for(int i=0;i<want.size();i++)if(!key(want.get(i),wl).equals(key(have.get(i),hl)))return false;
    for(TryCatchBlockNode t:actual.tryCatchBlocks){
      Integer start=hl.get(t.start),end=hl.get(t.end);
      if(start==null||end==null)throw new IllegalStateException("TRUSTED_TICK_HANDLER_LABEL");
      if(start<want.size()&&end>0)return false;
    }
    return true;
  }
}
