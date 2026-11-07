'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const csc='C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
test('Win32 observer distinguishes hidden, minimized and destroyed original HWND without rebinding',
 {skip:process.platform!=='win32',timeout:30000},async()=>{
 const root=path.resolve(__dirname,'../../../output');fs.mkdirSync(root,{recursive:true});
 const dir=fs.mkdtempSync(path.join(root,'window-state-proof-'));
 const probe=path.join(dir,'WindowProbe.exe'),fixture=path.join(dir,'WindowStateFixture.exe');
 for(const [source,target,references] of [['WindowProbe.cs',probe,[]],['WindowStateFixture.cs',fixture,['/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll']]]){
  const built=cp.spawnSync(csc,['/nologo','/target:exe','/out:'+target,...references,path.join(__dirname,source)],{encoding:'utf8',windowsHide:true,timeout:15000});
  assert.equal(built.status,0,built.stdout+built.stderr);
 }
 const app=cp.spawn(fixture,[],{stdio:['ignore','pipe','pipe'],windowsHide:true});
 let observer,identity,buffer='',samples=[],diagnostic='';
 try{
  identity=await new Promise((resolve,reject)=>{
   const deadline=setTimeout(()=>reject(Error('FIXTURE_IDENTITY_TIMEOUT')),5000);
   app.on('error',reject);app.stdout.on('data',b=>{buffer+=b;const at=buffer.indexOf('\n');if(at>=0){clearTimeout(deadline);resolve(JSON.parse(buffer.slice(0,at)));}});
  });
  observer=cp.spawn(probe,['--window',String(identity.pid),identity.processStartedUtcTicks,identity.windowHandle],{stdio:['ignore','pipe','pipe'],windowsHide:true});
  buffer='';observer.stdout.on('data',b=>{buffer+=b;let at;while((at=buffer.indexOf('\n'))>=0){samples.push(JSON.parse(buffer.slice(0,at)));buffer=buffer.slice(at+1);}});
  observer.stderr.on('data',b=>diagnostic+=b);
  await new Promise((resolve,reject)=>{observer.on('error',reject);observer.on('exit',resolve);});
  fs.writeFileSync(path.join(dir,'observations.json'),JSON.stringify({identity,samples,diagnostic},null,2),{flag:'wx'});
  assert.equal(diagnostic,'');assert(samples.length>=12);
  assert(samples.every(s=>s.windowHandle===identity.windowHandle&&s.pid===identity.pid));
  const normal=samples.find(s=>s.windowPresent&&s.responsive);assert(normal);assert.equal(normal.windowOwnerMatches,true);assert.equal(normal.clientRectAvailable,true);
  const hidden=samples.find(s=>s.windowUnavailableReason==='WINDOW_HIDDEN');assert(hidden);assert.equal(hidden.windowExists,true);assert.equal(hidden.windowVisible,false);assert.equal(hidden.alive,true);assert.equal(hidden.windowPresent,false);
  const minimized=samples.find(s=>s.windowUnavailableReason==='WINDOW_MINIMIZED');assert(minimized);assert.equal(minimized.windowExists,true);assert.equal(minimized.windowVisible,true);assert.equal(minimized.windowMinimized,true);assert.equal(minimized.windowPresent,false);
  const destroyed=samples.find(s=>s.windowUnavailableReason==='WINDOW_DESTROYED');assert(destroyed);assert.equal(destroyed.windowExists,false);assert.equal(destroyed.javaAlive,true);assert.equal(destroyed.windowPresent,false);
  console.log('WINDOW_STATE_OS_FIXTURE_OK '+dir);
 }finally{if(observer?.exitCode===null)observer.kill();if(app.exitCode===null)app.kill();}
});
