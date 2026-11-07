package kakiku.pig2mod.entity;

/** Synthetic field shape only. No opponent code or attack behavior. */
public final class Pig2 {
  enum Stage { LEVEL_3 }
  private Object mEnemy1st, mAttackingEnemy;
  private Object mAttackLevel = Stage.LEVEL_3;
  private int mTickCounterLevel3 = 17;
  private static Object gMaxFightPhase = Stage.LEVEL_3;
  private static long gStartFightingTime = 100, gLastFightingTime = 200;
  private static boolean gKilledAllServerEnemies = false;
  public Pig2(Object enemy, Object attacking, boolean malformed) {
    mEnemy1st = enemy; mAttackingEnemy = attacking;
    if (malformed) mAttackLevel = "not-enum";
  }
  public Object[] snapshot() {
    return new Object[]{mEnemy1st, mAttackingEnemy, mAttackLevel, mTickCounterLevel3,
        gMaxFightPhase, gStartFightingTime, gLastFightingTime, gKilledAllServerEnemies};
  }
}
