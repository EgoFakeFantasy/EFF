import java.nio.file.*;
import java.util.*;
import java.util.jar.*;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;

public final class BuildOwnedAgent implements Opcodes {
    static final String MANAGER="sun/instrument/TransformerManager";
    static final String DESC="(Ljava/lang/Module;Ljava/lang/ClassLoader;Ljava/lang/String;Ljava/lang/Class;Ljava/security/ProtectionDomain;[B)[B";
    static byte[] patch(byte[] original){
        ClassReader reader=new ClassReader(original);ClassNode node=new ClassNode();reader.accept(node,ClassReader.EXPAND_FRAMES);
        if(!MANAGER.equals(node.name))throw new IllegalStateException("WRONG_MANAGER");
        MethodNode method=node.methods.stream().filter(m->m.name.equals("transform")&&m.desc.equals(DESC)).findFirst().orElseThrow();
        if(method.maxLocals!=15||method.tryCatchBlocks.size()!=1)throw new IllegalStateException("UNREVIEWED_METHOD_SHAPE");
        int returns=0,calls=0;for(AbstractInsnNode insn:method.instructions){if(insn.getOpcode()==ARETURN)returns++;if(insn instanceof MethodInsnNode call&&call.owner.equals("java/lang/instrument/ClassFileTransformer")&&call.name.equals("transform"))calls++;}
        if(returns!=1||calls!=1)throw new IllegalStateException("UNREVIEWED_DISPATCH_SHAPE");
        for(AbstractInsnNode insn:method.instructions.toArray())if(insn instanceof FrameNode frame){
            int slots=0;for(Object value:frame.local)slots+=(value==Opcodes.LONG||value==Opcodes.DOUBLE)?2:1;
            while(slots++<15)frame.local.add(TOP);frame.local.add("java/lang/Object");
        }
        InsnList enter=new InsnList();enter.add(new VarInsnNode(ALOAD,0));enter.add(new VarInsnNode(ALOAD,6));enter.add(new VarInsnNode(ALOAD,2));enter.add(new VarInsnNode(ALOAD,3));enter.add(new VarInsnNode(ALOAD,4));
        enter.add(new MethodInsnNode(INVOKESTATIC,"eff/ownedboot/OwnedBoundary","enterFromManager","(Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;",false));enter.add(new VarInsnNode(ASTORE,15));method.instructions.insert(enter);
        for(AbstractInsnNode insn:method.instructions.toArray())if(insn.getOpcode()==ARETURN){InsnList finish=new InsnList();finish.add(new VarInsnNode(ASTORE,16));finish.add(new VarInsnNode(ALOAD,15));finish.add(new VarInsnNode(ALOAD,16));finish.add(new MethodInsnNode(INVOKESTATIC,"eff/ownedboot/OwnedBoundary","finish","(Ljava/lang/Object;[B)[B",false));method.instructions.insertBefore(insn,finish);}
        method.maxLocals=17;method.maxStack=Math.max(method.maxStack,5);
        ClassWriter writer=new ClassWriter(reader,0);node.accept(writer);return writer.toByteArray();
    }
    static void jar(Path output,Map<String,byte[]> entries)throws Exception{
        try(JarOutputStream out=new JarOutputStream(Files.newOutputStream(output,StandardOpenOption.CREATE_NEW))){for(var e:entries.entrySet()){JarEntry ze=new JarEntry(e.getKey());ze.setTime(0);out.putNextEntry(ze);out.write(e.getValue());out.closeEntry();}}
    }
    static void addClasses(Map<String,byte[]> content,Path classes)throws Exception{try(var walk=Files.walk(classes)){for(Path p:walk.filter(x->x.toString().endsWith(".class")).toList()){String name=classes.relativize(p).toString().replace('\\','/');if(content.putIfAbsent(name,Files.readAllBytes(p))!=null)throw new IllegalStateException("CLASS_COLLISION:"+name);}}}
    public static void main(String[] args)throws Exception{
        Path out=Path.of(args[1]);
        if(args[0].equals("tick-template")){
            var entries=OwnedOriginPatch.entries(Path.of(args[2]));
            byte[] template=entries.get("net/minecraft/server/network/ServerGamePacketListenerImpl.class");
            if(template==null||!HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(template))
                .equals("8bcf74fa649eeec89b4f22726da82f64db2d7e6dbc05e96e300e349daca04649"))
                throw new SecurityException("FORGE_CONNECTION_TEMPLATE_PIN");
            Files.write(out.resolve("forge-47.4.20-connection-template.class"),template,StandardOpenOption.CREATE_NEW);return;
        }
        if(args[0].equals("gate")){
            var entries=OwnedOriginPatch.entries(out);var result=new ArrayList<String>();
            for(String name:new String[]{"eff/lifetime/FieldWriteGate","eff/lifetime/LifetimeTarget","eff/lifetime/LifetimeRenderer"}){
                byte[] bytes=entries.get(name+".class");if(bytes==null)throw new IllegalStateException("GATE_CLASS_MISSING");
                String digest=HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(bytes));result.add("\""+name+"\":\""+digest+"\"");
            }
            System.out.println("{"+String.join(",",result)+"}");return;
        }
        if(args[0].equals("prepare")){
            byte[] original=Files.readAllBytes(Path.of(java.net.URI.create("jrt:/java.instrument/"+MANAGER+".class")));
            Files.write(out.resolve("TransformerManager.original.class"),original,StandardOpenOption.CREATE_NEW);
            Files.write(out.resolve("TransformerManager.patched.class"),patch(original),StandardOpenOption.CREATE_NEW);
            ClassWriter warm=new ClassWriter(0);warm.visit(V17,ACC_PUBLIC,"eff/ownedagent/HiddenWarm",null,"java/lang/Object",null);
            var write=warm.visitMethod(ACC_PUBLIC|ACC_STATIC,"write","(Lnet/minecraft/world/entity/Entity;Lnet/minecraft/world/phys/Vec3;)V",null,null);
            write.visitCode();write.visitVarInsn(ALOAD,0);write.visitVarInsn(ALOAD,1);write.visitFieldInsn(PUTFIELD,"net/minecraft/world/entity/Entity","position","Lnet/minecraft/world/phys/Vec3;");write.visitInsn(RETURN);write.visitMaxs(2,2);write.visitEnd();warm.visitEnd();
            Files.write(out.resolve("HiddenWarm.class"),warm.toByteArray(),StandardOpenOption.CREATE_NEW);
            for(String[] target:new String[][]{{"java.base/java/lang/reflect/Field","Field"},{"jdk.unsupported/sun/misc/Unsafe","Unsafe"}}){
                byte[] bytes=Files.readAllBytes(Path.of(java.net.URI.create("jrt:/"+target[0]+".class")));
                Files.write(out.resolve(target[1]+".original.class"),bytes,StandardOpenOption.CREATE_NEW);
                Files.write(out.resolve(target[1]+".patched.class"),StaticWritePatch.patch(bytes),StandardOpenOption.CREATE_NEW);
            }
            var own=OwnedOriginPatch.entries(Path.of(args[2]));
            StringBuilder src=new StringBuilder("package eff.ownedboot;\nfinal class Catalog { static java.util.Map<String,byte[]> bytes(){var m=new java.util.HashMap<String,byte[]>();\n");
            int count=0;for(var e:own.entrySet())if(e.getKey().startsWith("META-INF/eff-owned-origin/archive/")&&e.getKey().endsWith(".class")){
                String name=new ClassReader(e.getValue()).getClassName(),b64=Base64.getEncoder().encodeToString(e.getValue());
                src.append("m.put(\"").append(name).append("\",java.util.Base64.getDecoder().decode(");
                if(b64.length()>50000){src.append("new StringBuilder()");for(int i=0;i<b64.length();i+=40000)src.append(".append(\"").append(b64.substring(i,Math.min(b64.length(),i+40000))).append("\")");src.append(".toString()");}else src.append('"').append(b64).append('"');src.append("));\n");count++;
            }
            // Explicit reviewed manual observer additions; retain the exact class count.
            // Event transform ownership: the renderer itself
            // still retains FieldWriteGate's lease interface instead of pristine restoration.
            if(count!=31||!own.containsKey("META-INF/eff-owned-origin/archive/eff/minecraft/client/ProjectionRenderEvents.class")
                ||!own.containsKey("META-INF/eff-owned-origin/archive/eff/minecraft/client/Pig2EngagementProbe.class")
                ||!own.containsKey("META-INF/eff-owned-origin/archive/eff/minecraft/lab/AttackTraceBridge$ManualBinding.class")
                ||!own.containsKey("META-INF/eff-owned-origin/archive/eff/minecraft/lab/AttackTraceBridge$ManualContext.class")
                ||!own.containsKey("META-INF/eff-owned-origin/archive/eff/minecraft/PlayerLifetime.class")
                ||!own.containsKey("META-INF/eff-owned-origin/archive/eff/minecraft/PlayerLifetimeRegistry$Claim.class")
                ||!own.containsKey("META-INF/eff-owned-origin/archive/eff/minecraft/PlayerLifetimeRegistry$Bounds.class")
                ||!own.containsKey("META-INF/eff-owned-origin/archive/eff/minecraft/lab/ManualPlayerAttackFixture.class")
                ||!own.containsKey("META-INF/eff-owned-origin/archive/eff/minecraft/EffArena.class")
                ||!own.containsKey("META-INF/eff-owned-origin/archive/eff/minecraft/EffArena$Placement.class"))
                throw new IllegalStateException("OWNED_COUNT_CHANGED");
            src.append("return java.util.Collections.unmodifiableMap(m);}}\n");Files.writeString(out.resolve("Catalog.java"),src,StandardOpenOption.CREATE_NEW);
        }else if(args[0].equals("bootstrap")){Map<String,byte[]> content=new TreeMap<>();addClasses(content,Path.of(args[2]));jar(out,content);}
        else {
            Map<String,byte[]> content=OwnedOriginPatch.entries(Path.of(args[2]));addClasses(content,Path.of(args[3]));
            content.put("eff-owned/TransformerManager.patched.class",Files.readAllBytes(Path.of(args[4])));
            content.put("eff-owned/HiddenWarm.class",Files.readAllBytes(Path.of(args[4]).getParent().resolve("HiddenWarm.class")));
            content.put("eff-owned/forge-47.4.20-connection-template.class",Files.readAllBytes(Path.of(args[4]).getParent().resolve("forge-47.4.20-connection-template.class")));
            for(String name:new String[]{"Field","Unsafe"})content.put("eff-owned/"+name+".patched.class",Files.readAllBytes(Path.of(args[4]).getParent().resolve(name+".patched.class")));
            content.put("META-INF/MANIFEST.MF",("Manifest-Version: 1.0\r\nPremain-Class: eff.ownedagent.OwnedAgent\r\nCan-Retransform-Classes: true\r\nCan-Redefine-Classes: true\r\n\r\n").getBytes(java.nio.charset.StandardCharsets.UTF_8));jar(out,content);
            for(var e:OwnedOriginPatch.entries(Path.of(args[2])).entrySet())if(!e.getKey().equals("META-INF/MANIFEST.MF")&&!Arrays.equals(e.getValue(),content.get(e.getKey())))throw new AssertionError("ARGUMENT_AGENT_CHANGED");
        }
    }
}
