const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {readManualPreflight}=require('./manual-preparation-diagnostics.cjs');
test('preflight reports bounded untrusted hints without interpreting readiness or modifying files',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'eff-preflight-read-')),dir=path.join(root,'entity-guard-proof');fs.mkdirSync(dir);
 const row=(state)=>JSON.stringify({stage:'manual-client-preflight',mcPid:1234,atUnixMs:1000,state});
 fs.writeFileSync(path.join(dir,'state-1-manual-client-preflight.json'),row({admitted:false}));
 fs.writeFileSync(path.join(dir,'state-2-manual-client-preflight.json'),row({admitted:true,arenaReady:false}));
 fs.writeFileSync(path.join(dir,'state-3-manual-server-preflight.json'),'{broken');
 fs.writeFileSync(path.join(dir,'state-4-manual-player-fault.json'),'x'.repeat(32769));
 fs.writeFileSync(path.join(dir,'state-5-manual-target-preflight.json'),row({candidateCount:1}));
 fs.writeFileSync(path.join(dir,'state-99-manual-client-preflight.json'),row({admitted:'outside-bound'}));
 const before=fs.readdirSync(dir).map(name=>[name,fs.readFileSync(path.join(dir,name),'utf8')]);
 const value=readManualPreflight(root);
 assert.equal(value.scope,'diagnostic-only-not-acceptance');assert.equal(value.rejected,3);assert.equal(value.states.length,1);
 assert.deepEqual(value.states[0].state,{admitted:true,arenaReady:false});assert.equal(value.states[0].mcPid,1234);
 assert.equal('ready' in value,false);
 assert.deepEqual(fs.readdirSync(dir).map(name=>[name,fs.readFileSync(path.join(dir,name),'utf8')]),before);
 assert.deepEqual(readManualPreflight(path.join(root,'missing')),{scope:'diagnostic-only-not-acceptance',states:[],rejected:0});
});
