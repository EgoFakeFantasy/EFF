'use strict';
// Explicit offline stress check: synthetic video only, no game, window capture or input.
const fs=require('node:fs'),path=require('node:path');
const {toolsAt,execute,verifyVideo,encodingArguments,RECORDING_BUDGET:b}=require('./window-recorder.cjs');
const [toolsDirectory,destination]=process.argv.slice(2);
if(!toolsDirectory||!destination)throw Error('TOOLS_DIRECTORY_AND_NEW_OUTPUT_DIRECTORY_REQUIRED');
(async()=>{
 const tools=toolsAt(toolsDirectory),out=path.resolve(destination);fs.mkdirSync(out);
 const file=path.join(out,'synthetic-360s.mp4');
 const args=['-hide_banner','-v','error','-n','-f','lavfi','-i',
  'testsrc2=size=1280x720:rate=10,noise=alls=60:allf=t+u:all_seed=1234',
  '-an',...encodingArguments(),'-t',String(b.maxSeconds),'-fs',String(b.maxFileBytes),file];
 let result;
 try {
  await execute(tools['ffmpeg.exe'],args,{timeout:300000});
  const video=await verifyVideo(file,tools);
  if(video.frameCount!==b.maxSeconds*10||video.durationMs<(b.maxSeconds-.2)*1000||video.bytes>=b.maxFileBytes)
   throw Error('FULL_DURATION_OR_DISK_BUDGET_FAILED');
  result={passed:true,scope:'synthetic-encoding-budget-only-not-Minecraft-capture-or-combat',minecraftStarted:false,budget:b,video};
 }catch(e){result={passed:false,error:e.message,scope:'synthetic-encoding-budget-only-not-Minecraft-capture-or-combat'};process.exitCode=1;}
 fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(result,null,2),{flag:'wx'});
 console.log(JSON.stringify(result));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
