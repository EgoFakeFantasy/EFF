'use strict';
// Supplemental to original-object/window verification; never a combat verdict.
function reviewPlayerGameplay(rows,start,end,playerUUID){
 const fail=m=>{throw Error('PLAYER_GAMEPLAY_'+m);};
 if(!Array.isArray(rows)||!Number.isFinite(start)||!Number.isFinite(end)||end<=start)fail('INPUT');
 const covered=rows.filter(r=>r.observedAtUnixMs>=start&&r.observedAtUnixMs<=end);
 if(covered.length<20)fail('COVERAGE');
 let samples=0;
 for(const r of covered)for(const [side,entities] of [['client',r.client],['server',r.server?.entities]]){
  const found=entities?.filter(e=>e.uuid===playerUUID);if(found?.length!==1)fail('PLAYER_ROSTER');
  const g=found[0].gameplay;
  if(g?.readable!==true||g.side!==side||g.scope!=='in-process-public-gameplay-state')fail('UNREADABLE');
  if(!['EASY','NORMAL','HARD'].includes(g.difficulty))fail('DIFFICULTY');
  if(['creative','spectator','publicInvulnerable','abilityInvulnerable','abilityInstabuild'].some(k=>g[k]!==false))fail('IMMUNITY_OR_MODE');
  if(typeof g.naturalRegeneration!=='boolean'||side==='server'&&g.serverGameMode!=='survival')fail('SERVER_MODE');
  samples++;
 }
 const functional=require('./player-functional-evidence.cjs').reviewPlayerFunction(rows,start,end,playerUUID);
 if(!functional.noListedFailureObserved)fail('FUNCTION_'+functional.issues[0].code);
 return {scope:'sampled-player-test-preconditions-only',playerUUID,gameplaySamples:samples,combatPassed:false,
  functional,
  limitation:'In-process gameplay flags; combine with original-object, actual attack and external window evidence.'};
}
module.exports={reviewPlayerGameplay};
