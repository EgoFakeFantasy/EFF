"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict');
const {identity,frameSummary,windowFailure,observationGapOverlapsCapture,WindowRecorder,captureClock}=require('./window-recorder.cjs');
test('full capture bitrate leaves disk headroom and disk-limit termination remains a failure',()=>{
 const {RECORDING_BUDGET:b,encodingArguments,earlyExitReason}=require('./window-recorder.cjs');
 assert.ok((b.maxSeconds*b.maxRateBits+b.bufferBits)/8+1024*1024 < b.maxFileBytes);
 assert.equal(b.maxFileBytes,96*1024*1024);
 const args=encodingArguments();assert.equal(args[args.indexOf('-maxrate')+1],String(b.maxRateBits));
 assert.equal(earlyExitReason(0,100690911),'RECORDER_SIZE_BUDGET');
 assert.equal(earlyExitReason(0,b.maxFileBytes-1),'RECORDER_ENDED_EARLY');
 assert.equal(earlyExitReason(1,b.maxFileBytes),'RECORDER_NONZERO_EXIT');
 assert.equal(earlyExitReason(0,undefined),'RECORDER_ENDED_EARLY');
});
test('receipt retains actual frame wall-clock mapping; absent clock is not reconstructed from file dates',()=>{
 const clock=captureClock([3500.25,3600.25,3700.25],1700000000000);
 assert.equal(clock.captureStartedAtUnixMs,1700000003500.25);
 assert.equal(clock.captureEndedAtUnixMs,1700000003700.25);
 assert.equal(clock.maximumWallClockDriftMs,250);
 for(const [frames,offset] of [[[],1700000000000],[[1],1700000000000],[[1,2],undefined],[[1,Infinity],1],[[1,2],NaN]])
  assert.equal(captureClock(frames,offset),null);
});
test('delivery gaps before capture remain diagnostic but overlapping gaps fail even if frames arrive late',()=>{
 const preRoll={startedAtMs:3487,endedAtMs:6635};
 assert.equal(observationGapOverlapsCapture(preRoll,0),false);
 assert.equal(observationGapOverlapsCapture(preRoll,6810),false);
 assert.equal(observationGapOverlapsCapture(preRoll,6000),true);
 assert.equal(observationGapOverlapsCapture(preRoll,6635),true);
 assert.equal(observationGapOverlapsCapture({startedAtMs:7000,endedAtMs:10000},6810),true);
});
test('pre-roll allowance never permits a stale probe or stalled frames at readiness',()=>{
 const now=performance.now();
 const state={failure:'',frames:[now],samples:[{receivedAtMs:now-2100}]};
 assert.throws(()=>WindowRecorder.prototype.assertHealthy.call(state),/RECORDER_PROBE_STALLED/);
 state.samples=[{receivedAtMs:now}];state.frames=[now-1600];
 assert.throws(()=>WindowRecorder.prototype.assertHealthy.call(state),/RECORDER_FRAME_STALLED/);
});
test('response timeout is distinguished from loss of the original window or process',()=>{
 const expected={pid:123,processStartedUtcTicks:'638977123456789012',windowHandle:'1a23'};
 const sample={...expected,alive:true,windowPresent:true,responsive:false};
 assert.equal(windowFailure(sample,expected,true),'RECORDER_WINDOW_UNRESPONSIVE');
 assert.equal(windowFailure(sample,expected,false),null);
 assert.equal(windowFailure({...sample,responsive:true},expected,true),null);
 for(const patch of [{pid:124},{windowHandle:'1a24'},{alive:false},{windowPresent:false},{processStartedUtcTicks:'638977123456789013'}])
  assert.equal(windowFailure({...sample,...patch},expected,false),'RECORDER_WINDOW_IDENTITY_OR_AVAILABILITY');
});
test('capture requires exact process creation and nonzero hexadecimal HWND',()=>{
 const good={pid:123,processStartedUtcTicks:'638977123456789012',windowHandle:'1a23'};
 assert.deepEqual(identity(good),good);
 for(const patch of [{pid:0},{pid:1.5},{windowHandle:'0'},{windowHandle:'desktop'},{processStartedUtcTicks:'yesterday'}])assert.throws(()=>identity({...good,...patch}));
});
test('video frames must advance continuously with bounded gaps',()=>{
 const frames=[0,.1,.2,.3].map(n=>({best_effort_timestamp_time:String(n)}));
 assert.equal(frameSummary(frames).durationMs,300);
 assert.equal(frameSummary(frames).maxFrameGapMs,100);
 for(const times of [[0,0],[.2,.1],[0,1.001],[0,'NaN'],[0]])assert.throws(()=>frameSummary(times.map(n=>({best_effort_timestamp_time:String(n)}))));
});
