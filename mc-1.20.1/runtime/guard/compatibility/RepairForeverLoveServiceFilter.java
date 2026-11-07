import java.nio.file.*;
import java.security.*;
import java.util.*;
import java.util.zip.*;
import java.io.*;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;
import org.objectweb.asm.tree.analysis.*;

/** Offline bytecode data rewrite only: never loads or invokes specimen classes. */
public final class RepairForeverLoveServiceFilter implements Opcodes {
  static final String SOURCE_SHA = "3bf3ba852bbafec9f4440210d4084bb92ba9586c9a146ae03ddf003f17f1b5f8";
  static final String PREFIX = "com/wzz/forever_love_sword/core/transformer/ImplementationFilterTransformer";
  static final String ASM = "com/wzz/forever_love_sword/api/asm/";
  static String sha(byte[] b) throws Exception {
    return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(b));
  }
  static void require(boolean ok, String why) { if (!ok) throw new IllegalStateException(why); }
  static List<AbstractInsnNode> real(MethodNode m) {
    List<AbstractInsnNode> list = new ArrayList<>();
    for (AbstractInsnNode n : m.instructions) if (n.getOpcode() >= 0) list.add(n);
    return list;
  }
  static byte[] repair(String name, byte[] original) throws Exception {
    ClassNode c = new ClassNode(); new ClassReader(original).accept(c, 0);
    int changed = 0;
    for (MethodNode m : c.methods) {
      List<AbstractInsnNode> r = real(m);
      if (name.equals(PREFIX + "$1$1.class") && m.name.equals("visitMethodInsn")
          && m.desc.equals("(ILjava/lang/String;Ljava/lang/String;Ljava/lang/String;Z)V")) {
        for (int i=0; i+5<r.size(); i++) {
          if (r.get(i) instanceof VarInsnNode a && a.getOpcode()==ALOAD && a.var==0
              && r.get(i+1) instanceof FieldInsnNode f && f.getOpcode()==GETFIELD
              && f.owner.equals(PREFIX+"$1$1") && f.name.equals("mv")
              && f.desc.equals("L"+ASM+"MethodVisitor;")
              && r.get(i+2) instanceof IntInsnNode k && k.getOpcode()==BIPUSH && k.operand==ALOAD
              && r.get(i+3) instanceof VarInsnNode v && v.getOpcode()==ILOAD && v.var==6
              && r.get(i+4) instanceof MethodInsnNode call && call.getOpcode()==INVOKEVIRTUAL
              && call.owner.equals(ASM+"MethodVisitor") && call.name.equals("visitVarInsn")
              && call.desc.equals("(II)V") && r.get(i+5).getOpcode()==RETURN) {
            require(i>0 && r.get(i-1) instanceof MethodInsnNode prev
              && prev.name.equals("visitLabel") && prev.desc.equals("(L"+ASM+"Label;)V"),
              "Unexpected injection-tail context");
            for(int j=0;j<5;j++) m.instructions.remove(r.get(i+j));
            changed++;
          }
        }
      }
      if (name.equals(PREFIX+".class") && m.name.equals("filterImplementation")
          && m.desc.equals("([BLjava/lang/String;)[B")) {
        for (int i=1; i<r.size(); i++) {
          if (r.get(i) instanceof MethodInsnNode call && call.getOpcode()==INVOKESPECIAL
              && call.owner.equals(ASM+"ClassWriter") && call.name.equals("<init>")
              && call.desc.equals("(L"+ASM+"ClassReader;I)V")) {
            require(r.get(i-1).getOpcode()==ICONST_1,"Unexpected ClassWriter flags");
            m.instructions.set(r.get(i-1),new InsnNode(ICONST_2)); changed++;
          }
        }
      }
    }
    require(changed==1,"Expected exactly one local edit in "+name+", got "+changed);
    // These edits preserve helper-method stack effects; retain original helper frames.
    ClassWriter out = new ClassWriter(0); c.accept(out); byte[] result=out.toByteArray();
    ClassNode checked = new ClassNode(); new ClassReader(result).accept(checked,0);
    for(MethodNode m:checked.methods) if((m.access&(ACC_ABSTRACT|ACC_NATIVE))==0)
      new Analyzer<BasicValue>(new BasicVerifier()).analyze(checked.name,m);
    return result;
  }
  public static void main(String[] args) throws Exception {
    require(args.length==2,"Usage: RepairForeverLoveServiceFilter original.jar repaired-new.jar");
    Path source=Path.of(args[0]).toRealPath(), output=Path.of(args[1]).toAbsolutePath().normalize();
    require(!source.equals(output),"Never overwrite original");
    require(!Files.exists(output),"Output must not exist");
    require(sha(Files.readAllBytes(source)).equals(SOURCE_SHA),"Unexpected original SHA-256");
    LinkedHashMap<String,byte[]> all=new LinkedHashMap<>();
    Map<String,Long> times=new HashMap<>(); int changed=0;
    try(ZipFile zip=new ZipFile(source.toFile())) {
      for(ZipEntry e:Collections.list(zip.entries())) {
        require(!all.containsKey(e.getName()),"Duplicate ZIP entry");
        require(!e.getName().matches("(?i)META-INF/.*\\.(SF|RSA|DSA|EC)"),"Signed archive requires separate review");
        byte[] b; try(InputStream in=zip.getInputStream(e)){b=in.readAllBytes();}
        if(e.getName().equals(PREFIX+".class") || e.getName().equals(PREFIX+"$1$1.class")) {
          b=repair(e.getName(),b); changed++;
        }
        all.put(e.getName(),b); times.put(e.getName(),e.getTime());
      }
    }
    require(changed==2,"Missing target entries");
    try(ZipOutputStream zip=new ZipOutputStream(Files.newOutputStream(output,StandardOpenOption.CREATE_NEW))) {
      for(var item:all.entrySet()) {
        ZipEntry e=new ZipEntry(item.getKey()); long time=times.get(item.getKey()); if(time>=0)e.setTime(time);
        zip.putNextEntry(e); zip.write(item.getValue()); zip.closeEntry();
      }
    }
    int verifiedChanges=0;
    try(ZipFile a=new ZipFile(source.toFile()); ZipFile b=new ZipFile(output.toFile())) {
      require(a.size()==b.size(),"Entry count changed");
      for(ZipEntry e:Collections.list(a.entries())) {
        byte[] oldBytes,newBytes;
        try(InputStream in=a.getInputStream(e)){oldBytes=in.readAllBytes();}
        try(InputStream in=b.getInputStream(b.getEntry(e.getName()))){newBytes=in.readAllBytes();}
        if(!Arrays.equals(oldBytes,newBytes)) {
          require(e.getName().equals(PREFIX+".class")||e.getName().equals(PREFIX+"$1$1.class"),"Unintended entry diff");
          verifiedChanges++; System.out.println("Changed entry: "+e.getName());
        }
      }
    }
    require(verifiedChanges==2,"Unexpected output diff count");
    System.out.println("Original SHA-256: "+SOURCE_SHA);
    System.out.println("REPAIRED-COMPATIBILITY SHA-256: "+sha(Files.readAllBytes(output)));
    System.out.println("Not an original-specimen pass; no specimen code was executed by this tool.");
  }
}
