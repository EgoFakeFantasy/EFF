"use strict";
EFFLocal.notify();
const feedback=text=>document.getElementById('homeFeedback').textContent=text;
const native=EFFLocal.native;
document.getElementById('downloadNative').hidden=!!native;
if(native?.bootstrap.model?.enabled){document.getElementById('modelName').value=native.bootstrap.model.name;document.getElementById('modelBudget').value=native.bootstrap.model.profile||'balanced';feedback('本次游戏已启用双代理；点击停止 AI 可立即关闭。');}
for(const id of ['importSave','checkModel','enableModel','stopModel','quitGame'])document.getElementById(id).disabled=!native;
if(!native)feedback('浏览器预览使用独立的本地存储；原生文件存档和模型连接在 EFF.exe 中可用。');
document.getElementById('exportSave').addEventListener('click',async()=>{if(!native){const stores={};for(const key of EFFLocal.keys){const value=localStorage.getItem(key);if(value!==null)stores[key]=value;}const blob=new Blob([JSON.stringify({format:'eff-browser-backup',version:1,stores},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='EFF-browser-save.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);feedback('已导出此浏览器、此访问地址的进度，可在 EFF.exe 导入。');return;}await EFFLocal.flush();const r=await native.exportSave();feedback(r.ok?'存档已经导出。':r.cancelled?'导出已取消。':'导出未完成：'+r.error);});
document.getElementById('importSave').addEventListener('click',async()=>{const r=await native.importSave(document.getElementById('importProfile').value);if(r.ok){EFFLocal.applyEntries(r.entries);feedback('当前模式存档已导入；进入该模式继续。');}else feedback(r.cancelled?'导入已取消。':'未修改存档：'+r.error);});
const modelError=code=>({MODEL_CLOUD_NOT_ALLOWED:'这是云模型；请选择已安装的本地权重。',MODEL_NOT_LOCAL_CHAT:'模型不是可验证的本地对话模型。',MODEL_TIMEOUT:'本地服务检测超时。',MODEL_CANCELLED:'操作已取消。',INVALID_MODEL_CONFIG:'模型名称或预算无效。'}[code]||'本地服务没有准备好。先启动 Ollama 并确认模型已安装，再检测。');
let modelOperation=0;
document.getElementById('checkModel').addEventListener('click',async()=>{
 const operation=++modelOperation,button=document.getElementById('checkModel');button.disabled=true;feedback('正在检查已有本地服务与模型，没有启动或下载操作。');
 try{const r=await native.modelStatus();if(operation!==modelOperation)return;if(r.error){feedback(modelError(r.error));return;}
  const list=document.getElementById('localModels');list.replaceChildren();
  for(const model of r.models){const option=document.createElement('option');option.value=model.name;option.label=model.parameters+' / '+model.quantization+' / '+(model.size/1073741824).toFixed(1)+' GiB';list.append(option);}
  document.getElementById('modelDiagnostics').textContent='可用内存 '+r.resources.freeMemoryGiB+' / '+r.resources.totalMemoryGiB+' GiB · '+r.models.length+' 个候选模型。大小是权重文件体积，实际推理还需要额外内存。';
  if(!document.getElementById('modelName').value&&r.models.length)document.getElementById('modelName').value=[...r.models].sort((a,b)=>a.size-b.size)[0].name;
  feedback(r.models.length?'已读取安装列表。启用时还会核验所选模型是否为本地权重。':'服务已连接，未发现本地对话模型；仍可以使用规则模板。');
 }catch{if(operation===modelOperation)feedback('检测没有完成，可以重新检测。');}finally{button.disabled=false;}
});
document.getElementById('enableModel').addEventListener('click',async()=>{
 const model=document.getElementById('modelName').value.trim();if(!model){feedback('先检测并选择已经安装的本地模型。');return;}
 const operation=++modelOperation;feedback('正在核验本地模型，游戏数据尚未发送。');
 try{const r=await native.modelConfigure({enabled:true,model,profile:document.getElementById('modelBudget').value});if(operation!==modelOperation)return;feedback(r.error?modelError(r.error):'双代理已开启：同一套权重、两份独立上下文。进入现象战争后研究方案，再审阅执行。');}catch{if(operation===modelOperation)feedback('未能启用本地模型。');}
});
document.getElementById('stopModel').addEventListener('click',async()=>{modelOperation++;await native.modelConfigure({enabled:false,model:''});feedback('本游戏的两侧模型请求已停止；你自己的 Ollama 服务继续由你管理。');});
document.getElementById('quitGame').addEventListener('click',()=>native.quit());
const c=document.getElementById('homeArt').getContext('2d');c.imageSmoothingEnabled=false;
c.fillStyle='#0c1728';c.fillRect(0,0,640,176);
for(let i=0;i<110;i++){const x=(i*73+17)%640,y=(i*37+9)%160;c.fillStyle=i%4?'#1a2a3c':'#3d5263';c.fillRect(x,y,1,2);}
for(let r=39;r>0;r--){const shade=r>30?'#392233':r>22?'#6b343e':'#b55251';c.fillStyle=shade;for(let y=-r;y<=r;y++){const w=Math.floor(Math.sqrt(r*r-y*y));c.fillRect(499-w,45+y,w*2,1);}}
for(let y=0;y<176;y+=16){for(let x=367;x<448;x+=16){c.fillStyle=(x+y)%32?'#172435':'#213146';c.fillRect(x,y,15,15);c.fillStyle='#3a485b';c.fillRect(x+2,y+1,10,1);}c.fillStyle='#0b121f';c.fillRect(390,y+5,14,5);}
for(let y=94;y<176;y+=13){c.fillStyle='#172536';c.fillRect(295-(y-94),y,126,4);c.fillStyle='#3a4e60';c.fillRect(304-(y-94),y,80,1);}
c.fillStyle='#080e18';c.fillRect(0,165,640,11);c.fillStyle='#8c9c9f';c.fillRect(453,127,6,6);c.fillStyle='#526984';c.fillRect(452,133,8,13);c.fillStyle='#243349';c.fillRect(452,145,3,7);c.fillRect(457,145,3,7);
