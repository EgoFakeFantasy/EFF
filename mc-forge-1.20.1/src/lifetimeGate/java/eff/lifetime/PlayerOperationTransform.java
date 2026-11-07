package eff.lifetime;

import java.util.Set;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.Type;
import org.objectweb.asm.tree.*;

/** Before-operation player guards. A false predicate preserves the complete vanilla body. */
public final class PlayerOperationTransform implements Opcodes {
  private static final String PLAYER = "net/minecraft/world/entity/player/Player";
  private static final String HELPER = "eff/minecraft/PlayerLifetime";
  private static final String MARKER = "EFF_PLAYER_OPERATION_V1";
  private static final String CONNECTION = "net/minecraft/server/network/ServerGamePacketListenerImpl";
  private static final Set<String> TARGETS = Set.of("net/minecraft/world/entity/Entity",
      "net/minecraft/world/entity/LivingEntity", PLAYER, "net/minecraft/server/level/ServerPlayer",
      "net/minecraft/client/player/LocalPlayer", "net/minecraft/client/player/AbstractClientPlayer",
      "net/minecraft/client/player/RemotePlayer", CONNECTION);
  private PlayerOperationTransform() {}
  public static boolean supports(String name) { return TARGETS.contains(name); }

  public static int instrument(ClassNode node) {
    if (!supports(node.name)) return 0;
    int count = 0;
    if (PLAYER.equals(node.name) && !node.interfaces.contains("eff/lifetime/LifetimeTarget")) {
      node.interfaces.add("eff/lifetime/LifetimeTarget");
      delegate(node, "rejectLifetimeMutation", "()Z", "active", "(Ljava/lang/Object;)Z", IRETURN);
      delegate(node, "lifetimeKey", "()Ljava/lang/Object;", "key", "(Ljava/lang/Object;)Ljava/lang/Object;", ARETURN);
      delegate(node, "lifetimeOperationRejected", "(Ljava/lang/String;)V", "operationRejected", "(Ljava/lang/Object;Ljava/lang/String;)V", RETURN);
      delegate(node, "lifetimeBooleanWriteRejected", "(Ljava/lang/String;Z)V", "booleanWriteRejected", "(Ljava/lang/Object;Ljava/lang/String;Z)V", RETURN);
      MethodNode movement = new MethodNode(ACC_PUBLIC | ACC_SYNTHETIC, "lifetimeAllowsMovement", "()Z", null, null);
      movement.instructions.add(new InsnNode(ICONST_1)); movement.instructions.add(new InsnNode(IRETURN));
      node.methods.add(movement); count++;
      MethodNode position = new MethodNode(ACC_PUBLIC | ACC_SYNTHETIC, "lifetimeAllowsPosition", "(DDD)Z", null, null);
      position.instructions.add(new VarInsnNode(ALOAD, 0));
      for (int slot : new int[]{1, 3, 5}) position.instructions.add(new VarInsnNode(DLOAD, slot));
      position.instructions.add(new MethodInsnNode(INVOKESTATIC, HELPER, "allowsPosition", "(Ljava/lang/Object;DDD)Z", false));
      position.instructions.add(new InsnNode(IRETURN)); node.methods.add(position);
    }
    return count + instrumentOperations(node);
  }

