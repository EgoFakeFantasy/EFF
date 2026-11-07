"use strict";
// External, bounded HWND capture. No desktop/title fallback, game launch or automatic review.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {createHash}=require('node:crypto');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const PIN={
 'ffmpeg.exe':'1326dde4c84ff1f96fe6b8916c5bed29e163e9b5dccf995f6f3db069d143ec5e',
 'ffprobe.exe':'b49ccc7c6547b141ad5a2f6ec69cc04323d7133d7704d70b331b904c63eecb07'
};
// Leave muxing/startup headroom below the existing disk cap for the entire capture.
const RECORDING_BUDGET=Object.freeze({maxSeconds:360,maxFileBytes:96*1024*1024,maxRateBits:2000000,bufferBits:4000000});
function encodingArguments(){return ['-c:v','libx264','-preset','ultrafast','-crf','23',
 '-maxrate',String(RECORDING_BUDGET.maxRateBits),'-bufsize',String(RECORDING_BUDGET.bufferBits),
 '-pix_fmt','yuv420p','-threads','2','-fps_mode','passthrough'];}
function earlyExitReason(code,bytes){
 if(code!==0)return 'RECORDER_NONZERO_EXIT';
 return Number.isFinite(bytes)&&bytes>=RECORDING_BUDGET.maxFileBytes?'RECORDER_SIZE_BUDGET':'RECORDER_ENDED_EARLY';
}
function hash(file){return createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function identity(i){
 if(!i||!Number.isSafeInteger(i.pid)||i.pid<=0||!/^\d{15,20}$/.test(i.processStartedUtcTicks||'')||
    !/^[a-f0-9]{1,16}$/.test(i.windowHandle||'')||/^0+$/.test(i.windowHandle))throw Error('RECORDER_IDENTITY_REQUIRED');
 return {pid:i.pid,processStartedUtcTicks:i.processStartedUtcTicks,windowHandle:i.windowHandle};
}
function toolsAt(directory){
 const tools={};for(const [name,pin] of Object.entries(PIN)){
  const file=path.resolve(directory,name);
  if(!fs.statSync(file).isFile()||hash(file)!==pin)throw Error('RECORDER_TOOL_HASH_MISMATCH');
  tools[name]=file;
 }return tools;
}
function windowFailure(sample,expected,requireResponsive){
 if(sample.pid!==expected.pid||sample.processStartedUtcTicks!==expected.processStartedUtcTicks||
    sample.windowHandle!==expected.windowHandle||sample.alive!==true||sample.windowPresent!==true)
  return 'RECORDER_WINDOW_IDENTITY_OR_AVAILABILITY';
 return requireResponsive&&sample.responsive!==true?'RECORDER_WINDOW_UNRESPONSIVE':null;
}
function observationGapOverlapsCapture(gap,firstFrameAtMs){
 return firstFrameAtMs>0&&gap.endedAtMs>=firstFrameAtMs;
}
function captureClock(frames,epochOffsetUnixMs){
 if(!Array.isArray(frames)||frames.length<2||!Number.isFinite(epochOffsetUnixMs)
    ||epochOffsetUnixMs<=0||frames.some((x,i)=>!Number.isFinite(x)||x<0||i>0&&x<=frames[i-1]))return null;
 return {schema:1,source:'gdigrab-frame-time-and-recorder-wall-clock',epochOffsetUnixMs,
  captureStartedAtUnixMs:epochOffsetUnixMs+frames[0],captureEndedAtUnixMs:epochOffsetUnixMs+frames.at(-1),
  maximumWallClockDriftMs:250};
}
function execute(exe,args,{timeout=30000,max=4*1024*1024}={}){
 return new Promise((resolve,reject)=>{
  const p=spawn(exe,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let out='',err='',failure;
  const timer=setTimeout(()=>{failure=Error('RECORDER_TOOL_TIMEOUT');p.kill();},timeout);
  p.stdout.on('data',b=>{out+=b;if(out.length>max){failure=Error('RECORDER_OUTPUT_BUDGET');p.kill();}});
  p.stderr.on('data',b=>{err=(err+b).slice(-12000);});
  p.on('error',e=>{clearTimeout(timer);reject(e);});
  p.on('close',code=>{clearTimeout(timer);if(failure||code!==0)reject(failure||Error('RECORDER_TOOL_FAILED:'+err.slice(-1600)));else resolve(out);});
 });
}
function frameSummary(frames){
 if(!Array.isArray(frames)||frames.length<2||frames.length>4000)throw Error('VIDEO_FRAME_COUNT');
 const times=frames.map(f=>Number(f.best_effort_timestamp_time)*1000);
 if(times.some(x=>!Number.isFinite(x)))throw Error('VIDEO_FRAME_TIMESTAMPS');
 let maxFrameGapMs=0;
 for(let i=1;i<times.length;i++){const gap=times[i]-times[i-1];if(gap<=0||gap>1000)throw Error('VIDEO_FRAME_GAP');maxFrameGapMs=Math.max(maxFrameGapMs,gap);}
 return {frameCount:frames.length,durationMs:times.at(-1)-times[0],maxFrameGapMs};
}
async function verifyVideo(file,tools){
 const size=fs.statSync(file).size;if(size<1000||size>100*1024*1024)throw Error('VIDEO_SIZE_BUDGET');
 const metadata=JSON.parse(await execute(tools['ffprobe.exe'],['-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time,width,height','-of','json',file]));
 const summary=frameSummary(metadata.frames);
 await execute(tools['ffmpeg.exe'],['-hide_banner','-v','error','-xerror','-i',file,'-map','0:v:0','-f','null','-'],{timeout:60000});
 return {...summary,sha256:hash(file),bytes:size,decoded:true};
}
class WindowRecorder {
 constructor({directory,toolsDirectory,probeExe,identity:target,runId,recordStartup=false}){
  this.identity=identity(target);
  if(!/^[a-zA-Z0-9-]{8,80}$/.test(runId||''))throw Error('RECORDER_RUN_ID_REQUIRED');
  this.runId=runId;this.directory=path.resolve(directory);this.tools=toolsAt(toolsDirectory);
  this.probeExe=path.resolve(probeExe);this.probeSHA256=hash(this.probeExe);
   this.frames=[];this.samples=[];this.observationGaps=[];this.failure='';this.closed=false;this.firstFrameAtMs=0;
  this.requireResponsive=!recordStartup;
 }
 fail(reason){this.failure ||= reason;}
 async start(){
  if(this.started)throw Error('RECORDER_ALREADY_STARTED');this.started=true;
  fs.mkdirSync(this.directory); // No reuse or overwrite of any recording directory.
  this.file=path.join(this.directory,'window.mp4');this.epochOffset=Date.now()-performance.now();
  const i=this.identity;
  this.probe=spawn(this.probeExe,['--window',String(i.pid),i.processStartedUtcTicks,i.windowHandle],{windowsHide:true,stdio:['ignore','pipe','ignore']});
  let buffer='';this.probe.on('error',()=>this.fail('RECORDER_WINDOW_PROBE_START'));
  this.probe.on('exit',()=>{if(!this.closed)this.fail('RECORDER_WINDOW_PROBE_EXIT');});
  this.probe.stdout.on('data',b=>{
   buffer+=b;if(buffer.length>65536){this.fail('RECORDER_PROBE_OUTPUT_BUDGET');return;}
   let n;while((n=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,n);buffer=buffer.slice(n+1);try{
    const s=JSON.parse(line);if(this.samples.length>=400)throw Error();
    const receivedAtMs=performance.now();
    if(this.samples.length&&receivedAtMs-this.samples.at(-1).receivedAtMs>2000){
     const gap={startedAtMs:this.samples.at(-1).receivedAtMs,endedAtMs:receivedAtMs};
     this.observationGaps.push(gap);
     if(observationGapOverlapsCapture(gap,this.firstFrameAtMs))this.fail('RECORDER_WINDOW_OBSERVATION_GAP');
    }
    this.samples.push({...s,receivedAtMs});
    const windowError=windowFailure(s,i,this.requireResponsive);if(windowError)this.fail(windowError);
    if(!Number.isSafeInteger(s.clientWidth)||!Number.isSafeInteger(s.clientHeight)||s.clientWidth<64||s.clientHeight<64||s.clientWidth>3840||s.clientHeight>2160)throw Error();
    if(this.geometry&&(s.clientWidth!==this.geometry.width||s.clientHeight!==this.geometry.height))this.fail('RECORDER_WINDOW_RESIZED');
   }catch{this.fail('RECORDER_WINDOW_IDENTITY_OR_AVAILABILITY');}}
  });
  const until=performance.now()+8000;
  while(!this.samples.length&&!this.failure&&performance.now()<until)await delay(50);
  if(!this.samples.length||this.failure)throw Error(this.failure||'RECORDER_WINDOW_PROBE_TIMEOUT');
  this.geometry={width:this.samples[0].clientWidth,height:this.samples[0].clientHeight};
  this.process=spawn(this.tools['ffmpeg.exe'],[
   '-hide_banner','-loglevel','info','-n','-copyts','-start_at_zero','-f','gdigrab','-framerate','10','-draw_mouse','0',
   '-video_size',this.geometry.width+'x'+this.geometry.height,'-i','hwnd=0x'+i.windowHandle,
   '-an','-vf','showinfo,pad=ceil(iw/2)*2:ceil(ih/2)*2',
   ...encodingArguments(),
   '-t',String(RECORDING_BUDGET.maxSeconds),'-fs',String(RECORDING_BUDGET.maxFileBytes),'-avoid_negative_ts','make_zero','-flush_packets','1','-progress','pipe:1','-stats_period','0.1',this.file
  ],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  this.process.stdin.on('error',()=>{});this.process.stdout.resume();
  this.process.on('error',()=>this.fail('RECORDER_START_FAILED'));
  this.exit=new Promise(resolve=>this.process.on('close',code=>{
   this.exitCode=code;if(!this.closed){let bytes;try{bytes=fs.statSync(this.file).size;}catch{}
    this.fail(earlyExitReason(code,bytes));}resolve();}));
  let lines='';this.stderr='';
  this.process.stderr.on('data',b=>{
   this.stderr=(this.stderr+b).slice(-16000);lines+=b;
   if(lines.length>65536){this.fail('RECORDER_LOG_BUDGET');lines='';return;}
   let n;while((n=lines.indexOf('\n'))>=0){const line=lines.slice(0,n);lines=lines.slice(n+1);
    const start=/Duration: N\/A, start: (\d+\.\d+)/.exec(line);
    if(start)this.inputStartUnixMs=Number(start[1])*1000;
    const m=/\bn:\s*(\d+)\s+pts:\s*(\d+)/.exec(line);
    if(!m)continue;
    const pts=Number(m[2])/1000,now=performance.now(),atMs=pts+this.inputStartUnixMs-this.epochOffset;
    // gdigrab's microsecond PTS is wall-clock time; reject a changed clock/unsupported timebase.
    if(!Number.isFinite(atMs)||Math.abs((Date.now()-now)-this.epochOffset)>250||atMs>now+100||now-atMs>3000||this.frames.length>=3605){this.fail('RECORDER_CAPTURE_CLOCK');continue;}
    if(this.frames.length&&(atMs<=this.frames.at(-1)||atMs-this.frames.at(-1)>1000))this.fail('RECORDER_CAPTURE_GAP');
    this.frames.push(atMs);if(!this.firstFrameAtMs){
     this.firstFrameAtMs=atMs;
     // Frame timestamps can arrive after probe output. Recheck earlier delivery
     // gaps against actual capture start rather than hiding overlapping gaps.
     if(this.observationGaps.some(g=>observationGapOverlapsCapture(g,atMs)))this.fail('RECORDER_WINDOW_OBSERVATION_GAP');
    }
   }
  });
  const ready=performance.now()+20000;
  while(this.frames.length<3&&!this.failure&&performance.now()<ready)await delay(50);
  if(this.frames.length<3||this.failure)throw Error(this.failure||'RECORDER_FIRST_FRAME_TIMEOUT');
  this.assertHealthy();return this;
 }
 assertHealthy(){
  if(this.failure)throw Error(this.failure);
  if(!this.frames.length||performance.now()-this.frames.at(-1)>1500)throw Error('RECORDER_FRAME_STALLED');
  if(!this.samples.length||performance.now()-this.samples.at(-1).receivedAtMs>2000)throw Error('RECORDER_PROBE_STALLED');
 }
 beginObservation(){
  this.assertHealthy();
  const recent=this.samples.slice(-3);
  if(recent.length<3||recent.some(x=>x.responsive!==true))throw Error('RECORDER_RESPONSIVE_OBSERVATION_REQUIRED');
  this.requireResponsive=true;this.observationStartedAtMs=performance.now();
 }
 async stop(){
  if(this.receipt)return this.receipt;
  this.closed=true;
  if(this.process&&this.process.exitCode===null&&this.process.signalCode===null){
   this.process.stdin.write('q\n');
   let timer;const ok=await Promise.race([this.exit.then(()=>true),new Promise(r=>{timer=setTimeout(()=>r(false),5000);})]);clearTimeout(timer);
   if(!ok){this.fail('RECORDER_FINALIZATION_TIMEOUT');this.process.kill();await this.exit;}
  }
  if(this.probe&&this.probe.exitCode===null&&this.probe.signalCode===null)this.probe.kill();
  if(this.exitCode!==0)this.fail('RECORDER_NONZERO_EXIT');
  let validation={};try{validation=await verifyVideo(this.file,this.tools);
   if(validation.frameCount!==this.frames.length||Math.abs(validation.durationMs-(this.frames.at(-1)-this.frames[0]))>200)this.fail('RECORDER_FRAME_RECEIPT_MISMATCH');
  }catch(e){this.fail(e.message);}
  this.receipt={schema:1,source:'external-window-recorder',runId:this.runId,...this.identity,file:this.file,...validation,
   clock:captureClock(this.frames,this.epochOffset),
   startedAtMs:this.frames[0]??null,endedAtMs:this.frames.at(-1)??null,captureFrames:this.frames.length,geometry:this.geometry,observationStartedAtMs:this.observationStartedAtMs??null,
   observationGaps:this.observationGaps,encodingBudget:RECORDING_BUDGET,encoderExitCode:this.exitCode??null,
   toolsSHA256:PIN,probeSHA256:this.probeSHA256,mediaDecoded:validation.decoded===true,decoded:!this.failure&&validation.decoded===true,reviewed:false,error:this.failure||null};
  fs.writeFileSync(path.join(this.directory,'recorder-receipt.json'),JSON.stringify(this.receipt,null,2),{flag:'wx'});
  fs.writeFileSync(path.join(this.directory,'capture-timeline.json'),JSON.stringify({clock:this.receipt.clock,frames:this.frames,windows:this.samples},null,2),{flag:'wx'});
  fs.writeFileSync(path.join(this.directory,'recorder-tail.log'),this.stderr||'',{flag:'wx'});
  return this.receipt;
 }
}
module.exports={WindowRecorder,toolsAt,verifyVideo,frameSummary,identity,execute,windowFailure,observationGapOverlapsCapture,captureClock,RECORDING_BUDGET,encodingArguments,earlyExitReason};
