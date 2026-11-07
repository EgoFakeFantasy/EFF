package proof;
import java.nio.file.*;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;

/** Supply the three checked call-site shapes in the minimal header-test fixture.
 * This method is never executed; this fixture tests header ownership, not game rendering. */
public final class WorldRendererFixtureBuild implements Opcodes {
  public static void main(String[] args) throws Exception {
    Path file=Path.of(args[0]);ClassNode node=new ClassNode();
    new ClassReader(Files.readAllBytes(file)).accept(node,0);
    if(node.methods.stream().anyMatch(m->m.name.equals("fixtureRoutes")))return;
    MethodNode m=new MethodNode(ACC_PRIVATE|ACC_STATIC,"fixtureRoutes","()V",null,null);
    String helper="eff/minecraft/client/ProjectionRenderBoundary";
    String dispatcher="Lnet/minecraft/client/renderer/entity/EntityRenderDispatcher;";
    String entity="Lnet/minecraft/world/entity/Entity;";
    m.instructions.add(new InsnNode(ACONST_NULL));
    m.instructions.add(new MethodInsnNode(INVOKESTATIC,helper,"entities","(Lnet/minecraft/client/multiplayer/ClientLevel;)Ljava/lang/Iterable;",false));
    m.instructions.add(new InsnNode(POP));
    for(int i=0;i<3;i++)m.instructions.add(new InsnNode(ACONST_NULL));
    for(int i=0;i<3;i++)m.instructions.add(new InsnNode(DCONST_0));
    m.instructions.add(new MethodInsnNode(INVOKESTATIC,helper,"shouldRender","("+dispatcher+entity+"Lnet/minecraft/client/renderer/culling/Frustum;DDD)Z",false));
    m.instructions.add(new InsnNode(POP));
    for(int i=0;i<2;i++)m.instructions.add(new InsnNode(ACONST_NULL));
    for(int i=0;i<3;i++)m.instructions.add(new InsnNode(DCONST_0));
    for(int i=0;i<2;i++)m.instructions.add(new InsnNode(FCONST_0));
    for(int i=0;i<2;i++)m.instructions.add(new InsnNode(ACONST_NULL));
    m.instructions.add(new InsnNode(ICONST_0));
    m.instructions.add(new MethodInsnNode(INVOKESTATIC,helper,"render","("+dispatcher+entity+"DDDFFLcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/MultiBufferSource;I)V",false));
    m.instructions.add(new InsnNode(RETURN));node.methods.add(m);
    ClassWriter writer=new ClassWriter(ClassWriter.COMPUTE_MAXS);node.accept(writer);Files.write(file,writer.toByteArray());
  }
}
