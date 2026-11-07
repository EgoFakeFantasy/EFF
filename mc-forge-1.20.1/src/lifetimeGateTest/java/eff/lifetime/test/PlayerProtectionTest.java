package eff.lifetime.test;

import eff.lifetime.*;
import eff.minecraft.PlayerLifetimeRegistry;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;
import java.util.*;

/** Offline execution of emitted player bytecode and the production original-identity registry. */
public final class PlayerProtectionTest implements Opcodes {
  public static boolean active(Object target) {
    try { return target.getClass().getField("locked").getBoolean(target); }
    catch (ReflectiveOperationException e) { throw new AssertionError(e); }
  }
  public static boolean rejectOperation(Object target, String operation) { return active(target); }
  private static int damageCalls, lastDamageBits;
  private static Object lastDamageSource;
  public static boolean rejectDamage(Object target, String operation, Object source, float amount) {
    damageCalls++; lastDamageSource = source; lastDamageBits = Float.floatToRawIntBits(amount);
    return active(target);
  }
  public static Object key(Object target) { return null; }
  public static boolean allowsPosition(Object target, double x, double y, double z) {
    return x == 1.25 && y == 64.5 && z == -16.25;
  }
  public static void operationRejected(Object target, String operation) {}
  public static void booleanWriteRejected(Object target, String field, boolean value) {}

  public static final class Movable implements LifetimeTarget {
    public Object position;
    public Object blockPosition;
    public Object chunkPosition;
    public Object removalReason;
    public boolean dead;
    public boolean locked = true;
    public boolean movable;
    @Override public boolean rejectLifetimeMutation() { return locked; }
    @Override public boolean lifetimeAllowsMovement() { return movable; }
  }
  public static final class Writer {
    public static void write(Movable player, Object value) {
      player.position = value; player.blockPosition = value; player.chunkPosition = value;
      player.removalReason = value; player.dead = true;
    }
  }

  public static void run() throws Exception {
    registry(); movement(); playerMethods(false); playerMethods(true);
    hiddenMovement(false, false); hiddenMovement(true, false);
    hiddenMovement(false, true); hiddenMovement(true, true);
    SpatialCacheTest.run();
    PositionEntryTest.run();
    ClientSurfaceTest.run();
    TickCountGateTest.run();
    for (String owner : List.of("net/minecraft/world/entity/Entity", "net/minecraft/world/entity/LivingEntity",
        "net/minecraft/world/entity/player/Player")) { deathPose(owner, false); deathPose(owner, true); }
    System.out.println("PLAYER_PROTECTION_OFFLINE_OK: original identity, lease release, named/SRG pre-operation heads, moving player and hidden movement");
  }

