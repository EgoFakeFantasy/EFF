package eff.lifetime.test;

import eff.lifetime.FieldWriteGate;
import java.util.*;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;
import static eff.lifetime.test.PlayerProtectionTest.*;

/** Executes ordinary/hidden direct stores while preserving the vanilla screen setter API. */
final class ClientSurfaceTest implements Opcodes {
  static void run()throws Exception{
    for(boolean mapped:new boolean[]{false,true})for(boolean hidden:new boolean[]{false,true})scenario(mapped,hidden);
    System.out.println("CLIENT_SURFACE_OFFLINE_OK: direct stores denied only during original player claim, normal setters and release retained");
  }
  private static void check(boolean ok,String reason){if(!ok)throw new AssertionError(reason);}
  private static void scenario(boolean mapped,boolean hidden)throws Exception{
    String client="net/minecraft/client/Minecraft",player="net/minecraft/client/player/LocalPlayer",screen="net/minecraft/client/gui/screens/Screen",writer="fixture/ScreenWriter";
    String sf=mapped?"f_91080_":"screen",pf=mapped?"f_91074_":"player";
    ClassNode p=blank(player);p.interfaces.add("eff/lifetime/LifetimeTarget");p.fields.add(new FieldNode(ACC_PUBLIC,"locked","Z",null,null));
    MethodNode owned=new MethodNode(ACC_PUBLIC,"rejectLifetimeMutation","()Z",null,null);
    owned.instructions.add(new VarInsnNode(ALOAD,0));owned.instructions.add(new FieldInsnNode(GETFIELD,player,"locked","Z"));owned.instructions.add(new InsnNode(IRETURN));p.methods.add(owned);
    ClassNode mc=blank(client);mc.fields.add(new FieldNode(ACC_PUBLIC,sf,"L"+screen+";",null,null));mc.fields.add(new FieldNode(ACC_PUBLIC,pf,"L"+player+";",null,null));
    String[] setters=mapped?new String[]{"m_91152_","m_91346_"}:new String[]{"setScreen","forceSetScreen"};
    for(String name:setters){MethodNode m=new MethodNode(ACC_PUBLIC,name,"(L"+screen+";)V",null,null);
      m.instructions.add(new VarInsnNode(ALOAD,0));m.instructions.add(new VarInsnNode(ALOAD,1));m.instructions.add(new FieldInsnNode(PUTFIELD,client,sf,"L"+screen+";"));m.instructions.add(new InsnNode(RETURN));mc.methods.add(m);}
    MethodNode tick=new MethodNode(ACC_PUBLIC,"tick","()V",null,null);tick.instructions.add(new InsnNode(RETURN));mc.methods.add(tick);
    FieldWriteGate.instrument(mc);
    ClassNode call=blank(writer);MethodNode write=new MethodNode(ACC_PUBLIC|ACC_STATIC,"write","(L"+client+";L"+screen+";)V",null,null);
    write.instructions.add(new VarInsnNode(ALOAD,0));write.instructions.add(new VarInsnNode(ALOAD,1));write.instructions.add(new FieldInsnNode(PUTFIELD,client,sf,"L"+screen+";"));write.instructions.add(new InsnNode(RETURN));call.methods.add(write);
    Map<String,byte[]> files=new HashMap<>();for(ClassNode n:List.of(mc,p,blank(screen)))files.put(n.name.replace('/','.'),bytes(n));
    ClassLoader loader=loader(files);Class<?> m=loader.loadClass(client.replace('/','.')),pt=loader.loadClass(player.replace('/','.')),s=loader.loadClass(screen.replace('/','.'));
    if(hidden)files.put(writer.replace('/','.'),eff.hiddenboundary.HiddenWriteTransform.apply(m,bytes(call)));
    else{FieldWriteGate.instrument(call);files.put(writer.replace('/','.'),bytes(call));}
    var method=loader.loadClass(writer.replace('/','.')).getMethod("write",m,s);Object original=m.getConstructor().newInstance(),lp=pt.getConstructor().newInstance(),first=s.getConstructor().newInstance(),second=s.getConstructor().newInstance();
    m.getField(pf).set(original,lp);method.invoke(null,original,first);
    check(m.getField(sf).get(original)==first&&!FieldWriteGate.isOwnedRuntimeObject(original),"UNCLAIMED_SCREEN_CHANGED");
    pt.getField("locked").setBoolean(lp,true);check(FieldWriteGate.isOwnedRuntimeObject(original),"OWNED_CLIENT_ROOT_UNPROTECTED");
    method.invoke(null,original,second);check(m.getField(sf).get(original)==first,"DIRECT_SCREEN_REPLACED");
    method.invoke(null,original,null);check(m.getField(sf).get(original)==first,"DIRECT_SCREEN_CLEARED");
    m.getMethod(setters[0],s).invoke(original,second);check(m.getField(sf).get(original)==second,"NORMAL_SCREEN_SETTER_BLOCKED");
    m.getMethod(setters[1],s).invoke(original,new Object[]{null});check(m.getField(sf).get(original)==null,"NORMAL_SCREEN_CLOSE_BLOCKED");
    // A prior bad screen is not repaired or hidden by a later denied write.
    m.getField(sf).set(original,second);method.invoke(null,original,first);check(m.getField(sf).get(original)==second,"PREEXISTING_SCREEN_CONCEALED");
    pt.getField("locked").setBoolean(lp,false);method.invoke(null,original,first);
    check(m.getField(sf).get(original)==first&&!FieldWriteGate.isOwnedRuntimeObject(original),"RELEASE_IGNORED");
    // Symbolic owners may inherit or shadow the field; only the actual MC slot is protected.
    for(boolean shadow:new boolean[]{false,true}) {
      String sub="fixture/Client"+(shadow?"Shadow":"Inherited");ClassNode subNode=blank(sub);subNode.superName=client;
      for(AbstractInsnNode insn:subNode.methods.get(0).instructions)if(insn instanceof MethodInsnNode c)c.owner=client;
      if(shadow)subNode.fields.add(new FieldNode(ACC_PUBLIC,sf,"L"+screen+";",null,null));
      files.put(sub.replace('/','.'),bytes(subNode));Class<?> st=loader.loadClass(sub.replace('/','.'));Object instance=st.getConstructor().newInstance();
      m.getField(pf).set(instance,lp);pt.getField("locked").setBoolean(lp,true);
      check(FieldWriteGate.rejectDeclaredClientScreenWrite(instance,st,sf,"L"+screen+";")!=shadow,"CLIENT_SCREEN_DECLARATION_RESOLUTION");
    }
  }
}
