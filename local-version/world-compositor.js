"use strict";
// Pixel scene and execution geometry share one GPU compositor. Canvas fallback uses the same frame.
class WorldCompositor{
 constructor(){
  this.canvas=document.createElement('canvas');this.canvas.width=640;this.canvas.height=384;this.backend='canvas';this.lost=false;
  const gl=this.canvas.getContext('webgl2',{alpha:true,antialias:false,premultipliedAlpha:false,preserveDrawingBuffer:true});
  if(!gl)return;
  this.gl=gl;
  try{
   this.setup(gl);
   this.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.lost=true;this.backend='canvas';});
   this.canvas.addEventListener('webglcontextrestored',()=>{try{this.setup(this.gl);this.lost=false;this.backend='webgl2';}catch(err){this.error=err.message;this.lost=true;this.backend='canvas';}});
  }catch(error){this.error=error.message;this.backend='canvas';}
 }
 setup(gl){
  const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
  const vs=shader(gl.VERTEX_SHADER,`#version 300 es
  in vec2 position;out vec2 uv;void main(){uv=(position+1.0)*0.5;gl_Position=vec4(position,0,1);}`);
  const fs=shader(gl.FRAGMENT_SHADER,`#version 300 es
  precision highp float;in vec2 uv;out vec4 color;uniform sampler2D scene;uniform sampler2D skeleton;
  uniform float reveal;uniform float tear;uniform float pressure;uniform float time;uniform float hostile;uniform vec2 focus;
  void main(){
   vec2 p=vec2(uv.x,1.0-uv.y),pixel=floor(p*vec2(320.0,192.0));
   float crack=focus.x+sin(floor(pixel.y/6.0)*2.13)*.022+sin(floor(pixel.y/19.0))* .013;
   float side=sign(p.x-crack),gap=tear*.036;
   vec2 displaced=p+vec2(side*gap,sin(floor(pixel.y/5.0)*.73)*tear*.012);
   vec4 a=texture(scene,displaced),b=texture(skeleton,p);
   vec3 ink=mix(vec3(.58,.78,.67),vec3(.82,.36,.48),hostile);
   float rim=1.0-smoothstep(.003,.013,abs(p.x-crack)-gap*.22);
   float slit=step(abs(p.x-crack),gap*.24);
   float exposure=clamp(reveal*b.a,0.0,.85);
   vec3 combined=mix(a.rgb,b.rgb,exposure);
   combined+=ink*rim*tear*.25;
   float edge=pow(length((p-.5)*vec2(1.0,.85)),3.0)*pressure;
   combined=mix(combined,vec3(.20,.045,.08),min(.28,edge));
   color=vec4(combined,1.0-slit*.84);
  }`);
  const program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.deleteShader(vs);gl.deleteShader(fs);
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  gl.useProgram(program);const position=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
  this.textures=[0,1].map(unit=>{const t=gl.createTexture();gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGBA8,640,384);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;});
  this.uniforms=Object.fromEntries(['scene','skeleton','reveal','tear','pressure','time','hostile','focus'].map(n=>[n,gl.getUniformLocation(program,n)]));gl.uniform1i(this.uniforms.scene,0);gl.uniform1i(this.uniforms.skeleton,1);
  this.program=program;this.buffer=buffer;this.backend='webgl2';
 }
 draw(scene,skeleton,options={}){
  const reveal=Math.max(0,Math.min(1,options.reveal||0)),tear=Math.max(0,Math.min(1,options.tear||0));
  if(this.backend==='webgl2'&&!this.lost){
   const gl=this.gl;gl.useProgram(this.program);gl.viewport(0,0,this.canvas.width,this.canvas.height);
   for(let i=0;i<2;i++){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,this.textures[i]);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,i?skeleton:scene);}
   for(const [name,value] of Object.entries({reveal,tear,pressure:Math.min(1,(options.pressure||0)/6),time:options.reduced?0:options.time||0,hostile:options.hostile?1:0}))gl.uniform1f(this.uniforms[name],value);
   const focus=options.focus||[.5,.55];gl.uniform2f(this.uniforms.focus,focus[0],focus[1]);
   gl.drawArrays(gl.TRIANGLES,0,6);return this.canvas;
  }
  if(!this.fallback){this.fallback=document.createElement('canvas');this.fallback.width=640;this.fallback.height=384;}
  const c=this.fallback.getContext('2d');c.imageSmoothingEnabled=false;c.clearRect(0,0,640,384);
  const split=Math.round((options.focus?.[0]||.5)*640),gap=Math.round(tear*23);
  if(tear&&!options.reduced){
   for(const side of [-1,1]){
    c.save();c.beginPath();c.moveTo(side<0?0:640,0);
    for(let y=0;y<=384;y+=12)c.lineTo(split+Math.round(Math.sin(y/12*2.13)*14),y);
    c.lineTo(side<0?0:640,384);c.closePath();c.clip();c.drawImage(scene,side*gap,0,640,384);c.restore();
   }
  }else c.drawImage(scene,0,0,640,384);
  c.globalAlpha=reveal;c.drawImage(skeleton,0,0,640,384);c.globalAlpha=1;
  return this.fallback;
 }
 dispose(){if(this.gl){if(this.textures)this.textures.forEach(t=>this.gl.deleteTexture(t));if(this.buffer)this.gl.deleteBuffer(this.buffer);if(this.program)this.gl.deleteProgram(this.program);}this.backend='canvas';this.lost=true;}
}
if(typeof module!=='undefined'&&module.exports){module.exports=WorldCompositor;}
