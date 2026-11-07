package eff.ownedagent;

import java.lang.instrument.*;
import java.nio.file.*;
import java.security.*;
import java.util.*;
import java.util.jar.JarFile;

/** Dedicated fixed-JDK manager boundary; retains the existing argument agent unchanged. */
public final class OwnedAgent {
    private static String hash(byte[] value)throws Exception{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value));}
    public static void premain(String options,Instrumentation inst)throws Exception{
        if(options!=null&&!options.isEmpty())throw new IllegalArgumentException("NO_OPTIONS");
        if(!inst.isRetransformClassesSupported()||!inst.isRedefineClassesSupported())throw new IllegalStateException("INSTRUMENTATION_CAPABILITIES_REQUIRED");
        Path self=Path.of(OwnedAgent.class.getProtectionDomain().getCodeSource().getLocation().toURI());
        Path helper=self.getParent().resolve("eff-owned-origin-bootstrap.jar");
        if(!hash(Files.readAllBytes(helper)).equals(BuildPins.BOOTSTRAP_SHA256))throw new SecurityException("BOOTSTRAP_HASH_MISMATCH");
        byte[] original=Files.readAllBytes(Path.of(java.net.URI.create("jrt:/java.instrument/sun/instrument/TransformerManager.class")));
        if(!hash(original).equals(BuildPins.MANAGER_SHA256))throw new SecurityException("JDK_MANAGER_HASH_MISMATCH");
        byte[] patched;try(var in=OwnedAgent.class.getResourceAsStream("/eff-owned/TransformerManager.patched.class")){if(in==null)throw new IllegalStateException("PATCH_MISSING");patched=in.readAllBytes();}
        if(!hash(patched).equals(BuildPins.PATCHED_SHA256))throw new SecurityException("PATCH_HASH_MISMATCH");
        inst.appendToBootstrapClassLoaderSearch(new JarFile(helper.toFile()));
        Class<?> boundary=Class.forName("eff.ownedboot.OwnedBoundary",true,null);
        if(boundary.getClassLoader()!=null)throw new IllegalStateException("HELPER_NOT_BOOTSTRAP");
        boundary.getMethod("preload").invoke(null);
        Class<?> stateGuard=Class.forName("eff.ownedboot.StaticWriteGuard",true,null);
        stateGuard.getMethod("preload").invoke(null);
        var implementationTypes=new ArrayList<Class<?>>();var implementationBytes=new ArrayList<byte[]>();
        for(var entry:BuildPins.LIFETIME_CLASSES.entrySet()){
            byte[] bytes;try(var in=OwnedAgent.class.getResourceAsStream("/"+entry.getKey())){if(in==null)throw new SecurityException("LIFETIME_PROVIDER_MISSING");bytes=in.readAllBytes();}
            if(!hash(bytes).equals(entry.getValue()))throw new SecurityException("LIFETIME_PROVIDER_HASH_MISMATCH");
            String implementationName=entry.getKey().substring(0,entry.getKey().length()-6).replace('/','.');
            Class<?> implementation=Class.forName(implementationName,true,OwnedAgent.class.getClassLoader());
            if(implementation.getClassLoader()!=OwnedAgent.class.getClassLoader())throw new SecurityException("LIFETIME_IMPLEMENTATION_LOADER");
            implementationTypes.add(implementation);implementationBytes.add(bytes);
        }
        var provider=new LifetimeProvider();
        if(provider.getClass().getClassLoader()!=OwnedAgent.class.getClassLoader())throw new SecurityException("LIFETIME_PROVIDER_LOADER");
        boundary.getMethod("installLifetime",java.util.function.BiFunction.class,Class[].class,byte[][].class).invoke(null,provider,implementationTypes.toArray(Class<?>[]::new),implementationBytes.toArray(byte[][]::new));
        var instanceBridge=new InstanceGateBridge(BuildPins.GATE_SHA256,BuildPins.GATE_CLASSES);
        boundary.getMethod("installGateRestorer",ClassFileTransformer.class).invoke(null,instanceBridge);
        Class.forName("eff.ownedboot.InstanceWriteGuard",true,null).getMethod("install",java.util.function.Predicate.class).invoke(null,instanceBridge);
        java.util.function.BiPredicate<Object,Object> collectionBridge=instanceBridge::rejectCollection;
        Class.forName("eff.ownedboot.InstanceWriteGuard",true,null).getMethod("installCollection",java.util.function.BiPredicate.class).invoke(null,collectionBridge);
        var diagnostics=java.lang.management.ManagementFactory.getPlatformMXBean(com.sun.management.HotSpotDiagnosticMXBean.class);
        Path jvm=Path.of(System.getProperty("java.home"),"bin","server","jvm.dll");
        if(!hash(Files.readAllBytes(jvm)).equals("6b9a2354b41134986d61d1f8ff0f9614e3a6b7e235469b7e9260fe7a1d9bb84a")
                ||!"true".equals(diagnostics.getVMOption("UseCompressedClassPointers").getValue()))throw new SecurityException("HEADER_JVM_LAYOUT_PIN_MISMATCH");
        Class.forName("eff.ownedboot.ObjectHeaderGuard",true,null).getMethod("install",java.util.function.BiFunction.class).invoke(null,instanceBridge);
        inst.addTransformer(instanceBridge,true);
        Class<?> manager=Class.forName("sun.instrument.TransformerManager",false,null);
        inst.redefineModule(manager.getModule(),Set.of(boundary.getModule()),Map.of(),Map.of(),Set.of(),Map.of());
        Class<?> fieldClass=java.lang.reflect.Field.class,unsafeClass=Class.forName("sun.misc.Unsafe",false,null);
        inst.redefineModule(fieldClass.getModule(),Set.of(boundary.getModule()),Map.of(),Map.of(),Set.of(),Map.of());
        inst.redefineModule(unsafeClass.getModule(),Set.of(boundary.getModule()),Map.of(),Map.of(),Set.of(),Map.of());
        byte[] fieldPatch=verifiedPatch("java.base/java/lang/reflect/Field","Field",BuildPins.FIELD_SHA256,BuildPins.FIELD_PATCHED_SHA256);
        byte[] unsafePatch=verifiedPatch("jdk.unsupported/sun/misc/Unsafe","Unsafe",BuildPins.UNSAFE_SHA256,BuildPins.UNSAFE_PATCHED_SHA256);
        boundary.getMethod("installSystemBoundaries",Class[].class,byte[][].class).invoke(null,
            new Class<?>[]{manager,fieldClass,unsafeClass},new byte[][]{patched,fieldPatch,unsafePatch});
        ClassFileTransformer install=new ClassFileTransformer(){
            @Override public byte[] transform(ClassLoader loader,String name,Class<?> cls,ProtectionDomain domain,byte[] bytes){
                if(cls==fieldClass&&loader==null&&"java/lang/reflect/Field".equals(name))return fieldPatch.clone();
                if(cls==unsafeClass&&loader==null&&"sun/misc/Unsafe".equals(name))return unsafePatch.clone();
                return cls==manager&&loader==null&&"sun/instrument/TransformerManager".equals(name)?patched.clone():null;
            }
        };
        inst.addTransformer(install,true);inst.retransformClasses(manager,fieldClass,unsafeClass);
        System.err.println("[EFF-OWNED-JVM] manager-installed sourceSHA="+BuildPins.MANAGER_SHA256+" patchedSHA="+BuildPins.PATCHED_SHA256);
        System.err.println("[EFF-OWNED-STATIC] boundaries-installed fieldSHA="+BuildPins.FIELD_SHA256+" unsafeSHA="+BuildPins.UNSAFE_SHA256);
        // Exact existing implementation and its relocated dependencies are bundled byte-for-byte.
        eff.argumentagent.ArgumentIsolationAgent.premain(null,inst);
        if(!BuildPins.NATIVE_DLL_SHA256.isEmpty()){
            Path library=self.getParent().resolve("eff-native-hidden-boundary.dll").toAbsolutePath();
            if(!hash(Files.readAllBytes(library)).equals(BuildPins.NATIVE_DLL_SHA256))throw new SecurityException("NATIVE_BOUNDARY_HASH_MISMATCH");
            Class<?> nativeProvider=Class.forName("eff.hiddenboundary.HiddenWriteTransform",true,OwnedAgent.class.getClassLoader());
            byte[] warm;try(var in=OwnedAgent.class.getResourceAsStream("/eff-owned/HiddenWarm.class")){if(in==null)throw new SecurityException("HIDDEN_WARM_MISSING");warm=in.readAllBytes();}
            if(nativeProvider.getMethod("apply",Class.class,byte[].class).invoke(null,OwnedAgent.class,warm)==null)throw new IllegalStateException("HIDDEN_PROVIDER_WARM_FAILED");
            System.load(library.toString());
            Class.forName("eff.hiddenboundary.NativeHiddenBoundary",true,OwnedAgent.class.getClassLoader()).getMethod("install",Class.class).invoke(null,nativeProvider);
            var auditMethod=Class.forName("eff.hiddenboundary.NativeHiddenBoundary",true,OwnedAgent.class.getClassLoader()).getMethod("auditMethods");
            Runnable audit=()->{try{auditMethod.invoke(null);}catch(ReflectiveOperationException error){throw new IllegalStateException("ENTRY_AUDIT_FAILED",error);}};
            audit.run();
            boundary.getMethod("installEntryAuditor",Runnable.class).invoke(null,audit);
            System.err.println("[EFF-NATIVE-HIDDEN] installed SHA="+BuildPins.NATIVE_DLL_SHA256);
        }
    }
    private static byte[] verifiedPatch(String jrt,String shortName,String originalHash,String patchedHash)throws Exception{
        if(!hash(Files.readAllBytes(Path.of(java.net.URI.create("jrt:/"+jrt+".class")))).equals(originalHash))throw new SecurityException("JDK_WRITE_TARGET_HASH_MISMATCH:"+shortName);
        byte[] value;try(var in=OwnedAgent.class.getResourceAsStream("/eff-owned/"+shortName+".patched.class")){if(in==null)throw new IllegalStateException("WRITE_PATCH_MISSING");value=in.readAllBytes();}
        if(!hash(value).equals(patchedHash))throw new SecurityException("WRITE_PATCH_HASH_MISMATCH:"+shortName);return value;
    }
}
