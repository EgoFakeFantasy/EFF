package eff.argumentagent;

import eff.lifetime.StaticArgumentIsolation;
import java.lang.instrument.ClassFileTransformer;
import java.lang.instrument.Instrumentation;
import java.lang.module.ModuleFinder;
import java.lang.module.ModuleReference;
import java.security.ProtectionDomain;
import java.util.*;
import java.io.*;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.ClassNode;

/** Experimental repeated argument isolation. Not a native-code security boundary. */
public final class ArgumentIsolationAgent {
  public static void premain(String options, Instrumentation instrumentation) {
    if (options != null && !options.isEmpty()) throw new IllegalArgumentException("NO_AGENT_OPTIONS_SUPPORTED");
    if (!instrumentation.isRetransformClassesSupported()) throw new IllegalStateException("RETRANSFORM_REQUIRED");
    // Load the parser and normalizer before installing our own callback.
    ClassNode warm = new ClassNode(); warm.version=Opcodes.V17; warm.name="eff/argumentagent/Warm";
    warm.superName="java/lang/Object"; StaticArgumentIsolation.instrument(warm);
    warm.accept(new ClassWriter(0));
    instrumentation.addTransformer(new IsolationTransformer(), true);
    System.err.println("[EFF_ARGUMENT_AGENT] installed retransform=true");
  }

  static final class IsolationTransformer implements ClassFileTransformer {
    private final ThreadLocal<Boolean> entered=ThreadLocal.withInitial(()->false);
    @Override public byte[] transform(ClassLoader loader,String name,Class<?> redefining,
        ProtectionDomain domain,byte[] bytes) {
      if(loader==null || name==null || name.startsWith("eff/argumentagent/") || entered.get())return null;
      // Application-supplied class bytes only. No JDK/module/platform transformation.
      if(name.startsWith("java/")||name.startsWith("javax/")||name.startsWith("jdk/")||name.startsWith("sun/"))return null;
      if(bytes.length>8*1024*1024)return null;
      entered.set(true);
      try {
        ClassNode node=new ClassNode();new ClassReader(bytes).accept(node,ClassReader.SKIP_FRAMES);
        var changes=StaticArgumentIsolation.instrument(node);if(changes.isEmpty())return null;
        MetadataWriter writer=new MetadataWriter(loader,node);node.accept(writer);byte[] output=writer.toByteArray();
        System.err.println("[EFF_ARGUMENT_AGENT] phase="+(redefining==null?"define":"redefine-or-retransform")+
            " class="+name+" fields="+changes.size());
        return output;
      } catch(Throwable error) {
        // Instrumentation errors cannot veto class definition. Report rather than pretending protection.
        String detail=error instanceof HierarchyFailure failure?" code="+failure.code+" hierarchyClass="+failure.className:"";
        System.err.println("[EFF_ARGUMENT_AGENT] unavailable class="+boundedClassName(name)+" reason="+error.getClass().getName()+detail);
        return null;
      } finally {entered.remove();}
    }
  }

  static String boundedClassName(String name) {
    if(name==null)return "<null>";
    if(name.length()>240)return "<class-name-too-long>";
    if(!name.matches("[A-Za-z_$][A-Za-z0-9_$]*(/[A-Za-z_$][A-Za-z0-9_$]*)*"))return "<invalid-class-name>";
    return name;
  }
  static final class HierarchyFailure extends IllegalStateException {
    final String code,className;
    HierarchyFailure(String code,String name){super(code);this.code=code;this.className=boundedClassName(name);}
  }

