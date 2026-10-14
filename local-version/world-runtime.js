"use strict";
// A replaceable world instance. Authority comes from a replayed battle or original story events.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./phenomenon-runtime.js'));else root.WorldRuntime=factory(root.PhenomenonRuntime);})(globalThis,Runtime=>{
 const clone=v=>JSON.parse(JSON.stringify(v)),record=v=>v&&typeof v==='object'&&!Array.isArray(v);
 const only=(v,keys)=>record(v)&&Object.keys(v).every(k=>keys.includes(k));
 const nodes=['meta_1','meta_state_1','meta_state_2','meta_state_3','meta_observers','meta_prequel','meta_compensation','normal_ending','ending'];
 const blocked=new Set(['#','v','T','C','m','M','~','|','B','F','f','W','L','K','x','O','i','o','I']);
 function contract(c){
  if(c?.mode==='battle'){
   if(!only(c,['mode','checkpoint']))throw Error('INVALID_WORLD_CONTRACT');
   const s=Runtime.replay(c.checkpoint);return {source:clone(c),battleId:s.battleId,revision:s.revision,bodyOwner:s.bodyOwner,attribution:s.attribution,endingLock:s.endingLock,pressure:s.pressure,outcome:s.outcome,events:s.events.map(e=>({id:e.id,type:e.type})),past:false,node:null,step:0,rewritten:false};
  }
  if(c?.mode==='court'){
   if(!only(c,['mode','claimed'])||!Array.isArray(c.claimed)||c.claimed.length!==3||c.claimed.some(v=>typeof v!=='boolean'))throw Error('INVALID_WORLD_CONTRACT');
   return {source:clone(c),revision:c.claimed.filter(Boolean).length,bodyOwner:c.claimed[0]?'player':'contested',attribution:c.claimed[1]?'rejected':'claimed',endingLock:c.claimed[2]?'uncommitted':'pending',pressure:0,outcome:c.claimed.every(Boolean)?'won':'pending',events:[{id:'body',type:'ORIGINAL_RESPONSE'},{id:'attribution',type:'ORIGINAL_RESPONSE'},{id:'ending',type:'ORIGINAL_RESPONSE'}],past:false,node:null,step:0,rewritten:false};
  }
  if(c?.mode==='finale'){
   if(!only(c,['mode','node','step','intervening','rewritten'])||!nodes.includes(c.node)||!Number.isInteger(c.step)||c.step<0||c.step>3||typeof c.intervening!=='boolean'||typeof c.rewritten!=='boolean'||c.step>0&&!c.intervening||c.rewritten&&(!c.intervening||c.step!==3))throw Error('PAST_AUTHORITY_NOT_GRANTED');
   return {source:clone(c),revision:c.step,bodyOwner:'player',attribution:'rejected',endingLock:'uncommitted',pressure:0,outcome:'pending',events:[{id:c.node,type:'ORIGINAL_NARRATIVE'},{id:'present',type:'NARRATIVE_ANCHOR'},...(c.intervening?[{id:'past',type:'AUTHORIZED_ANCHOR'}]:[])],past:c.intervening,node:c.node,step:c.step,rewritten:c.rewritten};
  }
  throw Error('INVALID_WORLD_CONTRACT');
 }
 function walkable(s,x,y){
  if(!Number.isFinite(x)||!Number.isFinite(y))return false;
  if(s.boundary&&s.authority.endingLock!=='uncommitted'){const b=s.boundary;if(x+2<b.x||x+10>b.x+b.width||y+6<b.y||y+13>b.y+b.height)return false;}
  for(const [dx,dy] of [[2,6],[10,6],[2,13],[10,13]]){const ch=s.grid[Math.floor((y+dy)/16)]?.[Math.floor((x+dx)/16)];if(ch===undefined||blocked.has(ch))return false;}
  return true;
 }
 function create(config){
  if(!only(config,['session','scene','grid','pose','generation','contract'])||!/^world-[a-zA-Z0-9-]{1,64}$/.test(config.session)||!['blood','meta'].includes(config.scene)||!Number.isSafeInteger(config.generation)||config.generation<1||config.generation>32)throw Error('INVALID_WORLD_CONFIG');
  if(!Array.isArray(config.grid)||config.grid.length<3||config.grid.length>64||config.grid.some(row=>typeof row!=='string'||row.length<3||row.length>64||row.length!==config.grid[0].length||/[^a-zA-Z0-9.#~|*+ -]/.test(row)))throw Error('INVALID_WORLD_GRID');
  const authority=contract(config.contract);if(config.scene!==(config.contract.mode==='finale'?'meta':'blood'))throw Error('WORLD_SCENE_MISMATCH');
  const s={session:config.session,scene:config.scene,generation:config.generation,grid:[...config.grid],authority,tick:0,time:0,status:'running',avatar:{x:0,y:0,dir:0,walk:0},lastInput:{x:0,y:0}};
  const p=config.pose;if(!only(p,['x','y','dir','walk','tick','time','anchorX','anchorY'])||!walkable(s,p.x,p.y)||!Number.isInteger(p.dir)||p.dir<0||p.dir>3)throw Error('INVALID_WORLD_POSE');
  const anchorX=Number.isFinite(p.anchorX)?p.anchorX:p.x,anchorY=Number.isFinite(p.anchorY)?p.anchorY:p.y;
  if(anchorX<0||anchorX>config.grid[0].length*16||anchorY<0||anchorY>config.grid.length*16)throw Error("INVALID_WORLD_POSE");
  s.boundary={x:anchorX-30,y:anchorY-24,width:72,height:58};
  if(!walkable(s,p.x,p.y))throw Error("INVALID_WORLD_POSE");
  s.avatar={x:p.x,y:p.y,dir:p.dir,walk:Number.isFinite(p.walk)?Math.max(0,Math.min(100000,p.walk)):0};
  s.tick=Number.isSafeInteger(p.tick)&&p.tick>=0&&p.tick<=10000000?p.tick:0;s.time=Number.isFinite(p.time)&&p.time>=0&&p.time<=100000?p.time:0;
  return s;
 }
 function sync(state,nextContract){
  const a=contract(nextContract),old=state.authority;
  if(a.source.mode!==old.source.mode)throw Error('WORLD_MODE_MISMATCH');
  if(a.source.mode==='battle'){
   if(a.battleId!==old.battleId||a.revision<old.revision||a.revision>old.revision+1||JSON.stringify(a.source.checkpoint.rounds.slice(0,old.source.checkpoint.rounds.length))!==JSON.stringify(old.source.checkpoint.rounds))throw Error('WORLD_REVISION_MISMATCH');
  }else if(a.source.mode==='court'&&old.source.claimed.some((v,i)=>v&&!a.source.claimed[i]))throw Error('WORLD_REVISION_MISMATCH');
  else if(a.source.mode==='finale'&&(old.past&&!a.past||a.step<old.step||old.rewritten&&!a.rewritten))throw Error('WORLD_REVISION_MISMATCH');
  state.authority=a;if(!walkable(state,state.avatar.x,state.avatar.y))state.boundary={x:state.avatar.x-30,y:state.avatar.y-24,width:72,height:58};state.lastInput={x:0,y:0};return frame(state);
 }
 function step(state,dt,input={x:0,y:0}){
  if(!Number.isFinite(dt)||dt<0||dt>.1||!only(input,['x','y'])||![input.x,input.y].every(v=>Number.isInteger(v)&&v>=-1&&v<=1))throw Error('INVALID_WORLD_STEP');
  if(state.status!=='running'||dt===0)return frame(state);
  state.tick++;state.time+=dt;const a=state.avatar,owned=state.authority.bodyOwner==='player';
  let x=owned?input.x:Math.sign(state.grid[0].length*8-a.x),y=owned?input.y:Math.sign(96-a.y);
  if(!owned&&Math.hypot(state.grid[0].length*8-a.x,96-a.y)<12){x=0;y=0;}
  state.lastInput=owned?{x,y}:{x:0,y:0};const length=Math.hypot(x,y)||1,speed=owned?42:8;
  const dx=x/length*speed*dt,dy=y/length*speed*dt;
  if(walkable(state,a.x+dx,a.y))a.x+=dx;if(walkable(state,a.x,a.y+dy))a.y+=dy;
  if(x||y){a.dir=Math.abs(x)>Math.abs(y)?x<0?1:2:y<0?3:0;a.walk=(a.walk+dt*(owned?9:3))%100000;}
  return frame(state);
 }
 function pose(state){return {...state.avatar,tick:state.tick,time:state.time,anchorX:state.boundary.x+30,anchorY:state.boundary.y+24};}
 function frame(s){const a=s.authority;return {session:s.session,generation:s.generation,scene:s.scene,mode:a.source.mode,status:s.status,tick:s.tick,time:s.time,revision:a.revision,avatar:{...s.avatar},boundary:{...s.boundary,active:a.endingLock!=="uncommitted"},input:{...s.lastInput},bodyOwner:a.bodyOwner,attribution:a.attribution,endingLock:a.endingLock,pressure:a.pressure,outcome:a.outcome,events:clone(a.events),narrative:{node:a.node,step:a.step,authorizedPast:a.past,rewritten:a.rewritten}};}
 function replacement(state,generation){
  if(generation!==state.generation+1)throw Error('WORLD_GENERATION_MISMATCH');
  return {session:state.session,scene:state.scene,grid:[...state.grid],pose:pose(state),generation,contract:clone(state.authority.source)};
 }
 return Object.freeze({create,contract,sync,step,frame,pose,replacement,walkable});
});
