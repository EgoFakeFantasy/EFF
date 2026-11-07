'use strict';
const fs=require('node:fs'),{Writable}=require('node:stream');
// Drain hostile stdout/stderr after the budget is spent; never grow an authority log forever.
function boundedHostLog(file,{maxBytes=8*1024*1024,onLimit=()=>{}}={}){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>64*1024*1024)throw Error('HOST_LOG_BUDGET_INVALID');
 const fd=fs.openSync(file,'a');let written=fs.fstatSync(fd).size,dropped=0,notified=false,closed=false;
 const stream=new Writable({
  write(chunk,encoding,done){
   const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk,encoding),keep=Math.min(bytes.length,Math.max(0,maxBytes-written));
   dropped+=bytes.length-keep;
   const finish=error=>{
    if(!error&&dropped&&!notified){notified=true;try{onLimit({maxBytes});}catch(e){return done(e);}}
    done(error);
   };
   if(!keep)return finish();
   let offset=0;
   function writeRest(){fs.write(fd,bytes,offset,keep-offset,null,(error,n)=>{
    if(error)return finish(error);if(!n)return finish(Error('HOST_LOG_SHORT_WRITE'));
    offset+=n;written+=n;if(offset<keep)writeRest();else finish();
   });}
   writeRest();
  },
  destroy(error,done){if(closed)return done(error);closed=true;fs.close(fd,e=>done(error||e));}
 });
 stream.budget=()=>({maxBytes,written,dropped,truncated:dropped>0});
 return stream;
}
module.exports={boundedHostLog};
