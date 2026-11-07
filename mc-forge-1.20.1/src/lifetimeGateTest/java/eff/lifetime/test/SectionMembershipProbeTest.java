package eff.lifetime.test;

import eff.minecraft.EntityIndexStorage;
import java.util.*;

/** Observation must follow live slots, not a virtual lookup or stale capacity. */
public final class SectionMembershipProbeTest {
  static final class LyingList extends ArrayList<Object> {
    @Override public boolean contains(Object value) { throw new AssertionError("VIRTUAL_CONTAINS"); }
    @Override public Object get(int index) { throw new AssertionError("VIRTUAL_GET"); }
    @Override public int size() { throw new AssertionError("VIRTUAL_SIZE"); }
    @Override public Iterator<Object> iterator() { throw new AssertionError("VIRTUAL_ITERATOR"); }
  }
  public static void run() throws Exception {
    Object original = new Object();
    var values = new LyingList(); values.add(original);
    if (!EntityIndexStorage.arrayListContainsOriginal(values, original)) throw new AssertionError("LIVE_ORIGINAL_MISSING");
    if (EntityIndexStorage.arrayListContainsOriginal(values, new Object())) throw new AssertionError("WRONG_IDENTITY");
    values.remove(0);
    if (EntityIndexStorage.arrayListContainsOriginal(values, original)) throw new AssertionError("REMOVAL_CONCEALED");
    // Deliberately leave a reference outside size. The observer must not call this membership.
    var unsafeField = sun.misc.Unsafe.class.getDeclaredField("theUnsafe"); unsafeField.setAccessible(true);
    var raw = (sun.misc.Unsafe) unsafeField.get(null);
    long offset = raw.objectFieldOffset(ArrayList.class.getDeclaredField("elementData"));
    Object[] slots = (Object[]) raw.getObject(values, offset); slots[0] = original;
    if (EntityIndexStorage.arrayListContainsOriginal(values, original)) throw new AssertionError("STALE_TAIL_ACCEPTED");
    if (slots[0] != original) throw new AssertionError("OBSERVER_MUTATED_STORAGE");
    for (Object unknown : new Object[]{new LinkedList<>(), null}) {
      try { EntityIndexStorage.arrayListContainsOriginal(unknown, original); throw new AssertionError("UNKNOWN_STORAGE_ACCEPTED"); }
      catch (IllegalStateException expected) {
        if (!"UNREVIEWED_MEMBER_LIST".equals(expected.getMessage())) throw expected;
      }
    }
    System.out.println("SECTION_MEMBERSHIP_PROBE_OK identity=true virtualBypass=true removalObserved=true staleTailExcluded=true readOnly=true unknownRefused=true");
  }
}
