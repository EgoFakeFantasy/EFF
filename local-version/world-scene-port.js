"use strict";
// Adapter for the existing integer-pixel art. It never changes G, F, dialogue or the map cache.
class WorldScenePort{
 constructor(scene){
  this.scene=scene;this.map=MAPS[scene];this.sceneCanvas=document.createElement('canvas');this.skeletonCanvas=document.createElement('canvas');
  for(const c of [this.sceneCanvas,this.skeletonCanvas]){c.width=320;c.height=192;c.getContext('2d').imageSmoothingEnabled=false;}
  this.tiles=document.createElement('canvas');this.tiles.width=this.map.grid[0].length*16;this.tiles.height=this.map.grid.length*16;
  const c=this.tiles.getContext('2d');c.imageSmoothingEnabled=false;this.dynamic=[];
  for(let y=0;y<this.map.grid.length;y++)for(let x=0;x<this.map.grid[y].length;x++){const ch=this.map.grid[y][x];drawTile(c,ch,x,y,this.map,0);if(['x','b','I','*','~','o'].includes(ch))this.dynamic.push({x,y,ch});}
  PixelArt.sceneProps(c,this.map,{x:0,y:0});
 }
 draw(frame,reduced=false){
  const c=this.sceneCanvas.getContext('2d'),k=this.skeletonCanvas.getContext('2d'),map=this.map,w=this.tiles.width,h=this.tiles.height,t=reduced?0:frame.time;
  // Camera, silhouettes and collision geometry use the same instance coordinates.
  const cam={x:Math.round(Math.max(0,Math.min(w-320,frame.avatar.x-155))),y:Math.round(Math.max(0,Math.min(h-192,frame.avatar.y-109)))};this.camera=cam;
  c.clearRect(0,0,320,192);c.drawImage(this.tiles,cam.x,cam.y,320,192,0,0,320,192);
  for(const {x,y,ch} of this.dynamic){const sx=x*16-cam.x,sy=y*16-cam.y;if(sx>-16&&sx<320&&sy>-16&&sy<192){c.save();c.translate(-cam.x,-cam.y);drawTile(c,ch,x,y,map,t);c.restore();}}
  renderAreaFx(map,cam,t,c,this.scene);
  if(this.scene==='blood')for(const n of map.npcs||[]){if(n.kind!=='echo'||n.cond&&!F[n.cond])continue;c.globalAlpha=.4+(reduced?0:Math.sin(t*2)*.12);PixelArt.actor(c,n.x*16+2-cam.x,n.y*16-cam.y,{coat:'#9fc0d8',hair:'#d0e4f0',skin:'#cfe0ea',dir:0});c.globalAlpha=1;}
  c.fillStyle=this.scene==='blood'?'#c0604930':'#9384c330';for(let i=0;i<22;i++){const x=Math.round((i*79+Math.sin(t+i)*3)%320),y=Math.round((i*47-t*(this.scene==='blood'?7:3)+384)%192);c.fillRect(x,y,1,2);}
  const px=Math.round(frame.avatar.x-cam.x),py=Math.round(frame.avatar.y-cam.y),owned=frame.bodyOwner==='player';
  const ix=this.scene==='blood'?Math.min(292,Math.max(235,244-cam.x*.1)):268,iy=this.scene==='blood'?43:47;
  c.globalAlpha=frame.outcome==='won'?.28:1;PixelArt.writingPresence(c,ix,iy);c.globalAlpha=1;
  if(this.scene==='meta'&&frame.narrative.authorizedPast)PixelArt.writingPresence(c,45,56,true);
  if(this.scene==='meta'){
   for(let i=0;i<3;i++){const x=95+i*53,y=100+i%2*17;c.fillStyle='#c4b2e8';c.fillRect(x,y,2,8);c.fillRect(x-3,y+3,8,2);}
  }
  const red='#ac5c73',green='#94c8ab';c.strokeStyle=owned?green:red;c.lineWidth=1;
  if(!owned)for(const dy of [-21,-13,1]){c.beginPath();c.moveTo(ix-5,iy+dy/3);c.lineTo(px+6,py+dy);c.stroke();}
  const guilty=frame.attribution!=='rejected',locked=frame.endingLock!=='uncommitted';
  if(guilty){c.strokeStyle='#be6d82';c.beginPath();c.moveTo(35,140);c.lineTo(px+4,py-5);c.stroke();c.fillStyle='#b57484';c.font='9px Microsoft YaHei';c.fillText('强加的指认',8,137);}
  if(locked){const bx=Math.round(frame.boundary.x-cam.x),by=Math.round(frame.boundary.y-cam.y);c.fillStyle='#815263';c.fillRect(bx,by,1,59);c.fillRect(bx+72,by,1,58);c.fillRect(bx,by,73,1);c.fillRect(bx,by+58,73,1);c.fillStyle='#d38b9c';c.font='8px Consolas';c.fillText('BAD END 05',Math.min(235,Math.max(4,bx-1)),by-5);}
  PixelArt.actor(c,px,py,{dir:frame.avatar.dir,walk:reduced?0:frame.avatar.walk,pose:owned?(frame.input.x||frame.input.y?'stand':'refuse'):'bound',blood:this.scene==='blood',heldHeart:false,glow:owned?green:undefined});
  k.clearRect(0,0,320,192);k.fillStyle='#06111ed9';k.fillRect(0,0,320,192);
  k.strokeStyle='#476b6980';k.lineWidth=1;
  for(let y=0;y<map.grid.length;y++)for(let x=0;x<map.grid[y].length;x++){const sx=x*16-cam.x,sy=y*16-cam.y;if(sx>=-16&&sx<320&&sy>=-16&&sy<192){k.strokeRect(sx,sy,16,16);if(map.grid[y][x]==='#'){k.strokeStyle='#9b697aa0';k.beginPath();k.moveTo(sx,sy);k.lineTo(sx+16,sy+16);k.stroke();k.strokeStyle='#476b6980';}}}
  const line=(x,y,nx,ny,col)=>{k.strokeStyle=col;k.beginPath();k.moveTo(x,y);k.lineTo(nx,ny);k.stroke();};
  const head=[px+6,py-14],chest=[px+6,py-4],left=[px-7,py-8],right=[px+18,py-13];
  for(const p of [head,left,right,[px+2,py+13],[px+10,py+13]])line(...chest,...p,owned?green:red);
  for(const [x,y] of [head,chest,left,right]){k.fillStyle=owned?green:red;k.fillRect(x-1,y-1,3,3);}
  if(owned){line(19,181,...head,green);k.fillStyle=green;k.font='7px Consolas';k.fillText('INPUT / PLAYER',7,185);}else line(ix,iy,...head,red);line(37,141,...chest,guilty?red:'#4e645e');
  k.font='7px Consolas';k.fillStyle=owned?green:red;k.fillText('body / '+frame.bodyOwner,Math.max(3,px-29),Math.min(163,py+22));
  k.fillStyle='#90bbaa';k.fillText('WORLD '+String(frame.generation).padStart(2,'0')+'  tick '+frame.tick,8,13);
  for(let i=0;i<Math.min(6,frame.events.length);i++){const e=frame.events[i];k.fillStyle=i<3?'#90bbaa':'#5c8279';k.fillText(e.id+' / '+e.type,7,25+i*10);}
  if(this.scene==='meta'){
   const past=frame.narrative.authorizedPast,step=frame.narrative.step;k.fillStyle='#bfa8d9';k.font='8px Microsoft YaHei';k.fillText(past?'过去锚点 · 已获请求':'发生本身 · 两方争夺',152,151);
   for(let i=0;i<4;i++){const x=83+i*54,y=174;k.strokeStyle=past&&i<step?'#b9dfc9':'#68546e';k.strokeRect(x-4,y-4,8,8);if(i)line(x-48,y,x-5,y,past&&i<=step?green:'#68546e');}
   if(past&&step>0){k.fillStyle='#b9dfc9';k.fillText('<-- PAST INSERTION / ONE HISTORY',82,188);}
  }
  this.lastFrame=frame;return {scene:this.sceneCanvas,skeleton:this.skeletonCanvas};
 }
}
