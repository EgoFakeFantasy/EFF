package eff.ownedboot;

import java.lang.ref.WeakReference;
import java.security.MessageDigest;
import java.util.*;

/** Bootstrap-only helper. No target class loading, native calls, or game-state writes. */
public final class OwnedBoundary {
    private static final Map<String,Binding> BOUND = new HashMap<>();
    private static final Map<String,byte[]> TRUSTED = Catalog.bytes();
    private static final Set<String> REPORTED = new HashSet<>();
    private static final byte[] INVALID = {0, 0, 0, 0};
    private static volatile java.util.function.BiFunction<String,byte[],byte[]> lifetime;
    private static volatile java.lang.instrument.ClassFileTransformer gateRestorer;
    private static final class GateToken {
        final ClassLoader loader;final String name;final Class<?> type;final byte[] input;
        GateToken(ClassLoader l,String n,Class<?> t,byte[] b){loader=l;name=n;type=t;input=b==null?null:b.clone();}
    }
    public static synchronized void installGateRestorer(java.lang.instrument.ClassFileTransformer restorer){
        RuntimePin pin=runtimePins.get("eff/ownedagent/InstanceGateBridge");
        if(gateRestorer!=null||restorer==null||pin==null||pin.type!=restorer.getClass())throw new IllegalStateException("GATE_RESTORER_REGISTRATION");
        gateRestorer=restorer;new GateToken(null,"warm",null,new byte[0]);
    }
    private static volatile Map<String,RuntimePin> runtimePins=Map.of();
    private static volatile Map<String,RuntimePin> systemPins=Map.of();
    public static synchronized void installSystemBoundaries(Class<?>[] types,byte[][] bytes) {
        if(!systemPins.isEmpty() || types.length!=3 || bytes.length!=3)throw new IllegalStateException("SYSTEM_PIN_REGISTRATION");
        Set<String> expected=Set.of("sun.instrument.TransformerManager","java.lang.reflect.Field","sun.misc.Unsafe");
        Map<String,RuntimePin> pins=new HashMap<>();
        for(int i=0;i<types.length;i++){
            Class<?> type=types[i];
            if(type==null || type.getClassLoader()!=null || !expected.contains(type.getName())
                || bytes[i]==null || bytes[i].length<8 || pins.put(type.getName().replace('.','/'),new RuntimePin(type,bytes[i]))!=null)
                throw new IllegalArgumentException("SYSTEM_PIN_IDENTITY");
        }
        systemPins=Map.copyOf(pins);
    }
    private static final class RuntimePin {
        final Class<?> type;final byte[] bytes;
        RuntimePin(Class<?> t,byte[] b){type=t;bytes=b.clone();}
    }
    private static final class LifetimeToken {
        final String name;final byte[] input;
        LifetimeToken(String n,byte[] b){name=n;input=b==null?null:b.clone();}
    }
    public static synchronized void installLifetime(java.util.function.BiFunction<String,byte[],byte[]> pass,Class<?>[] implementations,byte[][] bytes){
        if(lifetime!=null||pass==null)throw new IllegalStateException("LIFETIME_PROVIDER_ALREADY_SET");
        Set<String> expected=new HashSet<>(Set.of("eff.finalgate.FinalLifetimeTransform","eff.finalgate.FinalLifetimeTransform$Result","eff.finalgate.TrustedTickTransform","eff.finalgate.PlayerOperationTransform","eff.ownedagent.LifetimeProvider","eff.ownedagent.InstanceGateBridge"));
        if(implementations.length==9)expected.addAll(Set.of("eff.hiddenboundary.HiddenWriteTransform","eff.hiddenboundary.HiddenWriteTransform$1","eff.hiddenboundary.NativeHiddenBoundary"));
        if(implementations.length!=expected.size()||bytes.length!=expected.size())throw new IllegalArgumentException("LIFETIME_PIN_COUNT");
        Map<String,RuntimePin> pins=new HashMap<>();
        for(int i=0;i<expected.size();i++){
            Class<?> type=implementations[i];
            if(!expected.contains(type.getName())||type.getClassLoader()==null||type.getClassLoader()!=pass.getClass().getClassLoader()||bytes[i]==null||pins.put(type.getName().replace('.','/'),new RuntimePin(type,bytes[i]))!=null)throw new IllegalArgumentException("LIFETIME_PIN_IDENTITY");
            System.err.println("[EFF-FINAL-LIFETIME] pinned class="+type.getName()+" SHA="+digest(bytes[i]));
        }
        runtimePins=Map.copyOf(pins);
        lifetime=pass;new LifetimeToken("warm",new byte[0]);
    }
    private static final class Binding {
        final WeakReference<ClassLoader> loader;
        WeakReference<Class<?>> defined = new WeakReference<>(null);
        Binding(ClassLoader value){loader=new WeakReference<>(value);}
    }
    private static final class Token {
        final String name,phase;final byte[] bytes;final String inputHash;
        Token(String n,String p,byte[] b,String h){name=n;phase=p;bytes=b;inputHash=h;}
    }
    public static void preload() {
        digest(new byte[0]);new Binding(ClassLoader.getSystemClassLoader());new Token("warm","warm",new byte[0],"");
        for(StackTraceElement frame:Thread.currentThread().getStackTrace())frame.toString();
        StackWalker.getInstance().forEach(frame -> frame.getDescriptor());
        // Force bootstrap helper nested classes, crypto and concatenation to resolve before hooks are patched.
        System.err.println("[EFF-OWNED-JVM] helper-ready classes="+TRUSTED.size());
    }
    private static String digest(byte[] bytes){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));}catch(Exception impossible){throw new IllegalStateException("SHA256_UNAVAILABLE",impossible);}}
    static boolean owns(Class<?> type){
        if(type==null)return false;
        String name=type.getName().replace('.','/');
        synchronized(BOUND){
            Binding binding=BOUND.get(name);if(binding==null||binding.loader.get()!=type.getClassLoader())return false;
            Class<?> known=binding.defined.get();if(known!=null&&known!=type)return false;
            binding.defined=new WeakReference<>(type);return true;
        }
    }
    private static final java.util.concurrent.atomic.AtomicInteger badEntries = new java.util.concurrent.atomic.AtomicInteger();
    private static final java.util.concurrent.atomic.AtomicInteger badReceivers = new java.util.concurrent.atomic.AtomicInteger();
    private static volatile Runnable entryAuditor;
    public static synchronized void installEntryAuditor(Runnable auditor) {
        if(entryAuditor!=null||auditor==null||runtimePins.isEmpty())throw new IllegalStateException("ENTRY_AUDITOR_REGISTRATION");
        Class<?> caller=StackWalker.getInstance(StackWalker.Option.RETAIN_CLASS_REFERENCE).getCallerClass();
        RuntimePin provider=runtimePins.get("eff/ownedagent/LifetimeProvider");
        if(!caller.getName().equals("eff.ownedagent.OwnedAgent")||provider==null
            ||caller.getClassLoader()!=provider.type.getClassLoader())throw new SecurityException("ENTRY_AUDITOR_OWNER");
        entryAuditor=auditor;
    }
    public static Object enterFromManager(Object receiver,Object input,Object loader,Object name,Object redefining) {
        RuntimePin manager=systemPins.get("sun/instrument/TransformerManager");
        if((manager==null || receiver==null || receiver.getClass()!=manager.type
            || input!=null && !(input instanceof byte[]) || loader!=null && !(loader instanceof ClassLoader)
            || name!=null && !(name instanceof String) || redefining!=null && !(redefining instanceof Class<?>))
            && badReceivers.getAndIncrement()<4) {
            System.err.println("[EFF-OWNED-CALLER] receiver="+shape(receiver)+" input="+shape(input)
                +" loader="+shape(loader)+" name="+shape(name)+" redefining="+shape(redefining));
            StackTraceElement[] trace=Thread.currentThread().getStackTrace();
            for(int i=0;i<Math.min(trace.length,12);i++)System.err.println("[EFF-OWNED-CALLER] "+trace[i]);
            StackWalker.getInstance().walk(frames -> {frames.limit(8).forEach(frame ->
                System.err.println("[EFF-OWNED-DESCRIPTOR] "+frame.getClassName()+"#"+frame.getMethodName()+frame.getDescriptor()));return null;});
            Runnable audit=entryAuditor;if(audit!=null)audit.run();
        }
        // Diagnostics only: no reinterpretation, guessing, or exemption of foreign calls.
        return enter(input,loader,name,redefining);
    }
    // This is a boundary exposed to transformed/native callers. Keep the descriptor
    // untyped so C2 cannot elide runtime shape checks using a caller's type promise.
    // Never guess/reorder malformed arguments or silently skip the final pass.
    public static Object enter(Object inputValue,Object loaderValue,Object nameValue,Object redefiningValue){
        if(inputValue!=null && !(inputValue instanceof byte[]) || loaderValue!=null && !(loaderValue instanceof ClassLoader)
            || nameValue!=null && !(nameValue instanceof String) || redefiningValue!=null && !(redefiningValue instanceof Class<?>)) {
            if(badEntries.getAndIncrement()<16)System.err.println("[EFF-OWNED-ENTRY] rejected input="+shape(inputValue)
                +" loader="+shape(loaderValue)+" name="+shape(nameValue)+" redefining="+shape(redefiningValue));
            return new Token("<invalid-entry>","type-rejected",INVALID.clone(),"unreadable");
        }
        byte[] input=(byte[])inputValue;ClassLoader loader=(ClassLoader)loaderValue;
        String name=(String)nameValue;Class<?> redefining=(Class<?>)redefiningValue;
        RuntimePin system=name==null?null:systemPins.get(name);
        if(system!=null && system.type==redefining && loader==null)
            return new Token(name,"system-boundary-retransform",system.bytes.clone(),input==null?"null":digest(input));
        if(gateRestorer!=null&&("eff/lifetime/FieldWriteGate".equals(name)||"eff/lifetime/LifetimeTarget".equals(name)||"eff/lifetime/LifetimeRenderer".equals(name)))return new GateToken(loader,name,redefining,input);
        RuntimePin runtime=name==null?null:runtimePins.get(name);
        if(runtime!=null&&runtime.type==redefining&&loader==runtime.type.getClassLoader())return new Token(name,"provider-redefine-or-retransform",runtime.bytes.clone(),input==null?"null":digest(input));
        if(lifetime!=null&&("net/minecraft/server/network/ServerGamePacketListenerImpl".equals(name)||"net/minecraft/client/renderer/entity/LivingEntityRenderer".equals(name)||"net/minecraft/client/renderer/LevelRenderer".equals(name)||"net/minecraft/world/entity/Entity".equals(name)||"net/minecraft/world/entity/LivingEntity".equals(name)||"net/minecraft/world/entity/player/Player".equals(name)||"net/minecraft/server/level/ServerPlayer".equals(name)||"net/minecraft/client/player/LocalPlayer".equals(name)||"net/minecraft/client/player/AbstractClientPlayer".equals(name)||"net/minecraft/client/player/RemotePlayer".equals(name)||"net/minecraft/world/level/entity/EntityLookup".equals(name)||"net/minecraft/client/multiplayer/ClientLevel".equals(name)||"net/minecraft/server/level/ServerLevel".equals(name)||"it/unimi/dsi/fastutil/ints/Int2ObjectLinkedOpenHashMap".equals(name)||"it/unimi/dsi/fastutil/ints/Int2ObjectOpenHashMap".equals(name)))return new LifetimeToken(name,input);
        if(name==null||loader==null||!TRUSTED.containsKey(name))return null;
        byte[] isolated=input==null?null:input.clone();String inputHash=isolated==null?"null":digest(isolated);
        synchronized(BOUND){
            Binding binding=BOUND.get(name);
            if(binding!=null && binding.loader.get()!=loader)return null; // no cross-loader ownership claim
            if(redefining==null){
                if(!Arrays.equals(isolated,TRUSTED.get(name)))return new Token(name,"define-rejected",INVALID.clone(),inputHash);
                if(binding==null){binding=new Binding(loader);BOUND.put(name,binding);}
                return new Token(name,"define",isolated,inputHash);
            }
            if(binding==null||redefining.getClassLoader()!=loader||!redefining.getName().replace('.','/').equals(name))return null;
            Class<?> known=binding.defined.get();
            if(known!=null&&known!=redefining)return null;
            // A loader can define at most one ordinary class for this binary name. Bind the actual Class now.
            binding.defined=new WeakReference<>(redefining);
            return new Token(name,"redefine-or-retransform",TRUSTED.get(name).clone(),inputHash);
        }
    }
    private static String shape(Object value){return value==null?"null":value.getClass().getName();}
    public static byte[] finish(Object opaque,byte[] transformed){
        if(opaque==null)return transformed;
        if(opaque instanceof GateToken gate){
            try{
                byte[] result=gateRestorer.transform(gate.loader,gate.name,gate.type,null,transformed==null?gate.input:transformed);
                if(result==null)return transformed;
                String before=transformed==null?gate.input==null?"null":digest(gate.input):digest(transformed),after=digest(result),key="gate:"+gate.name+":"+before;
                synchronized(REPORTED){if(REPORTED.size()<256&&REPORTED.add(key))System.err.println("[EFF-GATE-ORIGIN] class="+gate.name+" changed="+!before.equals(after)+" inputSHA="+before+" outputSHA="+after);}
                return result.clone();
            }catch(Throwable failure){System.err.println("[EFF-GATE-ORIGIN] rejected code=RESTORE_FAILURE");return INVALID.clone();}
        }
        if(opaque instanceof LifetimeToken selected){
            try {
                byte[] source=transformed==null?selected.input:transformed;
                if(source==null)throw new IllegalStateException("LIFETIME_MISSING_BYTES");
                byte[] result=lifetime.apply(selected.name,source.clone());
                if(result==null)throw new IllegalStateException("LIFETIME_NULL_RESULT");
                return result.clone();
            }catch(Throwable failure){
                String key="lifetime:"+selected.name+":"+failure.getClass().getName();
                synchronized(REPORTED){if(REPORTED.size()<256&&REPORTED.add(key))System.err.println("[EFF-FINAL-LIFETIME] rejected class="+selected.name+" code=TRANSFORM_FAILURE type="+failure.getClass().getName());}
                return INVALID.clone();
            }
        }
        Token token=(Token)opaque;byte[] result=token.bytes.clone();
        // CFT-manager null means no change: the effective bytes remain the incoming bytes.
        String transformedHash=transformed==null?token.inputHash:digest(transformed),outputHash=digest(result);
        String key=token.name+":"+token.phase+":"+transformedHash;
        synchronized(REPORTED){if(REPORTED.size()<256&&REPORTED.add(key))System.err.println("[EFF-OWNED-JVM] class="+token.name+" phase="+token.phase+" inputSHA="+token.inputHash+" transformedSHA="+transformedHash+" outputSHA="+outputHash+" changed="+!outputHash.equals(transformedHash));}
        return result;
    }
}
