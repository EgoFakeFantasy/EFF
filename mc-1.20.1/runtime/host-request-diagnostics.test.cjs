const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{Readable}=require('node:stream'),{EventEmitter}=require('node:events');
const {createHmac}=require('node:crypto');
const {Controller}=require('./controller.cjs');
test('authenticated rejection diagnostics remain bounded, omit values and preserve rejection',async()=>{
 const root=path.resolve(__dirname,'../../output');fs.mkdirSync(root,{recursive:true});
 const directory=fs.mkdtempSync(path.join(root,'host-diagnostic-test-'));
 const c=Object.assign(Object.create(Controller.prototype),{directory,hostEpoch:1,token:'synthetic-token-private',session:'synthetic-session-private',
   config:{host:{args:['-Deff.entityGuardSelftest=true']}},events:[],seenRequests:new Set(),firewall:{admit(){}},
   dispatch(){throw Error('PROJECTION_INVALID');}});
 async function send(n,valid=true){
   const raw=JSON.stringify({op:'heartbeat',session:c.session,epoch:1,requestId:'diagnostic-request-'+n,
     projection:{player:{uuid:'synthetic-private-value',alive:true,health:20},avatar:null}});
   const req=Readable.from([Buffer.from(raw)]);Object.assign(req,{method:'POST',url:'/v1/host',
     headers:{'x-eff-auth':valid?createHmac('sha256',c.token).update('request:'+raw).digest('hex'):'0'.repeat(64)},setTimeout(){}});
   const res=new EventEmitter();res.setHeader=()=>{};res.end=body=>{res.body=JSON.parse(body);res.emit('close');};
   await c.handle(req,res);assert.equal(res.statusCode,409);assert.equal(res.body.ok,false);return res.body;
 }
 assert.equal((await send(0,false)).error,'INVALID_HOST_SIGNATURE');assert.equal(fs.readdirSync(directory).length,0);
 for(let n=1;n<=6;n++)assert.equal((await send(n)).error,'PROJECTION_INVALID');
 const files=fs.readdirSync(directory);assert.equal(files.length,4);
 for(const file of files){
   const raw=fs.readFileSync(path.join(directory,file),'utf8'),record=JSON.parse(raw);
   assert.equal(record.playerType,'object');assert.equal(record.avatarType,'null');assert.equal(record.playerShape.uuid,'string');
   assert.equal(record.playerShape.health,'number');
   for(const secret of [c.token,c.session,'synthetic-private-value','diagnostic-request-'])assert.equal(raw.includes(secret),false);
 }
});
