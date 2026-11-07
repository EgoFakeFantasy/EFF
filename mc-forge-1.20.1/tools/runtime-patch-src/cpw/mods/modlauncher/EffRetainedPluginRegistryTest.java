package cpw.mods.modlauncher;

import cpw.mods.modlauncher.serviceapi.ILaunchPluginService;
import java.util.*;
import org.objectweb.asm.Type;
import org.objectweb.asm.tree.ClassNode;

/** Executes the real patched handler, with only its SPI source replaced by a test classpath. */
public final class EffRetainedPluginRegistryTest {
  static int constructors, handled, processed;
  public static class First implements ILaunchPluginService {
    public First() { constructors++; }
    public String name() { return "first"; }
    public EnumSet<Phase> handlesClass(Type type, boolean empty) { handled++; return EnumSet.of(Phase.BEFORE); }
    public int processClassWithFlags(Phase phase, ClassNode node, Type type, String reason) { processed++; return 0; }
  }
  public static final class Peer extends First { public String name() { return "peer"; } }
  public static final class Late extends First { public String name() { return "late"; } }
  public static final class Replacement extends LaunchPluginHandler { public Replacement(ModuleLayerHandler layer) { super(layer); } }
  static void require(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
  static EffRetainedPluginRegistry registry(LaunchPluginHandler handler) throws Exception {
    var field = LaunchPluginHandler.class.getDeclaredField("plugins"); field.setAccessible(true);
    return (EffRetainedPluginRegistry) EffRetainedPluginRegistry.resolve(handler, (Map<String, ILaunchPluginService>) field.get(handler));
  }
  static void dispatch(LaunchPluginHandler handler, int expected) {
    int beforeHandled = handled, beforeProcessed = processed;
    Type type = Type.getObjectType("fixture/Unrelated");
    var audit = new TransformerAuditTrail();
    var phases = handler.computeLaunchPluginTransformerSet(type, false, "fixture", audit);
    require(phases.get(ILaunchPluginService.Phase.BEFORE).size() == expected, "all admitted providers selected");
    handler.offerClassNodeToPlugins(ILaunchPluginService.Phase.BEFORE, phases.get(ILaunchPluginService.Phase.BEFORE), new ClassNode(), type, audit, "fixture");
    require(handled - beforeHandled == expected && processed - beforeProcessed == expected, "each callback exactly once");
  }
  public static void main(String[] args) throws Exception {
    ModuleLayerHandler layer = new ModuleLayerHandler();
    LaunchPluginHandler original = new LaunchPluginHandler(layer);
    var retained = registry(original);
    require(constructors == 2 && retained.size() == 2, "normal SPI creates both providers once");
    var initialKeys = List.copyOf(retained.keySet());
    var first = retained.get("first"); var peer = retained.get("peer");
    dispatch(original, 2);
    LaunchPluginHandler replacement = new Replacement(layer);
    require(constructors == 2 && registry(replacement) == retained, "handler replacement retains registry without duplicate SPI construction");
    retained.keySet().removeIf(key -> true); retained.entrySet().removeIf(entry -> true);
    retained.values().clear(); retained.clear(); retained.remove("first");
    retained.computeIfPresent("peer", (key, value) -> null);
    retained.put("first", peer); retained.entrySet().iterator().next().setValue(peer);
    require(retained.size() == 2 && retained.get("first") == first && retained.get("peer") == peer, "peer cleanup cannot evict admitted instances");
    require(initialKeys.equals(List.copyOf(retained.keySet())), "original iteration order preserved");
    var late = new Late(); registry(replacement).put(late.name(), late);
    require(original.get("late").orElseThrow() == late, "new peer is admitted into both handlers");
    require(constructors == 3, "late constructor is sole extra construction");
    dispatch(original, 3); dispatch(replacement, 3);
    var field = LaunchPluginHandler.class.getDeclaredField("plugins"); field.setAccessible(true);
    var batchPeer = new First() { public String name() { return "batch-peer"; } };
    var batch = new LinkedHashMap<String, ILaunchPluginService>(); batch.put(batchPeer.name(), batchPeer);
    field.set(replacement, batch);
    require(field.get(replacement) == batch, "ordinary reflective batch registration accepted");
    dispatch(replacement, 4);
    require(registry(replacement) == retained && original.get("batch-peer").orElseThrow() == batchPeer, "batch peer merged into canonical callbacks");
    require(field.get(replacement) == batch, "read boundary does not restore or overwrite proposed map");
    batch.clear(); field.set(original, new HashMap<>());
    dispatch(original, 4); dispatch(replacement, 4);
    require(retained.get("first") == first && retained.get("peer") == peer && retained.get("late") == late, "cleared replacement cannot evict existing identities");
    LaunchPluginHandler separate = new LaunchPluginHandler(new ModuleLayerHandler());
    require(registry(separate) != retained && constructors == 6, "distinct layer retains independent normal SPI lifecycle");
    var unsafeField=sun.misc.Unsafe.class.getDeclaredField("theUnsafe");unsafeField.setAccessible(true);
    var unsafe=(sun.misc.Unsafe)unsafeField.get(null);
    LaunchPluginHandler allocated=(LaunchPluginHandler)unsafe.allocateInstance(Replacement.class);
    var allocatedMap=new LinkedHashMap<String,ILaunchPluginService>();
    var allocatedPeer=new First(){public String name(){return "allocated-peer";}};
    allocatedMap.put(allocatedPeer.name(),allocatedPeer);field.set(allocated,allocatedMap);
    try { allocated.get("first");throw new AssertionError("unbound handler accepted"); }
    catch(IllegalStateException expected){require(expected.getMessage().equals("PLUGIN_HANDLER_NOT_ADMITTED"),"unbound fails explicitly");}
    Launcher owner=(Launcher)unsafe.allocateInstance(Launcher.class);
    var layerField=Launcher.class.getDeclaredField("moduleLayerHandler");layerField.setAccessible(true);layerField.set(owner,layer);
    var handlerField=Launcher.class.getDeclaredField("launchPlugins");handlerField.setAccessible(true);handlerField.set(owner,allocated);
    require(owner.findLaunchPlugin("first").orElseThrow()==first,"real Launcher read binds constructor-skipped replacement");
    require(registry(allocated)==retained && field.get(allocated)==allocatedMap,"owner-derived registry; proposed map unchanged");
    require(owner.findLaunchPlugin("allocated-peer").orElseThrow()==allocatedPeer,"new peer still admitted");
    dispatch(allocated,5);dispatch(original,5);
    handlerField.set(owner,separate);
    try { owner.findLaunchPlugin("first");throw new AssertionError("cross-layer rebinding accepted"); }
    catch(IllegalStateException expected){require(expected.getMessage().equals("PLUGIN_HANDLER_LAYER_MISMATCH"),"cross-layer identity rejected");}
    registry(replacement).put("failure", new First() {
      public EnumSet<Phase> handlesClass(Type type, boolean empty) { throw new IllegalStateException("expected-validation-failure"); }
    });
    try { dispatch(replacement, 6); throw new AssertionError("callback failure swallowed"); }
    catch (IllegalStateException expected) { require(expected.getMessage().equals("expected-validation-failure"), "callback error unchanged"); }
    System.out.println("PASS actual patched constructor/dispatch/Launcher owner read; allocated replacement binds real layer; cross-layer rejected; all peers invoked; no duplicate SPI; proposed map not overwritten; callback errors propagate");
  }
}