  private static void check(boolean ok, String reason) { if (!ok) throw new AssertionError(reason); }
  private static void registry() {
    var leases = new PlayerLifetimeRegistry<Object>();
    UUID id = UUID.randomUUID(); Object server = new Object(), client = new Object(), substitute = new Object(), owner = new Object();
    check(!leases.active(server, id, "arena", false, () -> true), "UNCLAIMED_PLAYER_PROTECTED");
    leases.claim(server, id, "arena", owner);
    check(leases.active(server, id, "arena", false, () -> false), "ORIGINAL_SERVER_NOT_RETAINED");
    check(!leases.active(substitute, id, "arena", false, () -> true), "SAME_UUID_SUBSTITUTION");
    check(!leases.active(client, id, "other", true, () -> true), "CROSS_WORLD_ADMISSION");
    check(!leases.active(client, id, "arena", true, () -> false), "UNREGISTERED_CLIENT_ADMISSION");
    check(leases.active(client, id, "arena", true, () -> true), "ORIGINAL_CLIENT_NOT_ADMITTED");
    check(leases.active(client, id, "arena", true, () -> false), "INDEX_LOSS_REOPENED_ADMISSION");
    check(!leases.active(substitute, id, "arena", true, () -> true), "CLIENT_REPLACEMENT_ADMITTED");
    check(leases.denied(server, id) == 0, "READ_COUNTED_AS_BLOCKED_ATTACK");
    leases.rejected(client, id); check(leases.denied(server, id) == 1, "DENIAL_NOT_OBSERVED");
    try { leases.release(server, id, new Object()); throw new AssertionError("FOREIGN_OWNER_RELEASE"); }
    catch (IllegalStateException expected) {}
    try { leases.release(substitute, id, owner); throw new AssertionError("SUBSTITUTE_RELEASE"); }
    catch (IllegalStateException expected) {}
    try { leases.claim(substitute, id, "arena", owner); throw new AssertionError("DUPLICATE_CLAIM"); }
    catch (IllegalStateException expected) {}
    leases.release(server, id, owner);
    check(!leases.active(server, id, "arena", false, () -> true)
        && !leases.active(client, id, "arena", true, () -> true), "RELEASE_DID_NOT_END_BOTH_LEASES");
    leases.claim(server,id,"arena",owner,new PlayerLifetimeRegistry.Bounds(256,60,0,320,320,64));
    check(leases.active(client,id,"arena",true,()->true),"BOUNDED_CLIENT_NOT_ADMITTED");
    for(Object original:List.of(server,client)) {
      check(leases.positionAllowed(original,id,283.5,66.25,17.25),"NORMAL_ARENA_MOTION_BLOCKED");
      check(!leases.positionAllowed(original,id,-999,-999,-999)&&!leases.positionAllowed(original,id,283,Double.NaN,17),"OUTSIDE_ARENA_ALLOWED");
    }
    check(!leases.positionAllowed(substitute,id,283,65,17),"SUBSTITUTE_GOT_SPATIAL_LEASE");
    try {leases.updateBounds(server,id,new Object(),new PlayerLifetimeRegistry.Bounds(-1000,-1000,-1000,1000,1000,1000));throw new AssertionError("FOREIGN_BOUNDS_UPDATE");}
    catch(IllegalStateException expected){}
    leases.updateBounds(server,id,owner,new PlayerLifetimeRegistry.Bounds(512,60,0,576,320,64));
    check(!leases.positionAllowed(client,id,283,65,17)&&leases.positionAllowed(client,id,540,65,17),"SCENE_BOUNDS_NOT_UPDATED");
    leases.release(server,id,owner);check(!leases.positionAllowed(client,id,540,65,17),"SPATIAL_LEASE_RETAINED_AFTER_RELEASE");
  }

  private static void movement() throws Exception {
    String name = Writer.class.getName(); ClassNode node = new ClassNode();
    new ClassReader(Writer.class.getResourceAsStream("/" + name.replace('.', '/') + ".class")).accept(node, 0);
    FieldWriteGate.instrument(node); ClassWriter out = new ClassWriter(ClassWriter.COMPUTE_FRAMES); node.accept(out);
    Class<?> writer = loader(Map.of(name, out.toByteArray())).loadClass(name);
    var method = writer.getMethod("write", Movable.class, Object.class);
    Object value = new Object(); Movable player = new Movable(); player.movable = true;
    method.invoke(null, player, value);
    check(player.position == value && player.blockPosition == value && player.chunkPosition == value
        && player.removalReason == null && !player.dead, "MOVEMENT_FROZEN_OR_LIFECYCLE_MUTATED");
    for (String field : List.of("position", "deltaMovement", "stuckSpeedMultiplier", "bb", "f_19825_", "f_19827_", "f_19865_", "f_19828_",
        "blockPosition", "f_19826_", "chunkPosition", "f_185933_"))
      check(!FieldWriteGate.rejectOperation(player, "field-write:" + field), "PLAYER_MOVEMENT_FIELD_BLOCKED:" + field);
    check(FieldWriteGate.rejectOperation(player, "field-write:removalReason"), "PLAYER_REMOVAL_ALLOWED");
    player.movable = false; Object next = new Object(); method.invoke(null, player, next);
    check(player.position == value && player.blockPosition == value && player.chunkPosition == value,
        "PARTIAL_POSITION_WRITE_CORRUPTED_CHUNK_CACHE");
    player.locked = false; method.invoke(null, player, next);
    check(player.position == next && player.blockPosition == next && player.chunkPosition == next
        && player.removalReason == next && player.dead, "RELEASED_FIELDS_BLOCKED");
  }

