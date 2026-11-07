import eff.lifetime.FieldWriteGate;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;
import java.nio.file.*;

/** Pristine ownership is only acceptable when it does not erase necessary gate additions. */
public final class OwnedArenaAudit {
  public static void main(String[] args) throws Exception {
    var files = OwnedOriginPatch.entries(Path.of(args[0]));
    OwnedOriginPatch.mcClasses=OwnedOriginPatch.entries(Path.of(args[2]));
    OwnedOriginPatch.mcClasses.putAll(OwnedOriginPatch.entries(Path.of(args[3])));
    var reviewed=OwnedOriginPatch.canonical(OwnedOriginPatch.owned(Path.of(args[0])));
    var archive=OwnedOriginPatch.entries(Path.of(args[1]));
    int classes = 0;
    for (String name : new String[]{"eff/minecraft/EffArena", "eff/minecraft/EffArena$Placement"}) {
      byte[] original = files.get(name + ".class");
      if (original == null) throw new AssertionError("ARENA_REVIEWED_CLASS_MISSING:" + name);
      ClassNode node = new ClassNode(); new ClassReader(original).accept(node, 0);
      int changes = FieldWriteGate.instrument(node);
      if (changes != (name.equals("eff/minecraft/EffArena") ? 3 : 0)) {
        for (MethodNode method : node.methods) for (AbstractInsnNode instruction : method.instructions)
          if (instruction instanceof MethodInsnNode call && call.owner.equals("eff/lifetime/FieldWriteGate"))
            System.out.println("ARENA_GATE_DELTA method=" + method.name + method.desc + " gate=" + call.name + call.desc);
        throw new AssertionError("ARENA_GATE_EDIT_COUNT_CHANGED:" + name + ":" + changes);
      }
      ClassNode before = new ClassNode(); new ClassReader(original).accept(before, 0);
      byte[] canonical=archive.get("META-INF/eff-owned-origin/archive/"+name+".class");
      if(!java.util.Arrays.equals(reviewed.get(name),canonical))throw new AssertionError("ARENA_CANONICAL_ARCHIVE_MISMATCH");
      ClassNode stored=new ClassNode();new ClassReader(canonical).accept(stored,0);
      if(!OwnedOriginPatch.schema(before).equals(OwnedOriginPatch.schema(stored)))throw new AssertionError("ARENA_CANONICAL_SCHEMA_CHANGED");
      for(int mutation=0;mutation<6;mutation++) {
        ClassNode altered=new ClassNode();new ClassReader(canonical).accept(altered,0);
        switch(mutation){
          case 0 -> altered.fields.get(0).name+="_changed";
          case 1 -> altered.fields.get(0).desc="Ljava/lang/Object;";
          case 2 -> altered.fields.get(0).access^=Opcodes.ACC_FINAL;
          case 3 -> altered.methods.get(0).name+="_changed";
          case 4 -> altered.methods.get(0).desc="()Ljava/lang/Object;";
          case 5 -> altered.methods.get(0).access^=Opcodes.ACC_FINAL;
        }
        if(OwnedOriginPatch.schema(stored).equals(OwnedOriginPatch.schema(altered)))throw new AssertionError("SCHEMA_NEGATIVE_CONTROL_MISSED:"+mutation);
      }
      classes++;
    }
    var method = new MethodNode(Opcodes.ACC_PRIVATE,"syncNPCs","(Lcom/google/gson/JsonObject;)V",null,null);
    var call = new MethodInsnNode(Opcodes.INVOKESTATIC,"eff/lifetime/FieldWriteGate","rejectCollectionRemoval","(Ljava/util/Collection;Ljava/lang/Object;)Z",false);
    if (!OwnedOriginPatch.reviewedArenaGate(method,call)) throw new AssertionError("REVIEWED_LIST_GATE_MISSING");
    method.name="unreviewedMethod";
    if (OwnedOriginPatch.reviewedArenaGate(method,call)) throw new AssertionError("WRONG_GATE_METHOD_ALLOWED");
    method.name="syncNPCs"; call.name="rejectListIndexRemoval";
    if (OwnedOriginPatch.reviewedArenaGate(method,call)) throw new AssertionError("UNREVIEWED_GATE_ALLOWED");
    System.out.println("OWNED_ARENA_GATE_AUDIT_OK classes=" + classes + " preservedEarlyGateEdits=3 completeMemberSchemaUnchanged=true memberNameDescriptorAccessNegativeControls=12 sourceAndCanonicalPinsSeparate=true noNecessaryGateErased=true unreviewedGateRefused=true");
  }
}
