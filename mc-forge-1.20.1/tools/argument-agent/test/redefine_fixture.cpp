#include <jni.h>
#include <jvmti.h>
// Synthetic fixture only: no target discovery, process access or opponent code.
extern "C" JNIEXPORT jint JNICALL Java_proof_SyntheticNativeRedefiner_redefine(JNIEnv* env,jclass,jclass target,jbyteArray bytes) {
  JavaVM* vm=nullptr; if(env->GetJavaVM(&vm)!=JNI_OK)return -1;
  jvmtiEnv* ti=nullptr;if(vm->GetEnv(reinterpret_cast<void**>(&ti),JVMTI_VERSION_1_2)!=JNI_OK)return -2;
  jvmtiCapabilities caps{};caps.can_redefine_classes=1;
  auto error=ti->AddCapabilities(&caps);if(error!=JVMTI_ERROR_NONE){ti->DisposeEnvironment();return error;}
  jbyte* data=env->GetByteArrayElements(bytes,nullptr);if(!data){ti->DisposeEnvironment();return -3;}
  jvmtiClassDefinition definition{target,env->GetArrayLength(bytes),reinterpret_cast<unsigned char*>(data)};
  error=ti->RedefineClasses(1,&definition);env->ReleaseByteArrayElements(bytes,data,JNI_ABORT);ti->DisposeEnvironment();return error;
}
