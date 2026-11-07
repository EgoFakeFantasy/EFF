package eff.ownedagent;

import eff.finalgate.FinalLifetimeTransform;
import eff.argumentagent.internal.asm.ClassReader;
import java.util.*;
import java.util.function.BiFunction;

/** App-loader callback; only bytecode metadata, never target class loading. */
public final class LifetimeProvider implements BiFunction<String,byte[],byte[]> {
    private final Set<String> reported=new HashSet<>();
    public byte[] apply(String name,byte[] input){
        if(!FinalLifetimeTransform.supports(name)||!new ClassReader(input).getClassName().equals(name))throw new IllegalStateException("LIFETIME_NAME_MISMATCH");
        var result=FinalLifetimeTransform.transform(input);
        synchronized(reported){if(reported.size()<24&&reported.add(name+":"+result.methods()))System.err.println("[EFF-FINAL-LIFETIME] class="+name+" methods="+result.methods());}
        return result.bytes();
    }
}
