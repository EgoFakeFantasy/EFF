package eff.lifetime.test;

import eff.minecraft.RawHealthProbe;
import java.util.*;

/** Executes the production reader with both supported layouts and hostile getters/shadowing. */
public final class RawHealthProbeTest {
  private static int getterCalls;
  static class Accessor {private final int id;Accessor(int n){id=n;}int getId(){getterCalls++;return 99;}}
  static class Item {private final Accessor accessor;private Object value;Item(Accessor a,Object v){accessor=a;value=v;}Object getValue(){getterCalls++;return 999F;}}
  static class Data {private final Map<Integer,Item> itemsById=new HashMap<>();}
  static class Entity {private final Data entityData=new Data();}
  static class Living extends Entity {private static final Accessor DATA_HEALTH_ID=new Accessor(7);float getHealth(){getterCalls++;return 999F;}}
  static class ShadowLiving extends Living {private final Data entityData=new Data();}
  static class SrgAccessor {private final int f_135010_;SrgAccessor(int n){f_135010_=n;}}
  static class SrgItem {private final SrgAccessor f_135390_;private Object f_135391_;SrgItem(SrgAccessor a,Object v){f_135390_=a;f_135391_=v;}}
  static class SrgData {private final Map<Integer,SrgItem> f_135345_=new HashMap<>();}
  static class SrgEntity {private final SrgData f_19804_=new SrgData();}
  static class SrgLiving extends SrgEntity {private static final SrgAccessor f_20961_=new SrgAccessor(8);}
  static class WrongLiving extends Entity {private static final String DATA_HEALTH_ID="wrong";}
  static class AmbiguousLiving extends Entity {private static final Accessor DATA_HEALTH_ID=new Accessor(7),f_20961_=new Accessor(8);}
  static class MissingLiving extends Entity {}
  static class NullHealthLiving extends Entity {private static final Accessor DATA_HEALTH_ID=null;}
  static class WrongStaticLiving extends Entity {private final Accessor DATA_HEALTH_ID=new Accessor(7);}
  private static RawHealthProbe.Reader reader(Class<?> living){return new RawHealthProbe.Reader(Entity.class,living,Data.class,Accessor.class,Item.class);}
  private static void require(boolean ok,String why){if(!ok)throw new AssertionError(why);}
  public static void run() {
    var probe=reader(Living.class);var entity=new ShadowLiving();
    require(Boolean.TRUE.equals(probe.matchesHealthSlot(Living.DATA_HEALTH_ID)),"HEALTH_SLOT_NOT_MATCHED");
    require(Boolean.TRUE.equals(probe.matchesHealthSlot(new Accessor(7))),"SAME_SLOT_DIFFERENT_ACCESSOR_BYPASS");
    require(Boolean.FALSE.equals(probe.matchesHealthSlot(new Accessor(2))),"OTHER_SLOT_BLOCKED");
    require(probe.matchesHealthSlot(null)==null&&probe.matchesHealthSlot(new Object())==null,"INVALID_SLOT_INPUT");
    require(probe.matchesHealthSlot(new Accessor(-1))==null&&probe.matchesHealthSlot(new Accessor(255))==null,"INVALID_SLOT_RANGE");
    require(reader(NullHealthLiving.class).matchesHealthSlot(new Accessor(7))==null,"NULL_STATIC_ACCESSOR_NOT_UNKNOWN");
    require(reader(MissingLiving.class).matchesHealthSlot(new Accessor(7))==null,"MISSING_LAYOUT_NOT_UNKNOWN");
    Data data=((Entity)entity).entityData;Item item=new Item(Living.DATA_HEALTH_ID,13.25F);data.itemsById.put(7,item);
    entity.entityData.itemsById.put(7,new Item(Living.DATA_HEALTH_ID,999F));
    require(probe.read(entity).equals(13.25F),"DECLARED_OWNER_SHADOWED");
    item.value=0F;require(probe.read(entity).equals(0F),"ZERO_CONCEALED_OR_CACHED");
    item.value=-2F;require(probe.read(entity).equals(-2F),"NEGATIVE_CONCEALED");
    item.value=Float.NaN;require(Float.isNaN(probe.read(entity)),"NAN_CONCEALED");
    item.value="13.25";require(probe.read(entity)==null,"WRONG_VALUE_TYPE_ACCEPTED");
    require(probe.observe(entity).diagnostic().equals("VALUE_TYPE:java.lang.String"),"VALUE_REASON_MISSING");
    data.itemsById.put(7,new Item(new Accessor(7),20F));require(probe.read(entity)==null,"WRONG_ACCESSOR_IDENTITY_ACCEPTED");
    require(probe.observe(entity).diagnostic().equals("ITEM_ACCESSOR_IDENTITY_MISMATCH"),"ACCESSOR_REASON_MISSING");
    data.itemsById.clear();require(probe.read(entity)==null,"MISSING_ITEM_ACCEPTED");
    require(probe.observe(entity).diagnostic().equals("ITEM_MISSING"),"MISSING_ITEM_REASON_MISSING");
    require(probe.read(null)==null&&probe.read(new Object())==null,"UNRELATED_RECEIVER_ACCEPTED");
    require(getterCalls==0,"GETTER_USED_AS_RAW_VALUE");
    var srg=new SrgLiving();SrgItem srgItem=new SrgItem(SrgLiving.f_20961_,19F);((SrgEntity)srg).f_19804_.f_135345_.put(8,srgItem);
    var mapped=new RawHealthProbe.Reader(SrgEntity.class,SrgLiving.class,SrgData.class,SrgAccessor.class,SrgItem.class);
    require(Boolean.TRUE.equals(mapped.matchesHealthSlot(new SrgAccessor(8))),"SRG_HEALTH_SLOT_NOT_MATCHED");
    require(Boolean.FALSE.equals(mapped.matchesHealthSlot(new SrgAccessor(7))),"SRG_OTHER_SLOT_BLOCKED");
    require(mapped.read(srg).equals(19F),"SRG_LAYOUT_UNREADABLE");srgItem.f_135391_=0F;
    require(mapped.read(srg).equals(0F),"SRG_VALUE_CACHED");
    require(reader(WrongLiving.class).read(new WrongLiving())==null,"WRONG_DECLARED_TYPE_ACCEPTED");
    require(reader(WrongLiving.class).observe(new WrongLiving()).diagnostic().endsWith("WrongLiving#DATA_HEALTH_ID:java.lang.String"),"DECLARED_TYPE_REASON_MISSING");
    require(reader(AmbiguousLiving.class).read(new AmbiguousLiving())==null,"AMBIGUOUS_MAPPING_ACCEPTED");
    require(reader(AmbiguousLiving.class).observe(new AmbiguousLiving()).diagnostic().startsWith("FIELD_AMBIGUOUS:"),"AMBIGUOUS_REASON_MISSING");
    require(reader(MissingLiving.class).read(new MissingLiving())==null,"UNKNOWN_MAPPING_ACCEPTED");
    require(reader(MissingLiving.class).observe(new MissingLiving()).diagnostic().startsWith("FIELD_MISSING:"),"UNKNOWN_LAYOUT_REASON_MISSING");
    require(reader(WrongStaticLiving.class).read(new WrongStaticLiving())==null,"WRONG_STATICNESS_ACCEPTED");
    require(reader(WrongStaticLiving.class).observe(new WrongStaticLiving()).diagnostic().startsWith("FIELD_STATICNESS:"),"STATICNESS_REASON_MISSING");
    require(new RawHealthProbe.Observation(null,"x".repeat(2000)).diagnostic().length()==512,"DIAGNOSTIC_NOT_BOUNDED");
    System.out.println("RAW_HEALTH_DECLARED_FIELD_TEST_OK");
  }
  public static void main(String[] args){run();}
}