  /** Final passes may reassert method heads, but may not change class schema. */
  public static int instrumentOperations(ClassNode node) {
    if (!supports(node.name)) return 0;
    int count = 0;
    for (MethodNode method : node.methods) {
      if ((method.access & (ACC_STATIC | ACC_ABSTRACT | ACC_NATIVE)) != 0) continue;
      int positionSlot = positionSlot(node.name, method.name, method.desc);
      if (positionSlot != 0) {
        InsnList head = positionHead(node, method, positionSlot);
        if (!exactPositionHead(method, head)) { method.instructions.insert(head); count++; }
        continue;
      }
      if (Set.of("setPose", "m_20124_").contains(method.name)
          && method.desc.equals("(Lnet/minecraft/world/entity/Pose;)V")) {
        if (!hasPoseHead(method)) {
          LabelNode ordinary = new LabelNode(); InsnList head = new InsnList();
          head.add(new LdcInsnNode("EFF_LIFETIME_POSE_V1")); head.add(new InsnNode(POP));
          head.add(new VarInsnNode(ALOAD, 0)); head.add(new VarInsnNode(ALOAD, 1));
          head.add(new MethodInsnNode(INVOKESTATIC, "eff/lifetime/FieldWriteGate", "rejectDyingPose",
              "(Ljava/lang/Object;Ljava/lang/Object;)Z", false));
          head.add(new JumpInsnNode(IFEQ, ordinary)); head.add(new InsnNode(RETURN)); head.add(ordinary);
          head.add(new FrameNode(F_NEW, 2, new Object[]{node.name, "net/minecraft/world/entity/Pose"}, 0, new Object[0]));
          method.instructions.insert(head); count++;
        }
        continue;
      }
      String operation = operation(method.name, method.desc);
      if (operation == null) continue;
      if (hasExactHead(method, operation)) continue;
      LabelNode ordinary = new LabelNode(); InsnList head = new InsnList();
      head.add(new LdcInsnNode(MARKER)); head.add(new InsnNode(POP));
      head.add(new VarInsnNode(ALOAD, 0)); head.add(new LdcInsnNode(operation));
      if (damageOperation(operation)) {
        head.add(new VarInsnNode(ALOAD, 1)); head.add(new VarInsnNode(FLOAD, 2));
        head.add(new MethodInsnNode(INVOKESTATIC, HELPER, "rejectDamage",
            "(Ljava/lang/Object;Ljava/lang/String;Ljava/lang/Object;F)Z", false));
      } else head.add(new MethodInsnNode(INVOKESTATIC, HELPER, "rejectOperation", "(Ljava/lang/Object;Ljava/lang/String;)Z", false));
      head.add(new JumpInsnNode(IFEQ, ordinary));
      if (method.desc.endsWith("Z")) { head.add(new InsnNode(ICONST_0)); head.add(new InsnNode(IRETURN)); }
      else head.add(new InsnNode(RETURN));
      head.add(ordinary);
      java.util.ArrayList<Object> locals = new java.util.ArrayList<>(); locals.add(node.name);
      for (Type type : Type.getArgumentTypes(method.desc)) {
        locals.add(switch (type.getSort()) {
          case Type.FLOAT -> FLOAT;
          case Type.LONG -> LONG;
          case Type.DOUBLE -> DOUBLE;
          case Type.OBJECT, Type.ARRAY -> type.getInternalName();
          default -> INTEGER;
        });
      }
      head.add(new FrameNode(F_NEW, locals.size(), locals.toArray(), 0, new Object[0]));
      method.instructions.insert(head); count++;
    }
    return count;
  }

  private static int positionSlot(String owner, String name, String desc) {
    if (CONNECTION.equals(owner)) return Set.of("teleport", "m_9774_", "m_9780_").contains(name)
        && Set.of("(DDDFF)V", "(DDDFFLjava/util/Set;)V").contains(desc) ? 1 : 0;
    if (Set.of("setPos", "m_6034_", "setPosRaw", "m_20343_", "absMoveTo", "m_20248_",
        "moveTo", "m_6027_", "dismountTo", "m_142098_", "teleportTo", "m_6021_",
        "teleportToWithTicket", "m_20324_").contains(name) && desc.equals("(DDD)V")) return 1;
    if (Set.of("absMoveTo", "m_19890_", "moveTo", "m_7678_").contains(name) && desc.equals("(DDDFF)V")) return 1;
    if (Set.of("teleportTo", "m_8999_", "m_264318_").contains(name)
        && Set.of("(Lnet/minecraft/server/level/ServerLevel;DDDFF)V",
            "(Lnet/minecraft/server/level/ServerLevel;DDDLjava/util/Set;FF)Z").contains(desc)) return 2;
    return 0;
  }

  private static InsnList positionHead(ClassNode node, MethodNode method, int slot) {
    InsnList head = new InsnList(); LabelNode ordinary = new LabelNode();
    head.add(new LdcInsnNode("EFF_ABSOLUTE_POSITION_ENTRY_V1")); head.add(new InsnNode(POP));
    head.add(new VarInsnNode(ALOAD, 0));
    if (CONNECTION.equals(node.name)) {
      FieldNode player = node.fields.stream().filter(f -> (f.access & ACC_STATIC) == 0
          && Set.of("player", "f_9743_").contains(f.name)
          && f.desc.equals("Lnet/minecraft/server/level/ServerPlayer;")).findFirst()
          .orElseThrow(() -> new IllegalStateException("POSITION_CONNECTION_PLAYER_FIELD_MISSING"));
      head.add(new FieldInsnNode(GETFIELD, node.name, player.name, player.desc));
    }
    for (int i = 0; i < 3; i++) head.add(new VarInsnNode(DLOAD, slot + 2 * i));
    head.add(new MethodInsnNode(INVOKESTATIC, "eff/lifetime/FieldWriteGate", "rejectPositionOperation",
        "(Ljava/lang/Object;DDD)Z", false));
    head.add(new JumpInsnNode(IFEQ, ordinary));
    if (method.desc.endsWith("Z")) { head.add(new InsnNode(ICONST_0)); head.add(new InsnNode(IRETURN)); }
    else head.add(new InsnNode(RETURN));
    head.add(ordinary);
    java.util.ArrayList<Object> locals = new java.util.ArrayList<>(); locals.add(node.name);
    for (Type type : Type.getArgumentTypes(method.desc)) locals.add(switch (type.getSort()) {
      case Type.DOUBLE -> DOUBLE; case Type.FLOAT -> FLOAT;
      case Type.OBJECT, Type.ARRAY -> type.getInternalName(); default -> INTEGER;
    });
    head.add(new FrameNode(F_NEW, locals.size(), locals.toArray(), 0, new Object[0]));
    return head;
  }

