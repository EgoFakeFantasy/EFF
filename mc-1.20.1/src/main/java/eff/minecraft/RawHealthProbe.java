package eff.minecraft;

import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.util.Map;

/** Read-only fallback for missing generated accessors. No health/value getter, writes, repair,
 * inferred default, or cached health value. Unknown field layouts produce no observation.
 * Reflection remains an in-process observation, not an assurance against arbitrary native code.
 */
public final class RawHealthProbe {
  private RawHealthProbe() {}
  public record Observation(Float value,String diagnostic) {
    public Observation {diagnostic=diagnostic.substring(0,Math.min(512,diagnostic.length()));}
  }

  public static final class Reader {
    private final Class<?> entityClass, livingClass, dataClass, accessorClass, itemClass;
    private volatile Layout layout;
    private volatile boolean attempted;
    private String layoutFailure="LAYOUT_UNRESOLVED";

    public Reader(Class<?> entity, Class<?> living, Class<?> data, Class<?> accessor, Class<?> item) {
      entityClass=entity;livingClass=living;dataClass=data;accessorClass=accessor;itemClass=item;
    }

    private synchronized Layout resolve() {
      if(attempted)return layout;
      try {
        if(!entityClass.isAssignableFrom(livingClass)){layoutFailure="ENTITY_HIERARCHY_MISMATCH";return null;}
        layout=new Layout(
            declared(entityClass,dataClass,false,"entityData","f_19804_"),
            declared(livingClass,accessorClass,true,"DATA_HEALTH_ID","f_20961_"),
            declared(dataClass,Map.class,false,"itemsById","f_135345_"),
            declared(accessorClass,int.class,false,"id","f_135010_"),
            declared(itemClass,accessorClass,false,"accessor","f_135390_"),
            declared(itemClass,Object.class,false,"value","f_135391_"));
      } catch(ReflectiveOperationException|RuntimeException|LinkageError unknown) {
        layoutFailure=unknown instanceof LayoutFailure failure?failure.code:"LAYOUT_EXCEPTION:"+typeName(unknown);
        layout=null;
      } finally {attempted=true;}
      return layout;
    }

    public Float read(Object entity) {
      return observe(entity).value();
    }

    /** Match the stored slot IDs without invoking a generated or virtual accessor.
     * Null is an unreadable layout/input, never evidence that a write is harmless. */
    public Boolean matchesHealthSlot(Object candidate) {
      Layout fields=attempted?layout:resolve();
      if(fields==null||!accessorClass.isInstance(candidate))return null;
      try {
        Object health=fields.health.get(null);
        if(!accessorClass.isInstance(health))return null;
        int expected=fields.id.getInt(health),actual=fields.id.getInt(candidate);
        if(expected<0||expected>254||actual<0||actual>254)return null;
        if(fields.health.get(null)!=health)return null;
        return actual==expected;
      } catch(ReflectiveOperationException|RuntimeException|LinkageError unreadable) {
        return null;
      }
    }

    /** Per-call diagnostic travels with its value; client/server threads cannot exchange reasons. */
    public Observation observe(Object entity) {
      if(entity==null||!livingClass.isInstance(entity))return absent("ENTITY_TYPE:"+typeName(entity));
      Layout fields=attempted?layout:resolve();if(fields==null)return absent(layoutFailure);
      String stage="entityData";
      try {
        Object data=fields.data.get(entity);
        if(!dataClass.isInstance(data))return absent("DATA_TYPE:"+typeName(data));
        stage="DATA_HEALTH_ID";Object accessor=fields.health.get(null);
        if(!accessorClass.isInstance(accessor))return absent("ACCESSOR_TYPE:"+typeName(accessor));
        stage="id";
        int id=fields.id.getInt(accessor);
        if(id<0||id>254)return absent("ID_OUT_OF_RANGE");
        stage="itemsById";
        Object rawItems=fields.items.get(data);
        if(!(rawItems instanceof Map<?,?> items))return absent("ITEMS_TYPE:"+typeName(rawItems));
        stage="itemsById.lookup";
        Object item=items.get(Integer.valueOf(id));
        if(item==null)return absent("ITEM_MISSING");
        if(!itemClass.isInstance(item))return absent("ITEM_TYPE:"+typeName(item));
        stage="accessor";
        if(fields.itemAccessor.get(item)!=accessor)return absent("ITEM_ACCESSOR_IDENTITY_MISMATCH");
        stage="value";
        Object value=fields.value.get(item);
        // Preserve zero/negative/NaN values as observed. The caller, not this reader, judges health.
        return value instanceof Float number?new Observation(number,"OK"):absent("VALUE_TYPE:"+typeName(value));
      } catch(ReflectiveOperationException|RuntimeException|LinkageError unreadable) {
        return absent("READ_EXCEPTION:"+stage+":"+typeName(unreadable));
      }
    }
  }

  private record Layout(Field data,Field health,Field items,Field id,Field itemAccessor,Field value) {}
  private static Observation absent(String reason){return new Observation(null,reason);}
  public static String typeName(Object value){return value==null?"null":className(value.getClass());}
  private static String className(Class<?> type){String name=type.getName();return name.substring(0,Math.min(160,name.length()));}
  private static final class LayoutFailure extends ReflectiveOperationException {
    final String code;LayoutFailure(String code){this.code=code;}
  }

  private static Field declared(Class<?> owner,Class<?> expected,boolean isStatic,String... names)
      throws ReflectiveOperationException {
    Field found=null;
    for(String name:names) {
      Field candidate;
      try{candidate=owner.getDeclaredField(name);}catch(NoSuchFieldException absent){continue;}
      catch(RuntimeException|LinkageError denied){throw new LayoutFailure("FIELD_LOOKUP:"+className(owner)+"#"+name+":"+typeName(denied));}
      boolean typeMatches=expected==Map.class?Map.class.isAssignableFrom(candidate.getType()):candidate.getType()==expected;
      String label=className(owner)+"#"+name;
      if(found!=null)throw new LayoutFailure("FIELD_AMBIGUOUS:"+label);
      if(candidate.getDeclaringClass()!=owner)throw new LayoutFailure("FIELD_OWNER:"+label);
      if(!typeMatches)throw new LayoutFailure("FIELD_TYPE:"+label+":"+className(candidate.getType()));
      if(Modifier.isStatic(candidate.getModifiers())!=isStatic)throw new LayoutFailure("FIELD_STATICNESS:"+label);
      try{if(!candidate.trySetAccessible())throw new LayoutFailure("FIELD_ACCESS_DENIED:"+label);}
      catch(RuntimeException|LinkageError denied){throw new LayoutFailure("FIELD_ACCESS:"+label+":"+typeName(denied));}
      found=candidate;
    }
    if(found==null)throw new LayoutFailure("FIELD_MISSING:"+className(owner)+"#"+names[0]+"/"+names[1]);
    return found;
  }
}
