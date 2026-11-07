package eff.hiddenboundary;

import java.util.Set;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;

/** Pre-mutation lifecycle and collection checks; caller identity is irrelevant. */
public final class HiddenWriteTransform implements Opcodes {
  private static final String ENTITY="net/minecraft/world/entity/Entity";
  private static final Set<String> VECTORS=Set.of("position","f_19825_","deltaMovement","f_19827_","stuckSpeedMultiplier","f_19865_");
  public static byte[] apply(Class<?> lookup,byte[] input) {
    ClassReader reader=new ClassReader(input);ClassNode node=new ClassNode();reader.accept(node,ClassReader.EXPAND_FRAMES);
    boolean changed=false;
    for(MethodNode method:node.methods) {
      for(AbstractInsnNode insn:method.instructions.toArray()) {
        if(insn instanceof FieldInsnNode screen && screen.getOpcode()==PUTFIELD
            && Set.of("screen","f_91080_").contains(screen.name)
            && screen.desc.equals("Lnet/minecraft/client/gui/screens/Screen;")) {
          LabelNode allowed=new LabelNode(),end=new LabelNode();InsnList code=new InsnList();
          code.add(new InsnNode(DUP2));code.add(new InsnNode(POP));
          code.add(new LdcInsnNode(Type.getObjectType(screen.owner)));code.add(new LdcInsnNode(screen.name));code.add(new LdcInsnNode(screen.desc));
          code.add(new MethodInsnNode(INVOKESTATIC,"eff/lifetime/FieldWriteGate","rejectDeclaredClientScreenWrite","(Ljava/lang/Object;Ljava/lang/Class;Ljava/lang/String;Ljava/lang/String;)Z",false));
          code.add(new JumpInsnNode(IFEQ,allowed));code.add(new InsnNode(POP2));code.add(new JumpInsnNode(GOTO,end));code.add(allowed);
          method.instructions.insertBefore(screen,code);method.instructions.insert(screen,end);changed=true;continue;
        }
        if (insn instanceof MethodInsnNode call && guardRemoval(method, call, lookup.getClassLoader()==null)) { changed=true; continue; }
        if(!(insn instanceof FieldInsnNode field)||field.getOpcode()!=PUTFIELD||!eligible(field))continue;
        // Preserve operand evaluation and all following operations. Only the write
        // to a currently owned target is withheld; ordinary/null targets keep JVM semantics.
        Type valueType=Type.getType(field.desc);
        int value=method.maxLocals;method.maxLocals+=valueType.getSize();int target=method.maxLocals++;
        LabelNode done=new LabelNode();InsnList code=new InsnList();
        code.add(new VarInsnNode(valueType.getOpcode(ISTORE),value));code.add(new VarInsnNode(ASTORE,target));
        code.add(new VarInsnNode(ALOAD,target));
        String operation = Set.of("position","f_19825_").contains(field.name) ? "field-write:position"
            : Set.of("blockPosition","f_19826_").contains(field.name) ? "field-write:blockPosition"
            : Set.of("chunkPosition","f_185933_").contains(field.name) ? "field-write:chunkPosition"
            : Set.of("deltaMovement","f_19827_").contains(field.name) ? "field-write:deltaMovement"
            : Set.of("stuckSpeedMultiplier","f_19865_").contains(field.name) ? "field-write:stuckSpeedMultiplier"
            : Set.of("bb","f_19828_").contains(field.name) ? "field-write:bb"
            : Set.of("removalReason","f_146795_").contains(field.name) ? "field-write:removalReason"
            : Set.of("dead","f_20890_").contains(field.name) ? "field-write:dead"
            : Set.of("deathTime","f_20919_").contains(field.name) ? "field-write:deathTime" : null;
        boolean spatial = field.desc.equals("Lnet/minecraft/world/phys/Vec3;") || field.desc.equals("Lnet/minecraft/world/phys/AABB;")
            || field.desc.equals("Lnet/minecraft/core/BlockPos;") || field.desc.equals("Lnet/minecraft/world/level/ChunkPos;");
        if (Set.of("tickCount","f_19797_").contains(field.name) && field.desc.equals("I")) {
          code.add(new VarInsnNode(ILOAD,value));code.add(new LdcInsnNode(Type.getObjectType(field.owner)));code.add(new LdcInsnNode(field.name));
          code.add(new MethodInsnNode(INVOKESTATIC,"eff/lifetime/FieldWriteGate","rejectDeclaredTickWrite",
              "(Ljava/lang/Object;ILjava/lang/Class;Ljava/lang/String;)Z",false));
        } else if (spatial) {
          code.add(new VarInsnNode(ALOAD,value));
          code.add(new LdcInsnNode(Type.getObjectType(field.owner)));
          code.add(new LdcInsnNode(field.name));code.add(new LdcInsnNode(field.desc));code.add(new LdcInsnNode(operation));
          code.add(new MethodInsnNode(INVOKESTATIC,"eff/lifetime/FieldWriteGate","rejectDeclaredSpatialValue",
              "(Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Class;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)Z",false));
        } else if (operation != null && !field.owner.equals(ENTITY) && !field.owner.equals("net/minecraft/world/entity/LivingEntity")) {
          // Resolve inherited vs shadow fields when the write executes, not while
          // the VM is defining a hidden class. Loading game classes in that native
          // callback can recursively enter the class-definition boundary.
          code.add(new LdcInsnNode(Type.getObjectType(field.owner)));
          code.add(new LdcInsnNode(field.name));code.add(new LdcInsnNode(field.desc));code.add(new LdcInsnNode(operation));
          code.add(new MethodInsnNode(INVOKESTATIC,"eff/lifetime/FieldWriteGate","rejectDeclaredOperation",
              "(Ljava/lang/Object;Ljava/lang/Class;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)Z",false));
        } else if (operation != null) {
          code.add(new LdcInsnNode(operation));
          code.add(new MethodInsnNode(INVOKESTATIC,"eff/lifetime/FieldWriteGate","rejectOperation","(Ljava/lang/Object;Ljava/lang/String;)Z",false));
        } else code.add(new MethodInsnNode(INVOKESTATIC,"eff/lifetime/FieldWriteGate","reject","(Ljava/lang/Object;)Z",false));
        code.add(new JumpInsnNode(IFNE,done));code.add(new VarInsnNode(ALOAD,target));code.add(new VarInsnNode(valueType.getOpcode(ILOAD),value));
        code.add(new FieldInsnNode(PUTFIELD,field.owner,field.name,field.desc));code.add(done);
        method.instructions.insertBefore(field,code);method.instructions.remove(field);changed=true;
      }
    }
    if(!changed)return input;
    ClassLoader loader=lookup.getClassLoader();
    ClassWriter writer=new ClassWriter(ClassWriter.COMPUTE_FRAMES|ClassWriter.COMPUTE_MAXS) {
      @Override protected String getCommonSuperClass(String a,String b) {
        if(a.equals(b))return a;
        try {
          // The class being defined cannot be resolved by name yet. Its declared
          // superclass is sufficient for a merge with any different reference type.
          String aa=a.equals(node.name)?node.superName:a,bb=b.equals(node.name)?node.superName:b;
          Class<?> ca=Class.forName(aa.replace('/','.'),false,loader),cb=Class.forName(bb.replace('/','.'),false,loader);
          if(ca.isAssignableFrom(cb))return aa;if(cb.isAssignableFrom(ca))return bb;
          if(ca.isInterface()||cb.isInterface())return "java/lang/Object";
          do {ca=ca.getSuperclass();}while(!ca.isAssignableFrom(cb));return ca.getName().replace('.','/');
        } catch(ClassNotFoundException e) {throw new IllegalStateException("HIDDEN_FRAME_HIERARCHY_UNRESOLVED",e);}
      }
    };
    node.accept(writer);return writer.toByteArray();
  }
  private static boolean eligible(FieldInsnNode field) {
    boolean lifecycle=Set.of("dead","f_20890_").contains(field.name)&&field.desc.equals("Z")
        ||Set.of("deathTime","f_20919_").contains(field.name)&&field.desc.equals("I");
    boolean entityField=VECTORS.contains(field.name)&&field.desc.equals("Lnet/minecraft/world/phys/Vec3;")
        ||Set.of("tickCount","f_19797_").contains(field.name)&&field.desc.equals("I")
        ||Set.of("blockPosition","f_19826_").contains(field.name)&&field.desc.equals("Lnet/minecraft/core/BlockPos;")
        ||Set.of("chunkPosition","f_185933_").contains(field.name)&&field.desc.equals("Lnet/minecraft/world/level/ChunkPos;")
        ||Set.of("removalReason","f_146795_").contains(field.name)&&field.desc.equals("Lnet/minecraft/world/entity/Entity$RemovalReason;")
        ||Set.of("bb","f_19828_").contains(field.name)&&field.desc.equals("Lnet/minecraft/world/phys/AABB;");
    return lifecycle||entityField;
  }
  /** Hidden definitions skip ordinary ModLauncher call-site instrumentation. Keep
   * the receiver, original invocation and caller stack; do not replace the list. */
  private static boolean guardRemoval(MethodNode method, MethodInsnNode call, boolean bootstrapLookup) {
    if(call.getOpcode()==INVOKESTATIC || !call.name.equals("remove"))return false;
    boolean list=Set.of("java/util/List","java/util/ArrayList","java/util/LinkedList").contains(call.owner);
    boolean indexed=list && call.desc.equals("(I)Ljava/lang/Object;");
    boolean object=(list || Set.of("java/util/Collection","java/util/Set","java/util/HashSet","java/util/LinkedHashSet").contains(call.owner))
        && call.desc.equals("(Ljava/lang/Object;)Z");
    if(!indexed&&!object)return false;
    LabelNode allowed=new LabelNode(),end=new LabelNode();InsnList code=new InsnList();
    code.add(new InsnNode(DUP2));
    // A bootstrap-defined hidden class cannot resolve a game-module class. Its
    // bridge lives in the bootstrap loader and binds only the authenticated gate.
    code.add(new MethodInsnNode(INVOKESTATIC,bootstrapLookup?"eff/ownedboot/InstanceWriteGuard":"eff/lifetime/FieldWriteGate",
        indexed?"rejectListIndexRemoval":"rejectCollectionRemoval",
        indexed?"(Ljava/util/List;I)Z":"(Ljava/util/Collection;Ljava/lang/Object;)Z",false));
    code.add(new JumpInsnNode(IFEQ,allowed));code.add(new InsnNode(POP2));
    code.add(new InsnNode(indexed?ACONST_NULL:ICONST_0));code.add(new JumpInsnNode(GOTO,end));code.add(allowed);
    method.instructions.insertBefore(call,code);method.instructions.insert(call,end);return true;
  }
}
