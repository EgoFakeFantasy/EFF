"use strict";
const readline=require('node:readline');
const lines=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
const pending=new Map();let serial=0,booted=false,controller,pulse;
const send=message=>process.stdout.write(JSON.stringify(message)+'\n');
function rpc(op,body={}){const id=++serial;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('OUTER_GUARD_TIMEOUT'));},5000);pending.set(id,{resolve,reject,timer});send({id,op,...body});});}
lines.on('line',async raw=>{
 try{
  // Windows PowerShell/UTF-8 console can make the framework stdin writer emit one BOM.
  if(!booted && raw.charCodeAt(0)===0xfeff)raw=raw.slice(1);
  if(raw.length>262144)throw Error('GUARD_REPLY_BUDGET');const message=JSON.parse(raw);
  if(!booted){if(message.op!=='boot')throw Error('OUTER_GUARD_REQUIRED');booted=true;
   const {Controller}=require('./controller.cjs');
   const store={load:()=>rpc('load'),commit:(previous,body)=>rpc('commit',{previous,body}),verify:()=>rpc('verify'),protect:pid=>rpc('protect',{pid})};
   controller=new Controller({...message.config,protectedGeneration:message.generation,store});
   controller.onFatal=reason=>{
    // Emit only fixed error codes and numeric exit status, never leases or launch arguments.
    const code=/^[A-Z][A-Z0-9_]{0,95}$/.test(reason)?reason:'CONTROLLER_FATAL_UNKNOWN';
    const hostExit=controller.events.filter(e=>e.type==='host-exit').at(-1);
    const status=Number.isInteger(hostExit?.code)?'\nHOST_EXIT_CODE_'+(hostExit.code>>>0):'';
    const trigger=controller.hostFault?.reason;
    const cause=/^[A-Za-z][A-Za-z0-9_-]{0,95}$/.test(trigger||'')?'\nHOST_FAULT_'+trigger:'';
    process.stderr.write(code+status+cause+'\n',()=>process.exit(2));
    setTimeout(()=>process.exit(2),250).unref();
   };
   pulse=setInterval(()=>send({op:'pulse'}),1000);
   await controller.start();await module.exports.onReady?.(controller,message.generation);send({op:'pulse'});
   controller.onUserStop=async()=>{await controller.close();clearInterval(pulse);send({op:'stopped'});process.exitCode=0;/* Keep stdin alive until the outer guard reads stop and drains its Job. */};
  }else{const p=pending.get(message.id);if(!p)return;pending.delete(message.id);clearTimeout(p.timer);message.ok?p.resolve(message.result):p.reject(Error(message.error||'OUTER_GUARD_FAILURE'));}
 }catch(e){
  process.stderr.write(e.message+'\n');
  // Only the sealed controller may end an already quarantined lab; MC goodbye never reaches here.
  if(e.message==='HOST_CAPABILITIES_QUARANTINED'&&controller?.closed&&controller.config.admission?.quarantineOnFault){clearInterval(pulse);require('node:fs').writeFileSync(require('node:path').join(controller.directory,'quarantine.json'),JSON.stringify({schema:1,reason:e.message,commit:controller.durable?.commit,mode:'observe-only'}));send({op:'stopped'});process.exitCode=0;/* Keep stdin alive until the outer guard reads stop and drains its Job. */return;}
  process.exit(2);
 }
});
lines.on('close',()=>{if(!controller?.closed)process.exit(3);});
