'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
// Read both segments without accepting a mixed pre/post-rotation view.
function readManualTrace(host){
 const files=['manual-scene-trace.previous.jsonl','manual-scene-trace.jsonl'].map(n=>path.join(host,n));
 const stamp=f=>{try{const s=fs.statSync(f);return `${s.ino}:${s.size}:${s.mtimeMs}`;}catch(e){if(e.code==='ENOENT')return null;throw e;}};
 for(let retry=0;retry<3;retry++){
  const before=files.map(stamp);if(before[1]===null)continue;
  let texts;
  try{texts=files.map((f,i)=>before[i]===null?'':fs.readFileSync(f,'utf8'));}
  catch(e){if(e.code==='ENOENT')continue;throw e;}
  if(JSON.stringify(before)!==JSON.stringify(files.map(stamp)))continue;
  // Legacy single-file traces had a 64 MiB cap. New segments together stay <=64 MiB.
  if(texts.reduce((n,s)=>n+Buffer.byteLength(s),0)>64*1024*1024)throw Error('BASELINE_TRACE_SIZE');
  const rows=[];let partial=false;
  for(let i=0;i<texts.length;i++){
   const lines=texts[i].split('\n'),tail=lines.pop();
   if(tail&&i===0)throw Error('BASELINE_PREVIOUS_TRACE_INCOMPLETE');
   partial ||= !!tail;
   rows.push(...lines.filter(Boolean).map(s=>JSON.parse(s)));
  }
  if(!rows.length)throw Error('BASELINE_TRACE_EMPTY');
  return {rows,partial,sha256:crypto.createHash('sha256').update(texts.join('')).digest('hex')};
 }
 throw Error('BASELINE_TRACE_CHANGED_DURING_READ');
}
module.exports={readManualTrace};
