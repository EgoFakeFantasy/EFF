"use strict";
const EFFLocal=(()=>{
 const native=typeof window!=='undefined'&&window.effDesktop;
 let enabled=false,profile='story';
 try{const p=new URLSearchParams(location.search);enabled=Boolean(native)||p.get('edition')==='local';profile=p.get('mode')==='tech'?'tech':'story';}catch{}
 const keys=['wuzhong-returner-pixel-v1','wuzhong-returner-pixel-meta-v1','wuzhong-returner-pixel-settings-v1','wuzhong-returner-pixel-journal-v1','wuzhong-returner-phenomenon-lab-v1'];
 let timer=null,pending={},status='浏览器存档',stopped=false;
 let get,set,remove;
 const notify=()=>{const el=document.getElementById('localSaveStatus');if(el)el.textContent=status;};
 async function flush(){
  if(timer){clearTimeout(timer);timer=null;}if(!native)return;
  const changes=pending;pending={};if(!Object.keys(changes).length)return;
  status='正在写入本地文件';notify();
  try{const result=await native.persist(changes);if(!result.ok)throw Error(result.error);status='本地文件已保存';}
  catch(e){pending={...changes,...pending};status='文件写入失败；窗口内进度仍保留';}notify();
 }
 if(enabled&&typeof Storage!=='undefined'){
  get=Storage.prototype.getItem;set=Storage.prototype.setItem;remove=Storage.prototype.removeItem;
  if(native){
   try{
    for(const p of ['story','tech'])for(const k of keys){const physical=p+':'+k,v=native.bootstrap.entries?.[physical];if(typeof v==='string')set.call(localStorage,physical,v);else remove.call(localStorage,physical);}
    status=native.bootstrap.recovered?'已从备份恢复本地存档':'本地文件存档';
   }catch(e){status='本地镜像写入受限；采用文件存档';}
  }
  const physical=key=>keys.includes(key)?profile+':'+key:key;
  const changed=(key,value)=>{if(native&&keys.some(k=>key===profile+':'+k)){pending[key]=value;if(!timer)timer=setTimeout(flush,60);}};
  Storage.prototype.getItem=function(key){return get.call(this,this===localStorage?physical(key):key);};
  Storage.prototype.setItem=function(key,value){const k=this===localStorage?physical(key):key;set.call(this,k,value);if(this===localStorage)changed(k,String(value));};
  Storage.prototype.removeItem=function(key){const k=this===localStorage?physical(key):key;remove.call(this,k);if(this===localStorage)changed(k,null);};
  window.addEventListener('pagehide',()=>{stopped=true;void flush();});
 }
 function applyEntries(entries){if(!native)return;for(const k of keys){const key=profile+':'+k;if(entries[key]===undefined)remove.call(localStorage,key);else set.call(localStorage,key,entries[key]);}}
 function init(){if(!enabled)return;document.body.classList.add('local-edition');const label=document.querySelector('.edition');if(label)label.textContent=profile==='tech'?'现象战争':'本地版';
  const nav=document.querySelector('.top-actions');if(nav){const menu=document.createElement('button');menu.id='localMenuButton';menu.type='button';menu.textContent='主菜单';menu.addEventListener('click',async()=>{if(typeof saveRun==='function')saveRun(true);AgentBridge.cancel();await flush();location.href='../local-version/index.html';});nav.append(menu);}
  const header=document.querySelector('.topbar');if(header){const badge=document.createElement('p');badge.id='localSaveStatus';badge.className='local-save-status';badge.setAttribute('role','status');header.after(badge);notify();}}
 return {enabled,profile,native,keys,flush,notify,init,applyEntries,get stopped(){return stopped;}};
})();
if(typeof window!=='undefined'){window.EFFLocal=EFFLocal;}
if(typeof globalThis!=='undefined'){globalThis.EFFLocal=EFFLocal;}
if(typeof module!=='undefined'&&module.exports){module.exports={EFFLocal};}
