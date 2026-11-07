#include <windows.h>
#include <jni.h>
#include <vector>
#include <new>
using LookupDefine = jclass (JNICALL *)(JNIEnv*,jclass,const char*,const jbyte*,jsize,jobject,jboolean,int,jobject);
static void fail(JNIEnv* env,const char* message){jclass cls=env->FindClass("java/lang/IllegalStateException");if(cls)env->ThrowNew(cls,message);}
// A separate caller DLL, with no dependence on the hook/trampoline/provider.
extern "C" JNIEXPORT jclass JNICALL Java_eff_hiddenfixture_NativeBoundary_define(JNIEnv* env,jclass,jclass lookup,jbyteArray bytes,jobject pd,jboolean initialize,jint flags,jobject data) {
  try {
    if(!bytes){fail(env,"TEST_BYTES_NULL");return nullptr;}
    jsize length=env->GetArrayLength(bytes);std::vector<jbyte> input(length);env->GetByteArrayRegion(bytes,0,length,input.data());if(env->ExceptionCheck())return nullptr;
    LookupDefine target=(LookupDefine)GetProcAddress(GetModuleHandleW(L"jvm.dll"),"JVM_LookupDefineClass");
    if(!target){fail(env,"TEST_EXPORT_MISSING");return nullptr;}
    return target(env,lookup,nullptr,input.data(),length,pd,initialize,flags,data);
  } catch(const std::bad_alloc&) {fail(env,"TEST_NATIVE_ALLOCATION");return nullptr;}
    catch(...) {fail(env,"TEST_NATIVE_EXCEPTION");return nullptr;}
}