  private static void playerMethods(boolean mapped) throws Exception {
    String player = "net/minecraft/world/entity/player/Player", source = "net/minecraft/world/damagesource/DamageSource";
    ClassNode node = blank(player);
    node.fields.add(new FieldNode(ACC_PUBLIC, "locked", "Z", null, null));
    node.fields.add(new FieldNode(ACC_PUBLIC, "calls", "I", null, null));
    String[] names = mapped ? new String[]{"m_6469_", "m_6475_", "m_6667_", "m_6074_", "m_6153_", "m_21153_", "m_142687_", "m_142467_", "onRemovedFromWorld"}
        : new String[]{"hurt", "actuallyHurt", "die", "kill", "tickDeath", "setHealth", "remove", "setRemoved", "onRemovedFromWorld"};
    String[] descs = {"(L" + source + ";F)Z", "(L" + source + ";F)V", "(L" + source + ";)V", "()V", "()V", "(F)V",
        "(Lnet/minecraft/world/entity/Entity$RemovalReason;)V", "(Lnet/minecraft/world/entity/Entity$RemovalReason;)V", "()V"};
    for (int i=0; i<names.length; i++) {
      MethodNode m = new MethodNode(ACC_PUBLIC, names[i], descs[i], null, null);
      m.instructions.add(new VarInsnNode(ALOAD, 0)); m.instructions.add(new InsnNode(DUP));
      m.instructions.add(new FieldInsnNode(GETFIELD, player, "calls", "I")); m.instructions.add(new InsnNode(ICONST_1));
      m.instructions.add(new InsnNode(IADD)); m.instructions.add(new FieldInsnNode(PUTFIELD, player, "calls", "I"));
      if (descs[i].endsWith("Z")) { m.instructions.add(new InsnNode(ICONST_1)); m.instructions.add(new InsnNode(IRETURN)); }
      else m.instructions.add(new InsnNode(RETURN)); node.methods.add(m);
    }
    check(PlayerOperationTransform.instrument(node) == names.length + 1, "PLAYER_METHOD_COVERAGE");
    check(PlayerOperationTransform.instrument(node) == 0, "PLAYER_GATE_NOT_IDEMPOTENT");
    // Final pass must dominate a later hostile prefix without replacing the original method.
    MethodNode kill = node.methods.stream().filter(m -> m.name.equals(names[3])).findFirst().orElseThrow();
    InsnList foreign = new InsnList(); foreign.add(new InsnNode(NOP)); kill.instructions.insert(foreign);
    check(PlayerOperationTransform.instrumentOperations(node) == 1, "LATER_PREFIX_NOT_REASSERTED");
    // Substitute a test-only helper; all player delegates and branch instructions remain production output.
    for (MethodNode method : node.methods) for (AbstractInsnNode insn : method.instructions)
      if (insn instanceof MethodInsnNode call && call.owner.equals("eff/minecraft/PlayerLifetime"))
        call.owner = PlayerProtectionTest.class.getName().replace('.', '/');
    Map<String,byte[]> files = new HashMap<>(); files.put(player.replace('/', '.'), bytes(node));
    files.put(source.replace('/', '.'), bytes(blank(source)));
    String reason = "net/minecraft/world/entity/Entity$RemovalReason"; files.put(reason.replace('/', '.'), bytes(blank(reason)));
    ClassLoader loader = loader(files); Class<?> type = loader.loadClass(player.replace('/', '.')); Object original = type.getConstructor().newInstance();
    check(original instanceof LifetimeTarget, "PLAYER_INTERFACE_MISSING");
    check(((LifetimeTarget) original).lifetimeAllowsMovement(), "PLAYER_NOT_MOVABLE");
    check(((LifetimeTarget)original).lifetimeAllowsPosition(1.25,64.5,-16.25)
        && !((LifetimeTarget)original).lifetimeAllowsPosition(-999,-999,-999),"PLAYER_SPATIAL_DELEGATE_ARGUMENTS");
    type.getField("locked").setBoolean(original, true);
    damageCalls = 0;
    for (int i=0; i<names.length; i++) {
      String methodName = names[i];
      var method = Arrays.stream(type.getMethods()).filter(m -> m.getName().equals(methodName)).findFirst().orElseThrow();
      Object[] arguments = Arrays.stream(method.getParameterTypes()).map(t -> t == float.class ? (Object) 3f : null).toArray();
      Object result = method.invoke(original, arguments);
      if (method.getReturnType() == boolean.class) check(Boolean.FALSE.equals(result), "DAMAGE_ACKNOWLEDGED");
    }
    check(type.getField("calls").getInt(original) == 0, "PROTECTED_PLAYER_BODY_EXECUTED");
    check(damageCalls == 2 && lastDamageBits == Float.floatToRawIntBits(3f), "DAMAGE_PARAMETERS_NOT_FORWARDED");
    Object damageSource = loader.loadClass(source.replace('/', '.')).getConstructor().newInstance();
    var hurt = Arrays.stream(type.getMethods()).filter(m -> m.getName().equals(names[0])).findFirst().orElseThrow();
    float unusual = Float.intBitsToFloat(0x7fc00001);
    hurt.invoke(original, damageSource, unusual);
    check(lastDamageSource == damageSource && lastDamageBits == 0x7fc00001
        && type.getField("calls").getInt(original) == 0, "DAMAGE_RAW_BITS_OR_SOURCE_LOST");
    type.getField("locked").setBoolean(original, false); type.getMethod(names[3]).invoke(original);
    check(type.getField("calls").getInt(original) == 1, "UNCLAIMED_PLAYER_NOT_VANILLA");
    check(Boolean.TRUE.equals(hurt.invoke(original, damageSource, 3f))
        && type.getField("calls").getInt(original) == 2, "UNCLAIMED_DAMAGE_BODY_BLOCKED");
  }

