package proof;
import net.minecraft.world.entity.*;
import net.minecraft.world.phys.Vec3;
import it.unimi.dsi.fastutil.ints.Int2ObjectMap;
public final class CombinedNativeOps {
    public static int write(Entity target,Vec3 value){target.position=value;target.removalReason=Entity.RemovalReason.DISCARDED;target.unrelated++;return 73;}
    public static int inherited(LivingEntity target,Vec3 value){target.position=value;target.removalReason=Entity.RemovalReason.DISCARDED;target.unrelated++;return 74;}
    public static int derived(CombinedNativeTest.Derived target,Vec3 value){target.position=value;target.removalReason=Entity.RemovalReason.DISCARDED;target.unrelated++;return 75;}
    public static Object remove(Int2ObjectMap<?> map,int id){return map.remove(id);}
    public static void clear(Int2ObjectMap<?> map){map.clear();}
    public static boolean removeList(java.util.List<?> list,Object value){return list.remove(value);}
    public static Object removeIndex(java.util.List<?> list,int index){return list.remove(index);}
}
