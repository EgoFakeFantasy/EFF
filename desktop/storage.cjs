"use strict";
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const LOGICAL=['wuzhong-returner-pixel-v1','wuzhong-returner-pixel-meta-v1','wuzhong-returner-pixel-settings-v1','wuzhong-returner-pixel-journal-v1','wuzhong-returner-phenomenon-lab-v1'];
const allowed=new Set(['story','tech'].flatMap(p=>LOGICAL.map(k=>p+':'+k)));
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function inspect(v,depth=0){if(depth>24)throw Error('DATA_TOO_DEEP');if(v&&typeof v==='object'){for(const k of Object.keys(v)){if(['__proto__','prototype','constructor'].includes(k))throw Error('UNSAFE_FIELD');inspect(v[k],depth+1);}}}
function validateEntries(entries){
 if(!record(entries)||Object.keys(entries).length>10)throw Error('INVALID_STORAGE');
 const result=Object.create(null);
 for(const [key,value] of Object.entries(entries)){
  if(!allowed.has(key))throw Error('KEY_NOT_ALLOWED');
  if(value!==null&&(typeof value!=='string'||Buffer.byteLength(value)>512*1024))throw Error('SAVE_TOO_LARGE');
  if(value!==null){const data=JSON.parse(value);inspect(data);result[key]=value;}
  else result[key]=null;
 }
 return result;
}
function checksum(entries){return crypto.createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(entries).sort(([a],[b])=>a.localeCompare(b))))).digest('hex');}
function readPacket(text){
 if(Buffer.byteLength(text)>6*1024*1024)throw Error('SAVE_TOO_LARGE');
 const p=JSON.parse(text);inspect(p);
 if(!record(p)||p.format!=='eff-local-save'||p.version!==1||!Number.isSafeInteger(p.revision)||p.revision<0||Object.keys(p).some(k=>!['format','version','revision','entries','checksum'].includes(k)))throw Error('INVALID_SAVE');
 const entries=validateEntries(p.entries);if(p.checksum!==checksum(entries))throw Error('SAVE_CHECKSUM');return {entries,revision:p.revision};
}
function importData(text,profile){
 if(!['story','tech'].includes(profile)||Buffer.byteLength(text)>6*1024*1024)throw Error('INVALID_IMPORT');
 const p=JSON.parse(text);inspect(p);const entries={};
 if(p?.format==='eff-local-save'){const packet=readPacket(text);for(const [key,value] of Object.entries(packet.entries)){if(key.startsWith(profile+':'))entries[key]=value;}}
 else if(record(p)&&typeof p.area==='string'&&record(p.flags))entries[profile+':'+LOGICAL[0]]=JSON.stringify(p);
 else if(record(p)&&p.format==='eff-browser-backup'&&p.version===1&&record(p.stores)){
  for(const [key,value] of Object.entries(p.stores)){if(!LOGICAL.includes(key))throw Error('KEY_NOT_ALLOWED');entries[profile+':'+key]=value;}
 }else throw Error('INVALID_IMPORT');
 if(!Object.keys(entries).length)throw Error('EMPTY_IMPORT');return validateEntries(entries);
}
async function readBounded(file){const info=await fs.stat(file);if(info.size>6*1024*1024)throw Error('SAVE_TOO_LARGE');return fs.readFile(file,'utf8');}
class SaveStore{
 constructor(directory){this.directory=directory;this.file=path.join(directory,'save-state.json');this.backup=this.file+'.bak';this.entries={};this.revision=0;this.queue=Promise.resolve();this.recovered=false;}
 async load(){await fs.mkdir(this.directory,{recursive:true});for(const file of [this.file,this.backup]){try{const p=readPacket(await readBounded(file));this.entries=p.entries;this.revision=p.revision;this.recovered=file===this.backup;return;}catch(e){if(e.code!=='ENOENT')this.recovered=true;}}}
 bootstrap(){return {version:1,entries:this.entries,recovered:this.recovered};}
 packet(entries=this.entries,revision=this.revision){return {format:'eff-local-save',version:1,revision,entries,checksum:checksum(entries)};}
 commit(changes){
  const valid=validateEntries(changes);
  const job=this.queue.catch(()=>{}).then(async()=>{
   const next={...this.entries};for(const [key,value] of Object.entries(valid)){if(value===null)delete next[key];else next[key]=value;}
   const text=JSON.stringify(this.packet(next,this.revision+1)),temp=this.file+'.tmp';
   if(Buffer.byteLength(text)>6*1024*1024)throw Error('SAVE_TOO_LARGE');
   const handle=await fs.open(temp,'w');try{await handle.writeFile(text,'utf8');await handle.sync();}finally{await handle.close();}
   // A corrupt primary never overwrites the last known-good backup.
   try{const old=await readBounded(this.file);readPacket(old);await fs.writeFile(this.backup,old,'utf8');}catch(e){if(e.code!=='ENOENT'&&!this.recovered)throw e;}
   await fs.rename(temp,this.file);this.entries=next;this.revision++;this.recovered=false;return {ok:true,revision:this.revision};
  });this.queue=job;return job;
 }
 async flush(){await this.queue;}
}
module.exports={SaveStore,LOGICAL,allowed,validateEntries,readPacket,importData};
