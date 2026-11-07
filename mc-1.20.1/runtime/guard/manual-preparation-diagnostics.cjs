'use strict';
const fs=require('node:fs'),path=require('node:path');
const stages=new Set(['manual-client-preflight','manual-server-preflight','manual-target-preflight','manual-player-fault','player-claim-rejected']);

// Host-created diagnostic files are untrusted hints. Never use these to grant readiness.
function readManualPreflight(hostDirectory){
 const directory=path.join(hostDirectory,'entity-guard-proof'),latest=new Map();
 let rejected=0,names;
 try{names=fs.readdirSync(directory);}catch{return {scope:'diagnostic-only-not-acceptance',states:[],rejected};}
 const candidates=names.map(name=>({name,match:/^state-([1-9]|[12][0-9]|3[0-2])-([a-z-]+)\.json$/.exec(name)}))
  .filter(x=>x.match&&stages.has(x.match[2])).sort((a,b)=>Number(a.match[1])-Number(b.match[1]));
 for(const item of candidates.slice(0,128))try{
  const file=path.join(directory,item.name),stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>32768)throw Error('DIAGNOSTIC_SHAPE');
  const record=JSON.parse(fs.readFileSync(file,'utf8'));
  if(record.stage!==item.match[2]||!Number.isSafeInteger(record.mcPid)||record.mcPid<=0
      ||!Number.isSafeInteger(record.atUnixMs)||record.atUnixMs<=0||!record.state
      ||typeof record.state!=='object'||Array.isArray(record.state))throw Error('DIAGNOSTIC_SHAPE');
  latest.set(record.stage,{file:item.name,mcPid:record.mcPid,atUnixMs:record.atUnixMs,state:record.state});
 }catch{rejected++;}
 return {scope:'diagnostic-only-not-acceptance',states:[...latest.values()],rejected};
}
module.exports={readManualPreflight};
