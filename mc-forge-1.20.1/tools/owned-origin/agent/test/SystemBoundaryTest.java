import java.lang.instrument.ClassFileTransformer;
import java.lang.instrument.Instrumentation;
import java.nio.file.Path;
import java.security.ProtectionDomain;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.objectweb.asm.ClassReader;
import org.objectweb.asm.ClassWriter;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.tree.*;
import proof.ControlAgent;

/** Pure Java, isolated-process regression for the installed manager's own final pin.
 * A downstream CFT observes pre-final bytes: the verdict therefore uses later class
 * behavior, not a transform callback's dump. No Minecraft or native fixture is run.
 */
public final class SystemBoundaryTest implements Opcodes {
    static final String MANAGER = "sun/instrument/TransformerManager";
    static final String OWNED = "eff/minecraft/RawHealthProbe";
    static final String FOREIGN = "net/minecraft/fixture/SystemBoundaryOrdinary";
    static final String OVERWRITE = "system-boundary-late-overwrite";
    static Map<String, byte[]> classes;
    static final AtomicInteger managerCallbacks = new AtomicInteger();
    static final AtomicInteger managerHeadsChanged = new AtomicInteger();
    static final AtomicInteger ownedCallbacks = new AtomicInteger();
    static final AtomicInteger foreignCallbacks = new AtomicInteger();

    static byte[] removeEnterToken(byte[] bytes) {
        ClassNode node = new ClassNode();
        new ClassReader(bytes).accept(node, 0);
        int changed = 0;
        for (MethodNode method : node.methods) {
            for (AbstractInsnNode insn : method.instructions.toArray()) {
                if (!(insn instanceof MethodInsnNode call)
                        || call.getOpcode() != INVOKESTATIC
                        || !call.owner.equals("eff/ownedboot/OwnedBoundary")
                        || !call.name.equals("enterFromManager")) continue;
                require(call.desc.equals("(Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;"),
                        "UNEXPECTED_ENTER_DESCRIPTOR");
                // Exactly preserve stack height and types at every original frame.
                // Five reference arguments are consumed; a null reference replaces
                // the token. All original transformer callbacks still execute.
                InsnList replacement = new InsnList();
                for (int i = 0; i < 5; i++) replacement.add(new InsnNode(POP));
                replacement.add(new InsnNode(ACONST_NULL));
                method.instructions.insertBefore(call, replacement);
                method.instructions.remove(call);
                changed++;
            }
        }
        require(changed == 1, "MANAGER_ENTER_HEAD_COUNT_" + changed);
        managerHeadsChanged.addAndGet(changed);
        ClassWriter writer = new ClassWriter(0);
        node.accept(writer);
        return writer.toByteArray();
    }

    static byte[] overwriteProbe(byte[] bytes) {
        ClassNode node = new ClassNode();
        new ClassReader(bytes).accept(node, 0);
        int changed = 0;
        for (MethodNode method : node.methods) {
            if (!method.name.equals("typeName")
                    || !method.desc.equals("(Ljava/lang/Object;)Ljava/lang/String;")) continue;
            method.instructions.clear();
            method.tryCatchBlocks.clear();
            if (method.localVariables != null) method.localVariables.clear();
            method.instructions.add(new LdcInsnNode(OVERWRITE));
            method.instructions.add(new InsnNode(ARETURN));
            method.maxLocals = 1;
            method.maxStack = 1;
            changed++;
        }
        require(changed == 1, "PROBE_METHOD_COUNT_" + changed);
        ClassWriter writer = new ClassWriter(0);
        node.accept(writer);
        return writer.toByteArray();
    }

    static final class Loader extends ClassLoader {
        Class<?> define(String name, byte[] bytes) {
            return defineClass(name.replace('/', '.'), bytes, 0, bytes.length);
        }
        @Override protected Class<?> findClass(String name) throws ClassNotFoundException {
            if (!name.startsWith("eff.minecraft.RawHealthProbe$")) throw new ClassNotFoundException(name);
            byte[] bytes = classes.get(name.replace('.', '/') + ".class");
            if (bytes == null) throw new ClassNotFoundException(name);
            return define(name, bytes);
        }
    }