  /** Match every executable instruction, the branch landing, and handler coverage. */
  private static boolean exactPositionHead(MethodNode method, InsnList expected) {
    AbstractInsnNode actual = method.instructions.getFirst(), last = null;
    JumpInsnNode branch = null; MethodInsnNode predicate = null;
    for (AbstractInsnNode wanted : expected) {
      if (wanted.getOpcode() < 0) continue;
      while (actual != null && actual.getOpcode() < 0) actual = actual.getNext();
      if (actual == null || actual.getOpcode() != wanted.getOpcode()) return false;
      if (wanted instanceof LdcInsnNode w && (!(actual instanceof LdcInsnNode a) || !w.cst.equals(a.cst))) return false;
      if (wanted instanceof VarInsnNode w && (!(actual instanceof VarInsnNode a) || w.var != a.var)) return false;
      if (wanted instanceof FieldInsnNode w && (!(actual instanceof FieldInsnNode a)
          || !w.owner.equals(a.owner) || !w.name.equals(a.name) || !w.desc.equals(a.desc))) return false;
      if (wanted instanceof MethodInsnNode w) {
        if (!(actual instanceof MethodInsnNode a) || !w.owner.equals(a.owner) || !w.name.equals(a.name)
            || !w.desc.equals(a.desc) || w.itf != a.itf) return false;
        predicate = (MethodInsnNode) actual;
      }
      if (actual instanceof JumpInsnNode a) branch = a;
      last = actual; actual = actual.getNext();
    }
    if (branch == null || predicate == null || last == null) return false;
    boolean landing = false;
    for (AbstractInsnNode n = last.getNext(); n != null && n.getOpcode() < 0; n = n.getNext())
      if (n == branch.label) landing = true;
    if (!landing) return false;
    int at = method.instructions.indexOf(predicate);
    for (TryCatchBlockNode handler : method.tryCatchBlocks)
      if (method.instructions.indexOf(handler.start) <= at && at < method.instructions.indexOf(handler.end)) return false;
    return true;
  }

  private static boolean hasPoseHead(MethodNode method) {
    java.util.ArrayList<AbstractInsnNode> prefix = new java.util.ArrayList<>();
    for (AbstractInsnNode insn : method.instructions) {
      if (insn.getOpcode() >= 0) prefix.add(insn);
      if (prefix.size() == 7) break;
    }
    if (prefix.size() != 7 || !(prefix.get(0) instanceof LdcInsnNode marker)
        || !"EFF_LIFETIME_POSE_V1".equals(marker.cst) || prefix.get(1).getOpcode() != POP
        || !(prefix.get(2) instanceof VarInsnNode receiver) || receiver.getOpcode() != ALOAD || receiver.var != 0
        || !(prefix.get(3) instanceof VarInsnNode pose) || pose.getOpcode() != ALOAD || pose.var != 1
        || !(prefix.get(4) instanceof MethodInsnNode call) || call.getOpcode() != INVOKESTATIC || call.itf
        || !call.owner.equals("eff/lifetime/FieldWriteGate") || !call.name.equals("rejectDyingPose")
        || !call.desc.equals("(Ljava/lang/Object;Ljava/lang/Object;)Z")
        || !(prefix.get(5) instanceof JumpInsnNode branch) || branch.getOpcode() != IFEQ
        || prefix.get(6).getOpcode() != RETURN) return false;
    AbstractInsnNode after = prefix.get(6).getNext(); boolean targetFound = false;
    while (after != null && after.getOpcode() < 0) {
      if (after == branch.label) targetFound = true;
      after = after.getNext();
    }
    if (!targetFound) return false;
    for (TryCatchBlockNode handler : method.tryCatchBlocks) {
      int start = method.instructions.indexOf(handler.start), end = method.instructions.indexOf(handler.end);
      int at = method.instructions.indexOf(call);
      if (start <= at && at < end) return false;
    }
    return true;
  }

