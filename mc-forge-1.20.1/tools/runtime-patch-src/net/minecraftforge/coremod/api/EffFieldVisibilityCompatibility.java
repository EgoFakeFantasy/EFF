package net.minecraftforge.coremod.api;

import java.util.Objects;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.tree.*;

/** Extends Forge's class-local field redirection to structurally safe widened instance fields.
 * External direct reads, writes, visibility and getter implementation remain unchanged.
 */
public final class EffFieldVisibilityCompatibility implements Opcodes {
  private EffFieldVisibilityCompatibility() {}
  public static boolean eligible(ClassNode owner, FieldNode field, String requestedGetter) {
    if ((field.access & ACC_PRIVATE) != 0) return true; // preserve upstream private path exactly
    if ((field.access & ACC_STATIC) != 0 || (owner.access & ACC_INTERFACE) != 0) return false;
    String descriptor = "()" + field.desc;
    MethodNode getter = null;
    for (MethodNode method : owner.methods) {
      if (!method.desc.equals(descriptor) || (requestedGetter != null && !method.name.equals(requestedGetter))) continue;
      if (getter != null) return false;
      getter = method;
    }
    if (getter == null || (getter.access & (ACC_STATIC | ACC_ABSTRACT)) != 0 || getter.name.startsWith("<")) return false;
    // Upstream ignores the getter and every method with its descriptor. Preserve that boundary.
    for (MethodNode method : owner.methods) {
      if (method == getter || method.desc.equals(descriptor)) continue;
      for (AbstractInsnNode instruction : method.instructions) {
        if (instruction instanceof FieldInsnNode read && read.getOpcode() == GETFIELD && Objects.equals(read.name, field.name)) {
          if (!Objects.equals(read.owner, owner.name) || !Objects.equals(read.desc, field.desc)) return false;
        }
      }
    }
    return true;
  }
}
