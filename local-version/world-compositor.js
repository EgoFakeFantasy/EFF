"use strict";
// Pixel scene and execution geometry share one GPU compositor. Canvas fallback uses the same frame.
class WorldCompositor{
 constructor(){
  this.canvas=document.createElement('canvas');this.canvas.width=640;this.canvas.height=384;this.backend='canvas';this.lost=false;
  const gl=this.canvas.getContext('webgl2',{alpha:true,antialias:false,premultipliedAlpha:false,preserveDrawingBuffer:true});
  if(!gl){this.canvas=document.createElement('canvas');this.canvas.width=640;this.canvas.height=384;return;}
  try{
   const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
   const vs=shader(gl.VERTEX_SHADER,`#version 300 es
   in vec2 position;out vec2 uv;void main(){uv=(position+1.0)*0.5;gl_Position=vec4(position,0,1);}`);
   const fs=shader(gl.FRAGMENT_SHADER,`#version 300 es
   precision highp float;in vec2 uv;out vec4 color;uniform sampler2D scene;uniform sampler2D skeleton;
   uniform float reveal;uniform float tear;uniform float pressure;uniform float time;uniform float hostile;
   void main(){vec2 p=vec2(uv.x,1.0-uv.y);float crack=.5+sin(floor(p.y*192.0)*.23)*.022;
    float side=sign(p.x-crack);vec2 displaced=p+vec2(side*tear*.08,sin(p.y*27.0+time)*tear*.009);
    vec4 a=texture(scene,displaced);vec4 b=texture(skeleton,p);vec3 ink=mix(vec3(.33,.74,.61),vec3(.77,.27,.43),hostile);
    float edge=pow(abs(p.x-.5)*2.0,5.0)*pressure*.35;
    vec3 combined=mix(a.rgb,b.rgb,clamp(reveal*b.a,0.0,1.0));combined=mix(combined,ink,edge);
    float slit=step(abs(p.x-crack),tear*.018);combined=mix(combined,ink,slit*.6);
    float border=step(p.x,.002)+step(.998,p.x)+step(p.y,.004)+step(.996,p.y);combined+=ink*border*.45;
    color=vec4(combined,1.0-slit*.83);}`);
   const program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.deleteShader(vs);gl.deleteShader(fs);
   const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
   gl.useProgram(program);const position=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
   this.textures=[0,1].map(unit=>{const t=gl.createTexture();gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;});
   this.uniforms=Object.fromEntries(['scene','skeleton','reveal','tear','pressure','time','hostile'].map(n=>[n,gl.getUniformLocation(program,n)]));gl.uniform1i(this.uniforms.scene,0);gl.uniform1i(this.uniforms.skeleton,1);
   this.gl=gl;this.program=program;this.buffer=buffer;this.backend='webgl2';
   this.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.lost=true;this.backend='canvas';});
   this.canvas.addEventListener('webglcontextrestored',()=>{this.lost=true;});
  }catch(error){this.error=error.message;this.backend='canvas';}
 }
 draw(scene,skeleton,options={}){
  const reveal=Math.max(0,Math.min(1,options.reveal||0)),tear=Math.max(0,Math.min(1,options.tear||0));
  if(this.backend==='webgl2'&&!this.lost){
   const gl=this.gl;gl.useProgram(this.program);gl.viewport(0,0,this.canvas.width,this.canvas.height);
   for(let i=0;i<2;i++){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,this.textures[i]);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,i?skeleton:scene);}
   for(const [name,value] of Object.entries({reveal,tear,pressure:Math.min(1,(options.pressure||0)/6),time:options.reduced?0:options.time||0,hostile:options.hostile?1:0}))gl.uniform1f(this.uniforms[name],value);
   gl.drawArrays(gl.TRIANGLES,0,6);return this.canvas;
  }
  if(!this.fallback){this.fallback=document.createElement('canvas');this.fallback.width=640;this.fallback.height=384;}
  const c=this.fallback.getContext('2d');c.imageSmoothingEnabled=false;c.clearRect(0,0,640,384);c.drawImage(scene,0,0,640,384);c.globalAlpha=reveal;c.drawImage(skeleton,0,0,640,384);c.globalAlpha=1;
  return this.fallback;
 }
 dispose(){if(this.gl){this.textures.forEach(t=>this.gl.deleteTexture(t));this.gl.deleteBuffer(this.buffer);this.gl.deleteProgram(this.program);}this.backend='canvas';this.lost=true;}
}
