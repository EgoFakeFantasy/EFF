#ifndef EFF_INSTRUMENTATION_ABI_H
#define EFF_INSTRUMENTATION_ABI_H
#include <jni.h>
#include <jvmti.h>
#include <atomic>
#include <cstdarg>
#include <cstdio>
#include <cstring>
#include <string>

// Compatibility for a JNI caller that resolves the modern transform descriptor
// but supplies the five legacy reference arguments. No specimen names, modified
// method bodies, transformer suppression, or recovered/corrupt trailing slots.
namespace eff_instrumentation_abi {
static jniNativeInterface* previous=nullptr;
static jvmtiEnv* tooling=nullptr;
static jclass instrumentClass=nullptr,managerClass=nullptr,loaderClass=nullptr,
    stringClass=nullptr,classClass=nullptr,domainClass=nullptr,bytesClass=nullptr,moduleClass=nullptr,errorClass=nullptr;
static jmethodID transformMethod=nullptr;
static jfieldID ordinaryField=nullptr,capableField=nullptr,transformersField=nullptr;
static std::atomic<int> state{0};
static std::atomic<unsigned long long> repairs{0},refusals{0};
static std::atomic<unsigned long long> emptyManagers{0};
static const char* descriptor="(Ljava/lang/Module;Ljava/lang/ClassLoader;Ljava/lang/String;Ljava/lang/Class;Ljava/security/ProtectionDomain;[BZ)[B";

static void fail(JNIEnv* env,const char* reason){
    refusals.fetch_add(1);
    std::fprintf(stderr,"[EFF-INSTRUMENTATION-ABI] refused=%s\n",reason);
    if(!env->ExceptionCheck()&&errorClass)env->ThrowNew(errorClass,reason);
}
static bool optionalInstance(JNIEnv* env,jobject object,jclass type){
    return !object||env->IsInstanceOf(object,type)==JNI_TRUE;
}
static int managerSize(JNIEnv* env,jobject manager){
    if(!manager)return 0;
    if(!env->IsInstanceOf(manager,managerClass))return -1;
    if(env->MonitorEnter(manager)!=JNI_OK)return -1;
    jobjectArray entries=static_cast<jobjectArray>(env->GetObjectField(manager,transformersField));
    int count=entries&&!env->ExceptionCheck()?env->GetArrayLength(entries):-1;
    if(entries)env->DeleteLocalRef(entries);
    if(env->MonitorExit(manager)!=JNI_OK)return -1;
    return count;
}
// -1 means error, 0 means no transformer exists, 1 means a unique active manager.
static int selectManager(JNIEnv* env,jobject receiver,jboolean& selected){
    // InstrumentationImpl registration locks receiver before manager. Keep that
    // order, and release both locks before dispatching user transformer code.
    if(env->MonitorEnter(receiver)!=JNI_OK)return -1;
    jobject ordinary=env->GetObjectField(receiver,ordinaryField);
    jobject capable=env->ExceptionCheck()?nullptr:env->GetObjectField(receiver,capableField);
    int a=env->ExceptionCheck()?-1:managerSize(env,ordinary);
    int b=env->ExceptionCheck()?-1:managerSize(env,capable);
    if(ordinary)env->DeleteLocalRef(ordinary);
    if(capable)env->DeleteLocalRef(capable);
    if(env->MonitorExit(receiver)!=JNI_OK)return -1;
    if(env->ExceptionCheck())return -1;
    if(a>0&&b==0){selected=JNI_FALSE;return 1;}
    if(b>0&&a==0){selected=JNI_TRUE;return 1;}
    if(a==0&&b==0){emptyManagers.fetch_add(1);return 0;}
    fail(env,a>0&&b>0?"INSTRUMENTATION_ABI_AMBIGUOUS_MANAGERS":
        "INSTRUMENTATION_ABI_MANAGER_SHAPE");
    return -1;
}
static jobject JNICALL callObjectMethodV(JNIEnv* env,jobject receiver,jmethodID method,va_list incoming){
    if(method!=transformMethod||!receiver||env->ExceptionCheck()||
       !env->IsInstanceOf(receiver,instrumentClass))
        return previous->CallObjectMethodV(env,receiver,method,incoming);
    va_list probe;va_copy(probe,incoming);
    jobject values[5];for(auto& value:values)value=va_arg(probe,jobject);
    va_end(probe);
    bool legacy=optionalInstance(env,values[0],loaderClass)&&optionalInstance(env,values[1],stringClass)&&
        optionalInstance(env,values[2],classClass)&&optionalInstance(env,values[3],domainClass)&&
        values[4]&&env->IsInstanceOf(values[4],bytesClass);
    if(!legacy){
        bool modern=optionalInstance(env,values[0],moduleClass)&&optionalInstance(env,values[1],loaderClass)&&
            optionalInstance(env,values[2],stringClass)&&optionalInstance(env,values[3],classClass)&&
            optionalInstance(env,values[4],domainClass);
        if(modern)return previous->CallObjectMethodV(env,receiver,method,incoming);
        fail(env,"INSTRUMENTATION_ABI_ARGUMENT_SHAPE");return nullptr;
    }
    jboolean selected=JNI_FALSE;
    if(selectManager(env,receiver,selected)!=1)return nullptr;
    jobject module=nullptr;
    // Match JPLIS: named-module lookup for initial definitions. For redefinitions
    // leave module null so InstrumentationImpl derives it from the actual Class.
    if(!values[2]&&values[1]){
        const char* name=env->GetStringUTFChars(static_cast<jstring>(values[1]),nullptr);
        if(!name)return nullptr;
        jvmtiError status=JVMTI_ERROR_INTERNAL;
        try {
            std::string package(name);auto slash=package.rfind('/');
            if(slash==std::string::npos)package.clear();else package.resize(slash);
            status=tooling->GetNamedModule(values[0],package.c_str(),&module);
        }catch(...){
            env->ReleaseStringUTFChars(static_cast<jstring>(values[1]),name);
            fail(env,"INSTRUMENTATION_ABI_MODULE_ALLOCATION");return nullptr;
        }
        env->ReleaseStringUTFChars(static_cast<jstring>(values[1]),name);
        if(status!=JVMTI_ERROR_NONE){fail(env,"INSTRUMENTATION_ABI_MODULE_LOOKUP");return nullptr;}
    }
    jvalue args[7]{};args[0].l=module;
    for(int i=0;i<5;i++)args[i+1].l=values[i];args[6].z=selected;
    auto number=repairs.fetch_add(1)+1;
    if(number<=8)std::fprintf(stderr,"[EFF-INSTRUMENTATION-ABI] adapted=%llu manager=%s referencesPreserved=true\n",number,selected?"capable":"ordinary");
    jobject result=previous->CallObjectMethodA(env,receiver,method,args);
    if(module)env->DeleteLocalRef(module);
    return result;
}
static jclass globalClass(JNIEnv* env,const char* name){
    jclass local=env->FindClass(name);if(!local)return nullptr;
    jclass global=static_cast<jclass>(env->NewGlobalRef(local));env->DeleteLocalRef(local);return global;
}
// Call once, in start/live phase and outside a JVMTI callback. Returns false with
// pending Java exception when setup is incomplete; do not start a test in that state.
static bool install(JNIEnv* env,jvmtiEnv* vm){
    int expected=0;if(!state.compare_exchange_strong(expected,1)){
        if(state.load()==2)return true;fail(env,"INSTRUMENTATION_ABI_INSTALL_STATE");return false;
    }
    tooling=vm;
    errorClass=globalClass(env,"java/lang/IllegalStateException");
    if(!tooling||!errorClass){state.store(3);return false;}
    instrumentClass=globalClass(env,"sun/instrument/InstrumentationImpl");
    managerClass=globalClass(env,"sun/instrument/TransformerManager");
    loaderClass=globalClass(env,"java/lang/ClassLoader");stringClass=globalClass(env,"java/lang/String");
    classClass=globalClass(env,"java/lang/Class");domainClass=globalClass(env,"java/security/ProtectionDomain");
    bytesClass=globalClass(env,"[B");moduleClass=globalClass(env,"java/lang/Module");
    if(env->ExceptionCheck()||!instrumentClass||!managerClass||!loaderClass||!stringClass||!classClass||!domainClass||!bytesClass||!moduleClass){state.store(3);return false;}
    transformMethod=env->GetMethodID(instrumentClass,"transform",descriptor);
    ordinaryField=env->GetFieldID(instrumentClass,"mTransformerManager","Lsun/instrument/TransformerManager;");
    capableField=env->GetFieldID(instrumentClass,"mRetransfomableTransformerManager","Lsun/instrument/TransformerManager;");
    transformersField=env->GetFieldID(managerClass,"mTransformerList","[Lsun/instrument/TransformerManager$TransformerInfo;");
    if(env->ExceptionCheck()||!transformMethod||!ordinaryField||!capableField||!transformersField){state.store(3);return false;}
    jniNativeInterface* replacement=nullptr;
    auto status=tooling->GetJNIFunctionTable(&previous);
    if(status==JVMTI_ERROR_NONE)status=tooling->GetJNIFunctionTable(&replacement);
    if(status!=JVMTI_ERROR_NONE||!previous||!replacement){state.store(3);fail(env,"INSTRUMENTATION_ABI_GET_TABLE");return false;}
    replacement->CallObjectMethodV=callObjectMethodV;
    status=tooling->SetJNIFunctionTable(replacement);
    tooling->Deallocate(reinterpret_cast<unsigned char*>(replacement));
    if(status!=JVMTI_ERROR_NONE){state.store(3);fail(env,"INSTRUMENTATION_ABI_SET_TABLE");return false;}
    state.store(2);
    std::fprintf(stderr,"[EFF-INSTRUMENTATION-ABI] installed modernDescriptor=true selector=unique-nonempty-manager\n");
    return true;
}
}
#endif
