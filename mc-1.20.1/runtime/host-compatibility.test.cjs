'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {assertHostArguments,hostArgumentOptions}=require('./launch-policy.cjs');
const sample='3bf3ba852bbafec9f4440210d4084bb92ba9586c9a146ae03ddf003f17f1b5f8';
const args=['-XX:+ExitOnOutOfMemoryError','-Djdk.attach.allowAttachSelf=true','-Xverify:all'];
test('self attach is confined to fixed-sample Low compatibility tests',()=>{
 const cfg={researchLab:true,researchMode:'observe-only',host:{lowIntegrity:true,nativeCompatibility:'foreverlove-2.2-self-attach',args,researchMods:[{sha256:sample}]}};
 assert.doesNotThrow(()=>assertHostArguments(args,hostArgumentOptions(cfg)));
 assert.throws(()=>assertHostArguments(args),/UNAPPROVED/);
 for(const change of [{researchLab:false},{researchMode:'normal'},{host:{...cfg.host,lowIntegrity:false}},{host:{...cfg.host,researchMods:[{sha256:'a'.repeat(64)}]}},{host:{...cfg.host,researchMods:undefined}},{host:{...cfg.host,nativeCompatibility:'anything'}}])assert.throws(()=>hostArgumentOptions({...cfg,...change}),/PROFILE_REFUSED/);
 const baseline={...cfg,host:{...cfg.host,args:[...args,'-Deff.entityGuardSelftest=true'],researchMods:undefined}};
 assert.equal(hostArgumentOptions(baseline).allowSelfAttach,true);
 for(const bad of [[...args,'-javaagent:external.jar'],[...args,'-XX:-DisableAttachMechanism'],[...args,'-XX:+DisableAttachMechanism'],[...args,'-Djdk.attach.allowAttachSelf=false']])assert.throws(()=>assertHostArguments(bad,hostArgumentOptions(cfg)));
 assert.deepEqual(hostArgumentOptions({host:{}}),{});
 const repaired={...cfg,host:{...cfg.host,nativeCompatibility:'foreverlove-2.2-servicefilter-repair',researchMods:[{sha256:'7eee66a0c9505a4babc502ac1707e7598e0fe284121dde1ade11936666f8ec9b'}]}};
 assert.equal(hostArgumentOptions(repaired).allowSelfAttach,true);
 assert.throws(()=>hostArgumentOptions({...repaired,host:{...repaired.host,researchMods:[{sha256:sample}]}}),/PROFILE_REFUSED/);
 assert.throws(()=>hostArgumentOptions({...repaired,host:{...repaired.host,nativeCompatibility:'foreverlove-2.2-self-attach'}}),/PROFILE_REFUSED/);
});
test('self-attach experiments require full verification with no later weakening flag',()=>{
 assert.throws(()=>assertHostArguments(args.filter(x=>x!=='-Xverify:all'),{allowSelfAttach:true}),/BYTECODE_VERIFICATION_REQUIRED/);
 for(const override of ['-noverify','-Xverify:none','-Xverify:remote','-XX:-BytecodeVerificationLocal','-XX:-BytecodeVerificationRemote','-XX:BytecodeVerificationRemote=false']){
  assert.throws(()=>assertHostArguments([...args,override],{allowSelfAttach:true}),/BYTECODE_VERIFICATION_REQUIRED/);
 }
 assert.doesNotThrow(()=>assertHostArguments(args,{allowSelfAttach:true}));
 for(const arg of ['-noverify','-Xverify:none','-XX:-BytecodeVerificationLocal','-XX:-BytecodeVerificationRemote'])
  assert.throws(()=>assertHostArguments(['-XX:+DisableAttachMechanism','-XX:+ExitOnOutOfMemoryError',arg]),/BYTECODE_VERIFICATION_REQUIRED/);
});