    static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
    static String behavior(Class<?> type) throws Exception {
        return (String) type.getMethod("typeName", Object.class).invoke(null, new Object[]{null});
    }
    static byte[] foreignFixture() {
        ClassWriter writer = new ClassWriter(0);
        writer.visit(V17, ACC_PUBLIC, FOREIGN, null, "java/lang/Object", null);
        var method = writer.visitMethod(ACC_PUBLIC | ACC_STATIC, "typeName",
                "(Ljava/lang/Object;)Ljava/lang/String;", null, null);
        method.visitCode(); method.visitLdcInsn("ordinary-original"); method.visitInsn(ARETURN);
        method.visitMaxs(1, 1); method.visitEnd(); writer.visitEnd();
        return writer.toByteArray();
    }

    public static void main(String[] args) throws Exception {
        require(args.length == 1, "EXPECTED_SOURCE_JAR_ARGUMENT");
        classes = OwnedOriginPatch.entries(Path.of(args[0]));
        byte[] original = classes.get(OWNED + ".class");
        require(original != null, "OWNED_SOURCE_MISSING");
        Instrumentation instrumentation = ControlAgent.instrumentation;
        require(instrumentation != null, "CONTROL_AGENT_MISSING");
        Class<?> manager = Class.forName(MANAGER.replace('/', '.'), false, null);
        require(instrumentation.isModifiableClass(manager), "MANAGER_NOT_MODIFIABLE");
        ClassFileTransformer later = new ClassFileTransformer() {
            @Override public byte[] transform(ClassLoader loader, String name, Class<?> redefining,
                    ProtectionDomain domain, byte[] bytes) {
                if (MANAGER.equals(name)) {
                    require(loader == null && redefining == manager, "MANAGER_IDENTITY_MISMATCH");
                    managerCallbacks.incrementAndGet();
                    return removeEnterToken(bytes);
                }
                if (OWNED.equals(name)) {
                    ownedCallbacks.incrementAndGet(); return overwriteProbe(bytes);
                }
                if (FOREIGN.equals(name)) {
                    foreignCallbacks.incrementAndGet(); return overwriteProbe(bytes);
                }
                return null;
            }
        };
        instrumentation.addTransformer(later, true);
        try {
            // Establish the actual owned behavior before attempting manager corruption.
            Loader loader = new Loader();
            Class<?> probe = loader.define(OWNED, original.clone());
            require("null".equals(behavior(probe)), "INITIAL_OWNED_BOUNDARY_MISSING");
            require(ownedCallbacks.get() > 0, "INITIAL_LATE_CALLBACK_NOT_RUN");
            // Two retransforms ensure that the restored implementation, rather than
            // an old on-stack manager frame, is protecting the second attempt too.
            for (int round = 1; round <= 2; round++) {
                int before = managerCallbacks.get();
                instrumentation.retransformClasses(manager);
                require(managerCallbacks.get() > before, "MANAGER_CFT_NOT_RUN_" + round);
                require(managerHeadsChanged.get() >= round, "NO_VALID_MANAGER_MUTATION_" + round);
                before = ownedCallbacks.get();
                instrumentation.retransformClasses(probe);
                require(ownedCallbacks.get() > before, "OWNED_LATE_CALLBACK_NOT_RUN_" + round);
                require("null".equals(behavior(probe)), "SYSTEM_MANAGER_PIN_BYPASSED_" + round);
            }
            Class<?> foreign = new Loader().define(FOREIGN, foreignFixture());
            require(foreignCallbacks.get() > 0 && OVERWRITE.equals(behavior(foreign)),
                    "ORDINARY_TRANSFORMER_WAS_DISABLED");
            System.out.println("SYSTEM_BOUNDARY_TEST_OK managerRetransforms=2 mutation=verified-stack-null-token"
                    + " managerCallbacks=" + managerCallbacks.get() + " ownedCallbacks=" + ownedCallbacks.get()
                    + " ownedBehaviorPreserved=true ordinaryTransformerRuns=true native=false minecraft=false");
        } finally {
            require(instrumentation.removeTransformer(later), "LATE_TRANSFORMER_REMOVE_FAILED");
        }
    }
}
