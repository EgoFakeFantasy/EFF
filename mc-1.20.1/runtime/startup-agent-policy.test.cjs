'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {validateStartupAgent,sealStartupAgent}=require('./startup-agent-policy.cjs');
const {hostArgumentOptions,assertHostArguments}=require('./launch-policy.cjs');
const hash=b=>createHash('sha256').update(b).digest('hex');
const base=path.resolve(__dirname,'../../output');fs.mkdirSync(base,{recursive:true});
const directory=fs.mkdtempSync(path.join(base,'startup-agent-policy-test-'));
const file=path.join(directory,'agent.jar'),bytes=Buffer.from('synthetic pinned artifact; never executed');fs.writeFileSync(file,bytes);
const descriptor=()=>({mechanism:'static-argument-isolation-v1',path:file,sha256:hash(bytes)});
const hardening=['-XX:+DisableAttachMechanism','-XX:+ExitOnOutOfMemoryError'];
test('exact pinned startup component is admitted and all other injection remains denied',()=>{
 const config={host:{startupAgent:descriptor()}},options=hostArgumentOptions(config),arg='-javaagent:'+file;
 assert.equal(validateStartupAgent(config.host).argument,arg);
 assert.doesNotThrow(()=>assertHostArguments([...hardening,arg],options));
 for(const hostile of [arg+'=options','-javaagent:other.jar','-agentlib:other','-agentpath:other',' '+arg,'--javaagent:'+file])
  assert.throws(()=>assertHostArguments([...hardening,arg,hostile],options),/UNAPPROVED_JVM_INJECTION/);
 assert.throws(()=>assertHostArguments([...hardening,arg]),/UNAPPROVED_JVM_INJECTION/);
 assert.throws(()=>assertHostArguments([...hardening],options),/STARTUP_AGENT_ARGUMENT_REQUIRED/);
 assert.throws(()=>assertHostArguments([...hardening,arg,arg],options),/STARTUP_AGENT_ARGUMENT_REQUIRED/);
 assert.throws(()=>assertHostArguments([...hardening,'-agentlib:x'],{startupAgentArgument:'-agentlib:x'}),/STARTUP_AGENT_DESCRIPTOR/);
});
test('descriptor refuses mutated bytes, extra options, relative paths and wrong mechanism',()=>{
 for(const bad of [{...descriptor(),sha256:'0'.repeat(64)},{...descriptor(),options:'x'},{...descriptor(),path:'agent.jar'},{...descriptor(),path:file+'=x'},{...descriptor(),mechanism:'anything'}])
  assert.throws(()=>validateStartupAgent({startupAgent:bad}),/STARTUP_AGENT_/);
});
test('actual controller launch boundary allows only the checked startup artifact',()=>{
 const {Controller}=require('./controller.cjs');
 const host={command:'synthetic-java-never-executed',startupAgent:descriptor(),args:[...hardening,'-javaagent:'+file,'-cp','ordinary.jar','Main']};
 const instance={config:{host},directory};
 assert.deepEqual(Controller.prototype.hostLaunch.call(instance),{command:host.command,args:host.args});
 for(const hostile of ['-javaagent:evil.jar','-agentpath:evil.dll','@untrusted.args']){
  instance.config.host={...host,args:[...host.args,hostile]};
  assert.throws(()=>Controller.prototype.hostLaunch.call(instance),/UNAPPROVED_JVM_INJECTION/);
 }
 instance.config.host={...host,args:[...host.args,host.args[2]]};
 assert.throws(()=>Controller.prototype.hostLaunch.call(instance),/STARTUP_AGENT_ARGUMENT_REQUIRED/);
 instance.config.host={...host,startupAgent:{...descriptor(),sha256:'0'.repeat(64)}};
 assert.throws(()=>Controller.prototype.hostLaunch.call(instance),/STARTUP_AGENT_HASH_MISMATCH/);
 instance.config.host={...host};delete instance.config.host.startupAgent;
 assert.throws(()=>Controller.prototype.hostLaunch.call(instance),/HOST_JVM_INJECTION_REFUSED/);
});
test('sealing copies and pins independent bytes, rewrites only exact argument, rejects reuse',()=>{
 const host={startupAgent:descriptor()},args=[...hardening,'-javaagent:'+file,'-cp','normal.jar','Main'];
 const payload=path.join(directory,'payload');fs.mkdirSync(payload);const pins=[];
 sealStartupAgent(host,args,{payload,pin:p=>pins.push(p)});
 assert.equal(pins.length,1);assert.notEqual(host.startupAgent.path,file);
 assert.deepEqual(fs.readFileSync(pins[0]),bytes);assert.equal(args[2],'-javaagent:'+pins[0]);
 assert.deepEqual(args.slice(3),['-cp','normal.jar','Main']);
 assert.doesNotThrow(()=>assertHostArguments(args,hostArgumentOptions({host})));
 fs.writeFileSync(file,'changed after seal');
 assert.throws(()=>validateStartupAgent({startupAgent:descriptor()}),/STARTUP_AGENT_HASH_MISMATCH/);
 assert.doesNotThrow(()=>validateStartupAgent(host));
 assert.throws(()=>sealStartupAgent(host,args,{payload,pin:()=>{}}),/EEXIST/);
 fs.writeFileSync(pins[0],'changed sealed bytes');
 assert.throws(()=>hostArgumentOptions({host}),/STARTUP_AGENT_HASH_MISMATCH/);
});
test('owned boundary pins its only bootstrap companion and rejects tampering without accepting extra agents',()=>{
 const own=fs.mkdtempSync(path.join(base,'owned-startup-policy-test-'));
 const main=path.join(own,'agent.jar'),helper=path.join(own,'eff-owned-origin-bootstrap.jar');
 const mainBytes=Buffer.from('synthetic combined agent'),helperBytes=Buffer.from('synthetic bootstrap');
 fs.writeFileSync(main,mainBytes);fs.writeFileSync(helper,helperBytes);
 const value={mechanism:'owned-java-transform-boundary-v1',path:main,sha256:hash(mainBytes),bootstrap:{path:helper,sha256:hash(helperBytes)}};
 const host={startupAgent:value},args=[...hardening,'-javaagent:'+main,'-cp','normal.jar','Main'];
 assert.doesNotThrow(()=>assertHostArguments(args,hostArgumentOptions({host})));
 for(const bad of [{...value,bootstrap:undefined},{...value,bootstrap:{...value.bootstrap,options:'x'}},{...value,bootstrap:{...value.bootstrap,sha256:'0'.repeat(64)}},{...value,bootstrap:{...value.bootstrap,path:main}}])
  assert.throws(()=>validateStartupAgent({startupAgent:bad}),/STARTUP_AGENT_BOOTSTRAP/);
 const payload=path.join(own,'payload');fs.mkdirSync(payload);const pins=[];
 sealStartupAgent(host,args,{payload,pin:p=>pins.push(p)});
 assert.equal(pins.length,2);assert.equal(path.dirname(host.startupAgent.bootstrap.path),payload);
 assert.deepEqual(fs.readFileSync(host.startupAgent.bootstrap.path),helperBytes);
 assert.doesNotThrow(()=>assertHostArguments(args,hostArgumentOptions({host})));
 assert.throws(()=>assertHostArguments([...args,'-javaagent:another.jar'],hostArgumentOptions({host})),/UNAPPROVED_JVM_INJECTION/);
 fs.writeFileSync(helper,'changed source');assert.doesNotThrow(()=>validateStartupAgent(host));
 fs.writeFileSync(host.startupAgent.bootstrap.path,'changed sealed helper');
 assert.throws(()=>validateStartupAgent(host),/STARTUP_AGENT_BOOTSTRAP_HASH/);
});
test('native hidden boundary requires its exact sealed companion and cannot downgrade silently',()=>{
 const own=fs.mkdtempSync(path.join(base,'native-startup-policy-test-'));
 const main=path.join(own,'agent.jar'),helper=path.join(own,'eff-owned-origin-bootstrap.jar'),dll=path.join(own,'eff-native-hidden-boundary.dll');
 const mainBytes=Buffer.from('synthetic native combined agent'),helperBytes=Buffer.from('synthetic bootstrap'),dllBytes=Buffer.from('synthetic DLL; never loaded');
 for(const [file,bytes] of [[main,mainBytes],[helper,helperBytes],[dll,dllBytes]])fs.writeFileSync(file,bytes);
 const value={mechanism:'owned-native-transform-boundary-v2',path:main,sha256:hash(mainBytes),bootstrap:{path:helper,sha256:hash(helperBytes)},nativeBoundary:{path:dll,sha256:hash(dllBytes)}};
 const host={startupAgent:value},args=[...hardening,'-javaagent:'+main,'-cp','normal.jar','Main'];
 assert.doesNotThrow(()=>assertHostArguments(args,hostArgumentOptions({host})));
 for(const bad of [{...value,nativeBoundary:undefined},{...value,nativeBoundary:{...value.nativeBoundary,options:'x'}},{...value,nativeBoundary:{...value.nativeBoundary,sha256:'0'.repeat(64)}},{...value,nativeBoundary:{...value.nativeBoundary,path:main}},{...value,mechanism:'owned-java-transform-boundary-v1'}])
  assert.throws(()=>validateStartupAgent({startupAgent:bad}),/STARTUP_AGENT_/);
 const payload=path.join(own,'payload');fs.mkdirSync(payload);const pins=[];
 sealStartupAgent(host,args,{payload,pin:p=>pins.push(p)});
 assert.equal(pins.length,3);assert.equal(path.dirname(host.startupAgent.nativeBoundary.path),payload);
 assert.deepEqual(fs.readFileSync(host.startupAgent.nativeBoundary.path),dllBytes);
 assert.doesNotThrow(()=>assertHostArguments(args,hostArgumentOptions({host})));
 assert.throws(()=>assertHostArguments([...args,'-agentpath:untrusted.dll'],hostArgumentOptions({host})),/UNAPPROVED_JVM_INJECTION/);
 fs.writeFileSync(dll,'changed source');assert.doesNotThrow(()=>validateStartupAgent(host));
 fs.writeFileSync(host.startupAgent.nativeBoundary.path,'changed sealed native');
 assert.throws(()=>validateStartupAgent(host),/STARTUP_AGENT_NATIVE_HASH/);
});
// Preserve all fixtures: user requested no file cleanup.
