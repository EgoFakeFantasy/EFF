const {test}=require('node:test'),assert=require('node:assert/strict');
const {reviewPlayerGameplay}=require('./player-gameplay-evidence.cjs');
function fixture(){return Array.from({length:21},(_,i)=>{
 const entity=side=>({uuid:'original',objectIdentity:side==='client'?1:2,sameOriginalIdentity:true,gameplay:{tickCount:i*20,scope:'in-process-public-gameplay-state',readable:true,side,difficulty:'NORMAL',
  creative:false,spectator:false,publicInvulnerable:false,abilityInvulnerable:false,abilityInstabuild:false,naturalRegeneration:true,serverGameMode:'survival'}});
 return {observedAtUnixMs:1000+i*1000,paused:false,serverAgeMs:0,serverSamplePending:false,client:[entity('client')],server:{entities:[entity('server')]}};
});}
test('normal survival conditions do not confer combat success',()=>{const r=reviewPlayerGameplay(fixture(),1000,21000,'original');assert.equal(r.gameplaySamples,42);assert.equal(r.combatPassed,false);});
test('one server-only immunity sample rejects the capture',()=>{const r=fixture();r[10].server.entities[0].gameplay.abilityInvulnerable=true;assert.throws(()=>reviewPlayerGameplay(r,1000,21000,'original'),/IMMUNITY/);});
test('peaceful, creative, missing and unreadable conditions cannot pass',()=>{
 for(const change of [g=>g.difficulty='PEACEFUL',g=>g.creative=true,g=>delete g.abilityInvulnerable,g=>g.readable=false,g=>g.serverGameMode='adventure']){
  const r=fixture();change(r[10].server.entities[0].gameplay);assert.throws(()=>reviewPlayerGameplay(r,1000,21000,'original'),/PLAYER_GAMEPLAY_/);
 }
});
test('wrong side, duplicate or missing original player cannot pass',()=>{
 for(const change of [r=>r[10].client[0].gameplay.side='server',r=>r[10].client.push(r[10].client[0]),r=>r[10].server.entities=[]]){
  const r=fixture();change(r);assert.throws(()=>reviewPlayerGameplay(r,1000,21000,'original'),/PLAYER_GAMEPLAY_/);
 }
});
test('uncaptured or too-short data cannot pass',()=>{assert.throws(()=>reviewPlayerGameplay(fixture(),2000,21000,'original-x'),/ROSTER/);assert.throws(()=>reviewPlayerGameplay(fixture(),5000,10000,'original'),/COVERAGE/);});
