import java.io.*;
import java.util.*;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;
import org.objectweb.asm.tree.analysis.*;

/** Independent reproduction of documented emission only. No specimen class loading. */
public class ServiceFilterStaticMirror implements Opcodes {
  static final String FILTER="com/wzz/forever_love_sword/core/service/ServiceLoaderFilter";
  static byte[] transform(byte[] bytes,String name,boolean fixed,Set<String> merges) {
    ClassReader cr=new ClassReader(bytes);
    ClassWriter cw=new ClassWriter(cr,fixed?ClassWriter.COMPUTE_FRAMES:ClassWriter.COMPUTE_MAXS) {
      protected String getCommonSuperClass(String a,String b) {
        merges.add(a+" + "+b);
        return super.getCommonSuperClass(a,b);
      }
    };
    cr.accept(new ClassVisitor(ASM9,cw) {
      public MethodVisitor visitMethod(int access,String method,String desc,String sig,String[] ex) {
        MethodVisitor mv=super.visitMethod(access,method,desc,sig,ex);
        if(!method.equals("hasNext")||!desc.equals("()Z")) return mv;
        return new MethodVisitor(ASM9,mv) {
          Label first;
          public void visitCode() {
            super.visitCode(); mv.visitVarInsn(ALOAD,0);
            mv.visitFieldInsn(GETFIELD,name,"this$0","Ljava/util/ServiceLoader;");
            mv.visitFieldInsn(GETFIELD,"java/util/ServiceLoader","service","Ljava/lang/Class;");
            mv.visitMethodInsn(INVOKESTATIC,FILTER,"recordServiceType","(Ljava/lang/Class;)V",false);
          }
          public void visitLabel(Label l) {super.visitLabel(l);if(first==null)first=l;}
          public void visitMethodInsn(int opcode,String owner,String method,String desc,boolean itf) {
            super.visitMethodInsn(opcode,owner,method,desc,itf);
            if(opcode==INVOKEINTERFACE && owner.equals("java/util/Iterator") && method.equals("next")) {
              mv.visitVarInsn(ASTORE,10);mv.visitVarInsn(ALOAD,10);mv.visitInsn(DUP);
              mv.visitMethodInsn(INVOKESTATIC,FILTER,"shouldBlockImplementation","(Ljava/lang/Object;)Z",false);
              Label allow=new Label();mv.visitJumpInsn(IFEQ,allow);mv.visitInsn(POP);
              if(first!=null)mv.visitJumpInsn(GOTO,first);mv.visitLabel(allow);
              if(!fixed)mv.visitVarInsn(ALOAD,10);
            }
          }
        };
      }
    },ClassReader.EXPAND_FRAMES);
    return cw.toByteArray();
  }
  static String check(byte[] bytes) {
    ClassNode node=new ClassNode();new ClassReader(bytes).accept(node,0);
    try {
      for(MethodNode m:node.methods) if(m.name.equals("hasNext"))
        new Analyzer<BasicValue>(new BasicVerifier()).analyze(node.name,m);
      return "PASS";
    }catch(Exception ex){return "FAIL "+ex.getMessage();}
  }
  public static void main(String[] args)throws Exception {
    for(String suffix:List.of("ModuleServicesLookupIterator","LayerLookupIterator","LazyClassPathLookupIterator")) {
      String name="java/util/ServiceLoader$"+suffix;byte[] source;
      try(InputStream in=ClassLoader.getSystemResourceAsStream(name+".class")){source=in.readAllBytes();}
      Set<String> merges=new LinkedHashSet<>();
      String oldResult=check(transform(source,name,false,new LinkedHashSet<>()));
      String fixedResult=check(transform(source,name,true,merges));
      System.out.println(name+" ORIGINAL-EMISSION="+oldResult+" CORRECTED-EMISSION="+fixedResult+" TYPE-MERGES="+merges);
      if(!fixedResult.equals("PASS"))throw new AssertionError("corrected failure");
      if(!suffix.startsWith("Lazy")&&!oldResult.startsWith("FAIL"))throw new AssertionError("expected defect not reproduced");
    }
    System.out.println("Static mirror only; no target transformer or specimen was executed, no generated class was defined.");
  }
}
