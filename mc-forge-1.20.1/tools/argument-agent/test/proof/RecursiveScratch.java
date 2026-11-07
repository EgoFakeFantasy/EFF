package proof;
public final class RecursiveScratch {
  private static int scratch;
  public static int invoke(int depth){scratch=depth;if(depth>0)invoke(depth-1);return scratch;}
}
