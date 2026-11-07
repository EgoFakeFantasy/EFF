'use strict';
// Before arming only. Every post-arm sample remains subject to strict combat acceptance.
function stableWindow(samples,launchPid){
 if(!samples.length)return null;
 const first=samples[0];
 if(samples.some(x=>x.launchPid!==launchPid||!Number.isSafeInteger(x.pid)||x.pid<=0||x.pid!==first.pid||x.processStartedUtcTicks!==first.processStartedUtcTicks))throw Error('PROBE_LAUNCH_IDENTITY_MISMATCH');
 if(samples.some(x=>x.alive!==true))throw Error('PROBE_PROCESS_LOST_BEFORE_ATTACK');
 const handles=new Set(samples.filter(x=>x.windowHandle!=='0').map(x=>x.windowHandle));
 if(handles.size>1)throw Error('PROBE_WINDOW_REPLACED_BEFORE_ATTACK');
 const tail=samples.slice(-3);
 if(tail.length===3&&tail.every(x=>x.responsive===true&&x.windowPresent===true&&typeof x.windowHandle==='string'&&/^[a-f0-9]+$/.test(x.windowHandle)&&!/^0+$/.test(x.windowHandle))&&tail[2].atMs-tail[0].atMs>=1800&&tail[2].atMs-tail[0].atMs<=4000)return tail;
 if(samples.at(-1).atMs-first.atMs>=10000)throw Error('PROBE_INITIAL_WINDOW_UNAVAILABLE');
 return null;
}
module.exports={stableWindow};
