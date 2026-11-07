import java.lang.instrument.ClassFileTransformer;
import java.security.ProtectionDomain;
import java.util.Arrays;

public final class AbiFixture {
    static native void install();
    static native Object receiver(ClassFileTransformer ordinary,ClassFileTransformer capable);
    static native byte[] call(Object receiver,Module module,ClassLoader loader,String name,Class<?> redefining,ProtectionDomain domain,byte[] bytes,boolean capable,boolean legacy);
    static native String unrelated(Object value);
    static native long repairs();
    static native long emptyManagers();
    static native Object malformed(Object target,String value);
    static int checks;
    static void check(boolean value,String why){if(!value)throw new AssertionError(why);checks++;}
    static final class Recorder implements ClassFileTransformer {
        int calls;Module module;ClassLoader loader;String name;Class<?> redefining;ProtectionDomain domain;byte[] input;
        boolean throwsException;
        public byte[] transform(Module m,ClassLoader l,String n,Class<?> r,ProtectionDomain p,byte[] b){
            calls++;module=m;loader=l;name=n;redefining=r;domain=p;input=b;
            if(throwsException)throw new IllegalArgumentException("FIXTURE_TRANSFORMER_EXCEPTION");
            return new byte[]{1,3,5};
        }
    }
    static void rejected(Object target,ClassLoader loader,ProtectionDomain domain,byte[] input,String code){
        try{call(target,null,loader,"fixture/Input",null,domain,input,false,true);throw new AssertionError("expected "+code);}
        catch(IllegalStateException error){check(error.getMessage().equals(code),"exact refusal: "+error);}
    }
    public static void main(String[] args)throws Exception{
        System.load(args[0]);install();
        ClassLoader loader=AbiFixture.class.getClassLoader();ProtectionDomain domain=AbiFixture.class.getProtectionDomain();
        byte[] input={6,7,8};Recorder r=new Recorder();Object target=receiver(null,r);
        byte[] out=call(target,AbiFixture.class.getModule(),loader,"fixture/Input",null,domain,input,true,false);
        check(Arrays.equals(out,new byte[]{1,3,5})&&r.calls==1,"normal seven callback executed");
        check(r.module==AbiFixture.class.getModule()&&r.loader==loader&&r.name.equals("fixture/Input")&&r.redefining==null&&r.domain==domain&&r.input==input,"normal seven references unchanged");
        check(repairs()==0,"normal seven never adapted");
        out=call(target,null,loader,"fixture/Input",null,domain,input,false,true);
        check(Arrays.equals(out,new byte[]{1,3,5})&&r.calls==2,"legacy callback executed");
        check(r.module==AbiFixture.class.getModule()&&r.loader==loader&&r.domain==domain&&r.input==input&&r.redefining==null,"legacy refs and unnamed module");
        check(repairs()==1,"legacy adapted exactly once");
        call(target,null,null,"java/lang/GeneratedFixture",null,null,input,false,true);
        check(r.loader==null&&r.domain==null&&r.module==Object.class.getModule(),"bootstrap named module lookup");
        call(target,null,loader,"fixture/Input",AbiFixture.class,domain,input,false,true);
        check(r.redefining==AbiFixture.class&&r.module==AbiFixture.class.getModule(),"redefined module derived by original implementation");
        call(target,null,null,null,null,null,input,false,true);
        check(r.loader==null&&r.name==null&&r.module!=null&&!r.module.isNamed(),"null-name bootstrap unnamed module");
        Recorder ordinary=new Recorder();Object ordinaryTarget=receiver(ordinary,null);
        call(ordinaryTarget,null,loader,"fixture/Input",null,domain,input,true,true);
        check(ordinary.calls==1,"ordinary-only selector false");
        Recorder left=new Recorder(),right=new Recorder();Object both=receiver(left,right);
        long unchanged=repairs();
        call(both,null,loader,"fixture/Input",null,domain,input,false,false);
        check(left.module==loader.getUnnamedModule(),"normal null module uses original unnamed-module fallback");
        call(both,AbiFixture.class.getModule(),loader,"fixture/Input",null,domain,input,true,false);
        check(left.calls==1&&right.calls==1&&repairs()==unchanged,"normal seven keeps explicit selector with both managers");
        rejected(both,loader,domain,input,"INSTRUMENTATION_ABI_AMBIGUOUS_MANAGERS");
        check(call(receiver(null,null),null,loader,"fixture/Input",null,domain,input,false,true)==null&&emptyManagers()==1,"empty managers return null without error or callback");
        try{malformed(target,"bad-shape");throw new AssertionError("shape accepted");}
        catch(IllegalStateException error){check(error.getMessage().equals("INSTRUMENTATION_ABI_ARGUMENT_SHAPE"),"unknown five-reference shape rejected without trailing reads");}
        r.throwsException=true;int before=r.calls;
        check(call(target,null,loader,"fixture/Input",null,domain,input,true,true)==null&&r.calls==before+1,"legacy transformer exception retains manager suppression semantics");
        check(call(target,AbiFixture.class.getModule(),loader,"fixture/Input",null,domain,input,true,false)==null&&r.calls==before+2,"normal exception semantics unchanged");
        check(unrelated(Integer.valueOf(61)).equals("61"),"unrelated JNI CallObjectMethodV unchanged");
        r.throwsException=false;Throwable[] failure={null};before=r.calls;int expectedCalls=before+1;
        Thread newEnvironment=new Thread(()->{try{call(target,null,loader,"fixture/ThreadInput",null,domain,input,false,true);}catch(Throwable t){failure[0]=t;}},"new-jni-environment");
        newEnvironment.start();newEnvironment.join();
        check(failure[0]==null&&r.calls==expectedCalls&&r.name.equals("fixture/ThreadInput"),"new thread JNI environment uses installed table");
        System.out.println("ABI_FIXTURE_PASS checks="+checks+" adapted="+repairs()+" originalCallbacks=true noSpecimen=true");
    }
}
