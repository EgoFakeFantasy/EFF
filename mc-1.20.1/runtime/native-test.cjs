"use strict";
const fs=require('node:fs'),path=require('node:path');
const {Controller}=require('./controller.cjs');
const config=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
if(fs.existsSync(path.join(config.host.cwd,'managed-proof')))throw Error('NATIVE_QA_REQUIRES_FRESH_DIRECTORY');
const controller=new Controller(config),wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{let ok=false,error='',crashed=false;try{await controller.start();console.log('Managed native QA started; actual MC PID',controller.host?.pid);
 const deadline=Date.now()+660000;
 while(Date.now()<deadline){
  const fail=path.join(config.host.cwd,'managed-failure.json');if(fs.existsSync(fail))throw Error(fs.readFileSync(fail,'utf8'));
  const complete=path.join(config.host.cwd,'managed-proof','2-complete.json');
  if(fs.existsSync(complete)&&!crashed){crashed=true;const old=controller.host.pid;controller.host.kill();console.log('Injected unexpected death into owned MC JVM',old);}
  if(fs.existsSync(path.join(config.host.cwd,'managed-proof','3-complete.json'))){ok=true;break;}
  if(controller.events.some(e=>e.type==='host-circuit'))throw Error('HOST_CIRCUIT');
  await wait(1000);
 }
 if(!ok)throw Error('QA_TIMEOUT');
 }catch(e){error=e.message;process.exitCode=1;}
 finally{const proof={ok,error,state:controller.durable,events:controller.events,hostEpoch:controller.hostEpoch};fs.writeFileSync(path.join(path.dirname(process.argv[2]),'result.json'),JSON.stringify(proof,null,2));await controller.close();console.log(JSON.stringify({ok,error,epochs:controller.hostEpoch}));}
})();
