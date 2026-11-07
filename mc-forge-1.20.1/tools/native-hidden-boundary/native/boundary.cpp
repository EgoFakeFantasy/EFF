#include <windows.h>
#include <bcrypt.h>
#include <jni.h>
#include <jvmti.h>
#include <atomic>
#include <vector>
#include <cstring>
#include <cstdio>
#include <new>
#include <string>
#include "MinHook.h"
#include "pins.h"
#include "instrumentation-abi.h"

// Exact OpenJDK 17 jvm.h ABI. The trampoline receives every argument unchanged
// except buf/len when the registered structural bytecode provider returns a change.
using LookupDefine = jclass (JNICALL *)(JNIEnv*,jclass,const char*,const jbyte*,jsize,jobject,jboolean,int,jobject);
static LookupDefine original=nullptr;
static void* entry=nullptr;
static jclass provider=nullptr;
static jmethodID apply=nullptr;
static thread_local bool transforming=false;
static std::atomic<long long> calls{0},changes{0},active{0};
static std::atomic<int> installState{0}; // fresh, installing, installed, failed; never reset
// Read-only diagnostics: a method descriptor alone cannot establish that the
// live method body still uses the same argument slots. Never repair VM metadata.
static jvmtiEnv* auditVm=nullptr;
static jclass auditManager=nullptr,auditInstrumentation=nullptr;
static std::atomic<int> auditCount{0};
static std::atomic<int> tickAuditCount{0};
static jvmtiError poolCapability=JVMTI_ERROR_NOT_AVAILABLE;
struct AuditAllocation {
  unsigned char* value=nullptr;
  ~AuditAllocation(){if(value&&auditVm)auditVm->Deallocate(value);}
};
static std::string auditHex(const unsigned char* bytes,jint length){
  static const char digits[]="0123456789abcdef";
  std::string out;out.reserve(static_cast<size_t>(length)*2);
  for(jint i=0;i<length;i++){out+=digits[bytes[i]>>4];out+=digits[bytes[i]&15];}
  return out;
}
// Fixed diagnostic surface. No lookup, invocation, redefinition, suspension or
// writes to the inspected class. A live bytecode snapshot is not an execution trace.
static std::string tickSnapshot(jclass cls){
  if(!auditVm)return "{\"readOnly\":true,\"error\":\"JVMTI_UNAVAILABLE\"}";
  if(!cls)return "{\"readOnly\":true,\"error\":\"NULL_CLASS\"}";
  AuditAllocation signature;
  auto se=auditVm->GetClassSignature(cls,reinterpret_cast<char**>(&signature.value),nullptr);
  if(se!=JVMTI_ERROR_NONE)return "{\"readOnly\":true,\"signatureError\":"+std::to_string(se)+"}";
  const char* name=reinterpret_cast<char*>(signature.value);
  bool connection=std::strcmp(name,"Lnet/minecraft/server/network/ServerGamePacketListenerImpl;")==0;
  bool player=std::strcmp(name,"Lnet/minecraft/server/level/ServerPlayer;")==0;
  bool local=std::strcmp(name,"Lnet/minecraft/client/player/LocalPlayer;")==0;
  bool world=std::strcmp(name,"Lnet/minecraft/server/level/ServerLevel;")==0;
  if(!connection&&!player&&!local&&!world)return "{\"readOnly\":true,\"error\":\"CLASS_NOT_ADMITTED\"}";
  std::string out="{\"readOnly\":true,\"executionProven\":false,\"classSignature\":\""+std::string(name)+"\",\"methods\":[";
  AuditAllocation methods;
  jint count=0;auto ce=auditVm->GetClassMethods(cls,&count,reinterpret_cast<jmethodID**>(&methods.value));
  bool first=true;
  if(ce==JVMTI_ERROR_NONE&&count>=0&&count<=4096){
    auto ids=reinterpret_cast<jmethodID*>(methods.value);
    for(jint i=0;i<count;i++){
      AuditAllocation methodName,descriptor;
      auto ne=auditVm->GetMethodName(ids[i],reinterpret_cast<char**>(&methodName.value),reinterpret_cast<char**>(&descriptor.value),nullptr);
      if(ne!=JVMTI_ERROR_NONE)continue;
      const char* method=reinterpret_cast<char*>(methodName.value);
      const char* desc=reinterpret_cast<char*>(descriptor.value);
      bool selected=world?
        ((std::strcmp(method,"m_8647_")==0&&std::strcmp(desc,"(Lnet/minecraft/world/entity/Entity;)V")==0)||
         (std::strcmp(method,"m_184063_")==0&&std::strcmp(desc,"(Lnet/minecraft/util/profiling/ProfilerFiller;Lnet/minecraft/world/entity/Entity;)V")==0)):
        (std::strcmp(desc,"()V")==0&&(connection?std::strcmp(method,"m_9933_")==0:
          (std::strcmp(method,"m_8119_")==0||(player&&std::strcmp(method,"m_9240_")==0))));
      if(!selected)continue;
      jint length=0,modifiers=0;AuditAllocation bytecode;
      auto be=auditVm->GetBytecodes(ids[i],&length,&bytecode.value);
      auto me=auditVm->GetMethodModifiers(ids[i],&modifiers);
      jboolean obsolete=JNI_FALSE;auto oe=auditVm->IsMethodObsolete(ids[i],&obsolete);
      if(!first)out+=",";first=false;
      out+="{\"name\":\""+std::string(method)+"\",\"descriptor\":\""+std::string(desc)+"\",\"bytecodeError\":"+std::to_string(be)+
        ",\"length\":"+std::to_string(length)+",\"modifiers\":"+std::to_string(modifiers)+",\"modifiersError\":"+std::to_string(me)+
        ",\"obsolete\":"+(obsolete?std::string("true"):std::string("false"))+",\"obsoleteError\":"+std::to_string(oe);
      if(be==JVMTI_ERROR_NONE&&length>=0&&length<=65535)out+=",\"bytecodeHex\":\""+auditHex(bytecode.value,length)+"\"";
      else out+=",\"bytecodeOmitted\":true";
      out+="}";
    }
  }
  out+="],\"methodsError\":"+std::to_string(ce)+",\"poolCapabilityError\":"+std::to_string(poolCapability);
  if(poolCapability==JVMTI_ERROR_NONE){
    jint entries=0,length=0;AuditAllocation pool;
    auto pe=auditVm->GetConstantPool(cls,&entries,&length,&pool.value);
    out+=",\"poolError\":"+std::to_string(pe)+",\"poolEntries\":"+std::to_string(entries)+",\"poolLength\":"+std::to_string(length);
    if(pe==JVMTI_ERROR_NONE&&length>=0&&length<=524288)out+=",\"poolHex\":\""+auditHex(pool.value,length)+"\"";
    else out+=",\"poolOmitted\":true";
  }
  return out+"}";
}
static void auditClass(jclass cls,const char* label){
  if(!auditVm||!cls)return;
  jint count=0;jmethodID* methods=nullptr;
  jvmtiError status=auditVm->GetClassMethods(cls,&count,&methods);
  if(status!=JVMTI_ERROR_NONE){std::fprintf(stderr,"[EFF-METHOD-AUDIT] class=%s error=%d\n",label,status);return;}
  for(jint i=0;i<count&&i<256;i++){
    char* name=nullptr;char* desc=nullptr;char* generic=nullptr;
    if(auditVm->GetMethodName(methods[i],&name,&desc,&generic)!=JVMTI_ERROR_NONE)continue;
    if(name&&std::strcmp(name,"transform")==0){
      jint modifiers=0,args=0,locals=0,length=0;unsigned char* bytes=nullptr;
      auto me=auditVm->GetMethodModifiers(methods[i],&modifiers);
      auto ae=auditVm->GetArgumentsSize(methods[i],&args);
      auto le=auditVm->GetMaxLocals(methods[i],&locals);
      auto be=auditVm->GetBytecodes(methods[i],&length,&bytes);
      unsigned long long fingerprint=14695981039346656037ULL;
      if(be==JVMTI_ERROR_NONE&&length>=0&&length<=1048576)for(jint j=0;j<length;j++){fingerprint^=bytes[j];fingerprint*=1099511628211ULL;}
      std::fprintf(stderr,"[EFF-METHOD-AUDIT] class=%s method=%s desc=%s modifiers=%d/%d args=%d/%d locals=%d/%d bytes=%d/%d fnv64=%016llx prefix=",label,name,desc?desc:"?",modifiers,me,args,ae,locals,le,length,be,fingerprint);
      if(be==JVMTI_ERROR_NONE)for(jint j=0;j<length&&j<48;j++)std::fprintf(stderr,"%02x",bytes[j]);
      std::fprintf(stderr,"\n");
      if(bytes)auditVm->Deallocate(bytes);
    }
    if(name)auditVm->Deallocate(reinterpret_cast<unsigned char*>(name));
    if(desc)auditVm->Deallocate(reinterpret_cast<unsigned char*>(desc));
    if(generic)auditVm->Deallocate(reinterpret_cast<unsigned char*>(generic));
  }
  if(methods)auditVm->Deallocate(reinterpret_cast<unsigned char*>(methods));
  std::fflush(stderr);
}
static void prepareAudit(JNIEnv* env){
  JavaVM* vm=nullptr;if(env->GetJavaVM(&vm)!=JNI_OK)return;
  if(vm->GetEnv(reinterpret_cast<void**>(&auditVm),JVMTI_VERSION_1_2)!=JNI_OK){auditVm=nullptr;return;}
  jvmtiCapabilities caps{};caps.can_get_bytecodes=1;
  auto status=auditVm->AddCapabilities(&caps);
  jvmtiCapabilities poolCaps{};poolCaps.can_get_constant_pool=1;
  poolCapability=auditVm->AddCapabilities(&poolCaps);
  std::fprintf(stderr,"[EFF-METHOD-AUDIT] capability=%d readOnly=true\n",status);
  jclass manager=env->FindClass("sun/instrument/TransformerManager");
  if(manager){auditManager=static_cast<jclass>(env->NewGlobalRef(manager));env->DeleteLocalRef(manager);}
  if(env->ExceptionCheck())return;
  jclass instrumentation=env->FindClass("sun/instrument/InstrumentationImpl");
  if(instrumentation){auditInstrumentation=static_cast<jclass>(env->NewGlobalRef(instrumentation));env->DeleteLocalRef(instrumentation);}
}
struct ActiveCall {ActiveCall(){active.fetch_add(1);}~ActiveCall(){transforming=false;active.fetch_sub(1);}};
struct InstallAttempt {~InstallAttempt(){if(installState.load()==1)installState.store(3);}};
struct LocalRef {JNIEnv* env;jobject value;LocalRef(JNIEnv* e,jobject v):env(e),value(v){}~LocalRef(){if(value)env->DeleteLocalRef(value);}};

