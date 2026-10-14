"use strict";
// Explicit developer check: never downloads or starts a model service.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {ModelClient}=require('../desktop/model-client.cjs');
const R=require('../local-version/phenomenon-runtime.js');
(async()=>{
 if(!process.env.EFF_LIVE_MODEL)throw Error('Set EFF_LIVE_MODEL to an already installed local model');
 const model=new ModelClient();let state=R.initial({battleId:'court-live',seed:314159});const rounds=[];
 try{
  await model.configure({enabled:true,model:process.env.EFF_LIVE_MODEL,profile:'patient'});
  for(const goal of ['body','attribution','bad_owned']){
   const pair=await model.plan({snapshot:R.checkpoint(state),goal});
   for(const actor of [pair.player,pair.intruder]){assert.equal(actor.source,'local-model',actor.reason);assert.equal(R.validateProposal(state,actor.proposal,actor.actor).ok,true);}
   state=R.resolveRound(state,pair.player.proposal,pair.intruder.proposal);
   const record={goal,player:pair.player,intruder:pair.intruder,state:R.summary(state)};rounds.push(record);
   console.log(JSON.stringify(record));
  }
  assert.equal(state.outcome,'won');assert.deepEqual(R.summary(R.replay(R.checkpoint(state))),R.summary(state));
  const out=path.resolve(process.env.EFF_TEST_OUTPUT||path.join(__dirname,'../../output/eff-local-ai-test'));await fs.mkdir(out,{recursive:true});
  await fs.writeFile(path.join(out,'real-model-battle.json'),JSON.stringify({model:process.env.EFF_LIVE_MODEL,rounds,checkpoint:R.checkpoint(state)},null,2));
  console.log('Real local model: six generated moves, deterministic replay, no fallback.');
 }finally{model.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
