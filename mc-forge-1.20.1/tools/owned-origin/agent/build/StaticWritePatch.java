import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;

/** Fixed JDK Java wrappers only. Native jdk.internal.misc.Unsafe entrypoints are explicitly out of scope. */
public final class StaticWritePatch implements Opcodes {
    static final String GUARD="eff/ownedboot/StaticWriteGuard";
    public static byte[] patch(byte[] original){
        ClassReader reader=new ClassReader(original);ClassNode node=new ClassNode();reader.accept(node,ClassReader.EXPAND_FRAMES);
        int count=0;
        for(MethodNode method:node.methods){
            if((method.access&(ACC_NATIVE|ACC_STATIC|ACC_ABSTRACT))!=0)continue;
            InsnList code=new InsnList();
            if(node.name.equals("java/lang/reflect/Field")){
                if(!method.name.matches("set|setBoolean|setByte|setChar|setShort|setInt|setLong|setFloat|setDouble")||!method.desc.startsWith("(Ljava/lang/Object;"))continue;
                code.add(new VarInsnNode(ALOAD,0));code.add(new VarInsnNode(ALOAD,1));code.add(new MethodInsnNode(INVOKESTATIC,GUARD,"denyField","(Ljava/lang/reflect/Field;Ljava/lang/Object;)Z",false));
            }else if(node.name.equals("sun/misc/Unsafe")){
                if(method.name.equals("copyMemory")&&method.desc.equals("(Ljava/lang/Object;JLjava/lang/Object;JJ)V")){
                    code.add(new VarInsnNode(ALOAD,4));code.add(new VarInsnNode(LLOAD,5));code.add(new VarInsnNode(LLOAD,7));
                }else if(method.name.equals("setMemory")&&method.desc.equals("(Ljava/lang/Object;JJB)V")){
                    code.add(new VarInsnNode(ALOAD,1));code.add(new VarInsnNode(LLOAD,2));code.add(new VarInsnNode(LLOAD,4));
                }else{
                    if(!method.desc.startsWith("(Ljava/lang/Object;J")||!(method.name.startsWith("put")||method.name.startsWith("compareAndSwap")||method.name.startsWith("getAndSet")||method.name.startsWith("getAndAdd")))continue;
                    code.add(new VarInsnNode(ALOAD,1));code.add(new VarInsnNode(LLOAD,2));
                    if(method.name.contains("Object")){code.add(new MethodInsnNode(INVOKESTATIC,GUARD,"referenceWidth","()I",false));code.add(new InsnNode(I2L));}
                    else {long size=method.name.contains("Boolean")||method.name.contains("Byte")?1:method.name.contains("Char")||method.name.contains("Short")?2:method.name.contains("Long")||method.name.contains("Double")?8:4;code.add(new LdcInsnNode(size));}
                }
                code.add(new MethodInsnNode(INVOKESTATIC,GUARD,"denyUnsafe","(Ljava/lang/Object;JJ)Z",false));
            }else throw new IllegalStateException("UNREVIEWED_STATIC_WRITE_CLASS");
            LabelNode allowed=new LabelNode();code.add(new JumpInsnNode(IFEQ,allowed));
            Type returnType=Type.getReturnType(method.desc);
            if(returnType.getSort()==Type.VOID)code.add(new InsnNode(RETURN));
            else if(method.name.startsWith("compareAndSwap")){code.add(new InsnNode(ICONST_0));code.add(new InsnNode(IRETURN));}
            else {
                if(returnType.getSort()==Type.OBJECT){
                    code.add(new VarInsnNode(ALOAD,1));code.add(new VarInsnNode(LLOAD,2));code.add(new MethodInsnNode(INVOKESTATIC,GUARD,"deniedObjectValue","(Ljava/lang/Object;J)Ljava/lang/Object;",false));code.add(new InsnNode(ARETURN));
                }else{
                String getter=returnType.getSort()==Type.OBJECT?"getObject":returnType.getSort()==Type.LONG?"getLong":"getInt";
                code.add(new VarInsnNode(ALOAD,0));code.add(new VarInsnNode(ALOAD,1));code.add(new VarInsnNode(LLOAD,2));
                code.add(new MethodInsnNode(INVOKEVIRTUAL,node.name,getter,"(Ljava/lang/Object;J)"+returnType.getDescriptor(),false));code.add(new InsnNode(returnType.getOpcode(IRETURN)));
                }
            }
            code.add(allowed);
            java.util.ArrayList<Object> locals=new java.util.ArrayList<>();locals.add(node.name);
            for(Type arg:Type.getArgumentTypes(method.desc))locals.add(switch(arg.getSort()){case Type.OBJECT->arg.getInternalName();case Type.ARRAY->arg.getDescriptor();case Type.LONG->LONG;case Type.DOUBLE->DOUBLE;case Type.FLOAT->FLOAT;default->INTEGER;});
            code.add(new FrameNode(F_NEW,locals.size(),locals.toArray(),0,new Object[0]));
            method.instructions.insert(code);method.maxStack=Math.max(method.maxStack,5);count++;
        }
        int expected=node.name.equals("java/lang/reflect/Field")?9:31;
        if(count!=expected)throw new IllegalStateException("UNREVIEWED_WRITE_METHOD_COUNT:"+node.name+":"+count);
        ClassWriter writer=new ClassWriter(reader,0);node.accept(writer);
        System.out.println("STATIC_PREWRITE_PATCH class="+node.name+" methods="+count+" schemaChanged=false");return writer.toByteArray();
    }
}
