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
// Home illustration: the rain tower beneath the red moon, drawn on a 2× backing so
// edges have half-pixel detail. It animates only rain, stars and the moon's glow.
(()=>{
 const canvas=document.getElementById('homeArt'),c=canvas.getContext('2d'),R=2;canvas.width=640*R;canvas.height=176*R;
 const still=matchMedia('(prefers-reduced-motion: reduce)').matches,hash=(a,b)=>{const v=Math.sin(a*127.1+b*311.7)*43758.5453;return v-Math.floor(v);};
 const px=(x,y,w,h,col)=>{c.fillStyle=col;c.fillRect(x,y,w,h);};
 const disc=(cx,cy,r,col)=>{c.fillStyle=col;c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);c.fill();};
 function frame(now){
  const t=still?0:now/1000;c.setTransform(R,0,0,R,0,0);c.imageSmoothingEnabled=false;
  const sky=c.createLinearGradient(0,0,0,176);sky.addColorStop(0,'#0c1728');sky.addColorStop(.6,'#0a1525');sky.addColorStop(1,'#121a2a');c.fillStyle=sky;c.fillRect(0,0,640,176);
  for(let i=0;i<140;i++){const x=Math.floor(hash(i,1)*640),y=Math.floor(hash(i,2)*150),tw=still?1:.55+.45*Math.sin(t*(1+hash(i,3)*2)+i);c.globalAlpha=tw*(i%5?.6:1);px(x,y,i%7?.5:1,i%7?.5:1,i%5?'#5d7790':'#d6deea');}
  c.globalAlpha=1;
  // Red moon: halo, body, terminator shading and craters.
  const glow=still?.5:.45+.08*Math.sin(t*.7),halo=c.createRadialGradient(499,45,30,499,45,95);halo.addColorStop(0,`rgba(181,82,81,${glow*.45})`);halo.addColorStop(1,'rgba(181,82,81,0)');c.fillStyle=halo;c.fillRect(380,0,240,150);
  disc(499,45,39,'#6b343e');disc(503,42,35,'#a24749');disc(507,39,28,'#c05b55');disc(511,34,15,'#d4766a');
  for(const [x,y,r] of [[488,58,6],[516,52,4],[493,31,3.5],[522,28,2.5],[478,42,3]]){disc(x,y,r,'#8a3a40');disc(x+.5,y+.5,r-1,'#b5524f');}
  c.save();c.beginPath();c.arc(499,45,39,0,Math.PI*2);c.clip();disc(475,57,40,'rgba(33,14,30,.42)');c.restore();
  // Distant ruined blocks.
  for(let i=0;i<9;i++){const x=i*72-10,h=30+hash(i,8)*44;px(x,176-h,52,h,'#0f1a29');for(let wy=176-h+6;wy<170;wy+=9)for(let wx=x+5;wx<x+48;wx+=8)if(hash(wx,wy)>.82)px(wx,wy,2.5,3,'#3b4651');}
  // The tower: bricks with mortar, lit edge and a few windows.
  px(364,0,87,176,'#121d2c');
  for(let y=0;y<176;y+=8){const o=(y/8)%2?8:0;for(let x=367-o;x<448;x+=16){const sx=Math.max(367,x),w=Math.min(448,x+15.5)-sx;if(w<=0)continue;px(sx,y,w,7.5,hash(x,y)>.5?'#1a2738':'#1e2c3f');px(sx,y,w,.5,'#2f3e52');}}
  px(447,0,1.5,176,'#4a5b6e');px(364,0,1,176,'#0a111c');
  for(let y=5;y<176;y+=16){px(390,y,14,5,'#0b121f');px(390,y,14,.5,'#05080f');const lit=still?hash(y,9)>.6:hash(y,Math.floor(t*.25))>.75;if(lit){px(391,y+1,12,3.5,'#d7a35d');px(391,y+1,12,1,'#f0c886');}}
  // Stair spiralling down from the tower.
  for(let y=94;y<176;y+=13){const x=295-(y-94);px(x,y,126,4,'#172536');px(x+9,y,80,1,'#3a4e60');px(x,y+4,126,1.5,'#0b1320');for(let k=0;k<126;k+=14)px(x+k,y+.5,.5,3,'#24364a');}
  px(0,165,640,11,'#080e18');px(0,165,640,.5,'#1d2a38');
  // The returner on the stair, coat moving slightly in the wind.
  const sway=still?0:Math.sin(t*1.6)*.5;
  px(452.5,126,7,7,'#c9b9a4');px(452,125,8,3,'#1c2230');px(452,128,2,3,'#1c2230');px(458,129,1,1,'#2b2a35');
  px(451.5,133,9,13,'#3c5272');px(451.5,133,9,1,'#5c7397');px(460+sway,138,1.5,8,'#2c3d58');px(455.5,134,1,11,'#2c3d58');
  px(452,146,3,7,'#1e2a3c');px(457,146,3,7,'#1e2a3c');px(451.5,152.5,4,1.5,'#0b0f17');px(456.5,152.5,4,1.5,'#0b0f17');
  // Rain, slanted, lit where it crosses the moon.
  for(let i=0;i<120;i++){const x=(hash(i,4)*700+t*40)%700-30,y=(hash(i,5)*200+t*(170+hash(i,6)*60))%200-12,near=Math.hypot(x-499,y-45)<45;c.strokeStyle=near?'rgba(236,170,160,.55)':'rgba(120,150,180,.28)';c.lineWidth=.5;c.beginPath();c.moveTo(x,y);c.lineTo(x-2,y+7);c.stroke();}
  if(!still)requestAnimationFrame(frame);
 }
 requestAnimationFrame(frame);
})();
