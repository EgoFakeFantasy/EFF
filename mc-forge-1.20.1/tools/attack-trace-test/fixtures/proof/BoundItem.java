package proof;
import java.lang.invoke.*;
import net.minecraft.world.entity.Entity;
import org.objectweb.asm.*;
/** Entirely synthetic item/hidden body; no opponent is loaded. */
public class BoundItem implements ItemHook {
  public void onLeftClickEntity(Entity target,MethodHandle kill) throws Throwable {kill.invokeExact(target);}
  public static byte[] bytes() throws Exception {try(var in=BoundItem.class.getResourceAsStream("BoundItem.class")){return in.readAllBytes();}}
  public static ItemHook hidden() throws Throwable {
    var lookup=MethodHandles.lookup().defineHiddenClass(bytes(),true,MethodHandles.Lookup.ClassOption.NESTMATE);
    return (ItemHook)lookup.findConstructor(lookup.lookupClass(),MethodType.methodType(void.class)).invoke();
  }
  public static MethodHandle unknownKill() throws Exception {
    ClassWriter out=new ClassWriter(ClassWriter.COMPUTE_MAXS);
    out.visit(Opcodes.V17,Opcodes.ACC_PUBLIC,"proof/<Unknown>",null,"java/lang/Object",null);
    var method=out.visitMethod(Opcodes.ACC_PUBLIC|Opcodes.ACC_STATIC,"killEntity","(Lnet/minecraft/world/entity/Entity;)V",null,null);
    method.visitCode();method.visitVarInsn(Opcodes.ALOAD,0);method.visitInsn(Opcodes.ACONST_NULL);
    method.visitFieldInsn(Opcodes.PUTFIELD,"net/minecraft/world/entity/Entity","position","Lnet/minecraft/world/phys/Vec3;");
    method.visitInsn(Opcodes.RETURN);method.visitMaxs(0,0);method.visitEnd();out.visitEnd();
    byte[] guarded=eff.hiddenboundary.HiddenWriteTransform.apply(BoundItem.class,out.toByteArray());
    var lookup=MethodHandles.lookup().defineHiddenClass(guarded,true,MethodHandles.Lookup.ClassOption.NESTMATE);
    return lookup.findStatic(lookup.lookupClass(),"killEntity",MethodType.methodType(void.class,Entity.class));
  }
}