static void fail(JNIEnv* env,const char* message){if(env->ExceptionCheck())return;jclass cls=env->FindClass("java/lang/IllegalStateException");if(cls){env->ThrowNew(cls,message);env->DeleteLocalRef(cls);}}
static bool fileHash(HMODULE module) {
  wchar_t path[32768];DWORD n=GetModuleFileNameW(module,path,32768);if(n==0||n>=32768)return false;
  HANDLE file=CreateFileW(path,GENERIC_READ,FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);if(file==INVALID_HANDLE_VALUE)return false;
  BCRYPT_ALG_HANDLE algorithm=nullptr;BCRYPT_HASH_HANDLE hash=nullptr;
  bool ok=BCryptOpenAlgorithmProvider(&algorithm,BCRYPT_SHA256_ALGORITHM,nullptr,0)>=0;
  if(ok)ok=BCryptCreateHash(algorithm,&hash,nullptr,0,nullptr,0,0)>=0;
  unsigned char block[65536],digest[32];DWORD read=0;
  while(ok){if(!ReadFile(file,block,sizeof(block),&read,nullptr)){ok=false;break;}if(!read)break;ok=BCryptHashData(hash,block,read,0)>=0;}
  if(ok)ok=BCryptFinishHash(hash,digest,32,0)>=0;
  if(hash)BCryptDestroyHash(hash);if(algorithm)BCryptCloseAlgorithmProvider(algorithm,0);CloseHandle(file);
  if(!ok)return false;char hex[65];for(int i=0;i<32;i++)std::sprintf(hex+2*i,"%02x",digest[i]);hex[64]=0;
  return std::strcmp(hex,JVM_SHA256)==0;
}
static jclass JNICALL guarded(JNIEnv* env,jclass lookup,const char* name,const jbyte* buf,jsize len,jobject pd,jboolean initialize,int flags,jobject classData) {
  // IS_HIDDEN is bit 2 in the pinned OpenJDK class-definition flags. Normal definitions
  // retain their original path, including all VM validation and error semantics.
  if(!(flags&2)||!lookup||!buf||len<=0)return original(env,lookup,name,buf,len,pd,initialize,flags,classData);
  if(transforming){fail(env,"HIDDEN_BOUNDARY_REENTRANT_PROVIDER");return nullptr;}
  ActiveCall scope;calls.fetch_add(1);transforming=true;
  try {
  jbyteArray input=env->NewByteArray(len);jbyteArray output=nullptr;
  LocalRef inputRef(env,input);
  if(input){env->SetByteArrayRegion(input,0,len,buf);if(!env->ExceptionCheck())output=(jbyteArray)env->CallStaticObjectMethod(provider,apply,lookup,input);}
  LocalRef outputRef(env,output);
  std::vector<jbyte> rewritten;
  if(output&&!env->ExceptionCheck()){
    jsize size=env->GetArrayLength(output);
    if(size>0){rewritten.resize(size);env->GetByteArrayRegion(output,0,size,rewritten.data());}
    else fail(env,"HIDDEN_BOUNDARY_EMPTY_OUTPUT");
  } else if(!env->ExceptionCheck())fail(env,"HIDDEN_BOUNDARY_NULL_OUTPUT");
  transforming=false;
  if(env->ExceptionCheck())return nullptr;
  bool changed=rewritten.size()!=(size_t)len||std::memcmp(rewritten.data(),buf,len)!=0;
  if(changed)changes.fetch_add(1);
  jclass result=original(env,lookup,name,rewritten.data(),(jsize)rewritten.size(),pd,initialize,flags,classData);
  return result;
  } catch(const std::bad_alloc&) {fail(env,"HIDDEN_BOUNDARY_NATIVE_ALLOCATION");return nullptr;}
    catch(...) {fail(env,"HIDDEN_BOUNDARY_NATIVE_EXCEPTION");return nullptr;}
}

