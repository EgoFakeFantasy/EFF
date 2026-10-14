"use strict";
// Shared lifecycle/input/art adapter for the battle panel, original scene and whole-window theatre.
const WorldStage={context:null,serial:0,focused:true,input:new Set(),moving:false,inflight:false,compositor:null,lastError:null,
 enabled(){return EFFLocal.enabled;},
 init(){
  if(!this.enabled())return;this.compositor=new WorldCompositor();
  const recovery=document.createElement('button');recovery.id='worldRecovery';recovery.type='button';recovery.textContent='接续世界';recovery.hidden=true;recovery.addEventListener('click',()=>{void this.recover().catch(()=>{});});document.querySelector('.top-actions').append(recovery);
  window.addEventListener('blur',()=>{this.focused=false;this.input.clear();});window.addEventListener('focus',()=>{this.focused=true;});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)this.input.clear();});
  window.addEventListener('pagehide',()=>{void this.close();});
  document.addEventListener('keydown',e=>{
   const key=e.key.toLowerCase();if(!['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key))return;
   if(e.target?.closest?.('.theatre-verses'))return;
   const theatre=ScreenTheatre.active(),canvasFocus=e.target?.id==='techCanvas',court=this.context?.config.contract.mode==='court'&&G.area==='blood'&&PhenomenonBattle.phase==='ownership'&&currentDialogScript===SCRIPTS.refusal&&['w','a','s','d'].includes(key);if(e.target?.closest?.('input,select,textarea'))return;if(!this.context||!theatre&&!canvasFocus&&!court)return;
   if(theatre&&ScreenTheatre.session.paused||this.paused())return;
   this.input.add(key);e.preventDefault();e.stopImmediatePropagation();
  },true);
  document.addEventListener('keyup',e=>{this.input.delete(e.key.toLowerCase());},true);
 },
 paused(){return !this.focused||document.hidden||ScreenTheatre.utilityPaused()||ScreenTheatre.session?.paused;},
 intent(){return {x:(this.input.has('d')||this.input.has('arrowright')?1:0)-(this.input.has('a')||this.input.has('arrowleft')?1:0),y:(this.input.has('s')||this.input.has('arrowdown')?1:0)-(this.input.has('w')||this.input.has('arrowup')?1:0)};},
 config(contract,generation=1,pose){
  const scene=contract.mode==='finale'?'meta':'blood',map=MAPS[scene],base={x:map.spawn.x*16+3,y:map.spawn.y*16+2,dir:0,walk:0};
  let p=pose|| (G.area===scene?{x:G.px,y:G.py,dir:G.dir,walk:G.walk}:base);
  const probe={grid:map.grid};if(!WorldRuntime.walkable(probe,p.x,p.y))p=base;
  p={...p,dir:Number.isInteger(p.dir)&&p.dir>=0&&p.dir<=3?p.dir:0};
  if(WorldRuntime.contract(contract).endingLock!=='uncommitted'&&Number.isFinite(p.anchorX)&&Number.isFinite(p.anchorY)&&(p.x+2<p.anchorX-30||p.x+10>p.anchorX+42||p.y+6<p.anchorY-24||p.y+13>p.anchorY+34)){p.anchorX=p.x;p.anchorY=p.y;}
  return {session:'world-'+(++this.serial),scene,grid:[...map.grid],pose:p,generation,contract};
 },
 async command(c,request){
  if(EFFLocal.native?.worldCommand){const r=await EFFLocal.native.worldCommand(request);if(!r?.ok)throw Error(r?.error||'WORLD_UNAVAILABLE');return r;}
  if(request.operation==='start')c.local=WorldRuntime.create(request.config);
  else if(request.operation==='sync')WorldRuntime.sync(c.local,request.contract);
  else if(request.operation==='tick')WorldRuntime.step(c.local,request.dt,request.input);
  else if(request.operation==='rebuild')c.local=WorldRuntime.create(WorldRuntime.replacement(c.local,request.generation));
  return {ok:true,backend:'local-instance',pid:null,frame:WorldRuntime.frame(c.local),lifecycle:[]};
 },
 async start(contract,generation=1,pose,{preview=false}={}){
  const config=this.config(contract,generation,pose),c={config,preview,port:new WorldScenePort(config.scene),frame:WorldRuntime.frame(WorldRuntime.create(config)),backend:'starting',last:performance.now(),changed:true};
  this.context=c;this.input.clear();this.lastError=null;
  c.ready=this.command(c,{operation:'start',config}).then(r=>{if(this.context===c){this.receive(c,r);c.last=performance.now();}return r;}).catch(e=>{if(this.context===c){this.lastError=e.message;c.backend='stopped';c.error=e.message;}throw e;});
  await c.ready;return c;
 },
 receive(c,r){c.frame=r.frame;c.backend=r.backend;c.pid=r.pid;c.lifecycle=r.lifecycle;c.changed=true;
  if(c.config.contract.mode==='court'&&G.area==='blood'&&PhenomenonBattle.phase==='ownership'&&currentDialogScript===SCRIPTS.refusal&&PhenomenonBattle.claimed[0]){G.px=c.frame.avatar.x;G.py=c.frame.avatar.y;G.dir=c.frame.avatar.dir;G.walk=c.frame.avatar.walk;}
 },
 async battle(state,generation){
  const contract={mode:'battle',checkpoint:PhenomenonRuntime.checkpoint(state)},c=this.context;
  if(c&&!c.preview&&c.config.contract.mode==='battle'&&c.config.contract.checkpoint.battleId===state.battleId){await this.sync(contract);return c;}
  return this.start(contract,generation,BattleEventAdapter.worldPose);
 },
 async sync(contract){
  const c=this.context;if(!c)return;await c.ready;if(this.context!==c)return;
  const r=await this.command(c,{operation:'sync',session:c.config.session,contract});if(this.context!==c)return;
  c.config.contract=contract;this.receive(c,r);
 },
 async story(contract){
  if(!this.enabled())return;const c=this.context;
  if(c&&!c.preview&&c.config.contract.mode===contract.mode){try{await this.sync(contract);}catch(e){this.lastError=e.message;}return;}
  await this.start(contract).catch(()=>{});
 },
 finale(){return this.story({mode:'finale',node:Finale.node(),step:Finale.step(),intervening:Finale.intervening(),rewritten:!!F.finaleRewritten});},
 court(){const contract={mode:'court',claimed:[...PhenomenonBattle.claimed]},c=this.context;if(this.enabled()&&c?.config.contract.mode==='court'&&c.config.contract.claimed.some((v,i)=>v&&!contract.claimed[i]))return this.start(contract).catch(()=>{});return this.story(contract);},
 async rebuild(){
  const c=this.context;if(!c)throw Error('WORLD_NOT_STARTED');await c.ready;this.input.clear();c.rebuilding=true;
  try{
   const r=await this.command(c,{operation:'rebuild',session:c.config.session,generation:c.frame.generation+1});
   if(this.context!==c)throw Error('WORLD_CANCELLED');c.config.generation=r.frame.generation;c.config.pose={...r.frame.avatar,tick:r.frame.tick,time:r.frame.time,anchorX:r.frame.boundary.x+30,anchorY:r.frame.boundary.y+24};this.receive(c,r);c.error=null;this.lastError=null;c.last=performance.now();
   return {generation:r.frame.generation,ruleset:1,backend:r.backend,pid:r.pid};
  }finally{c.rebuilding=false;}
 },
 async recover(){
  const c=this.context;if(!c)throw Error('WORLD_NOT_STARTED');let contract=c.config.contract;
  if(contract.mode==='battle'&&!c.preview)contract={mode:'battle',checkpoint:PhenomenonRuntime.checkpoint(BattleEventAdapter.state)};
  if(contract.mode==='court')contract={mode:'court',claimed:[...PhenomenonBattle.claimed]};
  if(contract.mode==='finale')contract={mode:'finale',node:Finale.node(),step:Finale.step(),intervening:Finale.intervening(),rewritten:!!F.finaleRewritten};
  const pose={...c.frame.avatar,tick:c.frame.tick,time:c.frame.time,anchorX:c.frame.boundary.x+30,anchorY:c.frame.boundary.y+24};
  const next=await this.start(contract,c.frame.generation+1,pose,{preview:c.preview});return {generation:next.frame.generation,ruleset:1};
 },
 snapshot(){const c=this.context;if(!c||c.preview||c.config.contract.mode!=='battle'||c.backend==='starting'||c.config.contract.checkpoint.battleId!==BattleEventAdapter.state?.battleId)return null;return {...c.frame.avatar,tick:c.frame.tick,time:c.frame.time,anchorX:c.frame.boundary.x+30,anchorY:c.frame.boundary.y+24};},
 async close(){const c=this.context;this.context=null;this.input.clear();const recovery=document.getElementById('worldRecovery');if(recovery)recovery.hidden=true;if(c&&EFFLocal.native?.worldCommand)await EFFLocal.native.worldCommand({operation:'dispose',session:c.config.session}).catch(()=>{});},
 frame(now){
  const c=this.context;if(!this.enabled()||!c||!this.compositor)return;
  const visible=ScreenTheatre.active()||RepressionUI.open||c.config.contract.mode==='finale'&&Finale.active()||c.config.contract.mode==='court'&&G.area==='blood'&&PhenomenonBattle.phase==='ownership';
  if(this.paused())this.input.clear();
  const dt=Math.min(.05,Math.max(0,(now-c.last)/1000));c.last=now;
  c.accumulator=visible&&!this.paused()?Math.min(.08,(c.accumulator||0)+dt):0;
  if(visible&&!this.paused()&&!c.rebuilding&&c.backend!=='starting'&&c.backend!=='stopped'&&!this.inflight&&now-(c.sent||0)>30){
   const intent=this.intent(),elapsed=c.accumulator;c.accumulator=0;this.inflight=true;c.sent=now;const reduced=Expedition.prefs.motion||matchMedia('(prefers-reduced-motion: reduce)').matches;
   this.command(c,{operation:'tick',session:c.config.session,dt:reduced&&!intent.x&&!intent.y?0:elapsed,input:intent}).then(r=>{if(this.context===c)this.receive(c,r);}).catch(e=>{if(this.context===c){this.lastError=e.message;c.error=e.message;c.backend='stopped';c.rebuilding=false;}}).finally(()=>{this.inflight=false;});
  }
  const globalRecovery=document.getElementById('worldRecovery');if(globalRecovery)globalRecovery.hidden=c.backend!=='stopped'||RepressionUI.open;
  const recovery=document.getElementById('techWorldRecover');if(recovery)recovery.hidden=c.backend!=='stopped';
  if(c.backend==='stopped'&&RepressionUI.open)document.getElementById('techWorldStatus').textContent='运行表面已经停下。已确认的检查点仍然保留，可以从这里接续。';
  if(RepressionUI.open&&this.domCanvas){const output=this.draw({reveal:.12,tear:0});this.blit(this.domCanvas,output);this.domCanvas.setAttribute('aria-label','血色庭院 · 身体 '+c.frame.bodyOwner+' · 归责 '+c.frame.attribution+' · 结局 '+c.frame.endingLock);}
 },
 draw(options={}){
  const c=this.context;if(!c||!this.compositor)return null;const reduced=Expedition.prefs.motion||matchMedia('(prefers-reduced-motion: reduce)').matches;
  const layers=c.port.draw(c.frame,reduced,options);return this.compositor.draw(layers.scene,layers.skeleton,{...options,focus:[(c.frame.avatar.x-c.port.camera.x+6)/320,(c.frame.avatar.y-c.port.camera.y)/192],pressure:c.frame.pressure,time:c.frame.time,reduced,hostile:c.frame.bodyOwner!=='player'||c.frame.narrative.node==='meta_state_2'});
 },
 blit(canvas,source){if(!canvas||!source)return;const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;c.clearRect(0,0,canvas.width,canvas.height);c.drawImage(source,0,0,canvas.width,canvas.height);},
 paintTheatre(canvas,plan,progress,reduced){
  const tear=reduced?0:Math.min(1,Math.max(0,(progress-.12)*2.5)),reveal=reduced?.5:Math.min(.68,Math.max(.08,(progress-.14)*1.5));
  this.blit(canvas,this.draw({kind:plan.kind,progress,tear:plan.rebuild&&progress>.62?0:tear,reveal:plan.rebuild&&progress>.62?.2:reveal}));
 },
 renderGameplay(now,dt){
  const c=this.context;if(!c||RepressionUI.open||NarrativeAgency.active()||NarrativeTrials.rainActive()||!ui.start.hidden||!ui.ending.hidden)return false;
  const matches=c.config.contract.mode==='court'&&G.area==='blood'&&PhenomenonBattle.phase==='ownership'||c.config.contract.mode==='finale'&&Finale.active();if(!matches)return false;
  if(c.config.contract.mode==='finale'){if(!Expedition.paused()&&!Expedition.prefs.motion)PhenomenonBattle.time+=dt;PhenomenonBattle.renderHistory();}
  const f=c.frame;const reveal=f.mode==='finale'?.17+f.narrative.step*.13:f.attribution==='rejected'?.22:.06;
  this.blit(canvas,this.draw({reveal,tear:f.mode==='finale'&&f.narrative.node==='meta_state_2'?.24:0}));return true;
 },
 async preview(state,run){
  const old=this.context,saved=old?{contract:old.config.contract,generation:old.frame.generation,pose:{...old.frame.avatar,tick:old.frame.tick,time:old.frame.time,anchorX:old.frame.boundary.x+30,anchorY:old.frame.boundary.y+24},preview:old.preview}:null;
  const c=await this.start({mode:'battle',checkpoint:PhenomenonRuntime.checkpoint(state)},1,undefined,{preview:true});
  try{return await run();}finally{if(this.context===c){if(saved)await this.start(saved.contract,saved.generation,saved.pose,{preview:saved.preview});else await this.close();}}
 }
};
