'use strict';
// Runs only in a separate Low process. Never load narrative code into the controller.
const http=require('node:http'),path=require('node:path'),fs=require('node:fs');
const {createHmac,timingSafeEqual}=require('node:crypto');
function start({Session,saveRoot,key}){
 if(!/^[a-f0-9]{64}$/.test(key)||!path.isAbsolute(saveRoot))throw Error('STORY_CONFIG');
 const sessions=new Map(),seen=new Set();let busy=0;
 const sign=text=>createHmac('sha256',key).update(text).digest('hex');
 const server=http.createServer({maxHeaderSize:4096,requestTimeout:5000},async(req,res)=>{
  let counted=false,id='';
  const finish=(status,body)=>{let raw=JSON.stringify({id,...body});if(Buffer.byteLength(raw)>400000){status=500;raw=JSON.stringify({id,ok:false,error:'STORY_REPLY_BUDGET'});}res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-EFF-Auth':sign('reply:'+raw)});res.end(raw);};
  try{
   if(req.method!=='POST'||req.url!=='/v1/story')throw Error('STORY_ROUTE');
   if(busy>=4)throw Error('STORY_BUSY');busy++;counted=true;
   req.setTimeout(3000,()=>req.destroy());const chunks=[];let bytes=0;
   for await(const c of req){bytes+=c.length;if(bytes>16384)throw Error('STORY_REQUEST_BUDGET');chunks.push(c);}req.setTimeout(0);
   const raw=Buffer.concat(chunks).toString('utf8'),given=req.headers['x-eff-auth'];
   if(typeof given!=='string'||!/^[a-f0-9]{64}$/.test(given)||!timingSafeEqual(Buffer.from(given),Buffer.from(sign('request:'+raw))))throw Error('STORY_AUTH');
   const r=JSON.parse(raw);if(!r||Object.keys(r).sort().join(',')!=='id,request,slot'||typeof r.id!=='string'||!/^[-a-zA-Z0-9]{16,64}$/.test(r.id)||typeof r.slot!=='string'||!/^[a-f0-9]{64}$/.test(r.slot)||!r.request||typeof r.request!=='object'||Array.isArray(r.request))throw Error('STORY_ENVELOPE');
   id=r.id;if(seen.has(id))throw Error('STORY_REPLAY');seen.add(id);if(seen.size>512)seen.delete(seen.values().next().value);
   let session=sessions.get(r.slot),result;
   if(r.request.op==='open'){
    if(Object.keys(r.request).length!==1)throw Error('STORY_OPEN_FIELDS');
    if(!session){if(sessions.size>=4)throw Error('STORY_SESSION_BUDGET');const saveDir=path.join(saveRoot,r.slot);fs.mkdirSync(saveDir,{recursive:true});session=new Session({saveDir});sessions.set(r.slot,session);}result={ready:true};
   }else{
    if(!session)throw Error('STORY_NOT_OPEN');
    result=await session.handle(r.request);
    if(r.request.op==='close')sessions.delete(r.slot);
   }
   finish(200,{ok:true,result});
  }catch(e){if(!res.destroyed)finish(409,{ok:false,error:/^[A-Z0-9_]+$/.test(e.message)?e.message:'STORY_FAILURE'});}
  finally{if(counted)busy--;}
 });
 server.maxConnections=8;server.on('close',()=>{for(const s of sessions.values()){s.model.close();try{s.save();}catch{}}sessions.clear();});
 return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve(server));});
}
module.exports={start};
if(require.main===module){
 const [runtime,saveRoot]=process.argv.slice(2),key=process.env.EFF_STORY_RPC_KEY;delete process.env.EFF_STORY_RPC_KEY;
 if(!runtime||!path.isAbsolute(runtime))throw Error('STORY_RUNTIME');
 const {Session}=require(path.join(runtime,'bridge/session.cjs'));
 start({Session,saveRoot,key}).then(server=>{process.stdout.write(JSON.stringify({storyPort:server.address().port})+'\n');}).catch(()=>{process.stderr.write('STORY_START_FAILED\n');process.exit(1);});
}
