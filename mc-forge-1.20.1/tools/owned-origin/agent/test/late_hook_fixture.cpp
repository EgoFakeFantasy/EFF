#include <jni.h>
#include <jvmti.h>
#include <vector>
#include <cstring>
// Test-only late native callback. Receives one explicit synthetic-test target, no discovery or host access.
static jvmtiEnv* hook_env=nullptr;
static jclass hook_target=nullptr;
static std::vector<unsigned char> replacement;
static void JNICALL on_class(jvmtiEnv* ti,JNIEnv* env,jclass redefining,jobject,const char*,jobject,jint,const unsigned char*,jint* length,unsigned char** output){
    if(!redefining||!hook_target||!env->IsSameObject(redefining,hook_target))return;
    unsigned char* data=nullptr;if(ti->Allocate(static_cast<jlong>(replacement.size()),&data)!=JVMTI_ERROR_NONE)return;
    std::memcpy(data,replacement.data(),replacement.size());*length=static_cast<jint>(replacement.size());*output=data;
}
extern "C" JNIEXPORT jint JNICALL Java_proof_SyntheticNativeTail_install(JNIEnv* env,jclass,jclass target,jbyteArray bytes){
    if(hook_env)return -1;JavaVM* vm=nullptr;if(env->GetJavaVM(&vm)!=JNI_OK)return -2;
    jvmtiEnv* ti=nullptr;if(vm->GetEnv(reinterpret_cast<void**>(&ti),JVMTI_VERSION_1_2)!=JNI_OK)return -3;
    jvmtiCapabilities caps{};caps.can_retransform_classes=1;caps.can_generate_all_class_hook_events=1;
    auto err=ti->AddCapabilities(&caps);if(err!=JVMTI_ERROR_NONE){ti->DisposeEnvironment();return err;}
    replacement.resize(env->GetArrayLength(bytes));env->GetByteArrayRegion(bytes,0,static_cast<jsize>(replacement.size()),reinterpret_cast<jbyte*>(replacement.data()));
    hook_target=static_cast<jclass>(env->NewGlobalRef(target));jvmtiEventCallbacks callbacks{};callbacks.ClassFileLoadHook=&on_class;
    err=ti->SetEventCallbacks(&callbacks,sizeof(callbacks));if(err==JVMTI_ERROR_NONE)err=ti->SetEventNotificationMode(JVMTI_ENABLE,JVMTI_EVENT_CLASS_FILE_LOAD_HOOK,nullptr);
    if(err!=JVMTI_ERROR_NONE){env->DeleteGlobalRef(hook_target);hook_target=nullptr;ti->DisposeEnvironment();return err;}
    hook_env=ti;return 0;
}
extern "C" JNIEXPORT jint JNICALL Java_proof_SyntheticNativeTail_uninstall(JNIEnv* env,jclass){
    if(!hook_env)return -1;auto err=hook_env->SetEventNotificationMode(JVMTI_DISABLE,JVMTI_EVENT_CLASS_FILE_LOAD_HOOK,nullptr);
    hook_env->DisposeEnvironment();hook_env=nullptr;env->DeleteGlobalRef(hook_target);hook_target=nullptr;replacement.clear();return err;
}
