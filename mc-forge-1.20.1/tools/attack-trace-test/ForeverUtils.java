package com.wzz.forever_love_sword.util;

import java.lang.invoke.*;
import it.unimi.dsi.fastutil.ints.Int2ObjectMap;

/** Synthetic fixture only. No opponent JAR is loaded or executed. */
public final class ForeverUtils {
  public static Object killEntity(Int2ObjectMap<?> map, int key) { return map.remove(key); }
  public static void killEntity(net.minecraft.world.entity.Entity target, int operation) {
    if (operation == 0) target.position = new net.minecraft.world.phys.Vec3(Double.NaN, Double.NaN, Double.NaN);
    else if (operation == 1) target.removalReason = net.minecraft.world.entity.Entity.RemovalReason.KILLED;
    else if (operation == 2) eff.lifetime.FieldWriteGate.rejectOperation(target, "query");
    else if (operation == 3) eff.lifetime.FieldWriteGate.rejectOperation(target, "field-write:unknown");
  }
  public static MethodHandle hiddenFieldKill() throws Exception {
    try (var in = ForeverUtils.class.getResourceAsStream("ForeverUtils.class")) {
      byte[] bytes = eff.hiddenboundary.HiddenWriteTransform.apply(ForeverUtils.class, in.readAllBytes());
      var lookup = MethodHandles.lookup().defineHiddenClass(bytes, true, MethodHandles.Lookup.ClassOption.NESTMATE);
      if (!lookup.lookupClass().isHidden()) throw new AssertionError("HIDDEN_FIELD_FIXTURE_REQUIRED");
      return lookup.findStatic(lookup.lookupClass(), "killEntity", MethodType.methodType(void.class, net.minecraft.world.entity.Entity.class, int.class));
    }
  }
  public static MethodHandle hiddenKill() throws Exception {
    try (var in = ForeverUtils.class.getResourceAsStream("ForeverUtils.class")) {
      var lookup = MethodHandles.lookup().defineHiddenClass(in.readAllBytes(), true, MethodHandles.Lookup.ClassOption.NESTMATE);
      if (!lookup.lookupClass().isHidden()) throw new AssertionError("HIDDEN_FIXTURE_REQUIRED");
      return lookup.findStatic(lookup.lookupClass(), "killEntity", MethodType.methodType(Object.class, Int2ObjectMap.class, int.class));
    }
  }
}