  private static void hiddenMovement(boolean mapped, boolean hidden) throws Exception {
    String entity = "net/minecraft/world/entity/Entity", vec = "net/minecraft/world/phys/Vec3", box = "net/minecraft/world/phys/AABB";
    String reason = entity + "$RemovalReason", writer = "fixture/HiddenMovingWriter";
    ClassNode target = blank(entity); target.interfaces.add("eff/lifetime/LifetimeTarget");
    target.fields.add(new FieldNode(ACC_PUBLIC,"locked","Z",null,null));
    for (String method : List.of("rejectLifetimeMutation", "lifetimeAllowsMovement")) {
      MethodNode m = new MethodNode(ACC_PUBLIC,method,"()Z",null,null);
      if (method.equals("rejectLifetimeMutation")) { m.instructions.add(new VarInsnNode(ALOAD,0));m.instructions.add(new FieldInsnNode(GETFIELD,entity,"locked","Z")); }
      else m.instructions.add(new InsnNode(ICONST_1));m.instructions.add(new InsnNode(IRETURN));target.methods.add(m);
    }
    String[] fields = mapped ? new String[]{"f_19825_","f_19827_","f_19865_","f_19828_","f_146795_"}
        : new String[]{"position","deltaMovement","stuckSpeedMultiplier","bb","removalReason"};
    String[] descs = {"L"+vec+";","L"+vec+";","L"+vec+";","L"+box+";","L"+reason+";"};
    ClassNode call = blank(writer); MethodNode write = new MethodNode(ACC_PUBLIC|ACC_STATIC,"write","(L"+entity+";L"+vec+";L"+box+";L"+reason+";)V",null,null);
    for(int i=0;i<fields.length;i++) {
      target.fields.add(new FieldNode(ACC_PUBLIC,fields[i],descs[i],null,null));
      write.instructions.add(new VarInsnNode(ALOAD,0));write.instructions.add(new VarInsnNode(ALOAD,i<3?1:i==3?2:3));
      write.instructions.add(new FieldInsnNode(PUTFIELD,entity,fields[i],descs[i]));
    }
    write.instructions.add(new InsnNode(RETURN)); call.methods.add(write);
    Map<String,byte[]> files = new HashMap<>();files.put(entity.replace('/','.'),bytes(target));
    for(String n:List.of(vec,box,reason)) {
      ClassNode valueNode=blank(n);
      String[] components=n.equals(vec)
          ? mapped?new String[]{"f_82479_","f_82480_","f_82481_"}:new String[]{"x","y","z"}
          : n.equals(box)?mapped?new String[]{"f_82288_","f_82289_","f_82290_","f_82291_","f_82292_","f_82293_"}
          :new String[]{"minX","minY","minZ","maxX","maxY","maxZ"}:new String[0];
      for(String component:components)valueNode.fields.add(new FieldNode(ACC_PUBLIC,component,"D",null,null));
      files.put(n.replace('/','.'),bytes(valueNode));
    }
    ClassLoader loader=loader(files);Class<?> t=loader.loadClass(entity.replace('/','.'));Object original=t.getConstructor().newInstance();
    // Use the actual definition loader: the parent contains a different MC mapping
    // and cannot resolve this isolated named/SRG fixture's field declarations.
    if(hidden) files.put(writer.replace('/','.'),eff.hiddenboundary.HiddenWriteTransform.apply(t,bytes(call)));
    else { FieldWriteGate.instrument(call); files.put(writer.replace('/','.'),bytes(call)); }
    t.getField("locked").setBoolean(original,true);
    Class<?> v=loader.loadClass(vec.replace('/','.')),b=loader.loadClass(box.replace('/','.')),r=loader.loadClass(reason.replace('/','.'));
    Object velocity=v.getConstructor().newInstance(), bounds=b.getConstructor().newInstance(), removal=r.getConstructor().newInstance();
    String[] maxima = mapped ? new String[]{"f_82291_","f_82292_","f_82293_"} : new String[]{"maxX","maxY","maxZ"};
    for (String maximum : maxima) b.getField(maximum).setDouble(bounds, 1);
    var method=loader.loadClass(writer.replace('/','.')).getMethod("write",t,v,b,r);method.invoke(null,original,velocity,bounds,removal);
    for(int i=0;i<4;i++)check(t.getField(fields[i]).get(original)==(i<3?velocity:bounds),"HIDDEN_MOVEMENT_FROZEN:"+fields[i]);
    check(t.getField(fields[4]).get(original)==null,"HIDDEN_REMOVAL_SUCCEEDED");
    for(double bad:new double[]{Double.NaN,Double.POSITIVE_INFINITY,Double.NEGATIVE_INFINITY}) {
      Object invalid=v.getConstructor().newInstance();v.getField(mapped?"f_82479_":"x").setDouble(invalid,bad);
      method.invoke(null,original,invalid,bounds,removal);
      for(int i=0;i<3;i++)check(t.getField(fields[i]).get(original)==velocity,"NONFINITE_MOVEMENT_ACCEPTED:"+fields[i]);
    }
    method.invoke(null,original,null,null,removal);
    check(t.getField(fields[0]).get(original)==velocity&&t.getField(fields[3]).get(original)==bounds,"NULL_SPATIAL_WRITE_ACCEPTED");
    Object inverted=b.getConstructor().newInstance();b.getField(mapped?"f_82288_":"minX").setDouble(inverted,2);
    method.invoke(null,original,velocity,inverted,removal);
    check(t.getField(fields[3]).get(original)==bounds,"INVERTED_BOUNDS_ACCEPTED");
    for (double badExtent : new double[]{0, 1000000, Double.POSITIVE_INFINITY, Double.NaN}) {
      Object badBox = b.getConstructor().newInstance();
      for (String maximum : maxima) b.getField(maximum).setDouble(badBox, 1);
      b.getField(maxima[0]).setDouble(badBox, badExtent);
      method.invoke(null, original, velocity, badBox, removal);
      check(t.getField(fields[3]).get(original)==bounds,"COLLISION_EXTENT_ACCEPTED:"+badExtent);
    }
    // Vanilla pose changes and box-before-position movement remain possible.
    for (double height : new double[]{0.6, 1.5, 1.8}) {
      Object normal = b.getConstructor().newInstance();
      b.getField(maxima[0]).setDouble(normal, .6); b.getField(maxima[1]).setDouble(normal, height);
      b.getField(maxima[2]).setDouble(normal, .6);
      method.invoke(null,original,velocity,normal,removal);
      check(t.getField(fields[3]).get(original)==normal,"NORMAL_POSE_BOX_BLOCKED");
    }
    method.invoke(null,original,velocity,bounds,removal);
    Object next=v.getConstructor().newInstance();v.getField(mapped?"f_82479_":"x").setDouble(next,12.25);
    method.invoke(null,original,next,bounds,removal);
    check(t.getField(fields[0]).get(original)==next,"VALID_MOVEMENT_AFTER_REJECTION_BLOCKED");
    t.getField("locked").setBoolean(original,false);method.invoke(null,original,velocity,bounds,removal);
    check(t.getField(fields[4]).get(original)==removal,"HIDDEN_RELEASE_IGNORED");
    method.invoke(null,original,null,null,removal);
    check(t.getField(fields[0]).get(original)==null&&t.getField(fields[3]).get(original)==null,"UNOWNED_SPATIAL_WRITE_CHANGED");
  }

