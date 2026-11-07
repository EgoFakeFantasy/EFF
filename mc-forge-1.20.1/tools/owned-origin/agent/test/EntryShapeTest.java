import java.lang.reflect.Method;
import java.security.ProtectionDomain;

/** Pure Java malformed-caller fixtures. No native invocation or game attack. */
public final class EntryShapeTest {
    public static void main(String[] args) throws Exception {
        Class<?> boundary=Class.forName("eff.ownedboot.OwnedBoundary",false,null);
        Method enter=boundary.getMethod("enter",Object.class,Object.class,Object.class,Object.class);
        Method finish=boundary.getMethod("finish",Object.class,byte[].class);
        ClassLoader loader=EntryShapeTest.class.getClassLoader();
        ProtectionDomain domain=EntryShapeTest.class.getProtectionDomain();
        Object[][] invalid={
            {domain,"eff/minecraft/EffProjection",EntryShapeTest.class,domain},
            {new byte[0],loader,EntryShapeTest.class,null},
            {new byte[0],"not-a-loader","fixture/Unknown",null},
            {new Object(),loader,"fixture/Unknown",null},
            {new byte[0],loader,"fixture/Unknown","not-a-class"}
        };
        for(int round=0;round<12000;round++){
            Object[] tuple=invalid[round%invalid.length];
            Object token=enter.invoke(null,tuple);
            if(token==null)throw new AssertionError("MALFORMED_ENTRY_SILENTLY_SKIPPED");
            byte[] result=(byte[])finish.invoke(null,token,new byte[]{1,2,3});
            if(result.length!=4 || result[0]!=0 || result[1]!=0 || result[2]!=0 || result[3]!=0)
                throw new AssertionError("MALFORMED_ENTRY_DID_NOT_REJECT_CLASS_BYTES");
        }
        if(enter.invoke(null,new byte[0],loader,"fixture/Unknown",null)!=null)
            throw new AssertionError("ORDINARY_FOREIGN_CLASS_CHANGED");
        System.out.println("ENTRY_SHAPE_TEST_OK malformed=12000 invalidBytes=true ordinaryForeignUnchanged=true nativeCallerNotSimulated=true");
    }
}
