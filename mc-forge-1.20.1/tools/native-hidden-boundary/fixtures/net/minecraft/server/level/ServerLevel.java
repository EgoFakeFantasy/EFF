package net.minecraft.server.level;
import net.minecraft.world.entity.Entity;
import net.minecraft.util.profiling.ProfilerFiller;
public class ServerLevel {
  static { eff.hiddenfixture.NativeBoundaryTest.tickInitializations++; }
  public void m_8647_(Entity entity) { throw new AssertionError("audit executed world tick"); }
  private void m_184063_(ProfilerFiller profiler, Entity entity) { throw new AssertionError("audit executed dispatch"); }
  public void m_8647_() { throw new AssertionError("wrong overload"); }
  public void m_184063_(Entity entity) { throw new AssertionError("wrong overload"); }
  public void unrelated() { throw new AssertionError("unrelated method"); }
}
