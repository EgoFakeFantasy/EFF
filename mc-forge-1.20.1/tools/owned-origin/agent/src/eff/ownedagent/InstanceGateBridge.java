package eff.ownedagent;

import java.lang.instrument.ClassFileTransformer;
import java.lang.reflect.*;
import java.net.URI;
import java.nio.file.*;
import java.security.*;
import java.util.*;
import java.util.function.Predicate;
import java.util.function.BiFunction;

/** Authenticated gate observer and write-activity bridge. Never loads Minecraft classes. */
public final class InstanceGateBridge implements ClassFileTransformer,Predicate<Object>,BiFunction<Object,Boolean,Boolean> {
    private final String jarHash;
    private final Map<String,String> classHashes;
    private ClassLoader loader;
    private final Set<String> observed=new HashSet<>(),reported=new HashSet<>();
    private final Map<String,byte[]> originals=new HashMap<>();
    private final Map<String,Class<?>> identities=new HashMap<>();
    private Class<?> targetType,gateType;
    private Method reject,runtimeOwned,collectionRemoval;
    public InstanceGateBridge(String source,Map<String,String> classes){jarHash=source;classHashes=Map.copyOf(classes);}
    private static String hash(byte[] bytes)throws Exception{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));}
    private static Path sourcePath(URI uri){
        if("file".equals(uri.getScheme()))return Path.of(uri);
        if(!"union".equals(uri.getScheme()))throw new IllegalArgumentException("GATE_SOURCE_SCHEME");
        String value=uri.getPath();int bang=value.lastIndexOf("!/");if(bang>=0)value=value.substring(0,bang);
        int marker=value.lastIndexOf('#');if(marker>=0&&value.substring(marker+1).matches("[0-9]+"))value=value.substring(0,marker);
        if(value.matches("^/[A-Za-z]:/.*"))value=value.substring(1);
        if(!value.endsWith(".jar"))throw new IllegalArgumentException("GATE_SOURCE_SHAPE");
        return Path.of(value);
    }
    @Override public byte[] transform(ClassLoader actualLoader,String name,Class<?> existing,ProtectionDomain domain,byte[] bytes){
        if(domain==null)return restore(actualLoader,name,existing);
        if(existing!=null||actualLoader==null||!classHashes.containsKey(name))return null;
        try {
            if(domain==null||domain.getCodeSource()==null||!classHashes.get(name).equals(hash(bytes)))throw new SecurityException("GATE_CLASS_HASH");
            Path source=sourcePath(domain.getCodeSource().getLocation().toURI());
            if(!Files.isRegularFile(source)||!jarHash.equals(hash(Files.readAllBytes(source))))throw new SecurityException("GATE_SOURCE_HASH");
            synchronized(this){
                if(loader!=null&&loader!=actualLoader){report("FOREIGN_LOADER",name);return null;}
                loader=actualLoader;observed.add(name);originals.putIfAbsent(name,bytes.clone());report("AUTHENTICATED",name);
            }
        }catch(Exception failure){report("UNAUTHENTICATED",name);}
        return null;
    }
    private synchronized boolean resolve(){
        if(reject!=null)return true;
        if(loader==null||!observed.contains("eff/lifetime/FieldWriteGate")||!observed.contains("eff/lifetime/LifetimeTarget"))return false;
        try{
            Class<?> actualTarget=Class.forName("eff.lifetime.LifetimeTarget",false,loader);
            Class<?> actualGate=Class.forName("eff.lifetime.FieldWriteGate",false,loader);
            Class<?> actualRenderer=Class.forName("eff.lifetime.LifetimeRenderer",false,loader);
            if(!observed.contains("eff/lifetime/LifetimeRenderer")||actualRenderer.getClassLoader()!=loader)throw new SecurityException("RENDERER_INTERFACE_IDENTITY");
            if(actualTarget.getClassLoader()!=loader||actualGate.getClassLoader()!=loader)throw new SecurityException("GATE_LOADER_IDENTITY");
            Method method=actualGate.getMethod("reject",Object.class);
            if(method.getReturnType()!=boolean.class||!Modifier.isStatic(method.getModifiers()))throw new SecurityException("GATE_METHOD_SHAPE");
            Method runtime=actualGate.getMethod("isOwnedRuntimeObject",Object.class);
            if(runtime.getReturnType()!=boolean.class||!Modifier.isStatic(runtime.getModifiers()))throw new SecurityException("GATE_RUNTIME_METHOD_SHAPE");
            Method collection=actualGate.getMethod("rejectCollectionRemoval",Collection.class,Object.class);
            if(collection.getReturnType()!=boolean.class||!Modifier.isStatic(collection.getModifiers()))throw new SecurityException("GATE_COLLECTION_METHOD_SHAPE");
            identities.put("eff/lifetime/FieldWriteGate",actualGate);identities.put("eff/lifetime/LifetimeTarget",actualTarget);identities.put("eff/lifetime/LifetimeRenderer",actualRenderer);
            targetType=actualTarget;gateType=actualGate;reject=method;runtimeOwned=runtime;collectionRemoval=collection;report("BOUND",actualGate.getName());return true;
        }catch(Exception failure){report("RESOLUTION_FAILED","gate");return false;}
    }
    @Override public boolean test(Object target){
        if(target==null||!resolve()||!targetType.isInstance(target))return false;
        try{return Boolean.TRUE.equals(reject.invoke(null,target));}
        catch(Throwable failure){report("ACTIVITY_CHECK_FAILED_CLOSED",gateType.getName());return true;}
    }
    public boolean rejectCollection(Object values,Object target){
        if(!(values instanceof Collection<?>))throw new IllegalArgumentException("COLLECTION_RECEIVER_REQUIRED");
        // Bootstrap-defined values cannot implement the authenticated non-bootstrap
        // LifetimeTarget. Avoid recursive gate binding during JDK String/Set startup.
        if(target==null||target.getClass().getClassLoader()==null&&!(target instanceof UUID))return false;
        if(!resolve()||!targetType.isInstance(target)&&!(target instanceof UUID))return false;
        try{return Boolean.TRUE.equals(collectionRemoval.invoke(null,values,target));}
        catch(Throwable failure){report("COLLECTION_CHECK_FAILED_CLOSED",gateType.getName());return true;}
    }
    @Override public Boolean apply(Object target,Boolean runtime){
        if(!Boolean.TRUE.equals(runtime))return test(target);
        if(target==null||!resolve())return false;
        try{return Boolean.TRUE.equals(runtimeOwned.invoke(null,target));}
        catch(Throwable failure){report("RUNTIME_ACTIVITY_UNAVAILABLE",gateType.getName());throw new IllegalStateException("RUNTIME_ACTIVITY_UNAVAILABLE");}
    }
    private synchronized byte[] restore(ClassLoader actualLoader,String name,Class<?> existing){
        if(name==null||loader==null||actualLoader!=loader||!originals.containsKey(name))return null;
        if(existing!=null){
            if(existing.getClassLoader()!=loader||!existing.getName().replace('.','/').equals(name))return null;
            Class<?> known=identities.get(name);if(known!=null&&known!=existing)return null;
            identities.putIfAbsent(name,existing);
        }
        return originals.get(name).clone();
    }
    private synchronized void report(String code,String name){String key=code+":"+name;if(reported.size()<24&&reported.add(key))System.err.println("[EFF-INSTANCE-GATE] code="+code+" class="+name);}
}
