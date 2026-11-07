'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {retainFailureTail}=require('./failure-tail.cjs');
test('failure tail is bounded observation only even if responsiveness later recovers',async()=>{
 let time=10,checks=0;const waits=[];
 const result=await retainFailureTail({isRunning:()=>{checks++;return true;},now:()=>time,wait:async ms=>{waits.push(ms);time+=ms;}});
 assert.equal(result.endedAtMs-result.startedAtMs,3000);assert.equal(result.affectsAcceptance,false);
 assert.equal(waits.length,30);assert.ok(checks<=31);assert.ok(waits.every(n=>n<=100));
});
test('exit ends observation promptly and bad clocks cannot wait indefinitely',async()=>{
 let time=0,count=0;
 const ended=await retainFailureTail({isRunning:()=>time<200,now:()=>time,wait:async ms=>{time+=ms;}});
 assert.equal(ended.endedAtMs,200);
 await retainFailureTail({isRunning:()=>true,now:()=>0,wait:async()=>{count++;}});
 assert.ok(count<=31);
 await assert.rejects(retainFailureTail({isRunning:()=>true,durationMs:5001}),/FAILURE_TAIL_BUDGET/);
});
