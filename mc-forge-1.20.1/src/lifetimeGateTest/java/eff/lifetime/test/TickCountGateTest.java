package eff.lifetime.test;

import eff.lifetime.FieldWriteGate;
import java.util.*;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;
import static eff.lifetime.test.PlayerProtectionTest.*;

final class TickCountGateTest implements Opcodes {
  static void run()throws Exception{
    for(boolean mapped:new boolean[]{false,true})for(boolean hidden:new boolean[]{false,true})scenario(mapped,hidden);
    System.out.println("PLAYER_TICK_GATE_OFFLINE_OK: named/SRG ordinary/hidden monotonic writes, signed overflow, release");
  }
  private static void check(boolean ok,String why){if(!ok)throw new AssertionError(why);}
  private static void scenario(boolean mapped,boolean hidden)throws Exception{
    String entity="net/minecraft/world/entity/Entity",writer="fixture/TickWriter",field=mapped?"f_19797_":"tickCount";
    ClassNode n=blank(entity);n.interfaces.add("eff/lifetime/LifetimeTarget");n.fields.add(new FieldNode(ACC_PUBLIC,field,"I",null,null));n.fields.add(new FieldNode(ACC_PUBLIC,"locked","Z",null,null));
    for(String name:List.of("rejectLifetimeMutation","lifetimeAllowsMovement")){
      MethodNode m=new MethodNode(ACC_PUBLIC,name,"()Z",null,null);
      if(name.equals("rejectLifetimeMutation")){m.instructions.add(new VarInsnNode(ALOAD,0));m.instructions.add(new FieldInsnNode(GETFIELD,entity,"locked","Z"));}
      else m.instructions.add(new InsnNode(ICONST_1));m.instructions.add(new InsnNode(IRETURN));n.methods.add(m);
    }
    ClassNode w=blank(writer);MethodNode write=new MethodNode(ACC_PUBLIC|ACC_STATIC,"write","(L"+entity+";I)V",null,null);
    write.instructions.add(new VarInsnNode(ALOAD,0));write.instructions.add(new VarInsnNode(ILOAD,1));write.instructions.add(new FieldInsnNode(PUTFIELD,entity,field,"I"));write.instructions.add(new InsnNode(RETURN));w.methods.add(write);
    Map<String,byte[]> files=new HashMap<>();files.put(entity.replace('/','.'),bytes(n));ClassLoader loader=loader(files);Class<?> t=loader.loadClass(entity.replace('/','.'));
    if(hidden)files.put(writer.replace('/','.'),eff.hiddenboundary.HiddenWriteTransform.apply(t,bytes(w)));
    else{FieldWriteGate.instrument(w);files.put(writer.replace('/','.'),bytes(w));}
    Object original=t.getConstructor().newInstance();var raw=t.getField(field);var locked=t.getField("locked");locked.setBoolean(original,true);
    var method=loader.loadClass(writer.replace('/','.')).getMethod("write",t,int.class);
    method.invoke(null,original,1);method.invoke(null,original,2);check(raw.getInt(original)==2,"NORMAL_TICKS_FROZEN");
    method.invoke(null,original,0);method.invoke(null,original,-1);check(raw.getInt(original)==2,"COUNTER_REGRESSED");
    method.invoke(null,original,3);check(raw.getInt(original)==3,"TICKS_AFTER_REJECTION_FROZEN");
    raw.setInt(original,Integer.MAX_VALUE);method.invoke(null,original,Integer.MIN_VALUE);method.invoke(null,original,Integer.MIN_VALUE+1);
    check(raw.getInt(original)==Integer.MIN_VALUE+1,"SIGNED_WRAP_BLOCKED");
    raw.setInt(original,100);locked.setBoolean(original,false);method.invoke(null,original,0);check(raw.getInt(original)==0,"RELEASED_RESET_BLOCKED");
  }
}