extern "C" JNIEXPORT void JNICALL Java_eff_hiddenboundary_NativeHiddenBoundary_install(JNIEnv* env,jclass,jclass handler) {
  int expected=0;
  if(!installState.compare_exchange_strong(expected,1)){fail(env,"HIDDEN_BOUNDARY_INSTALL_ALREADY_ATTEMPTED");return;}
  InstallAttempt attempt;
  if(!handler){fail(env,"HIDDEN_BOUNDARY_PROVIDER_NULL");return;}
  try {
  if(entry){fail(env,"HIDDEN_BOUNDARY_ALREADY_INSTALLED");return;}
  HMODULE jvm=GetModuleHandleW(L"jvm.dll");if(!jvm||!fileHash(jvm)){fail(env,"HIDDEN_BOUNDARY_JVM_HASH");return;}
  void* found=(void*)GetProcAddress(jvm,"JVM_LookupDefineClass");
  if(!found||((unsigned char*)found-(unsigned char*)jvm)!=JVM_EXPORT_RVA||std::memcmp(found,JVM_PROLOGUE,sizeof(JVM_PROLOGUE))){fail(env,"HIDDEN_BOUNDARY_PROLOGUE");return;}
  apply=env->GetStaticMethodID(handler,"apply","(Ljava/lang/Class;[B)[B");if(!apply)return;
  provider=(jclass)env->NewGlobalRef(handler);if(!provider)return;
  MH_STATUS status=MH_Initialize();if(status!=MH_OK){env->DeleteGlobalRef(provider);provider=nullptr;fail(env,"HIDDEN_BOUNDARY_HOOK_INIT");return;}
  status=MH_CreateHook(found,(void*)guarded,(void**)&original);
  if(status!=MH_OK){MH_Uninitialize();env->DeleteGlobalRef(provider);provider=nullptr;fail(env,"HIDDEN_BOUNDARY_HOOK_CREATE");return;}
  status=MH_EnableHook(found);
  if(status!=MH_OK){MH_RemoveHook(found);MH_Uninitialize();env->DeleteGlobalRef(provider);provider=nullptr;fail(env,"HIDDEN_BOUNDARY_HOOK_ENABLE");return;}
  entry=found;
  installState.store(2);
  prepareAudit(env);
  if(env->ExceptionCheck())return;
  if(!eff_instrumentation_abi::install(env,auditVm)){
    fail(env,"INSTRUMENTATION_ABI_NOT_INSTALLED");return;
  }
  } catch(const std::bad_alloc&) {fail(env,"HIDDEN_BOUNDARY_INSTALL_ALLOCATION");}
    catch(...) {fail(env,"HIDDEN_BOUNDARY_INSTALL_EXCEPTION");}
}
extern "C" JNIEXPORT jlongArray JNICALL Java_eff_hiddenboundary_NativeHiddenBoundary_stats(JNIEnv* env,jclass){jlong values[3]={calls.load(),changes.load(),active.load()};jlongArray result=env->NewLongArray(3);if(result)env->SetLongArrayRegion(result,0,3,values);return result;}
extern "C" JNIEXPORT void JNICALL Java_eff_hiddenboundary_NativeHiddenBoundary_auditMethods(JNIEnv*,jclass){
  int sequence=auditCount.fetch_add(1);if(sequence>=4)return;
  std::fprintf(stderr,"[EFF-METHOD-AUDIT] snapshot=%d\n",sequence);
  auditClass(auditManager,"sun.instrument.TransformerManager");
  auditClass(auditInstrumentation,"sun.instrument.InstrumentationImpl");
}
extern "C" JNIEXPORT jstring JNICALL Java_eff_hiddenboundary_NativeHiddenBoundary_inspectTick(JNIEnv* env,jclass,jclass target){
  if(tickAuditCount.fetch_add(1)>=32)return env->NewStringUTF("{\"readOnly\":true,\"error\":\"SAMPLE_LIMIT\"}");
  try {auto value=tickSnapshot(target);return env->NewStringUTF(value.c_str());}
  catch(...) {return env->NewStringUTF("{\"readOnly\":true,\"error\":\"AUDIT_ALLOCATION_FAILED\"}");}
}
#ifdef EFF_HIDDEN_BOUNDARY_FIXTURE_UNINSTALL
extern "C" JNIEXPORT void JNICALL Java_eff_hiddenfixture_NativeBoundary_uninstall(JNIEnv* env,jclass) {
  if(!entry){fail(env,"HIDDEN_BOUNDARY_NOT_INSTALLED");return;}
  if(active.load()!=0){fail(env,"HIDDEN_BOUNDARY_ACTIVE_CALLS");return;}
  if(MH_DisableHook(entry)!=MH_OK||std::memcmp(entry,JVM_PROLOGUE,sizeof(JVM_PROLOGUE))){fail(env,"HIDDEN_BOUNDARY_RESTORE_FAILED");return;}
  MH_RemoveHook(entry);MH_Uninitialize();entry=nullptr;
  // Helper globals remain until the private child JVM exits; no DLL unload race.
}
#endif
