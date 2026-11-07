"use strict";
// Use only AFTER watching the identified video. Rechecks its bytes and writes a NEW review artifact.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {toolsAt,verifyVideo}=require('./window-recorder.cjs'),{verdict}=require('./combat-verdict.cjs');
async function review({reportFile,toolsDirectory,expectedSHA256,reviewer,note,visualOutcome,combatReview}){
 if(!['pass','fail','uncertain'].includes(visualOutcome))throw Error('EXPLICIT_VISUAL_OUTCOME_REQUIRED');
 if(!/^[a-f0-9]{64}$/.test(expectedSHA256||'')||typeof reviewer!=='string'||reviewer.length<2||reviewer.length>80||typeof note!=='string'||note.length<20||note.length>4000)throw Error('EXPLICIT_VIDEO_HASH_REVIEWER_AND_REVIEW_NOTE_REQUIRED');
 const bytes=fs.readFileSync(reportFile);if(bytes.length>4*1024*1024)throw Error('REPORT_SIZE_BUDGET');
 const report=JSON.parse(bytes),video=report.video;
 if(fs.existsSync(path.join(path.dirname(path.resolve(reportFile)),'recording','acceptance-correction.json')))
  throw Error('ACCEPTANCE_WITHDRAWN_USE_A_NEW_RUN');
 if(visualOutcome==='pass'&&report.scope!=='clean-continuous-baseline'&&!combatReview)
  throw Error('STRUCTURED_VISIBLE_ATTACK_REVIEW_REQUIRED');
 if(!video||video.error||video.decoded!==true||video.reviewed!==false||video.runId!==report.runId||video.sha256!==expectedSHA256)throw Error('VIDEO_RECEIPT_MISMATCH');
 const file=path.join(path.dirname(path.resolve(reportFile)),'recording','window.mp4');
 if(path.resolve(video.file)!==file)throw Error('RUN_LOCAL_VIDEO_REQUIRED');
 const checked=await verifyVideo(file,toolsAt(toolsDirectory));
 for(const key of ['sha256','bytes','frameCount','durationMs','maxFrameGapMs'])if(checked[key]!==video[key])throw Error('VIDEO_CHANGED_AFTER_RECORDING');
 const reviewed={...report,video:{...video,reviewed:true,reviewer,reviewNote:note,visualOutcome,combatReview,reviewedAtUnixMs:Date.now()},
  sourceReportSHA256:createHash('sha256').update(bytes).digest('hex')};
 const baseline=reviewed.scope==='clean-continuous-baseline';
 reviewed.combatAcceptance=verdict(reviewed,{baseline});
 if(baseline)reviewed.ok=reviewed.combatAcceptance.accepted;
 const output=path.join(path.dirname(file),'reviewed-combat-result.json');
 fs.writeFileSync(output,JSON.stringify(reviewed,null,2),{flag:'wx'});return {output,combatAcceptance:reviewed.combatAcceptance};
}
if(require.main===module){
 const [reportFile,toolsDirectory,expectedSHA256,reviewer,noteFile,visualOutcome,combatReviewFile]=process.argv.slice(2);
 Promise.resolve().then(()=>review({reportFile,toolsDirectory,expectedSHA256,reviewer,visualOutcome,note:fs.readFileSync(noteFile,'utf8'),
  combatReview:combatReviewFile?JSON.parse(fs.readFileSync(combatReviewFile,'utf8')):undefined})).then(r=>{console.log(JSON.stringify(r));if(!r.combatAcceptance.accepted)process.exitCode=1;},e=>{console.error(e.message);process.exitCode=1;});
}
module.exports={review};
