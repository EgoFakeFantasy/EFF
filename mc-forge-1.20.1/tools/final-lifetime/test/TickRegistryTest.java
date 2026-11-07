import eff.minecraft.PlayerLifetimeRegistry;
import java.util.Arrays;
import java.util.UUID;
public final class TickRegistryTest {
  static void check(boolean good){if(!good)throw new AssertionError();}
  public static void main(String[] args){
    var registry=new PlayerLifetimeRegistry<Object>();
    Object original=new Object(),client=new Object(),owner=new Object(),world=new Object();UUID id=UUID.randomUUID();
    registry.observeTickBoundary(original,0);check(Arrays.equals(registry.tickBoundaries(original),new long[5]));
    registry.claim(original,id,world,owner);registry.active(client,id,world,true,()->true);
    registry.observeTickBoundary(client,0);registry.observeTickBoundary(new Object(),0);
    registry.observeTickBoundary(original,-1);registry.observeTickBoundary(original,5);registry.observeTickBoundary(null,0);
    check(Arrays.equals(registry.tickBoundaries(original),new long[5]));
    registry.observeTickBoundary(original,0);registry.observeTickBoundary(original,1);registry.observeTickBoundary(original,2);
    long[] snapshot=registry.tickBoundaries(original);check(Arrays.equals(snapshot,new long[]{1,1,1,0,0}));
    snapshot[0]=999;check(registry.tickBoundaries(original)[0]==1);
    registry.observeTickDecision(client,0,true);registry.observeTickDecision(new Object(),0,false);
    registry.observeTickDecision(original,-1,false);registry.observeTickDecision(original,6,true);
    check(Arrays.equals(registry.tickDecisions(original),new long[12]));
    registry.observeTickDecision(original,2,false);registry.observeTickDecision(original,2,true);
    long[] decisions=registry.tickDecisions(original);check(decisions[4]==1&&decisions[5]==1);decisions[4]=999;
    check(registry.tickDecisions(original)[4]==1);
    check(registry.denied(original,id)==0);registry.release(original,id,owner);registry.observeTickBoundary(original,0);
    registry.observeTickDecision(original,2,true);
    check(Arrays.equals(registry.tickBoundaries(original),new long[5])&&Arrays.equals(registry.tickDecisions(original),new long[12]));
    System.out.println("PASS diagnostic counters preserve identity, ignore client/unclaimed/invalid phase, isolate snapshots and clear on release");
  }
}
