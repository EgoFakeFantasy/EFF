'use strict';
// Diagnostic-only observation after a latched failure. Never clears an error,
// extends the successful observation window, relaunches a child or stops one.
async function retainFailureTail({isRunning,now=()=>performance.now(),wait=ms=>new Promise(r=>setTimeout(r,ms)),durationMs=3000}){
 if(!Number.isSafeInteger(durationMs)||durationMs<0||durationMs>5000)throw Error('FAILURE_TAIL_BUDGET');
 const startedAtMs=now(),deadline=startedAtMs+durationMs;
 let checks=0;
 // Check count also bounds a stalled or backwards clock supplied by a test/provider.
 while(checks++<Math.ceil(durationMs/100)+1&&isRunning()){
  const remaining=deadline-now();if(remaining<=0)break;
  await wait(Math.min(100,remaining));
 }
 return {startedAtMs,endedAtMs:now(),budgetMs:durationMs,evidenceScope:'post-failure diagnostics only',affectsAcceptance:false};
}
module.exports={retainFailureTail};
