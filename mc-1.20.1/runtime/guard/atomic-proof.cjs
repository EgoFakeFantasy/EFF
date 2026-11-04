"use strict";
const fs=require('node:fs'),{randomUUID}=require('node:crypto');
// Publish an entire proof atomically, without replacing an existing final name.
// Same-directory hard linking is required; unsupported filesystems fail closed.
function publishProof(file,value){
 const temporary=file+'.'+randomUUID()+'.tmp';
 const fd=fs.openSync(temporary,'wx',0o600);
 try {fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd);}
 catch(error){fs.closeSync(fd);fs.unlinkSync(temporary);throw error;}
 fs.closeSync(fd);
 try {fs.linkSync(temporary,file);}finally{fs.unlinkSync(temporary);}
}
function readBounded(file,limit=131072){
 if(!Number.isSafeInteger(limit)||limit<1||limit>8*1024*1024)throw Error('LAB_READ_LIMIT');
 let fd;try{fd=fs.openSync(file,'r');}catch(error){if(error.code==='ENOENT')return null;throw error;}
 try{
  const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.size>limit)throw Error('LAB_PROOF_BUDGET');
  const bytes=Buffer.allocUnsafe(limit+1);let used=0;
  while(used<bytes.length){const n=fs.readSync(fd,bytes,used,bytes.length-used,null);if(!n)break;used+=n;}
  if(used>limit)throw Error('LAB_PROOF_BUDGET');
  return bytes.subarray(0,used);
 }finally{fs.closeSync(fd);}
}
function readProof(file){const bytes=readBounded(file);return bytes===null?null:JSON.parse(bytes.toString('utf8'));}
module.exports={publishProof,readProof,readBounded};
