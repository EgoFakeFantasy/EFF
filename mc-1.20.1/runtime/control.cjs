"use strict";
// Medium-side console. This credential stays under authority/, never in the MC environment.
const fs=require('node:fs'),path=require('node:path');
const {createHmac,randomBytes,timingSafeEqual}=require('node:crypto');
async function request(directory,op,source){
 const file=path.join(path.resolve(directory),'control.json');
 if(fs.statSync(file).size>4096)throw Error('CONTROL_DESCRIPTOR_BUDGET');
 const c=JSON.parse(fs.readFileSync(file,'utf8'));
 if(c.schema!==1||!/^http:\/\/127\.0\.0\.1:[0-9]+$/.test(c.endpoint)||!/^[a-f0-9]{64}$/.test(c.key))throw Error('CONTROL_DESCRIPTOR_INVALID');
 const body={op,session:c.session,requestId:randomBytes(16).toString('hex')};
 if(op==='execute'){
  const snapshot=await request(directory,'snapshot');
  body.revision=snapshot.revision;body.commit=snapshot.runtime.commit;body.source=source;
 }
 const raw=JSON.stringify(body),signature=createHmac('sha256',c.key).update('control-request:'+raw).digest('hex');
 const response=await fetch(c.endpoint+'/v1/control',{method:'POST',headers:{'X-EFF-Auth':signature,'Content-Type':'application/json'},body:raw,signal:AbortSignal.timeout(15000)});
 const text=await response.text();if(text.length>262144)throw Error('CONTROL_REPLY_BUDGET');
 const supplied=Buffer.from(response.headers.get('x-eff-auth')||''),expected=Buffer.from(createHmac('sha256',c.key).update('control-reply:'+text).digest('hex'));
 if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))throw Error('CONTROL_REPLY_SIGNATURE');
 const reply=JSON.parse(text);if(!reply.ok)throw Error(reply.error);return reply.result;
}
module.exports={request};
if(require.main===module){const [directory,op='snapshot',source]=process.argv.slice(2);if(!directory||!['snapshot','execute','stop'].includes(op)){process.stderr.write('Usage: node control.cjs <deployment/authority> snapshot|execute "limited program"|stop\n');process.exitCode=2;}else request(directory,op,source).then(r=>process.stdout.write(JSON.stringify(r,null,2)+'\n')).catch(e=>{process.stderr.write(e.message+'\n');process.exitCode=1;});}
