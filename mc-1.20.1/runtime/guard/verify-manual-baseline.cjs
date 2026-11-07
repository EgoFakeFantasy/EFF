'use strict';
const fs=require('node:fs'),path=require('node:path');
const {reviewManualFiles}=require('./manual-baseline-evidence.cjs');
const {toolsAt,execute}=require('./window-recorder.cjs');

async function verifyAndSave(runDirectory,recordingName,toolsDirectory){
 if(!/^[a-z0-9-]+$/.test(recordingName||''))throw Error('RECORDING_NAME');
 const run=path.resolve(runDirectory),recording=path.join(run,recordingName);
 const output=path.join(run,'handoff-baseline.json'),frame=path.join(recording,'frame-10s.png');
 if(fs.existsSync(output)||fs.existsSync(frame))throw Error('BASELINE_OUTPUT_ALREADY_EXISTS');
 const report=await reviewManualFiles({runDirectory:run,recordingDirectory:recording,toolsDirectory});
 // This command hands off a currently running scene, not just an archived capture.
 const mtime=fs.statSync(path.join(run,'mc-host/manual-scene-trace.jsonl')).mtimeMs,now=Date.now();
 if(mtime>now+250||now-mtime>5000)throw Error('BASELINE_TRACE_STALE');
 await execute(toolsAt(toolsDirectory)['ffmpeg.exe'],['-hide_banner','-loglevel','error','-n',
  '-ss','10','-i',path.join(recording,'window.mp4'),'-frames:v','1',frame]);
 fs.writeFileSync(output,JSON.stringify({...report,frame},null,2),{flag:'wx'});
 return {output,pid:report.pid,coveringSnapshots:report.coveringSnapshots,checkedObjectSamples:report.checkedObjectSamples,
  captureStartedAtUnixMs:report.captureStartedAtUnixMs,captureEndedAtUnixMs:report.captureEndedAtUnixMs,
  combatPassed:false,visualReviewRequired:true,frame};
}
module.exports={verifyAndSave};
if(require.main===module)verifyAndSave(...process.argv.slice(2)).then(r=>console.log(JSON.stringify(r)))
 .catch(e=>{console.error(e.message);process.exitCode=1;});
