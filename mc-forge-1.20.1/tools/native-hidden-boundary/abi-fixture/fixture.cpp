#include "../native/instrumentation-abi.h"
namespace abi=eff_instrumentation_abi;
extern "C" JNIEXPORT void JNICALL Java_AbiFixture_install(JNIEnv* env,jclass){
    JavaVM* vm=nullptr;jvmtiEnv* tooling=nullptr;
    if(env->GetJavaVM(&vm)!=JNI_OK||vm->GetEnv(reinterpret_cast<void**>(&tooling),JVMTI_VERSION_1_2)!=JNI_OK)return;
    abi::install(env,tooling);
}
extern "C" JNIEXPORT jobject JNICALL Java_AbiFixture_receiver(JNIEnv* env,jclass,jobject ordinary,jobject capable){
    auto constructor=env->GetMethodID(abi::instrumentClass,"<init>","(JZZ)V");
    jobject receiver=env->NewObject(abi::instrumentClass,constructor,static_cast<jlong>(0),JNI_FALSE,JNI_FALSE);
    auto managerConstructor=env->GetMethodID(abi::managerClass,"<init>","(Z)V");
    auto add=env->GetMethodID(abi::managerClass,"addTransformer","(Ljava/lang/instrument/ClassFileTransformer;)V");
    if(ordinary){jobject manager=env->GetObjectField(receiver,abi::ordinaryField);env->CallVoidMethod(manager,add,ordinary);env->DeleteLocalRef(manager);}
    if(capable){jobject manager=env->NewObject(abi::managerClass,managerConstructor,JNI_TRUE);env->CallVoidMethod(manager,add,capable);env->SetObjectField(receiver,abi::capableField,manager);env->DeleteLocalRef(manager);}
    return receiver;
}
extern "C" JNIEXPORT jobject JNICALL Java_AbiFixture_call(JNIEnv* env,jclass,jobject receiver,jobject module,jobject loader,jstring name,jclass redefining,jobject domain,jbyteArray bytes,jboolean capable,jboolean legacy){
    // Deliberately reproduce only the public ABI mismatch with our own receiver
    // and callbacks. No sample code, game, attack logic, or native module loaded.
    if(legacy)return env->CallObjectMethod(receiver,abi::transformMethod,loader,name,redefining,domain,bytes);
    return env->CallObjectMethod(receiver,abi::transformMethod,module,loader,name,redefining,domain,bytes,capable);
}
extern "C" JNIEXPORT jstring JNICALL Java_AbiFixture_unrelated(JNIEnv* env,jclass,jobject value){
    auto cls=env->GetObjectClass(value);auto method=env->GetMethodID(cls,"toString","()Ljava/lang/String;");
    auto result=static_cast<jstring>(env->CallObjectMethod(value,method));env->DeleteLocalRef(cls);return result;
}
extern "C" JNIEXPORT jlong JNICALL Java_AbiFixture_repairs(JNIEnv*,jclass){return abi::repairs.load();}
extern "C" JNIEXPORT jlong JNICALL Java_AbiFixture_emptyManagers(JNIEnv*,jclass){return abi::emptyManagers.load();}
extern "C" JNIEXPORT jobject JNICALL Java_AbiFixture_malformed(JNIEnv* env,jclass,jobject receiver,jstring value){
    return env->CallObjectMethod(receiver,abi::transformMethod,value,value,value,value,value);
}