  private static boolean hasExactHead(MethodNode method, String operation) {
    boolean damage = damageOperation(operation);
    int callIndex = damage ? 6 : 4;
    java.util.ArrayList<AbstractInsnNode> prefix = new java.util.ArrayList<>();
    for (AbstractInsnNode insn : method.instructions) {
      if (insn.getOpcode() >= 0) prefix.add(insn);
      if (prefix.size() == (damage ? 10 : 8)) break;
    }
    int returnIndex = callIndex + (method.desc.endsWith("Z") ? 3 : 2);
    if (prefix.size() <= returnIndex) return false;
    if (!(prefix.get(0) instanceof LdcInsnNode a) || !MARKER.equals(a.cst)
        || prefix.get(1).getOpcode() != POP
        || !(prefix.get(2) instanceof VarInsnNode load) || load.getOpcode() != ALOAD || load.var != 0
        || !(prefix.get(3) instanceof LdcInsnNode op) || !operation.equals(op.cst)
        || !(prefix.get(callIndex) instanceof MethodInsnNode call) || call.getOpcode() != INVOKESTATIC
        || !HELPER.equals(call.owner) || !(damage ? "rejectDamage" : "rejectOperation").equals(call.name)
        || !(damage ? "(Ljava/lang/Object;Ljava/lang/String;Ljava/lang/Object;F)Z" : "(Ljava/lang/Object;Ljava/lang/String;)Z").equals(call.desc) || call.itf
        || !(prefix.get(callIndex + 1) instanceof JumpInsnNode branch) || branch.getOpcode() != IFEQ) return false;
    if (damage && (!(prefix.get(4) instanceof VarInsnNode source) || source.getOpcode() != ALOAD || source.var != 1
        || !(prefix.get(5) instanceof VarInsnNode amount) || amount.getOpcode() != FLOAD || amount.var != 2)) return false;
    if (method.desc.endsWith("Z") && prefix.get(callIndex + 2).getOpcode() != ICONST_0) return false;
    if (prefix.get(returnIndex).getOpcode() != (method.desc.endsWith("Z") ? IRETURN : RETURN)) return false;
    // The false predicate must land immediately after the return, never in hostile code
    // prepended before it. No exception handler may swallow the predicate itself.
    AbstractInsnNode after = prefix.get(returnIndex).getNext(); boolean targetFound = false;
    while (after != null && after.getOpcode() < 0) {
      if (after == branch.label) targetFound = true;
      after = after.getNext();
    }
    if (!targetFound) return false;
    for (TryCatchBlockNode handler : method.tryCatchBlocks) {
      int start = method.instructions.indexOf(handler.start), end = method.instructions.indexOf(handler.end);
      int at = method.instructions.indexOf(call);
      if (start <= at && at < end) return false;
    }
    return true;
  }

  private static boolean damageOperation(String operation) {
    return operation.equals("player:hurt") || operation.equals("player:actuallyHurt");
  }

  private static void delegate(ClassNode node, String name, String desc, String method, String targetDesc, int result) {
    if (node.methods.stream().anyMatch(m -> m.name.equals(name) && m.desc.equals(desc)))
      throw new IllegalStateException("PLAYER_LIFETIME_METHOD_COLLISION:" + name);
    MethodNode bridge = new MethodNode(ACC_PUBLIC | ACC_SYNTHETIC, name, desc, null, null);
    bridge.instructions.add(new VarInsnNode(ALOAD, 0));
    if (desc.startsWith("(Ljava/lang/String;")) bridge.instructions.add(new VarInsnNode(ALOAD, 1));
    if (desc.equals("(Ljava/lang/String;Z)V")) bridge.instructions.add(new VarInsnNode(ILOAD, 2));
    bridge.instructions.add(new MethodInsnNode(INVOKESTATIC, HELPER, method, targetDesc, false));
    bridge.instructions.add(new InsnNode(result)); node.methods.add(bridge);
  }

  private static String operation(String name, String desc) {
    String source = "Lnet/minecraft/world/damagesource/DamageSource;";
    if (Set.of("hurt", "m_6469_").contains(name) && desc.equals("(" + source + "F)Z")) return "player:hurt";
    if (Set.of("actuallyHurt", "m_6475_").contains(name) && desc.equals("(" + source + "F)V")) return "player:actuallyHurt";
    if (Set.of("die", "m_6667_").contains(name) && desc.equals("(" + source + ")V")) return "player:die";
    if (Set.of("kill", "m_6074_").contains(name) && desc.equals("()V")) return "player:kill";
    if (Set.of("tickDeath", "m_6153_").contains(name) && desc.equals("()V")) return "player:tickDeath";
    if (name.equals("onRemovedFromWorld") && desc.equals("()V")) return "player:onRemovedFromWorld";
    if (Set.of("setHealth", "m_21153_").contains(name) && desc.equals("(F)V")) return "player:setHealth";
    if (Set.of("remove", "m_142687_", "setRemoved", "m_142467_").contains(name)
        && desc.equals("(Lnet/minecraft/world/entity/Entity$RemovalReason;)V")) return "player:remove";
    return null;
  }
}
