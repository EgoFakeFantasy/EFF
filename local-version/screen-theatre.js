"use strict";
// Whole-window presentation. The arbiter commits first; animation has no victory authority.
const ScreenTheatre={dom:null,session:null,focused:true,serial:0,seen:new Set(),projection:1,
 active(){return !!this.session;},
 utilityPaused(){return Boolean(Expedition.dom?.settingsDialog.open||Expedition.dom?.journalDialog.open||document.getElementById('renameDialog')?.open||!ui.codex.hidden);},
 enabled(){return EFFLocal.enabled&&!!this.dom;},
 init(){
  if(!EFFLocal.enabled)return;
  const dialog=document.createElement('dialog');dialog.id='screenTheatre';dialog.className='screen-theatre';dialog.setAttribute('aria-label','现象争夺的全屏演出');
  dialog.innerHTML=`<canvas class="theatre-code" width="640" height="360" aria-hidden="true"></canvas><canvas class="theatre-live" width="640" height="384" aria-hidden="true"></canvas><div class="theatre-world" aria-hidden="true"></div><div class="theatre-new-world" aria-hidden="true"><div class="theatre-window-bar"><span>EFF / 无中归来者</span><span class="theatre-instance"></span></div><div class="theatre-restored"></div></div><div class="theatre-veil" aria-hidden="true"></div><section class="theatre-writing"><p class="theatre-kicker"></p><h2 class="theatre-title"></h2><p class="theatre-subtitle"></p><div class="theatre-verses"><del tabindex="0" aria-label="原先的完整语句"></del><ins tabindex="0" aria-label="改写后的完整语句"></ins><p></p></div></section><div class="theatre-boot"><span>EFF</span><strong>当前运行表面已断裂</strong><p></p></div><div class="theatre-claims" aria-label="当前成立的状态"></div><div class="theatre-progress" aria-hidden="true"><i></i></div><footer class="theatre-controls"><span class="theatre-beat" role="status" aria-live="polite"></span><button class="theatre-pause" type="button">暂停演出</button><button class="theatre-skip" type="button">略过演出</button></footer>`;
  document.body.append(dialog);this.dom={dialog,code:dialog.querySelector('.theatre-code'),world:dialog.querySelector('.theatre-world'),live:dialog.querySelector('.theatre-live'),newWorld:dialog.querySelector('.theatre-new-world'),restored:dialog.querySelector('.theatre-restored'),instance:dialog.querySelector('.theatre-instance'),kicker:dialog.querySelector('.theatre-kicker'),title:dialog.querySelector('.theatre-title'),subtitle:dialog.querySelector('.theatre-subtitle'),verses:dialog.querySelector('.theatre-verses'),boot:dialog.querySelector('.theatre-boot'),beat:dialog.querySelector('.theatre-beat'),claims:dialog.querySelector('.theatre-claims'),progress:dialog.querySelector('.theatre-progress i'),pause:dialog.querySelector('.theatre-pause')};
  dialog.querySelector('.theatre-skip').addEventListener('click',()=>this.finish('skip'));
  this.dom.pause.addEventListener('click',()=>{if(!this.session)return;this.session.paused=!this.session.paused;WorldStage.input.clear();this.dom.pause.textContent=this.session.paused?'继续演出':'暂停演出';});
  dialog.addEventListener('cancel',event=>{event.preventDefault();this.finish('skip');});
  document.addEventListener('keydown',event=>{
   if(!this.active())return;
   const reading=event.target?.closest?.('.theatre-verses');
   if(reading&&event.key.startsWith('Arrow'))return;
   if(event.key==='Escape'){event.preventDefault();this.finish('skip');}
   else if(event.code==='Space'&&!event.repeat){event.preventDefault();this.dom.pause.click();}
   else if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(event.key.toLowerCase())&&!this.session.paused&&!WorldStage.paused()){WorldStage.input.add(event.key.toLowerCase());event.preventDefault();}
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

 panes(source,plan){
  const center=plan.kind==='attribution'?[38,58]:plan.kind==='body'?[54,57]:[50,54];
  const ring=[[0,0],[50,0],[100,0],[100,50],[100,100],[50,100],[0,100],[0,50]];
  const seams=ring.map(([x,y],i)=>[center[0]+(x-center[0])*.42+(i%2?2:-2),center[1]+(y-center[1])*.42+(i%3-1)*3]);
  this.fracture={center,ring,seams};this.dom.world.replaceChildren();
  return ring.map((point,i)=>{
   // The shard is clipped on an inner layer so the outer pane's drop-shadow can light its broken edge.
   const next=(i+1)%ring.length,pane=document.createElement('div'),shard=document.createElement('div');pane.className='theatre-pane';shard.className='theatre-shard';
   shard.style.clipPath='polygon('+[center,seams[i],point,ring[next],seams[next]].map(v=>v[0]+'% '+v[1]+'%').join(',')+')';
   const mx=(point[0]+ring[next][0])/2,my=(point[1]+ring[next][1])/2;
   pane.motion=[(mx-center[0])/100,(my-center[1])/100,(i%2?-1:1)*(3+i%3)];
   pane.dataset.pane=i;shard.append(this.copySnapshot(source));pane.append(shard);this.dom.world.append(pane);return pane;
  });
 },
 present(plan,{rebuild,preview=false,key}={}){
  if(!this.enabled()||!plan)return Promise.resolve({skipped:true});
  if(key&&this.seen.has(key))return Promise.resolve({skipped:true});
  if(key)this.seen.add(key);if(this.seen.size>64)this.seen.delete(this.seen.values().next().value);
  this.cancel();
  const source=this.snapshot(),reduced=Expedition.prefs.motion||matchMedia('(prefers-reduced-motion: reduce)').matches;
  const id=++this.serial;
  const promise=new Promise(resolve=>{this.session={id,plan,source,rebuild,resolve,elapsed:0,last:performance.now(),paused:false,reduced,rebuilt:false,panes:this.panes(source,plan),frame:null};});
  const d=this.dom;delete d.dialog.dataset.rebuilt;d.dialog.dataset.kind=plan.kind;d.dialog.dataset.tone=plan.tone||(['occupation','pressure','rejected'].includes(plan.kind)?'intruder':'player');d.dialog.classList.toggle('still',reduced);d.dialog.dataset.beat='contact';
  d.kicker.textContent=preview?'演出预览 / 不提交剧情与回合':plan.kind==='chapter-rebirth'||['rewrite','retroaction','summon'].includes(plan.kind)?'终章 / 发生本身的争夺':'现象战争 / 已提交的仲裁';
  d.title.textContent=plan.title;d.subtitle.textContent=plan.subtitle;d.pause.textContent='暂停演出';
  d.verses.querySelector('del').textContent=plan.original||'';d.verses.querySelector('ins').textContent=plan.replacement||'';d.verses.querySelector('p').textContent=plan.quote||'';
  d.boot.querySelector('p').textContent=plan.rebuild?'从合法检查点创建下一运行实例':'本轮执行权被外来者占据';
  d.instance.textContent='INSTANCE '+String(this.projection).padStart(2,'0');d.restored.replaceChildren(this.copySnapshot(source));
  this.oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';clearInput();d.dialog.showModal();d.dialog.querySelector('.theatre-skip').focus({preventScroll:true});
  if(typeof Sfx!=='undefined')Sfx.play('crack');
  const loop=now=>{const s=this.session;if(!s||s.id!==id)return;const dt=Math.min(.1,Math.max(0,(now-s.last)/1000));s.last=now;if(!s.paused&&this.focused&&!document.hidden&&!this.utilityPaused())s.elapsed+=dt;
   if(s.plan.rebuild&&s.rebuildTask&&!s.rebuildDone)s.elapsed=Math.min(s.elapsed,s.plan.duration*.62);
   try{this.paint(s);if(s.elapsed>=(s.reduced?1.4:s.plan.duration)){this.finish('complete');return;}}catch(error){s.paintError=error.message;this.lastError=error.message;this.finish('error');return;}
   if(this.session===s)s.frame=requestAnimationFrame(loop);
  };
  this.session.frame=requestAnimationFrame(loop);return promise;
 },
 replace(s){
  if(s.rebuilt||!s.plan.rebuild)return s.rebuildTask;s.rebuilt=true;
  s.rebuildTask=(async()=>{
   try{
    const receipt=s.rebuild?await s.rebuild():{generation:++this.projection};if(this.session!==s)return;
    this.projection=Math.max(this.projection,receipt?.generation||this.projection+1);
    this.dom.instance.textContent='INSTANCE '+String(receipt?.generation||this.projection).padStart(2,'0')+' / RULE '+(receipt?.ruleset||1);
    this.dom.restored.replaceChildren(this.snapshot());s.rebuildReady=true;this.dom.dialog.dataset.rebuilt='true';if(typeof Sfx!=='undefined')Sfx.play('shard');
   }catch(error){s.rebuildError=error.message;if(this.session===s)this.dom.subtitle.textContent='检查点重建未通过；保留已确认的原运行状态。';}finally{s.rebuildDone=true;}
  })();return s.rebuildTask;
 },

 paint(s){
  const p=s.reduced?0.67:Math.min(1,s.elapsed/s.plan.duration),collapse=s.plan.rebuild||s.plan.kind==='occupation',occupied=s.plan.kind==='occupation';
  if(!s.reduced&&collapse&&p>=.48&&!s.crashSound){s.crashSound=true;if(typeof Sfx!=='undefined')Sfx.play('crumble');}
  const beat=s.reduced?'静态回应':collapse?(p<.16?'主张相撞':p<.36?'运行表面撕裂':p<.48?'执行轨迹暴露':p<.62?'表面崩溃':occupied?'身体的执行者已被占据':!s.rebuildDone?'检查点正在接续':p<.9?'下一实例重建':'回应重新显现'):(p<.22?'主张相撞':p<.56?'现象正在断裂':'原先的写法失效');
  this.dom.beat.textContent=s.paused?'演出暂停':beat;
  this.dom.dialog.dataset.beat=s.reduced?(s.rebuildReady?'rebuild':'rupture'):collapse&&p>=.48&&(p<.62||!occupied&&!s.rebuildDone)?'crash':s.plan.rebuild&&p>=.62?'rebuild':p>.32?'rupture':'contact';
  if(s.plan.rebuild&&(s.reduced?s.elapsed>.7:p>=.62))this.replace(s);
  const w=window.innerWidth,h=window.innerHeight,spread=s.reduced?0:Math.max(0,Math.min(1,(p-.1)/.58));
  s.panes.forEach(pane=>{
   const [mx,my,angle]=pane.motion,dx=mx*w*spread*.9,dy=my*h*spread*.85;
   const fall=!s.reduced&&collapse&&p>.36?Math.pow(Math.min(1,(p-.36)/.12),2)*h*1.4:0;
   pane.style.transform='translate('+Math.round(dx)+'px,'+Math.round(dy+fall)+'px) rotate('+(s.reduced?0:angle*spread)+'deg)';
   pane.style.opacity=String(s.reduced?.15:collapse&&p>.42?Math.max(0,1-(p-.42)*12):1-spread*.72);
   const edge=s.reduced||spread<=0?'':' drop-shadow(0 0 '+(1+spread*3).toFixed(1)+'px '+(this.dom.dialog.dataset.tone==='intruder'?'#d58aa0':'#b8e0c4')+')';
   pane.style.filter='brightness('+(1-spread*.28).toFixed(3)+')'+edge;
  });
  const recovery=s.plan.rebuild&&s.rebuildReady?(s.reduced?1:Math.max(0,Math.min(1,(p-.62)/.3))):0;
  this.dom.newWorld.style.opacity=String(recovery);this.dom.newWorld.style.transform=s.reduced?'none':'translateY('+Math.round((1-recovery)*h*.10)+'px) scale('+(.68+recovery*.32).toFixed(4)+')';
  this.dom.world.style.opacity=collapse&&p>.62?'0':'1';
  this.dom.code.style.opacity=collapse&&p>=.48&&p<.62?'0':String(s.reduced?.45:Math.min(.86,Math.max(0,(p-.2)*2.8)));
  WorldStage.paintTheatre(this.dom.live,s.plan,p,s.reduced);this.dom.live.style.opacity=!s.reduced&&collapse&&p>=.48&&p<.62?'0':occupied&&p>.62?'.3':'1';
  if(recovery)for(const c of this.dom.restored.querySelectorAll('canvas[data-world-viewport]'))WorldStage.blit(c,WorldStage.draw({reveal:.13,tear:0}));
  this.drawCode(s,p);this.dom.verses.style.opacity=collapse&&p>.46&&p<.9?'0':'1';
  this.dom.progress.style.width=Math.round(p*100)+'%';
  const f=WorldStage.context?.frame;
  if(f){
   const claims=f.mode==='finale'?[f.narrative.authorizedPast?'过去锚点：已获请求':'过去锚点：尚未开放',f.narrative.rewritten?'故事起点：回写完成':'发生本身：争夺中']:[
    '身体：'+(f.bodyOwner==='player'?'由你回应':f.bodyOwner==='intruder'?'被占据':'受牵引'),
    '指认：'+(f.attribution==='rejected'?'已剥离':'仍被强加'),
    '结局：'+(f.endingLock==='uncommitted'?'封印已打开':f.endingLock==='committed'?'已被决定':'尚待回应')];
   const key=claims.join('|');if(this.dom.claims.dataset.state!==key){this.dom.claims.dataset.state=key;this.dom.claims.replaceChildren(...claims.map(text=>{const el=document.createElement('span');el.textContent=text;return el;}));}
  }else this.dom.claims.replaceChildren();
 },

 // The code layer is drawn at the window's device resolution so cracks, traces
 // and the seal stay sharp; geometry is still expressed in the 640×360 plan space.
 sizeCode(){
  const c=this.dom.code,dpr=Math.min(2,window.devicePixelRatio||1),w=Math.max(320,Math.round(window.innerWidth*dpr)),h=Math.max(180,Math.round(window.innerHeight*dpr));
  if(c.width!==w||c.height!==h){c.width=w;c.height=h;}
  return {w,h,sx:w/640,sy:h/360,s:Math.min(w/640,h/360)};
 },
 crack(i,seg){
  // A deterministic jagged path from the impact through one seam to the frame edge.
  this.cracks||=new Map();const key=i+':'+seg.map(v=>v.join(',')).join('|');if(this.cracks.has(key))return this.cracks.get(key);
  const pts=[];for(let k=0;k<seg.length-1;k++){const [a,b]=[seg[k],seg[k+1]],n=9;for(let j=0;j<n;j++){const u=j/n,jit=(Math.sin((i*7+k*13+j)*12.9898)*43758.5453%1)*2-1,nx=-(b[1]-a[1]),ny=b[0]-a[0],len=Math.hypot(nx,ny)||1;pts.push([a[0]+(b[0]-a[0])*u+nx/len*jit*(j&&j<n?1.6:0),a[1]+(b[1]-a[1])*u+ny/len*jit*(j&&j<n?1.6:0)]);}}
  pts.push(seg.at(-1));this.cracks.set(key,pts);if(this.cracks.size>64)this.cracks.delete(this.cracks.keys().next().value);return pts;
 },
 drawCode(s,p){
  const {w,h,sx,sy,s:k}=this.sizeCode(),c=this.dom.code.getContext('2d'),red=this.dom.dialog.dataset.tone==='intruder';
  const ink=red?[206,129,149]:[164,200,175],gold=[226,206,160],rgba=(v,a)=>`rgba(${v[0]},${v[1]},${v[2]},${a})`;
  const X=x=>x*sx,Y=y=>y*sy,time=s.reduced?0:s.elapsed;
  c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,w,h);c.imageSmoothingEnabled=true;
  const {center,ring,seams}=this.fracture,P=v=>[X(v[0]*6.4),Y(v[1]*3.6)];
  const opening=s.reduced?.25:Math.min(1,Math.max(0,(p-.1)*2.1)),grow=s.reduced?1:Math.min(1,Math.max(0,(p-.03)/.27));
  const collapse=s.plan.rebuild||s.plan.kind==='occupation';
  // 1. The verified trace, exposed in columns through the rupture.
  const trace=(s.plan.trace?.length?s.plan.trace:['eff.runtime / '+s.plan.kind]).map(String);
  const exposure=s.reduced?.12:Math.max(0,Math.min(1,(p-.18)/.18))*(collapse&&p>.46?Math.max(0,1-(p-.46)*12):1);
  if(exposure>0){
   c.font=`${Math.round(9*k)}px Consolas, monospace`;c.textBaseline='top';
   const cols=Math.max(8,Math.round(w/(150*k))),lh=Math.round(12*k);
   for(let col=0;col<cols;col++){
    const x=Math.round((col+.15)*w/cols),speed=(18+col%5*7)*k,off=(time*speed+col*97)%lh;
    for(let row=-1;row<h/lh+1;row++){
     const line=trace[(row+col*3+Math.floor(time*speed/lh))%trace.length]||'';
     const dx=x/w-center[0]/100,dy=row*lh/h-center[1]/100,near=Math.max(0,1-Math.hypot(dx,dy)*2.2);
     c.fillStyle=rgba(ink,(.05+near*.22)*exposure);c.fillText(line.slice(0,26),x,Math.round(row*lh+off));
    }
   }
  }
  // 2. Impact: a ring and flash at the point where the claims collide.
  const [cx,cy]=P(center);
  if(!s.reduced&&p<.2){const u=p/.2;c.strokeStyle=rgba(gold,.7*(1-u));c.lineWidth=Math.max(1,3*k*(1-u));c.beginPath();c.arc(cx,cy,u*Math.min(w,h)*.45,0,Math.PI*2);c.stroke();
   const g=c.createRadialGradient(cx,cy,0,cx,cy,140*k);g.addColorStop(0,rgba(gold,.35*(1-u)));g.addColorStop(1,rgba(gold,0));c.fillStyle=g;c.fillRect(cx-140*k,cy-140*k,280*k,280*k);}
  // 3. Cracks along every seam: glow, coloured core and a hot centre line.
  if(!(collapse&&p>=.48)){
   for(let i=0;i<ring.length;i++){
    const pts=this.crack(i,[center,seams[i],ring[i]]).map(P),n=Math.max(2,Math.ceil(pts.length*grow));
    for(const [width,col] of [[7*k,rgba(ink,.12)],[3*k,rgba(ink,.45)],[1.2*k,rgba([245,240,225],.85)]]){
     c.lineWidth=width;c.strokeStyle=col;c.lineJoin='miter';c.beginPath();c.moveTo(...pts[0]);for(let j=1;j<n;j++)c.lineTo(...pts[j]);c.stroke();
    }
    // Sparks fly from the advancing tip of each crack.
    if(!s.reduced&&grow<1){const [tx,ty]=pts[n-1];c.fillStyle=rgba(gold,.9);for(let j=0;j<4;j++)c.fillRect(Math.round(tx+Math.cos(i+j*1.7+time*9)*(4+j*3)*k),Math.round(ty+Math.sin(i*2+j+time*7)*(4+j*3)*k),Math.ceil(1.5*k),Math.ceil(1.5*k));}
   }
  }
  // 4. The runtime panel types in its verified lines.
  if(!(collapse&&p>=.46)){
   const px=Math.round(X(13)),py=Math.round(Y(222)),pw=Math.round(260*k),ph=Math.round(74*k),chosen=trace.filter(line=>line.includes(s.plan.target==='bad_owned'?'ending_lock':s.plan.target||'authority'));
   const lines=[...new Set([...chosen,...trace.slice(-2)])].slice(0,3),typed=s.reduced?999:Math.floor(Math.max(0,p-.08)*260);
   c.fillStyle='rgba(4,9,18,.82)';c.fillRect(px,py,pw,ph);c.strokeStyle=rgba(ink,.6);c.lineWidth=Math.max(1,k);c.strokeRect(px+.5,py+.5,pw-1,ph-1);
   c.fillStyle=rgba(ink,.18);c.fillRect(px,py,pw,Math.round(14*k));c.fillStyle=rgba(ink,.95);c.font=`${Math.round(8*k)}px Consolas, monospace`;c.textBaseline='middle';
   c.fillText('EFF.RUNTIME / '+s.plan.kind.toUpperCase(),px+8*k,py+7*k);c.fillStyle=rgba(gold,.8);c.fillRect(px+pw-12*k,py+5*k,4*k,4*k);
   let left=typed;lines.forEach((line,i)=>{const text=String(line).slice(0,58),shown=text.slice(0,Math.max(0,left));left-=text.length;c.fillStyle=i?'#8fa8a3':'#d2d6c2';c.fillText(shown,px+8*k,py+(26+i*15)*k);
    if(shown.length<text.length&&shown.length>0&&!s.reduced&&Math.floor(time*4)%2===0){const tw=c.measureText(shown).width;c.fillRect(px+8*k+tw+1,py+(21+i*15)*k,4*k,9*k);}});
  }
  // 5. The seal: a stamped plate torn along a jagged line, halves pulled apart.
  const seal=['ending','rebirth','occupation','chapter-rebirth'].includes(s.plan.kind);
  if(seal&&p<.5){
   const split=s.plan.kind==='occupation'?0:opening*47*k,plateW=330*k,plateH=58*k,label=s.plan.seal||'BAD END 05';
   const tear=[];for(let j=0;j<=10;j++)tear.push([(Math.sin(j*91.7)*43758.5%1)*14*k-7*k,-plateH/2-6*k+j*(plateH+12*k)/10]);
   c.save();c.translate(X(320),Y(200));c.rotate(-.08);
   for(const side of [-1,1]){
    c.save();c.translate(side*split,side*split*.14);c.rotate(side*opening*.04);
    c.beginPath();c.moveTo(side*(plateW/2+20*k),-plateH);for(const [tx,ty] of tear)c.lineTo(tx,ty);c.lineTo(side*(plateW/2+20*k),plateH);c.closePath();c.clip();
    c.fillStyle='rgba(18,12,27,.9)';c.fillRect(-plateW/2,-plateH/2,plateW,plateH);
    c.strokeStyle='rgba(183,117,143,.9)';c.lineWidth=2*k;c.strokeRect(-plateW/2,-plateH/2,plateW,plateH);c.lineWidth=k;c.strokeRect(-plateW/2+5*k,-plateH/2+5*k,plateW-10*k,plateH-10*k);
    c.strokeStyle='rgba(183,117,143,.18)';for(let x=-plateW/2;x<plateW/2;x+=7*k){c.beginPath();c.moveTo(x,-plateH/2+6*k);c.lineTo(x+18*k,plateH/2-6*k);c.stroke();}
    c.font=`bold ${Math.round(30*k)}px Consolas, monospace`;c.textAlign='center';c.textBaseline='middle';c.fillStyle='#e3a1b1';c.fillText(label,0,k);
    c.restore();
    if(opening>0&&!s.reduced){c.fillStyle=rgba(gold,.85);for(const [tx,ty] of tear)if((ty*7|0)%3===0)c.fillRect(Math.round(tx+side*split*.5),Math.round(ty),Math.ceil(2*k),Math.ceil(2*k));}
   }
   c.restore();
  }
  // 6. A retroaction runs back from the present along one history.
  if(s.plan.kind==='retroaction'&&WorldStage.context?.frame.narrative.authorizedPast){
   const u=s.reduced?.5:Math.min(1,Math.max(0,(p-.12)/.68)),x0=X(548),x=X(548-u*390),y=Y(300);
   c.strokeStyle=rgba([166,204,189],.25);c.lineWidth=7*k;c.beginPath();c.moveTo(x0,y);c.lineTo(x,y);c.stroke();
   c.strokeStyle='#a6ccbd';c.lineWidth=1.5*k;c.beginPath();c.moveTo(x0,y);c.lineTo(x,y);c.stroke();
   c.fillStyle='#e3ceb0';c.beginPath();c.moveTo(x-8*k,y);c.lineTo(x+4*k,y-6*k);c.lineTo(x+4*k,y+6*k);c.closePath();c.fill();
   for(const [tx,label] of [[548,'PRESENT'],[158,'PAST']]){c.fillStyle='#a6ccbd';c.fillRect(X(tx)-2*k,y-8*k,4*k,16*k);c.font=`${Math.round(8*k)}px Consolas`;c.textAlign='center';c.fillText(label,X(tx),y+16*k);c.textAlign='left';}
   c.font=`${Math.round(8*k)}px Consolas`;c.textAlign='center';c.fillText('ONE HISTORY',(x0+X(158))/2,y-14*k);c.textAlign='left';
  }
 },
 finish(reason='complete'){
  const s=this.session;if(!s)return;
  if(reason==='cancel'){this.closeSession(s,reason);return;}
  if(s.finishing)return;s.finishing=true;if(s.frame!==null)cancelAnimationFrame(s.frame);
  if(s.plan.rebuild){void Promise.resolve(this.replace(s)).then(()=>{if(this.session===s)this.closeSession(s,reason);});}
  else this.closeSession(s,reason);
 },
 closeSession(s,reason){
  this.session=null;if(s.frame!==null)cancelAnimationFrame(s.frame);
  this.dom.dialog.close();delete this.dom.dialog.dataset.rebuilt;this.dom.world.replaceChildren();this.dom.restored.replaceChildren();document.body.style.overflow=this.oldOverflow||'';
  WorldStage.input.clear();clearInput();lastT=performance.now();s.resolve({cancelled:reason==='cancel',rebuilt:s.rebuilt&&!s.rebuildError,error:s.rebuildError||s.paintError});
  if(typeof Expedition!=='undefined')Expedition.focusGameplay();
 },
 cancel(){this.finish('cancel');},
 reset(){this.cancel();this.seen.clear();this.projection=1;},
 async round(state,rebuild){return this.present(SpectaclePlan.round(state),{rebuild});},
 onFinaleLine(line){if(!this.enabled()||!line.stage?.finale)return;void WorldStage.finale();const plan=SpectaclePlan.finale(line,{node:Finale.node(),step:Finale.step(),intervening:Finale.intervening(),rewritten:F.finaleRewritten});if(plan)void this.present(plan,{key:'line:'+Finale.node()+':'+Finale.step()+':'+(F.finaleRewritten?'r':'p')+':'+Finale.offset+':'+dialogIndex});},
 onFinaleAction(option){
  if(this.enabled()&&G.area==='meta')void WorldStage.finale();
  const plan=SpectaclePlan.action(option.action,{step:Finale.step(),quote:option.action==='summonUnconscious'?Finale.text(FinaleScenes.meta_state_3.text[Finale.requestIndex()]):''});
  if(plan)void this.present(plan,{rebuild:option.action==='rewriteChapter'?async()=>{await WorldStage.finale();const receipt=await WorldStage.rebuild();buildTileCache();return receipt;}:undefined});
 },
 async preview(){
  if(!this.enabled())return {skipped:true};
  const base=PhenomenonRuntime.initial({battleId:'court-preview',seed:42});let state=base;
  for(const target of ['body','attribution','bad_owned'])state=PhenomenonRuntime.resolveRound(state,AgentPolicies.make(state,target),AgentPolicies.intruder(state));
  let engine=VirtualEngine.instantiate(PhenomenonRuntime.checkpoint(state));
  return WorldStage.preview(state,()=>this.present(SpectaclePlan.round(state),{preview:true,rebuild:async()=>{await WorldStage.rebuild();engine=VirtualEngine.replace(engine,PhenomenonRuntime.checkpoint(state));return engine;}}));
 }
};
