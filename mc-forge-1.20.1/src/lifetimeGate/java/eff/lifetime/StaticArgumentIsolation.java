package eff.lifetime;

import java.util.*;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;

/** Makes a narrowly recognized, method-private argument scratch slot invocation-local.
 * No class, method, or field names are special-cased. Business calls and control flow stay intact.
 * The proof covers direct bytecode accesses in this class, not reflective/Unsafe/JNI access to
 * its private scratch fields. Nestmates and escaped field handles are therefore rejected.
 * This is a concurrency compatibility correction, not a native-code security boundary.
 */
public final class StaticArgumentIsolation implements Opcodes {
  private StaticArgumentIsolation() {}
  public record Rewrite(String method, String descriptor, String field, String fieldDescriptor, int local) {}
  private record Candidate(FieldNode field, MethodNode method, FieldInsnNode write,
                           List<FieldInsnNode> accesses) {}

  public static List<Rewrite> instrument(ClassNode owner) {
    // A nestmate can directly access a private field without appearing in this class.
    if (owner.nestHostClass != null || owner.nestMembers != null && !owner.nestMembers.isEmpty()) return List.of();
    List<Candidate> candidates = new ArrayList<>();
    for (FieldNode field : owner.fields) {
      if ((field.access & (ACC_PRIVATE | ACC_STATIC)) != (ACC_PRIVATE | ACC_STATIC)
          || (field.access & (ACC_FINAL | ACC_VOLATILE)) != 0 || field.value != null) continue;
      MethodNode method = null; FieldInsnNode write = null;
      List<FieldInsnNode> accesses = new ArrayList<>(); boolean unsafe = false;
      for (MethodNode current : owner.methods) {
        for (AbstractInsnNode instruction : current.instructions) {
          if (escaped(instruction, owner.name, field)) { unsafe = true; break; }
          if (!(instruction instanceof FieldInsnNode access) || !matches(access, owner.name, field)) continue;
          if (method != null && method != current) { unsafe = true; break; }
          method = current; accesses.add(access);
          if (access.getOpcode() == PUTSTATIC) {
            if (write != null) { unsafe = true; break; }
            write = access;
          } else if (access.getOpcode() != GETSTATIC) { unsafe = true; break; }
        }
        if (unsafe) break;
      }
      if (unsafe || method == null || write == null || accesses.size() < 2
          || method.name.startsWith("<") || (method.access & (ACC_ABSTRACT | ACC_NATIVE)) != 0) continue;
      AbstractInsnNode producer = write.getPrevious();
      while (producer != null && producer.getOpcode() < 0) producer = producer.getPrevious();
      Type valueType = Type.getType(field.desc);
      if (!(producer instanceof VarInsnNode load) || load.getOpcode() != valueType.getOpcode(ILOAD)
          || !isArgumentSlot(method, load.var, valueType)) continue;
      if (!dominatesReads(method, write, accesses)) continue;
      candidates.add(new Candidate(field, method, write, accesses));
    }
    List<Rewrite> changes = new ArrayList<>();
    for (Candidate candidate : candidates) {
      Type type = Type.getType(candidate.field.desc);
      int local = candidate.method.maxLocals;
      candidate.method.maxLocals += type.getSize();
      for (FieldInsnNode access : candidate.accesses)
        candidate.method.instructions.set(access,
            new VarInsnNode(type.getOpcode(access == candidate.write ? ISTORE : ILOAD), local));
      changes.add(new Rewrite(candidate.method.name, candidate.method.desc,
          candidate.field.name, candidate.field.desc, local));
    }
    return List.copyOf(changes);
  }

  private static boolean isArgumentSlot(MethodNode method, int slot, Type type) {
    int index = (method.access & ACC_STATIC) != 0 ? 0 : 1;
    for (Type argument : Type.getArgumentTypes(method.desc)) {
      if (slot == index) return type.equals(argument);
      index += argument.getSize();
    }
    return false;
  }
  private static boolean matches(FieldInsnNode instruction, String owner, FieldNode field) {
    return instruction.owner.equals(owner) && instruction.name.equals(field.name) && instruction.desc.equals(field.desc);
  }
  private static boolean escaped(AbstractInsnNode instruction, String owner, FieldNode field) {
    if (instruction instanceof LdcInsnNode constant) return escapedConstant(constant.cst, owner, field);
    if (instruction instanceof InvokeDynamicInsnNode dynamic) {
      if (escapedConstant(dynamic.bsm, owner, field)) return true;
      for (Object arg : dynamic.bsmArgs) if (escapedConstant(arg, owner, field)) return true;
    }
    return false;
  }
  private static boolean escapedConstant(Object value, String owner, FieldNode field) {
    if (value instanceof Handle handle)
      return handle.getOwner().equals(owner) && handle.getName().equals(field.name) && handle.getDesc().equals(field.desc);
    if (value instanceof ConstantDynamic dynamic) {
      if (escapedConstant(dynamic.getBootstrapMethod(), owner, field)) return true;
      for (int i = 0; i < dynamic.getBootstrapMethodArgumentCount(); i++)
        if (escapedConstant(dynamic.getBootstrapMethodArgument(i), owner, field)) return true;
    }
    return false;
  }

  /** No path from entry may reach a read without first executing the sole write.
   * Exception edges use the pre-instruction state; legacy subroutines are not accepted.
   */
  private static boolean dominatesReads(MethodNode method, FieldInsnNode write, List<FieldInsnNode> accesses) {
    AbstractInsnNode[] code = method.instructions.toArray();
    IdentityHashMap<AbstractInsnNode,Integer> indices = new IdentityHashMap<>();
    for (int i = 0; i < code.length; i++) {
      if (code[i].getOpcode() == JSR || code[i].getOpcode() == RET) return false;
      indices.put(code[i], i);
    }
    Set<AbstractInsnNode> reads = Collections.newSetFromMap(new IdentityHashMap<>());
    reads.addAll(accesses); reads.remove(write);
    ArrayDeque<Integer> pending = new ArrayDeque<>(); boolean[] visited = new boolean[code.length];
    pending.add(0);
    while (!pending.isEmpty()) {
      int index = pending.removeFirst(); if (index < 0 || index >= code.length || visited[index]) continue;
      visited[index] = true; AbstractInsnNode instruction = code[index];
      if (reads.contains(instruction)) return false;
      // Conservative exceptional edges: do not rely on a particular opcode never throwing.
      for (TryCatchBlockNode block : method.tryCatchBlocks)
        if (index >= indices.get(block.start) && index < indices.get(block.end)) pending.add(indices.get(block.handler));
      if (instruction == write) continue;
      int opcode = instruction.getOpcode();
      if (instruction instanceof JumpInsnNode branch) {
        pending.add(indices.get(branch.label)); if (opcode != GOTO) pending.add(index + 1);
      } else if (instruction instanceof TableSwitchInsnNode table) {
        pending.add(indices.get(table.dflt)); for (LabelNode label : table.labels) pending.add(indices.get(label));
      } else if (instruction instanceof LookupSwitchInsnNode lookup) {
        pending.add(indices.get(lookup.dflt)); for (LabelNode label : lookup.labels) pending.add(indices.get(label));
      } else if (opcode != ATHROW && !(opcode >= IRETURN && opcode <= RETURN)) pending.add(index + 1);
    }
    return true;
  }
}
