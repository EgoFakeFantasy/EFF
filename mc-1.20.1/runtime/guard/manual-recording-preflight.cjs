'use strict';
const fs=require('node:fs'),path=require('node:path');
function assertManualObserverReady(host,pid,now=Date.now()){
 for(const name of ['manual-observer-error.json','manual-first-structural-loss.json','manual-runtime-fault.json'])
  if(fs.existsSync(path.join(host,name)))throw Error('RECORDING_OBSERVER_FAILED:'+name);
 const file=path.join(host,'manual-scene-trace.jsonl'),s=fs.statSync(file);
 if(s.size===0||now-s.mtimeMs>5000||s.mtimeMs>now+250)throw Error('RECORDING_OBSERVER_STALE');
 const start=Math.max(0,s.size-1024*1024),buffer=Buffer.alloc(s.size-start),fd=fs.openSync(file,'r');
 try{fs.readSync(fd,buffer,0,buffer.length,start);}finally{fs.closeSync(fd);}
 const lines=buffer.toString('utf8').split('\n');lines.pop();if(start)lines.shift();
 const row=JSON.parse(lines.filter(Boolean).at(-1)||'null');
 if(!row||row.pid!==pid||row.structuralFailureLatched!==false||row.server?.failed!==false
  ||!Number.isFinite(row.serverAgeMs)||row.serverAgeMs<0||row.serverAgeMs>5000
  ||!Number.isFinite(row.observedAtUnixMs)||now-row.observedAtUnixMs>5000||row.observedAtUnixMs>now+250)
  throw Error('RECORDING_ORIGINAL_EVIDENCE_UNAVAILABLE');
 return {observedAtUnixMs:row.observedAtUnixMs,pid:row.pid};
}
module.exports={assertManualObserverReady};