  /** Resolve hierarchy from class resources, never Class.forName/initialization inside a callback. */
  static final class MetadataWriter extends ClassWriter {
    private static final boolean MODULE_PATCH_DECLARED=java.lang.management.ManagementFactory.getRuntimeMXBean()
        .getInputArguments().stream().anyMatch(a->a.equals("--patch-module")||a.startsWith("--patch-module="));
    private final ClassLoader loader;
    private final Map<String,Shape> shapes=new HashMap<>();
    MetadataWriter(ClassLoader loader,ClassNode current) {
      super(COMPUTE_FRAMES);this.loader=loader;
      shapes.put(current.name,new Shape(current.superName,List.copyOf(current.interfaces),(current.access&Opcodes.ACC_INTERFACE)!=0));
    }
    record Shape(String parent,List<String> interfaces,boolean isInterface){}
    InputStream platformResource(String name)throws IOException {
      if(MODULE_PATCH_DECLARED)throw new HierarchyFailure("HIERARCHY_MODULE_PATCH_DECLARED",name);
      int separator=name.lastIndexOf('/');if(separator<0)return null;
      String packageName=name.substring(0,separator).replace('/','.');ModuleReference selected=null;
      for(Module module:ModuleLayer.boot().modules()) {
        if(!module.getPackages().contains(packageName))continue;
        var system=ModuleFinder.ofSystem().find(module.getName());if(system.isEmpty())continue;
        ModuleReference candidate=system.get();
        var location=candidate.location();
        if(location.isEmpty()||!location.get().getScheme().equals("jrt")||!location.get().getPath().equals("/"+module.getName()))continue;
        if(!candidate.descriptor().packages().contains(packageName))continue;
        var resolved=ModuleLayer.boot().configuration().findModule(module.getName());
        if(resolved.isEmpty()||!resolved.get().reference().location().equals(location)
            ||!resolved.get().reference().descriptor().equals(candidate.descriptor()))
          throw new HierarchyFailure("HIERARCHY_SYSTEM_MODULE_REFERENCE_MISMATCH",name);
        if(selected!=null)throw new HierarchyFailure("HIERARCHY_MODULE_AMBIGUOUS",name);
        selected=candidate;
      }
      if(selected==null)return null;
      // Read the system image itself, not an application loader or patched module resource.
      try(var reader=selected.open()) {
        var resource=reader.open(name+".class");if(resource.isEmpty())return null;
        try(InputStream input=resource.get()) {
          byte[] bytes=input.readNBytes(4*1024*1024+1);
          if(bytes.length>4*1024*1024)throw new HierarchyFailure("HIERARCHY_RESOURCE_LIMIT",name);
          return new ByteArrayInputStream(bytes);
        }
      }
    }
    InputStream resource(String name)throws IOException {
      InputStream direct=loader.getResourceAsStream(name+".class");
      return direct!=null?direct:platformResource(name);
    }
    Shape shape(String name) {
      Shape known=shapes.get(name);if(known!=null)return known;
      try(InputStream input=resource(name)) {
        if(input==null)throw new HierarchyFailure("HIERARCHY_RESOURCE_MISSING",name);
        byte[] bytes=input.readNBytes(4*1024*1024+1);if(bytes.length>4*1024*1024)throw new HierarchyFailure("HIERARCHY_RESOURCE_LIMIT",name);
        ClassReader reader=new ClassReader(bytes);if(!reader.getClassName().equals(name))throw new HierarchyFailure("HIERARCHY_NAME_MISMATCH",name);
        Shape value=new Shape(reader.getSuperName(),List.of(reader.getInterfaces()),(reader.getAccess()&Opcodes.ACC_INTERFACE)!=0);
        shapes.put(name,value);return value;
      }catch(IOException e){throw new HierarchyFailure("HIERARCHY_RESOURCE_IO",name);}
    }
    boolean assignable(String expected,String actual,Set<String> visited) {
      if(expected.equals(actual)||expected.equals("java/lang/Object"))return true;
      if(!visited.add(actual))return false;
      if(actual.startsWith("[")) {
        if(expected.equals("java/lang/Cloneable")||expected.equals("java/io/Serializable"))return true;
        if(!expected.startsWith("["))return false;
        String a=component(actual),e=component(expected);return a!=null&&e!=null&&assignable(e,a,new HashSet<>());
      }
      if(expected.startsWith("["))return false;
      Shape s=shape(actual);if(s.parent()!=null&&assignable(expected,s.parent(),visited))return true;
      for(String i:s.interfaces())if(assignable(expected,i,visited))return true;
      return false;
    }
    String component(String array) {
      String c=array.substring(1);return c.startsWith("[")?c:c.startsWith("L")?c.substring(1,c.length()-1):null;
    }
    @Override protected String getCommonSuperClass(String a,String b) {
      if(assignable(a,b,new HashSet<>()))return a;
      if(assignable(b,a,new HashSet<>()))return b;
      if(a.startsWith("[")&&b.startsWith("[")) {
        String ac=component(a),bc=component(b);if(ac!=null&&bc!=null){String c=getCommonSuperClass(ac,bc);return "["+(c.startsWith("[")?c:"L"+c+";");}
        return "java/lang/Object";
      }
      if(a.startsWith("[")||b.startsWith("[")||shape(a).isInterface()||shape(b).isInterface())return "java/lang/Object";
      String next=shape(a).parent();Set<String> seen=new HashSet<>();
      while(next!=null&&seen.add(next)){if(assignable(next,b,new HashSet<>()))return next;next=shape(next).parent();}
      throw new HierarchyFailure("HIERARCHY_NO_COMMON_SUPER",a);
    }
  }
}
