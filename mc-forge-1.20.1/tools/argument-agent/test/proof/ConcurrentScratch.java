package proof;
import java.util.concurrent.CountDownLatch;
public final class ConcurrentScratch {
  private static Object scratch;
  public static Object invoke(Object value,CountDownLatch ready,CountDownLatch release)throws Exception {
    scratch=value;ready.countDown();release.await();return scratch;
  }
}
