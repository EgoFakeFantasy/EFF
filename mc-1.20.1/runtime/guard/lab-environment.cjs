'use strict';
// Explicit execution context, not a sandbox or evidence of virtualization.
function labEnvironment(env=process.env,platform=process.platform){
 if(platform!=='win32')throw Error('WINDOWS_NATIVE_LAB_REQUIRED');
 const mode=env.EFF_NATIVE_LAB;
 if(mode!==undefined){
  if(mode!=='local-windows'||env.EFF_DISPOSABLE_VM_LAB!==undefined)throw Error('INVALID_NATIVE_LAB_MODE');
  return 'local-windows';
 }
 if(env.EFF_DISPOSABLE_VM_LAB==='1')return 'disposable-vm';
 throw Error('EXPLICIT_NATIVE_LAB_MODE_REQUIRED');
}
module.exports={labEnvironment};
