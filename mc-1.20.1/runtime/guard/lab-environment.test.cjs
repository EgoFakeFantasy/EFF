'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {labEnvironment}=require('./lab-environment.cjs');
test('local Windows and legacy VM labels remain distinct explicit choices',()=>{
 assert.equal(labEnvironment({EFF_NATIVE_LAB:'local-windows'},'win32'),'local-windows');
 assert.equal(labEnvironment({EFF_DISPOSABLE_VM_LAB:'1'},'win32'),'disposable-vm');
});
test('missing, conflicting and invalid contexts cannot silently opt in',()=>{
 for(const env of [{},{EFF_NATIVE_LAB:'true'},{EFF_NATIVE_LAB:''},{EFF_NATIVE_LAB:'local-windows',EFF_DISPOSABLE_VM_LAB:'1'},{EFF_DISPOSABLE_VM_LAB:'0'}])assert.throws(()=>labEnvironment(env,'win32'));
 assert.throws(()=>labEnvironment({EFF_NATIVE_LAB:'local-windows'},'linux'),/WINDOWS_NATIVE_LAB_REQUIRED/);
});
