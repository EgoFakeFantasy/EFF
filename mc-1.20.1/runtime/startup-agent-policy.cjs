'use strict';
// Explicit, content-pinned application startup component; not dynamic attach or an OS boundary.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function validateStartupAgent(host){
 const value=host.startupAgent;if(value===undefined)return null;
 const native=value?.mechanism==='owned-native-transform-boundary-v2';
 const owned=native||value?.mechanism==='owned-java-transform-boundary-v1';
 if(!value||Object.keys(value).sort().join(',')!==(native?'bootstrap,mechanism,nativeBoundary,path,sha256':owned?'bootstrap,mechanism,path,sha256':'mechanism,path,sha256')||
    (!owned&&value.mechanism!=='static-argument-isolation-v1')||typeof value.path!=='string'||
    !path.isAbsolute(value.path)||/[\0\r\n=]/.test(value.path)||!value.path.endsWith('.jar')||
    !/^[a-f0-9]{64}$/.test(value.sha256))throw Error('STARTUP_AGENT_DESCRIPTOR');
 const stat=fs.lstatSync(value.path);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size===0||stat.size>8*1024*1024)throw Error('STARTUP_AGENT_FILE');
 if(hash(value.path)!==value.sha256)throw Error('STARTUP_AGENT_HASH_MISMATCH');
 if(owned){
  const helper=value.bootstrap;
  if(!helper||Object.keys(helper).sort().join(',')!=='path,sha256'||typeof helper.path!=='string'||
     !path.isAbsolute(helper.path)||/[\0\r\n=]/.test(helper.path)||
     path.basename(helper.path)!=='eff-owned-origin-bootstrap.jar'||path.dirname(helper.path)!==path.dirname(value.path)||
     !/^[a-f0-9]{64}$/.test(helper.sha256))throw Error('STARTUP_AGENT_BOOTSTRAP_DESCRIPTOR');
  const s=fs.lstatSync(helper.path);
  if(!s.isFile()||s.isSymbolicLink()||s.size===0||s.size>1024*1024)throw Error('STARTUP_AGENT_BOOTSTRAP_FILE');
  if(hash(helper.path)!==helper.sha256)throw Error('STARTUP_AGENT_BOOTSTRAP_HASH');
 }
 if(native){
  const companion=value.nativeBoundary;
  if(!companion||Object.keys(companion).sort().join(',')!=='path,sha256'||typeof companion.path!=='string'||
     !path.isAbsolute(companion.path)||/[\0\r\n=]/.test(companion.path)||
     path.basename(companion.path)!=='eff-native-hidden-boundary.dll'||path.dirname(companion.path)!==path.dirname(value.path)||
     !/^[a-f0-9]{64}$/.test(companion.sha256))throw Error('STARTUP_AGENT_NATIVE_DESCRIPTOR');
  const s=fs.lstatSync(companion.path);
  if(!s.isFile()||s.isSymbolicLink()||s.size===0||s.size>4*1024*1024)throw Error('STARTUP_AGENT_NATIVE_FILE');
  if(hash(companion.path)!==companion.sha256)throw Error('STARTUP_AGENT_NATIVE_HASH');
 }
 return {...value,argument:'-javaagent:'+value.path};
}
function sealStartupAgent(host,args,{payload,pin}){
 const value=validateStartupAgent(host);if(!value)return;
 const at=args.indexOf(value.argument);
 if(at<0||args.lastIndexOf(value.argument)!==at)throw Error('STARTUP_AGENT_ARGUMENT_REQUIRED');
 const target=path.join(payload,'eff-argument-isolation-agent.jar');
 fs.copyFileSync(value.path,target,fs.constants.COPYFILE_EXCL);
 if(hash(target)!==value.sha256)throw Error('STARTUP_AGENT_COPY_CHANGED');
 pin(target);host.startupAgent={mechanism:value.mechanism,path:target,sha256:value.sha256};
 if(value.bootstrap){
  const helper=path.join(payload,'eff-owned-origin-bootstrap.jar');
  fs.copyFileSync(value.bootstrap.path,helper,fs.constants.COPYFILE_EXCL);
  if(hash(helper)!==value.bootstrap.sha256)throw Error('STARTUP_AGENT_BOOTSTRAP_COPY_CHANGED');
  pin(helper);host.startupAgent.bootstrap={path:helper,sha256:value.bootstrap.sha256};
 }
 if(value.nativeBoundary){
  const companion=path.join(payload,'eff-native-hidden-boundary.dll');
  fs.copyFileSync(value.nativeBoundary.path,companion,fs.constants.COPYFILE_EXCL);
  if(hash(companion)!==value.nativeBoundary.sha256)throw Error('STARTUP_AGENT_NATIVE_COPY_CHANGED');
  pin(companion);host.startupAgent.nativeBoundary={path:companion,sha256:value.nativeBoundary.sha256};
 }
 args[at]='-javaagent:'+target;
}
module.exports={validateStartupAgent,sealStartupAgent};
