package eff.diagnostics;
import com.sun.tools.attach.VirtualMachine;
public final class AttachSnapshot {
  public static void main(String[] args) throws Exception {
    if(args.length != 3 || !args[0].matches("[1-9][0-9]{0,7}")) throw new IllegalArgumentException("PID_JAR_OUTPUT");
    VirtualMachine vm = VirtualMachine.attach(args[0]);
    try { vm.loadAgent(args[1], args[2]); } finally { vm.detach(); }
    if (!java.nio.file.Files.isRegularFile(java.nio.file.Path.of(args[2])))
      throw new IllegalStateException("SNAPSHOT_NOT_PRODUCED");
    System.out.println("READ_ONLY_SNAPSHOT_FINISHED");
  }
}