  private static void deathPose(String owner, boolean mapped) throws Exception {
    ClassNode node = blank(owner); node.interfaces.add("eff/lifetime/LifetimeTarget");
    node.fields.add(new FieldNode(ACC_PUBLIC, "locked", "Z", null, null));
    node.fields.add(new FieldNode(ACC_PUBLIC, "calls", "I", null, null));
    String pose = "Lnet/minecraft/world/entity/Pose;";
    node.fields.add(new FieldNode(ACC_PUBLIC, "pose", pose, null, null));
    MethodNode owned = new MethodNode(ACC_PUBLIC,"rejectLifetimeMutation","()Z",null,null);
    owned.instructions.add(new VarInsnNode(ALOAD,0));owned.instructions.add(new FieldInsnNode(GETFIELD,owner,"locked","Z"));
    owned.instructions.add(new InsnNode(IRETURN));node.methods.add(owned);
    String name = mapped ? "m_20124_" : "setPose";
    MethodNode setter = new MethodNode(ACC_PUBLIC,name,"("+pose+")V",null,null);
    setter.instructions.add(new VarInsnNode(ALOAD,0));setter.instructions.add(new VarInsnNode(ALOAD,1));
    setter.instructions.add(new FieldInsnNode(PUTFIELD,owner,"pose",pose));
    setter.instructions.add(new VarInsnNode(ALOAD,0));setter.instructions.add(new InsnNode(DUP));
    setter.instructions.add(new FieldInsnNode(GETFIELD,owner,"calls","I"));setter.instructions.add(new InsnNode(ICONST_1));
    setter.instructions.add(new InsnNode(IADD));setter.instructions.add(new FieldInsnNode(PUTFIELD,owner,"calls","I"));
    setter.instructions.add(new InsnNode(RETURN));node.methods.add(setter);
    check(PlayerOperationTransform.instrumentOperations(node)==1,"POSE_MAPPING_MISSING");
    check(PlayerOperationTransform.instrumentOperations(node)==0,"POSE_NOT_IDEMPOTENT");
    setter.instructions.insert(new InsnNode(NOP));
    check(PlayerOperationTransform.instrumentOperations(node)==1,"POSE_LATE_PREFIX_NOT_REASSERTED");
    check(PlayerOperationTransform.instrumentOperations(node)==0,"POSE_REASSERTION_NOT_IDEMPOTENT");
    Class<?> target=loader(Map.of(owner.replace('/','.'),bytes(node))).loadClass(owner.replace('/','.'));
    Object original=target.getConstructor().newInstance();
    var method=target.getMethod(name,net.minecraft.world.entity.Pose.class);
    var raw=target.getField("pose");var calls=target.getField("calls");var locked=target.getField("locked");
    raw.set(original,net.minecraft.world.entity.Pose.STANDING);locked.setBoolean(original,true);
    method.invoke(original,net.minecraft.world.entity.Pose.DYING);
    check(raw.get(original)==net.minecraft.world.entity.Pose.STANDING&&calls.getInt(original)==0,"DEATH_POSE_BODY_EXECUTED");
    method.invoke(original,net.minecraft.world.entity.Pose.CROUCHING);
    method.invoke(original,net.minecraft.world.entity.Pose.SWIMMING);
    check(raw.get(original)==net.minecraft.world.entity.Pose.SWIMMING&&calls.getInt(original)==2,"NORMAL_POSE_FROZEN");
    locked.setBoolean(original,false);method.invoke(original,net.minecraft.world.entity.Pose.DYING);
    check(raw.get(original)==net.minecraft.world.entity.Pose.DYING&&calls.getInt(original)==3,"UNOWNED_POSE_BLOCKED");
    locked.setBoolean(original,true);method.invoke(original,net.minecraft.world.entity.Pose.DYING);
    check(raw.get(original)==net.minecraft.world.entity.Pose.DYING&&calls.getInt(original)==3,"PREEXISTING_DEATH_CONCEALED");
    check(!FieldWriteGate.rejectDyingPose(original,null)&&!FieldWriteGate.rejectDyingPose(new Object(),net.minecraft.world.entity.Pose.DYING),"ORDINARY_INPUT_SEMANTICS");
  }

