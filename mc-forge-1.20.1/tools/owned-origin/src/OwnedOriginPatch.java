import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import java.util.jar.*;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;
import eff.lifetime.FieldWriteGate;

public final class OwnedOriginPatch implements Opcodes {
    static final String OWNER = "cpw/mods/modlauncher/TransformingClassLoader";
    static final String ENTRY = OWNER + ".class";
    static final String DESC = "([BLjava/lang/String;Ljava/lang/String;)[B";
    static final String DELEGATE = "eff$ownedOriginDelegate";
    static final String HELPER = "cpw/mods/modlauncher/EffOwnedOrigin";
    static final String RAW = "eff/minecraft/RawHealthProbe";
    static final Set<String> ROOTS = Set.of(RAW,"eff/minecraft/Jsons","eff/minecraft/ProjectionProbe","eff/minecraft/EntityIndexStorage",
        "eff/minecraft/RuntimeLink","eff/minecraft/BootstrapDiagnostics","eff/minecraft/RemoteStory","eff/minecraft/BridgeProcess",
        "eff/minecraft/client/EntityGuardSelfTest","eff/minecraft/client/AttackEntryProbe","eff/minecraft/client/Pig2EngagementProbe","eff/minecraft/lab/AttackTraceBridge",
        "eff/minecraft/lab/LabThreadSampler", "eff/minecraft/client/ProjectionRenderBoundary",
        "eff/minecraft/client/ProjectionRenderEvents", "eff/minecraft/PlayerLifetime", "eff/minecraft/PlayerLifetimeRegistry",
        "eff/minecraft/EffArena", "eff/minecraft/lab/ManualPlayerAttackFixture");
    // EffProjectionRenderer intentionally stays on the reviewed FieldWriteGate path:
    // restoring pristine bytes here would strip its injected LifetimeRenderer lease.
    // JDK Executor's inherited method retains its Java name on the MC receiver.
    static final Set<String> UNMAPPED_PUBLIC_API = Set.of("net/minecraft/client/server/IntegratedServer#execute(Ljava/lang/Runnable;)V",
        "net/minecraft/world/phys/Vec3#toString()Ljava/lang/String;");
    static final Set<String> JAVA_OBJECT_API = Set.of("toString()Ljava/lang/String;","hashCode()I","equals(Ljava/lang/Object;)Z","getClass()Ljava/lang/Class;");
    // The diagnostic compares the primitive and boxed views of the already supplied
    // MC fastutil map. No implementation package or arbitrary new dependency is trusted.
    static final Set<String> REVIEWED_LIBRARY_TYPES = Set.of("it/unimi/dsi/fastutil/ints/Int2ObjectMap",
        "it/unimi/dsi/fastutil/ints/Int2ObjectOpenHashMap", "it/unimi/dsi/fastutil/ints/Int2ObjectLinkedOpenHashMap",
        "com/mojang/blaze3d/vertex/PoseStack", "com/mojang/blaze3d/vertex/PoseStack$Pose",
        "com/mojang/blaze3d/systems/RenderSystem", "eff/lifetime/FieldWriteGate", "org/joml/Matrix4f", "org/joml/Matrix4fc",
        "org/joml/Matrix3f", "org/joml/Matrix3fc", "sun/misc/Unsafe",
        // Opt-in fixture uses the ordinary command and attack APIs; no opponent internals.
        "com/mojang/authlib/GameProfile", "com/mojang/brigadier/CommandDispatcher", "com/mojang/brigadier/Command",
        "com/mojang/brigadier/context/CommandContext", "com/mojang/brigadier/builder/LiteralArgumentBuilder",
        "com/mojang/brigadier/builder/ArgumentBuilder", "com/mojang/brigadier/tree/LiteralCommandNode",
        "com/mojang/brigadier/exceptions/CommandSyntaxException");
    static Map<String,byte[]> mcClasses;
    static final String ARENA="eff/minecraft/EffArena";
    static boolean reviewedArenaGate(MethodNode method, MethodInsnNode call) {
        return method.name.equals("syncNPCs") && method.desc.equals("(Lcom/google/gson/JsonObject;)V")
            && (call.name.equals("rejectMapRemoval") && call.desc.equals("(Ljava/util/Map;Ljava/lang/Object;)Z")
                || call.name.equals("rejectCollectionRemoval") && call.desc.equals("(Ljava/util/Collection;Ljava/lang/Object;)Z"));
    }
    static List<Object> schema(ClassNode node) {
        var result=new ArrayList<Object>();
        result.add(Arrays.asList(node.version,node.access,node.name,node.signature,node.superName,List.copyOf(node.interfaces),node.outerClass,node.outerMethod,node.outerMethodDesc,node.nestHostClass,node.nestMembers==null?null:List.copyOf(node.nestMembers)));
        for(FieldNode field:node.fields)result.add(Arrays.asList("field",field.name,field.desc,field.access,field.signature,field.value));
        for(MethodNode method:node.methods)result.add(Arrays.asList("method",method.name,method.desc,method.access,method.signature,method.exceptions==null?null:List.copyOf(method.exceptions)));
        for(InnerClassNode inner:node.innerClasses)result.add(Arrays.asList("inner",inner.name,inner.outerName,inner.innerName,inner.access));
        if(node.recordComponents!=null)for(RecordComponentNode component:node.recordComponents)result.add(Arrays.asList("record",component.name,component.descriptor,component.signature));
        return result;
    }
    static Map<String,byte[]> canonical(Map<String,byte[]> sources)throws Exception {
        Map<String,byte[]> result=new TreeMap<>(sources);
        byte[] original=sources.get(ARENA);if(original==null)throw new IllegalStateException("ARENA_SOURCE_MISSING");
        ClassNode before=new ClassNode(),node=new ClassNode();new ClassReader(original).accept(before,ClassReader.EXPAND_FRAMES);new ClassReader(original).accept(node,ClassReader.EXPAND_FRAMES);
        int edits=FieldWriteGate.instrument(node),calls=0,mapCalls=0,listCalls=0;
        for(MethodNode method:node.methods)for(AbstractInsnNode insn:method.instructions)if(insn instanceof MethodInsnNode call&&call.owner.equals("eff/lifetime/FieldWriteGate")){
            if(!reviewedArenaGate(method,call))throw new IllegalStateException("UNREVIEWED_ARENA_GATE_OPERATION:"+method.name+":"+call.name);calls++;
            if(call.name.equals("rejectMapRemoval"))mapCalls++;else listCalls++;
        }
        // One NPC map removal and two actor-list removals, all in the reviewed sync method.
        if(edits!=3||calls!=3||mapCalls!=1||listCalls!=2||!schema(before).equals(schema(node)))throw new IllegalStateException("UNREVIEWED_ARENA_GATE_SHAPE:"+edits+":"+calls);
        // Metadata only: computing frames must not initialize Minecraft or run a game constructor.
        Map<String,byte[]> metadata=new HashMap<>(mcClasses);for(var e:sources.entrySet())metadata.put(e.getKey()+".class",e.getValue());
        ClassWriter writer=new ClassWriter(ClassWriter.COMPUTE_FRAMES|ClassWriter.COMPUTE_MAXS){
            ClassReader header(String name){
                byte[] bytes=metadata.get(name+".class");
                if(bytes==null)try(var stream=OwnedOriginPatch.class.getClassLoader().getResourceAsStream(name+".class")){if(stream!=null)bytes=stream.readAllBytes();}catch(java.io.IOException e){throw new IllegalStateException(e);}
                if(bytes==null)throw new IllegalStateException("ARENA_FRAME_TYPE_UNAVAILABLE:"+name);
                return new ClassReader(bytes);
            }
            boolean assignable(String base,String type,Set<String> seen){
                if(base.equals(type)||base.equals("java/lang/Object"))return true;
                if(!seen.add(type))return false;
                ClassReader info=header(type);String parent=info.getSuperName();
                if(parent!=null&&assignable(base,parent,seen))return true;
                for(String iface:info.getInterfaces())if(assignable(base,iface,seen))return true;return false;
            }
            @Override protected String getCommonSuperClass(String a,String b){
                if(a.equals(b))return a;
                if(assignable(a,b,new HashSet<>()))return a;if(assignable(b,a,new HashSet<>()))return b;
                if((header(a).getAccess()&ACC_INTERFACE)!=0||(header(b).getAccess()&ACC_INTERFACE)!=0)return "java/lang/Object";
                do{a=header(a).getSuperName();}while(a!=null&&!assignable(a,b,new HashSet<>()));
                if(a==null)throw new IllegalStateException("ARENA_FRAME_HIERARCHY_UNRESOLVED");return a;
            }
        };
        node.accept(writer);byte[] bytes=writer.toByteArray();auditReferences(bytes,sources.keySet());result.put(ARENA,bytes);
        return result;
    }
    static boolean enumField(FieldInsnNode field){
        byte[] bytes=mcClasses.get(field.owner+".class");if(bytes==null){System.out.println("MC_ENUM_OWNER_NOT_IN_PATCHED_JAR:"+field.owner);return false;}
        ClassNode owner=new ClassNode();new ClassReader(bytes).accept(owner,ClassReader.SKIP_CODE|ClassReader.SKIP_DEBUG|ClassReader.SKIP_FRAMES);
        return (owner.access&ACC_ENUM)!=0 && owner.fields.stream().anyMatch(f->f.name.equals(field.name)&&f.desc.equals(field.desc)&&(f.access&(ACC_ENUM|ACC_PUBLIC|ACC_STATIC))==(ACC_ENUM|ACC_PUBLIC|ACC_STATIC));
    }
    static String hash(byte[] bytes) throws Exception { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
    static Map<String,byte[]> entries(Path file) throws Exception {
        Map<String,byte[]> result = new TreeMap<>();
        try (JarFile jar = new JarFile(file.toFile())) { for (JarEntry entry : Collections.list(jar.entries())) {
            if (entry.getName().matches("(?i)META-INF/[^/]+\\.(SF|RSA|DSA|EC)")) throw new IllegalStateException("SIGNED_INPUT");
            if (result.put(entry.getName(), jar.getInputStream(entry).readAllBytes()) != null) throw new IllegalStateException("DUPLICATE_ENTRY");
        }} return result;
    }
    static void auditReferences(byte[] bytes, Set<String> owned) {
        // Constant-pool class references cover field/method owners, descriptor classes are checked separately.
        ClassReader r = new ClassReader(bytes); char[] buffer = new char[r.getMaxStringLength()];
        for (int i=1; i<r.getItemCount(); i++) {
            int at=r.getItem(i); if(at==0)continue;
            int tag=r.readByte(at-1);
            if(tag==7)checkType(r.readUTF8(at,buffer),owned);
            if(tag==12)checkDescriptor(r.readUTF8(at+2,buffer),owned);
            if(tag==16)checkDescriptor(r.readUTF8(at,buffer),owned);
        }
        ClassNode node = new ClassNode(); r.accept(node,0);
        if(node.visibleAnnotations!=null||node.invisibleAnnotations!=null)throw new IllegalStateException("ANNOTATED_OWNED_CLASS");
        for(FieldNode f:node.fields){checkDescriptor(f.desc,owned);if(f.visibleAnnotations!=null||f.invisibleAnnotations!=null)throw new IllegalStateException("ANNOTATED_FIELD");}
        for(MethodNode m:node.methods){
            checkDescriptor(m.desc,owned);if(m.visibleAnnotations!=null||m.invisibleAnnotations!=null)throw new IllegalStateException("ANNOTATED_METHOD");
            for(AbstractInsnNode insn:m.instructions){
                if(insn instanceof MethodInsnNode call&&call.owner.equals("eff/lifetime/FieldWriteGate")
                    && !(node.name.equals(ARENA)&&reviewedArenaGate(m,call)))
                    throw new IllegalStateException("UNREVIEWED_OWNED_GATE_CALL:"+node.name+"#"+m.name+":"+call.name);
                if(insn instanceof MethodInsnNode call && call.owner.equals("sun/misc/Unsafe")
                    && !Set.of("objectFieldOffset(Ljava/lang/reflect/Field;)J", "getInt(Ljava/lang/Object;J)I", "getObject(Ljava/lang/Object;J)Ljava/lang/Object;").contains(call.name+call.desc))
                    throw new IllegalStateException("UNREVIEWED_UNSAFE_OPERATION:"+call.name+call.desc);
                if(insn instanceof MethodInsnNode call && call.owner.startsWith("net/minecraft/") && !call.name.startsWith("m_") && !call.name.equals("<init>") && !JAVA_OBJECT_API.contains(call.name+call.desc) && !UNMAPPED_PUBLIC_API.contains(call.owner+"#"+call.name+call.desc))throw new IllegalStateException("UNREVIEWED_MAPPED_METHOD:"+call.owner+"#"+call.name+call.desc);
                if(insn instanceof FieldInsnNode field && field.owner.startsWith("net/minecraft/") && !field.name.startsWith("f_")&&!enumField(field))throw new IllegalStateException("UNREVIEWED_MAPPED_FIELD:"+field.owner+"#"+field.name);
            }
        }
    }
    static void checkDescriptor(String desc, Set<String> owned){
        Type t=Type.getType(desc); if(t.getSort()==Type.METHOD){for(Type arg:t.getArgumentTypes())checkAsmType(arg,owned);checkAsmType(t.getReturnType(),owned);}else checkAsmType(t,owned);
    }
    static void checkAsmType(Type t,Set<String> owned){if(t.getSort()==Type.ARRAY)checkAsmType(t.getElementType(),owned);else if(t.getSort()==Type.OBJECT)checkType(t.getInternalName(),owned);}
    static void checkType(String name,Set<String> owned){
        if(name.startsWith("[")){checkDescriptor(name,owned);return;}
        if(name.contains("/mixin/")||name.startsWith("org/spongepowered/")||name.startsWith("net/fabricmc/"))throw new IllegalStateException("TRANSFORM_SENSITIVE_DEPENDENCY:"+name);
        if(!name.startsWith("java/")&&!name.startsWith("javax/")&&!name.startsWith("com/google/gson/")&&!name.startsWith("net/minecraft/")&&!name.startsWith("net/minecraftforge/")&&!name.startsWith("eff/minecraft/")&&!owned.contains(name)&&!REVIEWED_LIBRARY_TYPES.contains(name))throw new IllegalStateException("UNREVIEWED_DEPENDENCY:"+name);
    }
    static Map<String,byte[]> owned(Path jar) throws Exception {
        Map<String,byte[]> selected=new TreeMap<>();
        for(var entry:entries(jar).entrySet())if(ROOTS.stream().anyMatch(root->entry.getKey().equals(root+".class")||entry.getKey().startsWith(root+"$")&&entry.getKey().endsWith(".class"))) {
            String name=new ClassReader(entry.getValue()).getClassName();
            if(!entry.getKey().equals(name+".class"))throw new IllegalStateException("NAME_MISMATCH");selected.put(name,entry.getValue());
        }
        if(!selected.keySet().containsAll(ROOTS))throw new IllegalStateException("MISSING_REVIEWED_ROOTS");
        for(byte[] bytes:selected.values())auditReferences(bytes,selected.keySet());return selected;
    }
    static byte[] transform(byte[] original){
        ClassReader reader=new ClassReader(original);ClassNode node=new ClassNode();reader.accept(node,0);
        if(!node.name.equals(OWNER))throw new IllegalStateException("WRONG_LOADER");
        if(node.methods.stream().anyMatch(m->m.name.equals(DELEGATE)))throw new IllegalStateException("ALREADY_FIXED");
        // Require the previously reviewed scoped-context boundary, retain its entire body.
        if(node.methods.stream().noneMatch(m->m.name.equals("eff$transformBytesDelegate")&&m.desc.equals(DESC)))throw new IllegalStateException("CONTEXT_WRAPPER_REQUIRED");
        MethodNode target=node.methods.stream().filter(m->m.name.equals("maybeTransformClassBytes")&&m.desc.equals(DESC)).findFirst().orElseThrow();
        int originalAccess=target.access;
        MethodNode wrapper=new MethodNode(target.access,target.name,target.desc,target.signature,target.exceptions.toArray(String[]::new));
        target.name=DELEGATE;target.access=ACC_PRIVATE|ACC_SYNTHETIC;
        wrapper.visitCode();wrapper.visitVarInsn(ALOAD,1);wrapper.visitVarInsn(ALOAD,2);
        wrapper.visitMethodInsn(INVOKESTATIC,HELPER,"snapshot","([BLjava/lang/String;)[B",false);wrapper.visitVarInsn(ASTORE,4);
        for(int i=0;i<4;i++)wrapper.visitVarInsn(ALOAD,i);
        wrapper.visitMethodInsn(INVOKESPECIAL,OWNER,DELEGATE,DESC,false);wrapper.visitVarInsn(ASTORE,5);
        wrapper.visitVarInsn(ALOAD,4);wrapper.visitVarInsn(ALOAD,5);wrapper.visitVarInsn(ALOAD,2);
        wrapper.visitMethodInsn(INVOKESTATIC,HELPER,"finish","([B[BLjava/lang/String;)[B",false);wrapper.visitInsn(ARETURN);wrapper.visitMaxs(4,6);wrapper.visitEnd();
        node.methods.add(wrapper);ClassWriter writer=new ClassWriter(reader,0);node.accept(writer);byte[] result=writer.toByteArray();
        // Prove that existing plugin dispatch, existing scoped wrapper, and every other class detail were retained.
        ClassNode restored=new ClassNode();new ClassReader(result).accept(restored,0);
        restored.methods.removeIf(m->m.name.equals("maybeTransformClassBytes")&&m.desc.equals(DESC));
        MethodNode old=restored.methods.stream().filter(m->m.name.equals(DELEGATE)&&m.desc.equals(DESC)).findFirst().orElseThrow();old.name="maybeTransformClassBytes";old.access=originalAccess;
        ClassNode pristine=new ClassNode();reader.accept(pristine,0);ClassWriter a=new ClassWriter(0),b=new ClassWriter(0);pristine.accept(a);restored.accept(b);
        if(!Arrays.equals(a.toByteArray(),b.toByteArray()))throw new AssertionError("EXISTING_PIPELINE_CHANGED");
        return result;
    }
    static void prepare(Path eff,Path out) throws Exception {
        Map<String,byte[]> own=owned(eff),normalized=canonical(own);String effHash=hash(Files.readAllBytes(eff));
        StringBuilder source=new StringBuilder("package cpw.mods.modlauncher;\nfinal class EffOwnedOriginCatalog {\nstatic final String SOURCE_JAR_SHA256=\"").append(effHash).append("\";\nstatic final java.util.Map<String,String> HASHES=java.util.Map.ofEntries(\n");
        List<String> lines=new ArrayList<>();for(var entry:own.entrySet())lines.add("java.util.Map.entry(\""+entry.getKey()+"\",\""+hash(entry.getValue())+"\")");
        source.append(String.join(",\n",lines)).append(");\nstatic final java.util.Map<String,String> CANONICAL_HASHES=java.util.Map.of(\"").append(ARENA).append("\",\"").append(hash(normalized.get(ARENA))).append("\");\n}\n");
        Files.writeString(out.resolve("EffOwnedOriginCatalog.java"),source,StandardOpenOption.CREATE_NEW);
        StringBuilder manifest=new StringBuilder("sourceJarSHA256=").append(effHash).append('\n');
        for(var entry:own.entrySet())manifest.append(entry.getKey()).append('=').append(hash(entry.getValue())).append('\n');
        manifest.append("canonical:").append(ARENA).append('=').append(hash(normalized.get(ARENA))).append('\n');
        Files.writeString(out.resolve("owned-manifest.txt"),manifest,StandardOpenOption.CREATE_NEW);
        System.out.println("OWNED_AUDIT_OK count="+own.size()+" roots="+ROOTS.size()+" annotations=none mixinDependencies=none minecraftMembers=SRG sourceJarSHA256="+effHash+" arenaSourceSHA256="+hash(own.get(ARENA))+" arenaCanonicalSHA256="+hash(normalized.get(ARENA))+" preservedArenaGateEdits=3");
    }
    static void patch(Path library,Path eff,Path compiled,Path out) throws Exception {
        Map<String,byte[]> content=entries(library),own=canonical(owned(eff));byte[] before=content.get(ENTRY);content.put(ENTRY,transform(before));
        for(String name:new String[]{"EffOwnedOrigin","EffOwnedOriginCatalog"}){
            String key="cpw/mods/modlauncher/"+name+".class";
            if(content.putIfAbsent(key,Files.readAllBytes(compiled.resolve(key)))!=null)throw new IllegalStateException("HELPER_COLLISION");
        }
        String prefix="META-INF/eff-owned-origin/";
        for(var entry:own.entrySet())content.put(prefix+"archive/"+entry.getKey()+".class",entry.getValue());
        content.put(prefix+"manifest.txt",Files.readAllBytes(compiled.getParent().resolve("owned-manifest.txt")));
        try(JarOutputStream output=new JarOutputStream(Files.newOutputStream(out,StandardOpenOption.CREATE_NEW))){
            for(var entry:content.entrySet()){JarEntry ze=new JarEntry(entry.getKey());ze.setTime(0);output.putNextEntry(ze);output.write(entry.getValue());output.closeEntry();}
        }
        Map<String,byte[]> original=entries(library),result=entries(out);
        for(var entry:original.entrySet())if(!entry.getKey().equals(ENTRY)&&!Arrays.equals(entry.getValue(),result.get(entry.getKey())))throw new AssertionError("UNEXPECTED_LIBRARY_CHANGE");
        if(result.size()!=original.size()+own.size()+3)throw new AssertionError("ENTRY_COUNT");
        System.out.println("PATCH_OK existing entries identical except loader wrapper; helpers=2 archive="+own.size());
    }
    public static void main(String[] args)throws Exception{mcClasses=entries(Path.of(args[args.length-2]));mcClasses.putAll(entries(Path.of(args[args.length-1])));if(args[0].equals("prepare"))prepare(Path.of(args[1]),Path.of(args[2]));else patch(Path.of(args[1]),Path.of(args[2]),Path.of(args[3]),Path.of(args[4]));}
}
