package eff.lifetime;
import net.minecraft.world.entity.Entity;
public final class FieldWriteGate {
  public static boolean rejectOperation(Object target,String operation){return reject(target);}
  // This native fixture tests declaration resolution and write transport. The
  // production finite-value policy is executed separately by PlayerProtectionTest.
  public static boolean rejectSpatialValue(Object target,Object value,String operation){return reject(target);}
  public static boolean reject(Object target){return target instanceof Entity entity&&entity.owned;}
  /* PRODUCTION_DECLARATION_GATE */
}
