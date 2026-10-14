"use strict";
// Whole-window presentation. The arbiter commits first; animation has no victory authority.
const ScreenTheatre={dom:null,session:null,focused:true,serial:0,seen:new Set(),projection:1,
 active(){return !!this.session;},
 utilityPaused(){return Boolean(Expedition.dom?.settingsDialog.open||Expedition.dom?.journalDialog.open||document.getElementById('renameDialog')?.open||!ui.codex.hidden);},
 enabled(){return EFFLocal.enabled&&!!this.dom;},
 init(){
  if(!EFFLocal.enabled)return;
  const dialog=document.createElement('dialog');dialog.id='screenTheatre';dialog.className='screen-theatre';dialog.setAttribute('aria-label','现象争夺的全屏演出');
  dialog.innerHTML=`<canvas class="theatre-code" width="640" height="360" aria-hidden="true"></canvas><div class="theatre-world" aria-hidden="true"></div><div class="theatre-new-world" aria-hidden="true"><div class="theatre-window-bar"><span>EFF / 无中归来者</span><span class="theatre-instance"></span></div><div class="theatre-restored"></div></div><div class="theatre-veil" aria-hidden="true"></div><section class="theatre-writing"><p class="theatre-kicker"></p><h2 class="theatre-title"></h2><p class="theatre-subtitle"></p><div class="theatre-verses"><del tabindex="0" aria-label="原先的完整语句"></del><ins tabindex="0" aria-label="改写后的完整语句"></ins><p></p></div></section><div class="theatre-boot"><span>EFF</span><strong>当前运行表面已断裂</strong><p></p></div><footer class="theatre-controls"><span class="theatre-beat" role="status" aria-live="polite"></span><button class="theatre-pause" type="button">暂停演出</button><button class="theatre-skip" type="button">略过演出</button></footer>`;
  document.body.append(dialog);this.dom={dialog,code:dialog.querySelector('.theatre-code'),world:dialog.querySelector('.theatre-world'),newWorld:dialog.querySelector('.theatre-new-world'),restored:dialog.querySelector('.theatre-restored'),instance:dialog.querySelector('.theatre-instance'),kicker:dialog.querySelector('.theatre-kicker'),title:dialog.querySelector('.theatre-title'),subtitle:dialog.querySelector('.theatre-subtitle'),verses:dialog.querySelector('.theatre-verses'),boot:dialog.querySelector('.theatre-boot'),beat:dialog.querySelector('.theatre-beat'),pause:dialog.querySelector('.theatre-pause')};
  dialog.querySelector('.theatre-skip').addEventListener('click',()=>this.finish('skip'));
  this.dom.pause.addEventListener('click',()=>{if(!this.session)return;this.session.paused=!this.session.paused;this.dom.pause.textContent=this.session.paused?'继续演出':'暂停演出';});
  dialog.addEventListener('cancel',event=>{event.preventDefault();this.finish('skip');});
  document.addEventListener('keydown',event=>{
   if(!this.active())return;
   if(event.key==='Escape'){event.preventDefault();this.finish('skip');}
   else if(event.code==='Space'&&!event.repeat){event.preventDefault();this.dom.pause.click();}
   if(!['Tab','Shift','Control','Alt','Meta'].includes(event.key))event.stopImmediatePropagation();
  },true);
  window.addEventListener('blur',()=>{this.focused=false;});window.addEventListener('focus',()=>{this.focused=true;});
  window.addEventListener('pagehide',()=>this.cancel());
 },
 snapshot(){
  const root=document.createElement('div');root.className='theatre-snapshot';root.style.width=window.innerWidth+'px';root.style.height=window.innerHeight+'px';root.inert=true;
  const properties=['display','box-sizing','position','inset','z-index','width','height','min-width','max-width','min-height','max-height','margin','padding','border','border-radius','background','color','font','line-height','letter-spacing','text-align','white-space','overflow','overflow-x','overflow-y','opacity','box-shadow','text-shadow','grid-template-columns','grid-template-rows','gap','flex-direction','flex-wrap','justify-content','align-items','align-content','flex','object-fit','image-rendering','transform','transform-origin'];
  for(const source of [...document.body.children]){
   if(source===this.dom.dialog||['SCRIPT','STYLE','LINK'].includes(source.tagName))continue;
   const rect=source.getBoundingClientRect();if(rect.width<1||rect.height<1||rect.bottom<0||rect.top>window.innerHeight)continue;
   const clone=source.cloneNode(true),srcNodes=[source,...source.querySelectorAll('*')],dstNodes=[clone,...clone.querySelectorAll('*')];
   if(srcNodes.length>1100)continue;
   for(let i=0;i<srcNodes.length;i++){
    const src=srcNodes[i],dst=dstNodes[i];if(['SCRIPT','STYLE','LINK','IFRAME','OBJECT','EMBED'].includes(dst.tagName)){dst.remove();continue;}
    const computed=getComputedStyle(src);for(const property of properties)dst.style.setProperty(property,computed.getPropertyValue(property));
    for(const attr of [...dst.attributes])if(attr.name==='id'||attr.name==='name'||attr.name==='href'||attr.name==='autofocus'||attr.name.startsWith('on'))dst.removeAttribute(attr.name);
    dst.tabIndex=-1;if('value' in src)dst.value=src.value;if('checked' in src)dst.checked=src.checked;
    if(src.tagName==='CANVAS'){dst.width=src.width;dst.height=src.height;try{dst.getContext('2d').drawImage(src,0,0);}catch{}}
    dst.scrollTop=src.scrollTop;dst.scrollLeft=src.scrollLeft;
   }
   clone.style.cssText+=';position:absolute!important;left:'+Math.round(rect.left)+'px!important;top:'+Math.round(rect.top)+'px!important;right:auto!important;bottom:auto!important;width:'+Math.round(rect.width)+'px!important;height:'+Math.round(rect.height)+'px!important;margin:0!important;transform:none!important;pointer-events:none!important;';
   if(source.matches(':modal')){const shade=document.createElement('div');shade.style.cssText='position:absolute;inset:0;background:'+getComputedStyle(source,'::backdrop').backgroundColor+';z-index:900;pointer-events:none;';root.append(shade);clone.style.setProperty('z-index','1000','important');}
   root.append(clone);
  }
  return root;
 },
 copySnapshot(source){
  const clone=source.cloneNode(true),a=source.querySelectorAll('canvas'),b=clone.querySelectorAll('canvas');
  for(let i=0;i<a.length;i++){b[i].width=a[i].width;b[i].height=a[i].height;b[i].getContext('2d').drawImage(a[i],0,0);}
  clone.inert=true;return clone;
 },
 panes(source){
  const shapes=['polygon(0 0,48% 0,52% 39%,34% 54%,0 34%)','polygon(48% 0,100% 0,100% 29%,70% 52%,52% 39%)','polygon(0 34%,34% 54%,43% 77%,0 100%)','polygon(34% 54%,52% 39%,70% 52%,65% 85%,43% 77%)','polygon(100% 29%,100% 100%,65% 85%,70% 52%)','polygon(0 100%,43% 77%,65% 85%,100% 100%)'];
  this.dom.world.replaceChildren();return shapes.map((shape,i)=>{const pane=document.createElement('div');pane.className='theatre-pane';pane.style.clipPath=shape;pane.dataset.pane=i;pane.append(this.copySnapshot(source));this.dom.world.append(pane);return pane;});
 },
 present(plan,{rebuild,preview=false,key}={}){
  if(!this.enabled()||!plan)return Promise.resolve({skipped:true});
  if(key&&this.seen.has(key))return Promise.resolve({skipped:true});
  if(key)this.seen.add(key);if(this.seen.size>64)this.seen.delete(this.seen.values().next().value);
  this.cancel();
  const source=this.snapshot(),reduced=Expedition.prefs.motion||matchMedia('(prefers-reduced-motion: reduce)').matches;
  const id=++this.serial;
  const promise=new Promise(resolve=>{this.session={id,plan,source,rebuild,resolve,elapsed:0,last:performance.now(),paused:false,reduced,rebuilt:false,panes:this.panes(source),frame:null};});
  const d=this.dom;d.dialog.dataset.kind=plan.kind;d.dialog.dataset.tone=plan.tone||(['occupation','pressure','rejected'].includes(plan.kind)?'intruder':'player');d.dialog.classList.toggle('still',reduced);d.dialog.dataset.beat='contact';
  d.kicker.textContent=preview?'演出预览 / 不提交剧情与回合':plan.kind==='chapter-rebirth'||['rewrite','retroaction','summon'].includes(plan.kind)?'终章 / 发生本身的争夺':'现象战争 / 已提交的仲裁';
  d.title.textContent=plan.title;d.subtitle.textContent=plan.subtitle;d.pause.textContent='暂停演出';
  d.verses.querySelector('del').textContent=plan.original||'';d.verses.querySelector('ins').textContent=plan.replacement||'';d.verses.querySelector('p').textContent=plan.quote||'';
  d.boot.querySelector('p').textContent=plan.rebuild?'从合法检查点创建下一运行实例':'本轮执行权被外来者占据';
  d.instance.textContent='INSTANCE '+String(this.projection).padStart(2,'0');d.restored.replaceChildren(this.copySnapshot(source));
  this.oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';clearInput();d.dialog.showModal();d.dialog.querySelector('.theatre-skip').focus({preventScroll:true});
  if(typeof Sfx!=='undefined')Sfx.play('crack');
  const loop=now=>{const s=this.session;if(!s||s.id!==id)return;const dt=Math.min(.1,Math.max(0,(now-s.last)/1000));s.last=now;if(!s.paused&&this.focused&&!document.hidden&&!this.utilityPaused())s.elapsed+=dt;
   try{this.paint(s);if(s.elapsed>=(s.reduced?1.4:s.plan.duration)){this.finish('complete');return;}}catch(error){s.paintError=error.message;this.lastError=error.message;this.finish('error');return;}
   if(this.session===s)s.frame=requestAnimationFrame(loop);
  };
  this.session.frame=requestAnimationFrame(loop);return promise;
 },
 replace(s){
  if(s.rebuilt||!s.plan.rebuild)return;s.rebuilt=true;
  try{
   const receipt=s.rebuild?s.rebuild():{generation:++this.projection};
   this.projection=Math.max(this.projection,receipt?.generation||this.projection+1);
   this.dom.instance.textContent='INSTANCE '+String(receipt?.generation||this.projection).padStart(2,'0')+' / RULE '+(receipt?.ruleset||1);
   // Capture the rebuilt live surface, including its fresh runtime state.
   this.dom.restored.replaceChildren(this.snapshot());this.dom.dialog.dataset.rebuilt='true';if(typeof Sfx!=='undefined')Sfx.play('shard');
  }catch(error){s.rebuildError=error.message;this.dom.subtitle.textContent='检查点重建未通过；保留已确认的原运行状态。';}
 },
 paint(s){
  const p=s.reduced?0.67:Math.min(1,s.elapsed/s.plan.duration),collapse=s.plan.rebuild||s.plan.kind==='occupation';
  if(!s.reduced&&collapse&&p>=.48&&!s.crashSound){s.crashSound=true;if(typeof Sfx!=='undefined')Sfx.play('crumble');}
  const beat=s.reduced?'静态回应':collapse?(p<.16?'主张相撞':p<.36?'运行表面撕裂':p<.48?'执行轨迹暴露':p<.62?'表面崩溃':p<.9?'下一实例重建':'回应重新显现'):(p<.22?'主张相撞':p<.56?'现象正在断裂':'原先的写法失效');
  this.dom.beat.textContent=s.paused?'演出暂停':beat;
  this.dom.dialog.dataset.beat=collapse&&p>=.48&&p<.62?'crash':collapse&&p>=.62?'rebuild':p>.32?'rupture':'contact';
  if(s.plan.rebuild&&(s.reduced?s.elapsed>.7:p>=.62))this.replace(s);
  const w=window.innerWidth,h=window.innerHeight,spread=s.reduced?0:Math.max(0,Math.min(1,(p-.10)/.48));
  s.panes.forEach((pane,i)=>{
   const dx=[-.55,.52,-.62,.06,.63,.02][i]*w*spread,dy=[-.24,-.3,.19,-.035,.24,.53][i]*h*spread;
   const fall=!s.reduced&&collapse&&p>.36?Math.pow(Math.min(1,(p-.36)/.12),2)*h*1.4:0;
   pane.style.transform=`translate(${Math.round(dx)}px,${Math.round(dy+fall)}px) rotate(${s.reduced?0:[-7,5,-9,3,8,2][i]*spread}deg)`;
   pane.style.opacity=collapse&&p>.42?String(Math.max(0,1-(p-.42)*12)):'1';
  });
  const recovery=collapse?(s.reduced?1:Math.max(0,Math.min(1,(p-.62)/.3))):0;
  this.dom.newWorld.style.opacity=String(recovery);this.dom.newWorld.style.transform=s.reduced?'none':`translateY(${Math.round((1-recovery)*h*.22)}px) scale(${(.24+recovery*.76).toFixed(4)})`;
  this.dom.world.style.opacity=collapse&&p>.62?'0':'1';
  this.dom.code.style.opacity=collapse&&p>=.48&&p<.62?'0':String(.32+Math.min(1,p/.3)*.68);
  this.drawCode(s,p);this.dom.verses.style.opacity=collapse&&p>.46&&p<.9?'0':'1';
 },
 drawCode(s,p){
  const c=this.dom.code.getContext('2d'),w=640,h=360,time=s.reduced?0:s.elapsed;
  c.imageSmoothingEnabled=false;c.fillStyle='#040810';c.fillRect(0,0,w,h);
  const red=this.dom.dialog.dataset.tone==='intruder',col=red?'#df667e':'#83d6b3';
  c.font='9px Consolas, monospace';c.textBaseline='top';
  const trace=s.plan.trace?.slice(0,24)||[];
  for(let column=0;column<3;column++)for(let row=0;row<24;row++){
   const line=trace[(row+column*3)%Math.max(1,trace.length)]||'EFF / VERIFIED STATE';
   const y=(row*18+Math.round(time*(column===1?-12:8))+column*8)%430-40;
   c.fillStyle=row%5===0?col:row%3?'#234437':'#405162';
   c.fillText(String(row+column*24).padStart(4,'0')+'  '+String(line).slice(0,74),column*220+6,y);
  }
  // Rupture exposes the actual finite game trace, not OS addresses or commands.
  const k=s.reduced?0.8:Math.min(1,Math.max(0,(p-.16)/.25));
  c.fillStyle='#070b15';c.fillRect(115,97,410,164);c.strokeStyle=col;c.lineWidth=1;c.strokeRect(115,97,410,164);
  c.fillStyle=col;c.font='10px Consolas, monospace';c.fillText('EFF.RUNTIME / GAME TRACE',131,108);
  c.font='9px Consolas, monospace';trace.slice(-8).forEach((line,i)=>{c.fillStyle=i===7?'#e5dbc2':'#9dc6b7';c.fillText(String(line).slice(0,73),131,130+i*15);});
  c.strokeStyle=red?'#ce6880':'#ccaa83';c.beginPath();
  for(let i=0;i<34;i++){const y=i*11,x=318+Math.sin(i*2.13)*14+(i%2?7:-7);if(i)c.lineTo(x+Math.round((i%3-1)*k*20),y);else c.moveTo(x,y);}c.stroke();
  const seal=['ending','rebirth','occupation','chapter-rebirth'].includes(s.plan.kind);
  if(seal&&p<.5){
   const split=s.plan.kind==='occupation'?0:Math.max(0,Math.min(1,(p-.18)/.28))*66;
   c.save();c.translate(320,180);c.rotate(-.12);c.font='bold 43px Consolas, monospace';c.textAlign='center';
   for(const side of [-1,1]){c.save();c.beginPath();c.rect(side<0?-240:0,-75,240,130);c.clip();c.translate(side*split,side*split*.16);c.fillStyle='#ad47608c';c.fillText(s.plan.seal||'BAD END 05',0,-30);c.strokeStyle='#b65873';c.strokeRect(-171,-41,342,59);c.restore();}c.restore();
  }
  if(s.plan.kind==='retroaction'){c.strokeStyle='#83c6d2';for(let i=0;i<9;i++){const y=315-i*27;c.beginPath();c.moveTo(10,y);c.lineTo(200,y);c.lineTo(445,y-31);c.lineTo(630,y-31);c.stroke();}c.fillStyle='#d6ddd0';c.fillText('PAST <--- AUTHORIZED INSERTION <--- PRESENT',98,311);}
  if(s.plan.rebuild&&p>.62){c.fillStyle='#90c9b1';c.fillText('replay(checkpoint) -> valid',214,265);c.fillText('next instance / one authority',210,280);}
 },
 finish(reason='complete'){
  const s=this.session;if(!s)return;
  if(reason!=='cancel')this.replace(s);
  this.session=null;if(s.frame!==null)cancelAnimationFrame(s.frame);
  this.dom.dialog.close();delete this.dom.dialog.dataset.rebuilt;this.dom.world.replaceChildren();this.dom.restored.replaceChildren();document.body.style.overflow=this.oldOverflow||'';
  clearInput();lastT=performance.now();s.resolve({cancelled:reason==='cancel',rebuilt:s.rebuilt&&!s.rebuildError,error:s.rebuildError||s.paintError});
  if(typeof Expedition!=='undefined')Expedition.focusGameplay();
 },
 cancel(){this.finish('cancel');},
 reset(){this.cancel();this.seen.clear();this.projection=1;},
 async round(state,rebuild){return this.present(SpectaclePlan.round(state),{rebuild});},
 onFinaleLine(line){if(!this.enabled()||!line.stage?.finale)return;const plan=SpectaclePlan.finale(line,{node:Finale.node(),step:Finale.step(),intervening:Finale.intervening(),rewritten:F.finaleRewritten});if(plan)void this.present(plan,{key:'line:'+Finale.node()+':'+Finale.step()+':'+(F.finaleRewritten?'r':'p')+':'+Finale.offset+':'+dialogIndex});},
 onFinaleAction(option){
  const plan=SpectaclePlan.action(option.action,{step:Finale.step(),quote:option.action==='summonUnconscious'?Finale.text(FinaleScenes.meta_state_3.text[Finale.requestIndex()]):''});
  if(plan)void this.present(plan,{rebuild:option.action==='rewriteChapter'?()=>{buildTileCache();return {generation:++this.projection,ruleset:1};}:undefined});
 },
 preview(){
  const base=PhenomenonRuntime.initial({battleId:'court-preview',seed:42});let state=base;
  for(const target of ['body','attribution','bad_owned'])state=PhenomenonRuntime.resolveRound(state,AgentPolicies.make(state,target),AgentPolicies.intruder(state));
  let engine=VirtualEngine.instantiate(PhenomenonRuntime.checkpoint(state));
  return this.present(SpectaclePlan.round(state),{preview:true,rebuild:()=>{engine=VirtualEngine.replace(engine,PhenomenonRuntime.checkpoint(state));return engine;}});
 }
};
