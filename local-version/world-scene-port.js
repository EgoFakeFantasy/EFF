"use strict";
// Adapter for the existing integer-pixel art. It never changes G, F, dialogue or the map cache.
class WorldScenePort{
 constructor(scene){
  this.scene=scene;this.map=MAPS[scene];this.res=typeof RES==='number'?RES:2;this.sceneCanvas=document.createElement('canvas');this.skeletonCanvas=document.createElement('canvas');
  // Both layers back 2× pixels; drawing stays in 320×192 logical units so the
  // half-pixel figures and materials of the story mode appear here too.
  for(const c of [this.sceneCanvas,this.skeletonCanvas]){c.width=320*this.res;c.height=192*this.res;c.getContext('2d').imageSmoothingEnabled=false;}
  this.tiles=document.createElement('canvas');this.tiles.width=this.map.grid[0].length*16*this.res;this.tiles.height=this.map.grid.length*16*this.res;
  const c=this.tiles.getContext('2d');c.setTransform(this.res,0,0,this.res,0,0);c.imageSmoothingEnabled=false;this.dynamic=[];
  for(let y=0;y<this.map.grid.length;y++)for(let x=0;x<this.map.grid[y].length;x++){const ch=this.map.grid[y][x];drawTile(c,ch,x,y,this.map,0);if(['x','b','I','*','~','o'].includes(ch))this.dynamic.push({x,y,ch});}
  PixelArt.sceneProps(c,this.map,{x:0,y:0});
  this.contours=[];const blocked=(x,y)=>!WorldRuntime.walkable({grid:this.map.grid},x*16,y*16);
  for(let y=0;y<this.map.grid.length;y++)for(let x=0;x<this.map.grid[y].length;x++){
   if(!blocked(x,y))continue;const sx=x*16,sy=y*16;
   if(!blocked(x,y-1))this.contours.push([sx,sy,sx+16,sy]);if(!blocked(x,y+1))this.contours.push([sx,sy+16,sx+16,sy+16]);
   if(!blocked(x-1,y))this.contours.push([sx,sy,sx,sy+16]);if(!blocked(x+1,y))this.contours.push([sx+16,sy,sx+16,sy+16]);
  }

 }
 draw(frame,reduced=false,options={}){
  const c=this.sceneCanvas.getContext('2d'),k=this.skeletonCanvas.getContext('2d'),map=this.map,w=this.tiles.width/this.res,h=this.tiles.height/this.res,t=reduced?0:frame.time;
  for(const g of [c,k]){g.setTransform(this.res,0,0,this.res,0,0);g.imageSmoothingEnabled=false;}
  // Camera, silhouettes and collision geometry use the same instance coordinates.
  const cam={x:Math.round(Math.max(0,Math.min(w-320,frame.avatar.x-155))),y:Math.round(Math.max(0,Math.min(h-192,frame.avatar.y-109)))};this.camera=cam;
  c.clearRect(0,0,320,192);c.drawImage(this.tiles,cam.x*this.res,cam.y*this.res,320*this.res,192*this.res,0,0,320,192);
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
  if(!owned)for(const dy of [-21,-13,1]){
   c.beginPath();c.moveTo(ix-5,iy+dy/3);c.lineTo(px+6,py+dy);c.stroke();
   const u=(t*.18+dy*.03+10)%1;c.fillStyle='#e091a4';c.fillRect(Math.round(ix+(px+6-ix)*u),Math.round(iy+dy/3+(py+dy-iy-dy/3)*u),2,1);
  }
  const guilty=frame.attribution!=='rejected',locked=frame.endingLock!=='uncommitted';
  if(guilty){c.strokeStyle='#be6d82';c.beginPath();c.moveTo(35,140);c.lineTo(px+4,py-5);c.stroke();c.fillStyle='#b57484';c.font='9px Microsoft YaHei';c.fillText('强加的指认',8,137);}
  const bx=Math.round(frame.boundary.x-cam.x),by=Math.round(frame.boundary.y-cam.y);
  if(locked){
   c.fillStyle='#29151d38';c.fillRect(bx,by,73,59);c.strokeStyle='#854e62';c.strokeRect(bx+.5,by+.5,72,58);
   for(const [x,y,dx,dy] of [[bx,by,1,1],[bx+72,by,-1,1],[bx,by+58,1,-1],[bx+72,by+58,-1,-1]]){
    c.fillStyle='#cc8591';c.fillRect(x-1,y-1,3,3);c.fillRect(x+dx*3,y,dx*9,1);c.fillRect(x,y+dy*3,1,dy*9);
   }
   for(let i=8;i<67;i+=13){c.fillStyle='#bd667b';c.fillRect(bx+i,by-2,1,5);c.fillRect(bx+i+2,by-1,1,3);c.fillRect(bx+i,by+56,1,5);}
   c.fillStyle='#d38b9c';c.font='8px Consolas';c.fillText('BAD END 05',Math.min(235,Math.max(4,bx-1)),by-6);
  }
  PixelArt.actor(c,px,py,{dir:frame.avatar.dir,walk:reduced?0:frame.avatar.walk,pose:owned?(frame.input.x||frame.input.y?'stand':'refuse'):'bound',blood:this.scene==='blood',heldHeart:false,glow:owned?green:undefined});
  // Only real obstacle contours and authority connections show through the exposed layer.
  k.clearRect(0,0,320,192);k.lineWidth=1;
  const line=(x,y,nx,ny,col)=>{k.strokeStyle=col;k.beginPath();k.moveTo(x,y);k.lineTo(nx,ny);k.stroke();};
  for(const [x,y,nx,ny] of this.contours){
   if(Math.max(x,nx)<cam.x||Math.min(x,nx)>cam.x+320||Math.max(y,ny)<cam.y||Math.min(y,ny)>cam.y+192)continue;
   line(x-cam.x,y-cam.y,nx-cam.x,ny-cam.y,'#86ab9560');
  }
  const head=[px+6,py-10],chest=[px+6,py-1],left=[px-5,py-3],right=[px+15,py-8];
  for(const joint of [head,left,right,[px+2,py+12],[px+10,py+12]])line(...chest,...joint,owned?green:red);
  for(const [x,y] of [head,chest,left,right]){k.fillStyle=owned?green:red;k.fillRect(x-1,y-1,3,3);k.clearRect(x,y,1,1);}
  if(owned){line(25,170,69,170,green);line(69,170,...head,green);k.fillStyle=green;k.font='6px Consolas';k.fillText('INPUT / PLAYER',9,180);}else line(ix,iy,...head,red);
  if(guilty)line(37,141,...chest,red);else{line(37,141,66,122,'#b4778660');line(px-17,py+11,...chest,'#b4778660');}
  if(locked){k.strokeStyle=red;k.strokeRect(bx+.5,by+.5,72,58);}
  k.font='6px Consolas';k.fillStyle=owned?green:red;k.fillText('body / '+frame.bodyOwner,Math.max(3,px-29),Math.min(157,py+22));
  k.fillStyle='#90bbaa80';k.fillText('WORLD '+String(frame.generation).padStart(2,'0')+' / '+frame.tick,8,13);
  for(let i=0;i<Math.min(4,frame.events.length);i++){const e=frame.events[i];k.fillStyle='#90bbaa70';k.fillRect(9,23+i*10,2,2);k.fillText(e.id+' / '+e.type,16,26+i*10);}
  if(this.scene==='meta'){
   const past=frame.narrative.authorizedPast,step=frame.narrative.step;k.fillStyle='#bfa8d9';k.font='7px Microsoft YaHei';k.fillText(past?'过去锚点 · 已获请求':'发生本身 · 两方争夺',147,146);
   line(past?213:283,169,301,169,past?'#94c8ab':'#a87791');
   for(let i=past?0:3;i<4;i++){const x=86+i*66,y=169;if(i>0&&past)line(x-63,y,x-3,y,i<=step?green:'#68546e');k.strokeStyle=past&&i<step?green:'#9a789f';k.strokeRect(x-3,y-3,6,6);k.fillStyle=past&&i<step?green:'#362539';k.fillRect(x-1,y-1,2,2);}
   if(past&&step>0){k.fillStyle='#b9dfc9';k.font='6px Consolas';k.fillText('<-- PAST INSERTION / ONE HISTORY',91,186);}
  }
  this.responseArt(c,frame,{px,py,ix,iy,bx,by},options,reduced);
  this.lastFrame=frame;return {scene:this.sceneCanvas,skeleton:this.skeletonCanvas};
 }
 responseArt(c,frame,a,options,reduced){
  const kind=options.kind,p=options.progress||0;if(!kind)return;
  const amount=reduced?.55:Math.max(0,Math.sin(Math.min(1,Math.max(0,(p-.12)/.8))*Math.PI)),{px,py,ix,iy,bx,by}=a;
  const pixelLine=(x,y,nx,ny,color)=>{c.fillStyle=color;const n=Math.max(Math.abs(nx-x),Math.abs(ny-y));for(let i=0;i<=n;i++)c.fillRect(Math.round(x+(nx-x)*i/Math.max(1,n)),Math.round(y+(ny-y)*i/Math.max(1,n)),1,1);};
  c.save();c.globalAlpha=amount;
  if(kind==='body'){
   // Both ends of the severed tethers recoil from the reclaimed body.
   for(let j=0;j<3;j++){
    const x=px+6,y=py-13+j*6,mx=(x+ix)/2,my=(y+iy)/2,gap=8+amount*17;
    pixelLine(ix,iy+j*3,mx+gap,my-amount*8,'#c78497');pixelLine(x,y,mx-gap,my+amount*8,'#bc758b');
    c.fillStyle='#e0cbb0';for(let i=0;i<5;i++)c.fillRect(Math.round(mx+(i-2)*amount*11),Math.round(my+(j-1)*7+(i%2?1:-1)*amount*12),1,2);
   }
   c.strokeStyle='#b4d6b1';c.strokeRect(px-9.5,py-18.5,30,33);
  }else if(kind==='attribution'){
   const x=px-28,y=py+23;c.font='8px Microsoft YaHei';c.fillStyle='#cd8c9b';c.fillText('你的罪',x-amount*9,y);pixelLine(x-3,y-3,x+41,y-11,'#d5bd9e');
   for(let i=0;i<8;i++){c.fillStyle=i%2?'#8ba5a5':'#b98592';c.fillRect(Math.round(x+10+i*4+amount*(i-4)*3),Math.round(y+amount*(i%2?9:-12)),2,1);}
  }else if(['ending','rebirth','chapter-rebirth'].includes(kind)){
   for(let i=0;i<12;i++){const x=bx+i*6,y=i%2?by:by+58,dx=(i-5.5)*amount*5,dy=(i%2?-1:1)*amount*13;c.fillStyle='#c98492';c.fillRect(Math.round(x+dx),Math.round(y+dy),4,1);c.fillRect(Math.round(x+dx),Math.round(y+dy+1),1,2);}
  }else if(kind==='retroaction'&&frame.narrative.authorizedPast){
   const u=reduced?.5:Math.max(0,Math.min(1,(p-.15)/.65)),x=Math.round(283-u*197);pixelLine(x,169,283,169,'#accfbd');c.fillStyle='#deceb0';c.fillRect(x-1,167,3,5);
  }
  c.restore();
 }
}
