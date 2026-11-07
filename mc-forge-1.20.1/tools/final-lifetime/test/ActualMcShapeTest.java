import eff.finalgate.FinalLifetimeTransform;
import java.nio.file.*;
import java.util.jar.*;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;
public final class ActualMcShapeTest {
  public static void main(String[] args)throws Exception {
    try(JarFile jar=new JarFile(args[0])) {
      for(String name:new String[]{"net/minecraft/world/entity/Entity","net/minecraft/world/entity/LivingEntity","net/minecraft/world/level/entity/EntityLookup","net/minecraft/client/multiplayer/ClientLevel","net/minecraft/server/level/ServerLevel","net/minecraft/world/entity/player/Player","net/minecraft/server/level/ServerPlayer","net/minecraft/client/player/LocalPlayer"}){
        byte[] input=jar.getInputStream(jar.getJarEntry(name+".class")).readAllBytes();
        var result=FinalLifetimeTransform.transform(input);
        if(result.methods()==0)throw new AssertionError(name);
        ClassNode before=new ClassNode(),after=new ClassNode();new ClassReader(input).accept(before,0);new ClassReader(result.bytes()).accept(after,0);
        if(before.fields.size()!=after.fields.size()||before.methods.size()!=after.methods.size())throw new AssertionError("schema changed");
        if(name.equals("net/minecraft/server/level/ServerLevel")) {
          for(String methodName:new String[]{"m_6815_","m_143317_"}) {
            MethodNode query=after.methods.stream().filter(m->m.name.equals(methodName)
                &&m.desc.equals("(I)Lnet/minecraft/world/entity/Entity;")).findFirst().orElseThrow();
            boolean guarded=false;
            for(AbstractInsnNode insn:query.instructions)if(insn instanceof MethodInsnNode call
                &&call.owner.equals("eff/minecraft/ProjectionProbe")&&call.name.equals("serverEntityById"))guarded=true;
            if(!guarded)throw new AssertionError("ACTUAL_SERVER_INTERACTION_UNGUARDED:"+methodName);
          }
        }
        if(name.equals("net/minecraft/world/entity/Entity")) {
          MethodNode pose=after.methods.stream().filter(m->m.name.equals("m_20124_")
              &&m.desc.equals("(Lnet/minecraft/world/entity/Pose;)V")).findFirst().orElseThrow();
          boolean guarded=false;
          for(AbstractInsnNode insn:pose.instructions)if(insn instanceof MethodInsnNode call
              &&call.owner.equals("eff/lifetime/FieldWriteGate")&&call.name.equals("rejectDyingPose"))guarded=true;
          if(!guarded)throw new AssertionError("ACTUAL_MINECRAFT_POSE_CALLEE_UNGUARDED");
        }
        System.out.println("PASS actual MC SRG shape "+name+" guardedMethods="+result.methods()+" schemaPreserved=true");
      }
      byte[] armor=jar.getInputStream(jar.getJarEntry("net/minecraft/world/entity/decoration/ArmorStand.class")).readAllBytes();
      ClassNode node=new ClassNode();new ClassReader(armor).accept(node,ClassReader.SKIP_CODE);
      for(MethodNode m:node.methods)if(java.util.Set.of("m_21223_","m_6084_","m_21224_").contains(m.name))System.out.println("ARMOR_STAND_OVERRIDE "+m.name+m.desc);
    }
  }
}
