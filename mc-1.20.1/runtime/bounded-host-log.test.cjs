'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{finished}=require('node:stream/promises');
const {boundedHostLog}=require('./bounded-host-log.cjs');
test('host output is drained with a cumulative on-disk cap across restarts',async t=>{
 const base=fs.realpathSync(os.tmpdir()),root=fs.mkdtempSync(path.join(base,'eff-log-test-'));
 t.after(()=>{if(path.dirname(fs.realpathSync(root))!==base)throw Error('UNSAFE_TEST_CLEANUP');fs.rmSync(root,{recursive:true,force:true});});
 const file=path.join(root,'host.log');fs.writeFileSync(file,'existing');let limits=0;
 const first=boundedHostLog(file,{maxBytes:64,onLimit:()=>limits++});
 for(let i=0;i<100;i++)first.write(Buffer.alloc(1000,65));first.end();await finished(first);
 assert.equal(fs.statSync(file).size,64);assert.equal(first.budget().dropped,99944);assert.equal(limits,1);
 const again=boundedHostLog(file,{maxBytes:64});again.end('second generation');await finished(again);
 assert.equal(fs.statSync(file).size,64);assert.equal(again.budget().dropped,17);
 assert.equal(fs.readFileSync(file,'utf8').slice(0,8),'existing');
 assert.throws(()=>boundedHostLog(file,{maxBytes:Infinity}),/BUDGET_INVALID/);
});
