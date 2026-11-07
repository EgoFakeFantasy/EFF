package proof;
public final class MergeScratch {
  private static Object scratch;
  public static Object invoke(Object value,boolean branch) {
    scratch=value;
    Object[] array=branch?new String[1]:new Integer[1];
    if(scratch==null) return array;
    CharSequence sequence=branch?new StringBuilder():new StringBuffer();
    if(sequence.length()==0)return scratch;
    return sequence;
  }
}
