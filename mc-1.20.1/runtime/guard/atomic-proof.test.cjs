"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {publishProof,readProof,readBounded}=require('./atomic-proof.cjs');
test('proof publication is complete, exclusive and leaves no temporary files',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'eff-proof-'));
 try {
  const file=path.join(root,'arm.json'),body={mcPid:42,runId:'first'};
  publishProof(file,body);assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),body);
  assert.throws(()=>publishProof(file,{mcPid:43,runId:'replacement'}),{code:'EEXIST'});
  assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),body);
  assert.deepEqual(fs.readdirSync(root),['arm.json']);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('untrusted proof reads are bounded and reject incomplete or oversized content',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'eff-read-proof-'));
 try{
  const file=path.join(root,'proof.json');assert.equal(readProof(file),null);
  publishProof(file,{ok:true});assert.deepEqual(readProof(file),{ok:true});
  assert.throws(()=>readBounded(file,4),/LAB_PROOF_BUDGET/);
  fs.writeFileSync(file,'{"partial":');assert.throws(()=>readProof(file),SyntaxError);
  fs.writeFileSync(file,'a'.repeat(131073));assert.throws(()=>readProof(file),/LAB_PROOF_BUDGET/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
