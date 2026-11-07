const {test}=require('node:test'),assert=require('node:assert/strict');
const {reviewPlayerFunction:review}=require('./player-functional-evidence.cjs');
function fixture(){return Array.from({length:21},(_,i)=>{
 const player=side=>({uuid:'p',objectIdentity:side==='client'?1:2,sameOriginalIdentity:true,rawHealth:20,
  gameplay:{tickCount:i*20},spatial:{storedPosition:{x:'0',y:'65',z:'0',finite:true}}});
 return {observedAtUnixMs:1000+i*1000,paused:false,serverAgeMs:0,serverSamplePending:false,
  client:[player('client')],server:{entities:[player('server')]}};
});}
const run=rows=>review(rows,1000,21000,'p');
const has=(r,code,side)=>r.issues.some(i=>i.code===code&&(!side||i.side===side));
test('normal advancing original player is not combat success',()=>{
 const r=run(fixture());assert.equal(r.noListedFailureObserved,true);assert.equal(r.checkedTickSamples,42);assert.equal(r.combatPassed,false);
});
test('unchanged healthy indexed player with fresh observations is a functional stall',()=>{
 const rows=fixture();for(const r of rows)r.server.entities[0].gameplay.tickCount=7790;
 const r=run(rows);assert(has(r,'PLAYER_TICK_STALLED','server'));assert(!has(r,'STALE_SERVER_SNAPSHOT'));assert.equal(r.combatPassed,false);
});
test('old server snapshots are missing freshness, not a proven stopped player tick',()=>{
 const rows=fixture();for(const [i,r] of rows.entries()){r.serverAgeMs=6000+i*1000;r.server.entities[0].gameplay.tickCount=7790;}
 const r=run(rows);assert(has(r,'STALE_SERVER_SNAPSHOT','server'));assert(!has(r,'PLAYER_TICK_STALLED','server'));
});
test('one repeated server snapshot at the freshness boundary is not a tick-stall proof',()=>{
 const rows=fixture();for(const [i,r] of rows.entries()){r.serverAgeMs=i*1000;r.server.sampledAtNanos=1000000000;r.server.entities[0].gameplay.tickCount=10;}
 const r=run(rows);assert(has(r,'STALE_SERVER_SNAPSHOT','server'));assert(!has(r,'PLAYER_TICK_STALLED','server'));
});
test('pause, missing samples and replacement never count as normal function',()=>{
 for(const edit of [rows=>rows[3].paused=true,rows=>rows[3].serverAgeMs=undefined,
  rows=>rows[3].server.entities=[],rows=>rows[3].client[0].objectIdentity=3,
  rows=>rows.splice(5,4),rows=>delete rows[3].client[0].gameplay.tickCount]){
  const rows=fixture();edit(rows);assert.equal(run(rows).noListedFailureObserved,false);
 }
});
test('signed tick wrap is accepted but rollback is rejected',()=>{
 const rows=fixture();for(const [i,r] of rows.entries())for(const p of [r.client[0],r.server.entities[0]])p.gameplay.tickCount=(2147483640+i*20)|0;
 assert.equal(run(rows).noListedFailureObserved,true);
 rows[10].server.entities[0].gameplay.tickCount=(rows[9].server.entities[0].gameplay.tickCount-1)|0;
 assert(has(run(rows),'PLAYER_TICK_REGRESSION','server'));
});
test('position disagreement is reported without asserting the cause',()=>{
 const rows=fixture();rows[10].client[0].spatial.storedPosition.y='60';const r=run(rows);
 assert.equal(r.maximumPositionDifference,5);assert.equal(r.noListedFailureObserved,true);assert.equal(r.combatPassed,false);
});
test('missing capture coverage and duplicate clocks are explicit',()=>{
 assert(has(run(fixture().slice(4)),'INSUFFICIENT_COVERAGE'));
 const rows=fixture();rows[10].observedAtUnixMs=rows[9].observedAtUnixMs;assert(has(run(rows),'TRACE_CLOCK_OR_GAP'));
});