  static ClassNode blank(String name) {
    ClassNode n = new ClassNode(); n.version=V17;n.access=ACC_PUBLIC;n.name=name;n.superName="java/lang/Object";
    MethodNode ctor=new MethodNode(ACC_PUBLIC,"<init>","()V",null,null);ctor.instructions.add(new VarInsnNode(ALOAD,0));
    ctor.instructions.add(new MethodInsnNode(INVOKESPECIAL,"java/lang/Object","<init>","()V",false));ctor.instructions.add(new InsnNode(RETURN));n.methods.add(ctor);return n;
  }
  static byte[] bytes(ClassNode n) { ClassWriter w=new ClassWriter(ClassWriter.COMPUTE_FRAMES);n.accept(w);return w.toByteArray(); }
  static ClassLoader loader(Map<String,byte[]> files) {
    return new ClassLoader(PlayerProtectionTest.class.getClassLoader()) {
      @Override protected Class<?> loadClass(String name, boolean resolve) throws ClassNotFoundException {
        if (!files.containsKey(name)) return super.loadClass(name, resolve);
        Class<?> type=findLoadedClass(name);if(type==null){byte[] b=files.get(name);type=defineClass(name,b,0,b.length);}if(resolve)resolveClass(type);return type;
      }
    };
  }
}
