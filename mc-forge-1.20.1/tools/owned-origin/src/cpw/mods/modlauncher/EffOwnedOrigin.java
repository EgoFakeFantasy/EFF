package cpw.mods.modlauncher;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/** Fixed build-time origin allowlist, not a transformer/plugin filter. */
public final class EffOwnedOrigin {
    private static final java.util.Set<String> REPORTED = java.util.concurrent.ConcurrentHashMap.newKeySet();
    private EffOwnedOrigin() {}
    public static byte[] snapshot(byte[] input, String name) {
        String key = name == null ? "" : name.replace('.', '/');
        String expected = EffOwnedOriginCatalog.HASHES.get(key);
        if (expected == null) return null;
        if (input == null) throw new SecurityException("EFF_OWNED_ORIGIN_MISSING:" + key);
        byte[] isolated = input.clone();
        try {
            String actual = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(isolated));
            if (!actual.equals(expected)) throw new SecurityException("EFF_OWNED_ORIGIN_MISMATCH:" + key);
        } catch (NoSuchAlgorithmException impossible) { throw new ExceptionInInitializerError(impossible); }
        return isolated;
    }
    public static byte[] finish(byte[] snapshot, byte[] transformed, String name) {
        if (snapshot == null) return transformed;
        byte[] result = snapshot.clone();
        String key = name == null ? "" : name.replace('.', '/');
        String canonicalHash=EffOwnedOriginCatalog.CANONICAL_HASHES.get(key);
        if(canonicalHash!=null) {
            try(var stream=EffOwnedOrigin.class.getResourceAsStream("/META-INF/eff-owned-origin/archive/"+key+".class")) {
                if(stream==null)throw new SecurityException("EFF_OWNED_CANONICAL_MISSING:"+key);
                result=stream.readAllBytes();
                if(!digest(result).equals(canonicalHash))throw new SecurityException("EFF_OWNED_CANONICAL_MISMATCH:"+key);
            }catch(java.io.IOException failure){throw new SecurityException("EFF_OWNED_CANONICAL_UNREADABLE:"+key,failure);}
        }
        if (EffOwnedOriginCatalog.HASHES.containsKey(key) && REPORTED.add(key)) {
            String originalHash = digest(snapshot), transformedHash = transformed == null ? "null" : digest(transformed);
            System.err.println("[EFF-OWNED-ORIGIN] class=" + key + " inputSHA=" + originalHash
                + " transformedSHA=" + transformedHash + " outputSHA=" + digest(result)
                + " changed=" + !java.util.Arrays.equals(snapshot, transformed));
        }
        return result;
    }
    private static String digest(byte[] bytes) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
        catch (NoSuchAlgorithmException impossible) { throw new ExceptionInInitializerError(impossible); }
    }
}
