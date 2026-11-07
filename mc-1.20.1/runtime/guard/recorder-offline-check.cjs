"use strict";
// Explicit invocation only. Opens an owned WinForms fixture, NEVER launches Minecraft.
const fs=require('node:fs'),path=require('node:path'),{spawn,spawnSync}=require('node:child_process');
const {WindowRecorder,execute,verifyVideo,toolsAt}=require('./window-recorder.cjs');
const [toolsDirectory,destination,mode='normal']=process.argv.slice(2);
if(!toolsDirectory||!destination||!['normal','window-loss'].includes(mode))throw Error('TOOLS_DIRECTORY_NEW_OUTPUT_DIRECTORY_AND_MODE_REQUIRED');
const out=path.resolve(destination);toolsAt(toolsDirectory);fs.mkdirSync(out);
const csc=path.join(process.env.WINDIR||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');
for(const name of ['WindowProbe','RecorderFixture']){
 const r=spawnSync(csc,['/nologo','/target:exe','/out:'+path.join(out,name+'.exe'),'/r:System.Drawing.dll','/r:System.Windows.Forms.dll',path.join(__dirname,name+'.cs')],{encoding:'utf8',windowsHide:true});
 if(r.status!==0)throw Error(r.stdout+r.stderr);
}
let fixture,recorder;
(async()=>{try{
 fixture=spawn(path.join(out,'RecorderFixture.exe'),[],{windowsHide:true,stdio:['pipe','pipe','pipe']});fixture.stdin.on('error',()=>{});
 const info=await new Promise((resolve,reject)=>{let b='';const t=setTimeout(()=>reject(Error('FIXTURE_READY_TIMEOUT')),10000);fixture.on('error',e=>{clearTimeout(t);reject(e);});fixture.stdout.on('data',v=>{b+=v;if(b.includes('\n')){clearTimeout(t);try{resolve(JSON.parse(b.split('\n')[0]));}catch(e){reject(e);}}});});
 let wrongIdentityRejected=false;
 try{await execute(path.join(out,'WindowProbe.exe'),['--window',String(info.pid),'638000000000000000',info.windowHandle],{timeout:3000});}catch{wrongIdentityRejected=true;}
 recorder=new WindowRecorder({directory:path.join(out,'recording'),toolsDirectory,probeExe:path.join(out,'WindowProbe.exe'),identity:info,runId:'offline-fixture-'+Date.now()});
 await recorder.start();await new Promise(r=>setTimeout(r,mode==='normal'?5000:1500));
 if(mode==='window-loss'){
  fixture.stdin.end('close\n');await new Promise(r=>setTimeout(r,1600));
  let rejected=false;try{recorder.assertHealthy();}catch{rejected=true;}
  const receipt=await recorder.stop();
  if(!rejected||receipt.decoded||!receipt.error)throw Error('WINDOW_LOSS_NOT_REJECTED');
  const result={minecraftStarted:false,fixtureOnly:true,mode,windowLossRejected:true,receipt};
  fs.writeFileSync(path.join(out,'offline-result.json'),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result));return;
 }
 recorder.assertHealthy();const receipt=await recorder.stop();fixture.stdin.end('close\n');
 if(receipt.error||!receipt.decoded||receipt.reviewed)throw Error('FIXTURE_VALIDATION_FAILED');
 const truncated=path.join(out,'truncated.mp4');fs.writeFileSync(truncated,fs.readFileSync(receipt.file).subarray(0,2048),{flag:'wx'});
 let truncatedRejected=false;try{await verifyVideo(truncated,toolsAt(toolsDirectory));}catch{truncatedRejected=true;}
 if(!wrongIdentityRejected||!truncatedRejected)throw Error('NEGATIVE_TEST_FAILED');
 // New contact sheet for inspection, never modifies the recording.
 await execute(toolsAt(toolsDirectory)['ffmpeg.exe'],['-hide_banner','-v','error','-n','-i',receipt.file,'-vf','fps=1,scale=480:-1,tile=3x2','-frames:v','1',path.join(out,'contact.png')]);
 const result={minecraftStarted:false,fixtureOnly:true,mode,wrongIdentityRejected,truncatedRejected,receipt};
 fs.writeFileSync(path.join(out,'offline-result.json'),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result));
}catch(e){console.error(e.stack);process.exitCode=1;}finally{
 if(recorder&&!recorder.receipt)try{await recorder.stop();}catch(e){console.error(e.message);}
 if(fixture&&fixture.exitCode===null){if(!fixture.stdin.writableEnded)fixture.stdin.end('close\n');setTimeout(()=>{if(fixture.exitCode===null)fixture.kill();},2000).unref();}
}})();
