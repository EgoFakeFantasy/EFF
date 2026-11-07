package eff.lifetime.test;

import eff.lifetime.*;
import java.util.*;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;

/** Execute production entry guards before synthetic chunk/packet/collision side effects. */
public final class PositionEntryTest implements Opcodes {
  private static final String ENTITY="net/minecraft/world/entity/Entity", SERVER="net/minecraft/server/level/ServerPlayer",
      CONNECTION="net/minecraft/server/network/ServerGamePacketListenerImpl", WORLD="net/minecraft/server/level/ServerLevel";
  public static boolean inside(double x,double y,double z) {
    return x>=0 && x<=32 && y>=60 && y<=100 && z>=0 && z<=32;
  }
  private static void check(boolean ok,String reason) { if(!ok)throw new AssertionError(reason); }
  public static void run() throws Exception {
    for(boolean mapped:new boolean[]{false,true}) {
      for(String name:mapped?List.of("m_6034_","m_20343_","m_20248_","m_6027_","m_142098_","m_6021_","m_20324_")
          :List.of("setPos","setPosRaw","absMoveTo","moveTo","dismountTo","teleportTo","teleportToWithTicket"))
        exercise(ENTITY,name,"(DDD)V",mapped);
      exercise(ENTITY,mapped?"m_19890_":"absMoveTo","(DDDFF)V",mapped);
      exercise(ENTITY,mapped?"m_7678_":"moveTo","(DDDFF)V",mapped);
      exercise(SERVER,mapped?"m_8999_":"teleportTo","(L"+WORLD+";DDDFF)V",mapped);
      exercise(SERVER,mapped?"m_264318_":"teleportTo","(L"+WORLD+";DDDLjava/util/Set;FF)Z",mapped);
      exercise(CONNECTION,mapped?"m_9774_":"teleport","(DDDFF)V",mapped);
      exercise(CONNECTION,mapped?"m_9780_":"teleport","(DDDFFLjava/util/Set;)V",mapped);
    }
    // Relative coordinates are not absolute positions; never apply this guard to offsets.
    var relative=target(ENTITY); relative.methods.add(body(ENTITY,"teleportRelative","(DDD)V"));
    check(PlayerOperationTransform.instrumentOperations(relative)==0,"RELATIVE_OFFSET_MISINTERPRETED");
    System.out.println("POSITION_ENTRY_OK: named/SRG, chunk/packet/collision ordering, lease release, exact heads");
  }
  private static ClassNode target(String name) {
    ClassNode n=PlayerProtectionTest.blank(name);n.interfaces.add("eff/lifetime/LifetimeTarget");
    for(String field:List.of("locked","moving"))n.fields.add(new FieldNode(ACC_PUBLIC,field,"Z",null,null));
    for(String field:List.of("chunkQueries","packets","boxChanges"))n.fields.add(new FieldNode(ACC_PUBLIC,field,"I",null,null));
    for(String[] pair:new String[][]{{"rejectLifetimeMutation","locked"},{"lifetimeAllowsMovement","moving"}}) {
      MethodNode m=new MethodNode(ACC_PUBLIC,pair[0],"()Z",null,null);
      m.instructions.add(new VarInsnNode(ALOAD,0));m.instructions.add(new FieldInsnNode(GETFIELD,name,pair[1],"Z"));
      m.instructions.add(new InsnNode(IRETURN));n.methods.add(m);
    }
    MethodNode m=new MethodNode(ACC_PUBLIC,"lifetimeAllowsPosition","(DDD)Z",null,null);
    for(int slot:new int[]{1,3,5})m.instructions.add(new VarInsnNode(DLOAD,slot));
    m.instructions.add(new MethodInsnNode(INVOKESTATIC,Type.getInternalName(PositionEntryTest.class),"inside","(DDD)Z",false));
    m.instructions.add(new InsnNode(IRETURN));n.methods.add(m);return n;
  }
  private static MethodNode body(String owner,String name,String desc) {
    MethodNode m=new MethodNode(ACC_PUBLIC,name,desc,null,null);
    for(String field:List.of("chunkQueries","packets","boxChanges")) {
      m.instructions.add(new VarInsnNode(ALOAD,0));m.instructions.add(new InsnNode(DUP));
      m.instructions.add(new FieldInsnNode(GETFIELD,owner,field,"I"));m.instructions.add(new InsnNode(ICONST_1));
      m.instructions.add(new InsnNode(IADD));m.instructions.add(new FieldInsnNode(PUTFIELD,owner,field,"I"));
    }
    if(desc.endsWith("Z")){m.instructions.add(new InsnNode(ICONST_1));m.instructions.add(new InsnNode(IRETURN));}
    else m.instructions.add(new InsnNode(RETURN));return m;
  }
  private static void exercise(String owner,String name,String desc,boolean mapped) throws Exception {
    ClassNode n=target(owner);MethodNode m=body(owner,name,desc);n.methods.add(m);
    String playerField=mapped?"f_9743_":"player";
    if(owner.equals(CONNECTION))n.fields.add(new FieldNode(ACC_PUBLIC,playerField,"L"+SERVER+";",null,null));
    check(PlayerOperationTransform.instrumentOperations(n)==1,"MISSING_ENTRY:"+name+desc);
    check(PlayerOperationTransform.instrumentOperations(n)==0,"DUPLICATE_ENTRY");
    // A marker is not enough: reassert ahead of a later prefix and corrupted operand.
    m.instructions.insert(new InsnNode(NOP));
    check(PlayerOperationTransform.instrumentOperations(n)==1,"PREFIX_NOT_DOMINATED");
    for(AbstractInsnNode i:m.instructions)if(i instanceof VarInsnNode v && v.getOpcode()==DLOAD){v.var+=2;break;}
    check(PlayerOperationTransform.instrumentOperations(n)==1,"CORRUPTED_OPERAND_TRUSTED");
    check(PlayerOperationTransform.instrumentOperations(n)==0,"REASSERTION_NOT_IDEMPOTENT");
    // Remove obsolete tails only in the test fixture: they contain the deliberately
    // invalid operand above. Production never rewrites the ordinary body.
    AbstractInsnNode firstReturn=null; for(AbstractInsnNode i:m.instructions)if(i.getOpcode()==RETURN||i.getOpcode()==IRETURN){firstReturn=i;break;}
    AbstractInsnNode ordinary=firstReturn.getNext();while(ordinary!=null&&ordinary.getOpcode()<0)ordinary=ordinary.getNext();
    while(ordinary!=null){AbstractInsnNode next=ordinary.getNext();m.instructions.remove(ordinary);ordinary=next;}
    MethodNode clean=body(owner,name,desc);m.instructions.add(clean.instructions);
    Map<String,byte[]> files=new HashMap<>();files.put(owner.replace('/','.'),PlayerProtectionTest.bytes(n));
    if(owner.equals(CONNECTION))files.put(SERVER.replace('/','.'),PlayerProtectionTest.bytes(target(SERVER)));
    files.put(WORLD.replace('/','.'),PlayerProtectionTest.bytes(PlayerProtectionTest.blank(WORLD)));
    ClassLoader loader=PlayerProtectionTest.loader(files);Class<?> type=loader.loadClass(owner.replace('/','.'));Object receiver=type.getConstructor().newInstance();
    Object player=receiver;
    if(owner.equals(CONNECTION)){player=loader.loadClass(SERVER.replace('/','.')).getConstructor().newInstance();type.getField(playerField).set(receiver,player);}
    player.getClass().getField("locked").setBoolean(player,true);player.getClass().getField("moving").setBoolean(player,true);
    Type[] args=Type.getArgumentTypes(desc);Class<?>[] signature=new Class<?>[args.length];Object[] values=new Object[args.length];
    int coordinate=0;
    for(int i=0;i<args.length;i++) {
      if(args[i].getSort()==Type.DOUBLE){signature[i]=double.class;values[i]=new double[]{16,65,16}[coordinate++];}
      else if(args[i].getSort()==Type.FLOAT){signature[i]=float.class;values[i]=0f;}
      else {signature[i]=loader.loadClass(args[i].getClassName());values[i]=null;}
    }
    var method=type.getMethod(name,signature);int x=args[0].getSort()==Type.DOUBLE?0:1;
    for(double bad:new double[]{-999,Double.NaN,Double.POSITIVE_INFINITY,1e100}) {
      values[x]=bad;Object result=method.invoke(receiver,values);if(desc.endsWith("Z"))check(Boolean.FALSE.equals(result),"REJECTION_RETURN");
    }
    for(String field:List.of("chunkQueries","packets","boxChanges"))check(type.getField(field).getInt(receiver)==0,"SIDE_EFFECT_BEFORE_GUARD:"+field);
    values[x]=16d;method.invoke(receiver,values);
    for(String field:List.of("chunkQueries","packets","boxChanges"))check(type.getField(field).getInt(receiver)==1,"LEGAL_MOTION_FROZEN");
    player.getClass().getField("locked").setBoolean(player,false);values[x]=-999d;method.invoke(receiver,values);
    for(String field:List.of("chunkQueries","packets","boxChanges"))check(type.getField(field).getInt(receiver)==2,"UNCLAIMED_BODY_CHANGED");
  }
}
