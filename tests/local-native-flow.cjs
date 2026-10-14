"use strict";
const {_electron}=require('playwright'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {SaveStore}=require('../desktop/storage.cjs');
const out=path.resolve(process.env.EFF_TEST_OUTPUT||path.join(__dirname,'../../output/eff-local-preview'));
const canonical='wuzhong-returner-pixel-v1',errors=[];
async function launch(profile){
 const app=await _electron.launch({executablePath:process.env.EFF_ELECTRON_PATH,args:process.env.EFF_TEST_PACKAGED==='1'?[]:[path.resolve(__dirname,'../desktop')],env:{...process.env,EFF_DATA_DIR:profile},timeout:60000});
 const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForURL('eff://game/local-version/index.html');return {app,page};
}
async function fixture(mode){const profile=await fs.mkdtemp(path.join(out,'flow-'+mode+'-')),store=new SaveStore(path.join(profile,'saves'));await store.load();await store.commit({[mode+':'+canonical]:JSON.stringify(mode==='tech'?{area:'blood',px:195,py:226,flags:{sister:true,parents:true},memories:[],counters:{},trials:{version:1,court:{mode:'choice',remaining:16000,script:'accuse',index:6,selected:0,claimed:[false,false,false],written:false}}}:{area:'mirror',px:179,py:66,flags:{m1:true},memories:['存在自身'],counters:{}}),[mode+':wuzhong-returner-pixel-settings-v1']:JSON.stringify({speed:0,hints:true,motion:true,volume:0,lighting:true})});return profile;}
(async()=>{
 await fs.mkdir(out,{recursive:true});
 let profile=await fixture('story'),context=await launch(profile),{app,page}=context;
 try{
  await page.getByRole('link',{name:/原文之旅/}).click();await page.locator('#startButton').click();
  assert.equal(await page.evaluate(()=>F.m1),true);assert.equal(await page.locator('#techButton').count(),0);
  assert.equal(await page.evaluate(()=>EFFLocal.profile),'story');
  const attack=await page.evaluate(()=>window.effDesktop.persist({'../../private.txt':'{}'}));assert.equal(attack.ok,false);assert.ok(['KEY_NOT_ALLOWED','PROFILE_NOT_ALLOWED'].includes(attack.error));
  const cross=await page.evaluate(()=>window.effDesktop.persist({'tech:wuzhong-returner-pixel-v1':'{}'}));assert.equal(cross.ok,false);assert.equal(cross.error,'PROFILE_NOT_ALLOWED');
  assert.equal(await page.evaluate(()=>typeof window.effDesktop.execShell),'undefined');
 }finally{await app.close();}
 profile=await fixture('tech');({app,page}=await launch(profile));
 try{
  await page.getByRole('link',{name:/进入技术版/}).click();await page.locator('#startButton').click();await page.locator('#repressionPanel').waitFor({state:'visible'});
  assert.match(await page.locator('#techIdentity').innerText(),/身份未揭示/);
  const remaining=await page.evaluate(()=>NarrativeTrials.court.remaining);await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>NarrativeTrials.court.remaining),remaining);
  await page.locator('#techAnalyze').click();await page.locator('#techSubmit').click();await page.waitForFunction(()=>!RepressionUI.busy);
  await page.locator('#techMode').selectOption('cooperate');await page.locator('#techGoal').selectOption('attribution');await page.locator('#techAnalyze').click();
  const draft=JSON.parse(await page.locator('#techEditor').inputValue());draft.action='EXEC_SHELL';await page.locator('#techEditor').fill(JSON.stringify(draft));await page.locator('#techSubmit').click();await page.waitForFunction(()=>!RepressionUI.busy);
  assert.match(await page.locator('#techStatus').innerText(),/拒绝/);assert.equal(await page.evaluate(()=>BattleEventAdapter.state.bodyOwner),'player');assert.equal(await page.evaluate(()=>!!F.finaleSummoned),false);
  await page.evaluate(()=>EFFLocal.flush());await page.reload();await page.locator('#startButton').click();await page.locator('#repressionPanel').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>BattleEventAdapter.state.round),2);assert.equal(await page.evaluate(()=>NarrativeTrials.court.remaining),remaining);
  for(const goal of ['attribution','bad_owned']){await page.locator('#techGoal').selectOption(goal);await page.locator('#techAnalyze').click();await page.locator('#techSubmit').click();await page.waitForFunction(()=>!RepressionUI.busy);}
  assert.equal(await page.evaluate(()=>BattleEventAdapter.state.outcome),'won');
  await page.locator('#techResult button').getByText('回到周防的原文回应').click();
  assert.equal(await page.evaluate(()=>currentFullText()),'不，我拒绝这一切。');assert.deepEqual(await page.evaluate(()=>PhenomenonBattle.claimed),[false,false,false]);assert.equal(await page.evaluate(()=>!!F.finaleSummoned),false);
  await page.screenshot({path:path.join(out,'local-story-bridge.png')});
  // The name is unlocked only by the original completed rain-tower memory.
  await page.evaluate(()=>{closeDialog();G.area='rain';G.memories.push('显意识边缘');buildTileCache();});await page.locator('#techButton').click();assert.match(await page.locator('#techIdentity').innerText(),/^压抑/);await page.locator('#techClose').click();
 }finally{await app.close();}
 profile=await fixture('tech');({app,page}=await launch(profile));
 try{
  await page.getByRole('link',{name:/进入技术版/}).click();await page.locator('#startButton').click();await page.locator('#repressionPanel').waitFor({state:'visible'});await page.locator('#techMode').selectOption('research');
  await page.locator('#techAnalyze').click();await page.locator('#techSubmit').click();await page.waitForFunction(()=>!RepressionUI.busy);
  for(let i=0;i<5;i++){await page.locator('#techGoal').selectOption('attribution');await page.locator('#techAnalyze').click();const p=JSON.parse(await page.locator('#techEditor').inputValue());p.reason_code='WIN_WITHOUT_EVIDENCE';await page.locator('#techEditor').fill(JSON.stringify(p));await page.locator('#techSubmit').click();await page.waitForFunction(()=>!RepressionUI.busy);}
  assert.equal(await page.evaluate(()=>BattleEventAdapter.state.outcome),'lost');assert.equal(await page.evaluate(()=>BattleEventAdapter.state.bodyOwner),'intruder');await page.getByRole('button',{name:'接受本轮失守 · 被外来者占据'}).click();
  await page.evaluate(()=>{for(let i=0;i<10&&dialogActive;i++)advanceDialog();});assert.equal(await page.evaluate(()=>endingId),'bad_owned');
  await page.screenshot({path:path.join(out,'local-occupied-ending.png')});
 }finally{await app.close();}
 assert.deepEqual(errors,[]);console.log(JSON.stringify({errors,oldSave:true,profileIsolation:true,pauseAndRefresh:true,originalRefusal:true,identityBoundary:true,occupiedEnding:true}));
})().catch(e=>{console.error(e);process.exitCode=1;});
