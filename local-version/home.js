"use strict";
EFFLocal.notify();
const feedback=text=>document.getElementById('homeFeedback').textContent=text;
const native=EFFLocal.native;
if(native?.bootstrap.model?.enabled){document.getElementById('modelName').value=native.bootstrap.model.name;feedback('本次游戏已启用本地建议；点击停止 AI 可立即关闭。');}
for(const id of ['importSave','enableModel','stopModel','quitGame'])document.getElementById(id).disabled=!native;
if(!native)feedback('浏览器预览使用独立的本地存储；原生文件存档和模型连接在 EFF.exe 中可用。');
document.getElementById('exportSave').addEventListener('click',async()=>{if(!native){const stores={};for(const key of EFFLocal.keys){const value=localStorage.getItem(key);if(value!==null)stores[key]=value;}const blob=new Blob([JSON.stringify({format:'eff-browser-backup',version:1,stores},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='EFF-browser-save.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);feedback('已导出此浏览器、此访问地址的进度，可在 EFF.exe 导入。');return;}await EFFLocal.flush();const r=await native.exportSave();feedback(r.ok?'存档已经导出。':r.cancelled?'导出已取消。':'导出未完成：'+r.error);});
document.getElementById('importSave').addEventListener('click',async()=>{const r=await native.importSave(document.getElementById('importProfile').value);if(r.ok){EFFLocal.applyEntries(r.entries);feedback('当前模式存档已导入；进入该模式继续。');}else feedback(r.cancelled?'导入已取消。':'未修改存档：'+r.error);});
document.getElementById('enableModel').addEventListener('click',async()=>{const model=document.getElementById('modelName').value.trim();if(!model){feedback('填写你已经安装的模型名称。');return;}const r=await native.modelConfigure({enabled:true,model});feedback(r.error?'没有启用：'+r.error:'本地建议已开启。分析时会连接已有 Ollama，失败时使用规则模板。');});
document.getElementById('stopModel').addEventListener('click',async()=>{await native.modelConfigure({enabled:false,model:''});feedback('本游戏的模型请求已停止；Ollama 服务由你管理。');});
document.getElementById('quitGame').addEventListener('click',()=>native.quit());
const c=document.getElementById('homeArt').getContext('2d');c.imageSmoothingEnabled=false;
c.fillStyle='#0c1728';c.fillRect(0,0,640,176);
for(let i=0;i<110;i++){const x=(i*73+17)%640,y=(i*37+9)%160;c.fillStyle=i%4?'#1a2a3c':'#3d5263';c.fillRect(x,y,1,2);}
for(let r=39;r>0;r--){const shade=r>30?'#392233':r>22?'#6b343e':'#b55251';c.fillStyle=shade;for(let y=-r;y<=r;y++){const w=Math.floor(Math.sqrt(r*r-y*y));c.fillRect(499-w,45+y,w*2,1);}}
for(let y=0;y<176;y+=16){for(let x=367;x<448;x+=16){c.fillStyle=(x+y)%32?'#172435':'#213146';c.fillRect(x,y,15,15);c.fillStyle='#3a485b';c.fillRect(x+2,y+1,10,1);}c.fillStyle='#0b121f';c.fillRect(390,y+5,14,5);}
for(let y=94;y<176;y+=13){c.fillStyle='#172536';c.fillRect(295-(y-94),y,126,4);c.fillStyle='#3a4e60';c.fillRect(304-(y-94),y,80,1);}
c.fillStyle='#080e18';c.fillRect(0,165,640,11);c.fillStyle='#8c9c9f';c.fillRect(453,127,6,6);c.fillStyle='#526984';c.fillRect(452,133,8,13);c.fillStyle='#243349';c.fillRect(452,145,3,7);c.fillRect(457,145,3,7);
