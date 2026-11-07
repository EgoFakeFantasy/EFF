'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {randomBytes,randomUUID,createHmac}=require('node:crypto');
const {start}=require('./story-service.cjs');
const {Session}=require('../../mc-version/bridge/session.cjs');
test('isolated narrative protocol: real session, signed replies, namespaces, replay and path refusal',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'eff-story-protocol-')),key=randomBytes(32).toString('hex');
 const server=await start({Session,saveRoot:root,key});t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 const endpoint=`http://127.0.0.1:${server.address().port}/v1/story`,sign=s=>createHmac('sha256',key).update(s).digest('hex'),slot='a'.repeat(64);
 async function send(request,{id=randomUUID(),namespace=slot,auth=true}={}){
  const raw=JSON.stringify({id,slot:namespace,request});
  const res=await fetch(endpoint,{method:'POST',headers:{'X-EFF-Auth':auth?sign('request:'+raw):'0'.repeat(64)},body:raw});const body=await res.text();assert.equal(res.headers.get('x-eff-auth'),sign('reply:'+body));return JSON.parse(body);
 }
 assert.equal((await send({op:'open'},{auth:false})).error,'STORY_AUTH');
 assert.equal((await send({op:'open'},{namespace:'../authority'})).error,'STORY_ENVELOPE');
 const id=randomUUID();assert.equal((await send({op:'open'},{id})).result.ready,true);
 assert.equal((await send({op:'open'},{id})).error,'STORY_REPLAY');
 assert.equal((await send({op:'enter',mode:'research'})).ok,true);
 assert.equal((await send({op:'state'})).ok,true);
 assert.equal((await send({op:'open',path:root})).error,'STORY_OPEN_FIELDS');
 assert.equal((await send({op:'close'})).ok,true);
 assert.equal((await send({op:'state'})).error,'STORY_NOT_OPEN');
 assert.deepEqual(fs.readdirSync(root),[slot]);
});
