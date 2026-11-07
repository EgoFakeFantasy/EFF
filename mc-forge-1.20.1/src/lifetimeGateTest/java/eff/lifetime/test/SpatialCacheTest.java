package eff.lifetime.test;

import eff.lifetime.FieldWriteGate;
import eff.minecraft.PlayerLifetimeRegistry;
import java.util.*;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;
import static eff.lifetime.test.PlayerProtectionTest.*;

/** Executes complete position/block/chunk write sequences, including rejected first writes. */
public final class SpatialCacheTest implements Opcodes {
  private static final PlayerLifetimeRegistry<Object> claims=new PlayerLifetimeRegistry<>();
  private static final Map<Object,UUID> ids=new IdentityHashMap<>();
  public static boolean allowed(Object target,double x,double y,double z){return claims.positionAllowed(target,ids.get(target),x,y,z);}
  private static final String E="net/minecraft/world/entity/Entity", V="net/minecraft/world/phys/Vec3",
      I="net/minecraft/core/Vec3i", B="net/minecraft/core/BlockPos", C="net/minecraft/world/level/ChunkPos",
      S="fixture/MovingSubclass", H="fixture/ShadowSubclass", W="fixture/CacheWriter";
  static void run() throws Exception {
    for(boolean mapped:new boolean[]{false,true}) for(boolean hidden:new boolean[]{false,true}) scenario(mapped,hidden);
    System.out.println("SPATIAL_CACHE_OFFLINE_OK: named/SRG ordinary/hidden sequence, floor boundaries, inheritance, shadow, release");
  }
  private static void check(boolean ok,String reason){if(!ok)throw new AssertionError(reason);}
  private static ClassNode subclass(String name,String parent){
    ClassNode n=blank(name);n.superName=parent;
    for(AbstractInsnNode insn:n.methods.get(0).instructions)if(insn instanceof MethodInsnNode call)call.owner=parent;
    return n;
  }
  private static ClassNode numeric(String name,String[] names,String descriptor){
    ClassNode n=blank(name);for(String field:names)n.fields.add(new FieldNode(ACC_PUBLIC,field,descriptor,null,null));return n;
  }
  private static void scenario(boolean mapped,boolean hidden)throws Exception{
    String[] entityFields=mapped?new String[]{"f_19825_","f_19826_","f_185933_"}:new String[]{"position","blockPosition","chunkPosition"};
    String[] vectorFields=mapped?new String[]{"f_82479_","f_82480_","f_82481_"}:new String[]{"x","y","z"};
    String[] blockFields=mapped?new String[]{"f_123285_","f_123286_","f_123289_"}:new String[]{"x","y","z"};
    String[] chunkFields=mapped?new String[]{"f_45578_","f_45579_"}:new String[]{"x","z"};
    String[] descriptors={"L"+V+";","L"+B+";","L"+C+";"};
    Map<String,byte[]> files=new HashMap<>();ClassNode entity=blank(E);entity.interfaces.add("eff/lifetime/LifetimeTarget");
    entity.fields.add(new FieldNode(ACC_PUBLIC,"locked","Z",null,null));
    for(int i=0;i<3;i++)entity.fields.add(new FieldNode(ACC_PUBLIC,entityFields[i],descriptors[i],null,null));
    for(String name:List.of("rejectLifetimeMutation","lifetimeAllowsMovement")){
      MethodNode m=new MethodNode(ACC_PUBLIC,name,"()Z",null,null);
      if(name.equals("rejectLifetimeMutation")){m.instructions.add(new VarInsnNode(ALOAD,0));m.instructions.add(new FieldInsnNode(GETFIELD,E,"locked","Z"));}
      else m.instructions.add(new InsnNode(ICONST_1));
      m.instructions.add(new InsnNode(IRETURN));entity.methods.add(m);
    }
    MethodNode permitted=new MethodNode(ACC_PUBLIC,"lifetimeAllowsPosition","(DDD)Z",null,null);
    permitted.instructions.add(new VarInsnNode(ALOAD,0));for(int slot:new int[]{1,3,5})permitted.instructions.add(new VarInsnNode(DLOAD,slot));
    permitted.instructions.add(new MethodInsnNode(INVOKESTATIC,"eff/lifetime/test/SpatialCacheTest","allowed","(Ljava/lang/Object;DDD)Z",false));
    permitted.instructions.add(new InsnNode(IRETURN));entity.methods.add(permitted);
    ClassNode shadow=subclass(H,E);shadow.fields.add(new FieldNode(ACC_PUBLIC,entityFields[1],descriptors[1],null,null));
    for(ClassNode n:List.of(entity,subclass(S,E),shadow,numeric(V,vectorFields,"D"),numeric(I,blockFields,"I"),subclass(B,I),numeric(C,chunkFields,"I")))
      files.put(n.name.replace('/','.'),bytes(n));
    ClassLoader loader=loader(files);Class<?> type=loader.loadClass(S.replace('/','.'));
    ClassNode writer=blank(W);
    for(String owner:List.of(E,S,H)){
      MethodNode m=new MethodNode(ACC_PUBLIC|ACC_STATIC,owner.equals(H)?"shadow":owner.equals(S)?"inherited":"direct",
          "(L"+owner+";"+String.join("",descriptors)+")V",null,null);
      for(int i=0;i<3;i++){
        m.instructions.add(new VarInsnNode(ALOAD,0));m.instructions.add(new VarInsnNode(ALOAD,i+1));
        m.instructions.add(new FieldInsnNode(PUTFIELD,owner,entityFields[i],descriptors[i]));
      }
      m.instructions.add(new InsnNode(RETURN));writer.methods.add(m);
    }
    if(hidden)files.put(W.replace('/','.'),eff.hiddenboundary.HiddenWriteTransform.apply(type,bytes(writer)));
    else{FieldWriteGate.instrument(writer);files.put(W.replace('/','.'),bytes(writer));}
    Class<?> e=loader.loadClass(E.replace('/','.')),v=loader.loadClass(V.replace('/','.')),b=loader.loadClass(B.replace('/','.')),c=loader.loadClass(C.replace('/','.'));
    Class<?> w=loader.loadClass(W.replace('/','.'));
    for(String methodName:List.of("direct","inherited")){
      Object original=type.getConstructor().newInstance();e.getField("locked").setBoolean(original,true);
      UUID id=UUID.randomUUID();ids.put(original,id);claims.claim(original,id,"arena",original,new PlayerLifetimeRegistry.Bounds(-32,-16,-64,32,128,64));
      var method=w.getMethod(methodName,methodName.equals("direct")?e:type,v,b,c);
      Object[] before=null;
      double[][] legal={{-16.25,64.9,31.999},{-16,65,32},{-0.01,-0.25,-16.01},{0,0,0},{17.125,66.5,-32}};
      for(double[] xyz:legal){
        Object vector=values(v,vectorFields,xyz),block=values(b,blockFields,new double[]{Math.floor(xyz[0]),Math.floor(xyz[1]),Math.floor(xyz[2])}),
            chunk=values(c,chunkFields,new double[]{((int)Math.floor(xyz[0]))>>4,((int)Math.floor(xyz[2]))>>4});
        method.invoke(null,original,vector,block,chunk);before=new Object[]{vector,block,chunk};assertStored(e,original,entityFields,before,"LEGAL_SEQUENCE_BLOCKED");
      }
      // Bad first assignment must not authorize the subsequently computed caches.
      Object zeroBlock=values(b,blockFields,new double[]{0,0,0}),zeroChunk=values(c,chunkFields,new double[]{0,0});
      for(double invalid:new double[]{Double.NaN,Double.POSITIVE_INFINITY,Double.NEGATIVE_INFINITY}){
        method.invoke(null,original,values(v,vectorFields,new double[]{invalid,0,0}),zeroBlock,zeroChunk);
        assertStored(e,original,entityFields,before,"REJECTED_POSITION_POISONED_CACHES");
      }
      method.invoke(null,original,null,null,null);assertStored(e,original,entityFields,before,"NULL_CACHE_ACCEPTED");
      // Even a finite vector may not make an unrelated chunk cache legitimate.
      method.invoke(null,original,before[0],zeroBlock,zeroChunk);assertStored(e,original,entityFields,before,"MISMATCHED_CACHE_ACCEPTED");
      method.invoke(null,original,values(v,vectorFields,new double[]{-999,-999,-999}),values(b,blockFields,new double[]{-999,-999,-999}),values(c,chunkFields,new double[]{-63,-63}));
      assertStored(e,original,entityFields,before,"FINITE_OUTSIDE_LEASE_ACCEPTED");
      // A target whose stored position is already invalid is not silently repaired.
      Object corrupted=values(v,vectorFields,new double[]{Double.NaN,0,0});e.getField(entityFields[0]).set(original,corrupted);
      method.invoke(null,original,null,zeroBlock,zeroChunk);
      check(e.getField(entityFields[0]).get(original)==corrupted&&e.getField(entityFields[1]).get(original)==before[1],"PREEXISTING_CORRUPTION_CONCEALED");
      e.getField("locked").setBoolean(original,false);method.invoke(null,original,null,zeroBlock,zeroChunk);
      assertStored(e,original,entityFields,new Object[]{null,zeroBlock,zeroChunk},"UNOWNED_WRITE_CHANGED");
    }
    Class<?> h=loader.loadClass(H.replace('/','.'));Object shadowObject=h.getConstructor().newInstance();e.getField("locked").setBoolean(shadowObject,true);
    UUID shadowId=UUID.randomUUID();ids.put(shadowObject,shadowId);claims.claim(shadowObject,shadowId,"arena",shadowObject,new PlayerLifetimeRegistry.Bounds(-32,-16,-64,32,128,64));
    Object mismatch=values(b,blockFields,new double[]{999,999,999});
    w.getMethod("shadow",h,v,b,c).invoke(null,shadowObject,values(v,vectorFields,new double[]{0,0,0}),mismatch,values(c,chunkFields,new double[]{0,0}));
    check(h.getDeclaredField(entityFields[1]).get(shadowObject)==mismatch&&e.getDeclaredField(entityFields[1]).get(shadowObject)==null,"UNRELATED_SHADOW_INTERCEPTED");
  }
  private static Object values(Class<?> type,String[] names,double[] values)throws Exception{
    Object v=type.getConstructor().newInstance();for(int i=0;i<names.length;i++){
      var field=type.getField(names[i]);if(field.getType()==int.class)field.setInt(v,(int)values[i]);else field.setDouble(v,values[i]);
    }return v;
  }
  private static void assertStored(Class<?> type,Object target,String[] names,Object[] expected,String reason)throws Exception{
    for(int i=0;i<names.length;i++)check(type.getField(names[i]).get(target)==expected[i],reason+":"+names[i]);
  }
}
