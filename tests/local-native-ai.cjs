"use strict";
const {_electron}=require('playwright'),path=require('node:path'),fs=require('node:fs/promises'),assert=require('node:assert/strict');
(async()=>{
 if(!process.env.EFF_LIVE_MODEL)throw Error('Set EFF_LIVE_MODEL to an installed local model; no service will be started or downloaded');
 const out=path.resolve(process.env.EFF_TEST_OUTPUT||path.join(__dirname,'../../output/eff-local-ai-test'));await fs.mkdir(out,{recursive:true});
 const profile=await fs.mkdtemp(path.join(out,'native-ai-'));
 const app=await _electron.launch({executablePath:process.env.EFF_ELECTRON_PATH,args:process.env.EFF_TEST_PACKAGED==='1'?[]:[path.resolve(__dirname,'../desktop')],env:{...process.env,EFF_DATA_DIR:profile},timeout:60000});
 const errors=[];let managed=[],closed=false;
 try{
  const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForURL('eff://game/local-version/index.html');
  await page.locator('#checkModel').click();await page.waitForFunction(()=>document.getElementById('localModels').children.length>0);
  assert.ok(await page.locator('#modelDiagnostics').innerText());
  await page.locator('#modelName').fill(process.env.EFF_LIVE_MODEL);await page.locator('#modelBudget').selectOption('balanced');
  await page.locator('#enableModel').click();await page.waitForFunction(()=>document.getElementById('homeFeedback').textContent.includes('双代理已开启'));
  await page.screenshot({path:path.join(out,'ai-home.png')});
  await page.getByRole('link',{name:'先练习一次现象争夺 →'}).click();await page.locator('#startButton').click();await page.locator('#repressionPanel').waitFor({state:'visible'});
  assert.match(await page.locator('#techIdentity').innerText(),/身份未揭示/);
  const generated=[];
  for(const [index,goal] of ['body','attribution','bad_owned'].entries()){
   await page.locator('#techGoal').selectOption(goal);await page.locator('#techAnalyze').click();
   await page.waitForFunction(()=>!RepressionUI.busy&&!!RepressionUI.pair,{},{timeout:60000});
   const pair=await page.evaluate(()=>RepressionUI.pair);assert.equal(pair.player.source,'local-model',pair.player.reason);assert.equal(pair.intruder.source,'local-model',pair.intruder.reason);generated.push(pair);
   assert.equal(await page.evaluate(()=>BattleEventAdapter.state.round),index); // Generation never commits on its own.
   if(index===0)await page.screenshot({path:path.join(out,'ai-dual-proposals.png')});
   await page.locator('#techSubmit').click();await page.waitForFunction(round=>BattleEventAdapter.state.round===round,index+1);
  }
  assert.equal(await page.evaluate(()=>BattleEventAdapter.state.outcome),'won');assert.equal(await page.evaluate(()=>!!F.finaleSummoned),false);
  await page.evaluate(()=>EFFLocal.flush());await page.reload();await page.locator('#startButton').click();await page.locator('#repressionPanel').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>BattleEventAdapter.state.round),3);assert.equal(await page.evaluate(()=>BattleEventAdapter.receipts.length),3);await page.locator('details.tech-trace summary').click();assert.match(await page.locator('#techTrace').innerText(),/本地模型/);
  await page.screenshot({path:path.join(out,'ai-replayed.png')});
  await page.getByRole('button',{name:'开始新的练习'}).click();await page.locator('#techAnalyze').click();await page.waitForFunction(()=>RepressionUI.busy);await page.locator('#techClose').click();
  await page.locator('#techButton').click();await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>BattleEventAdapter.state.round),0);assert.equal(await page.evaluate(()=>RepressionUI.draft),null);
  await page.locator('#techAnalyze').click();await page.waitForFunction(()=>RepressionUI.busy);await page.locator('#techStop').click();await page.waitForTimeout(250);
  assert.equal(await page.evaluate(()=>RepressionUI.busy),false);assert.equal(await page.evaluate(()=>BattleEventAdapter.state.round),0);
  await page.locator('#techAnalyze').click();await page.waitForFunction(()=>!RepressionUI.busy&&!!RepressionUI.pair);assert.equal(await page.evaluate(()=>RepressionUI.pair.intruder.source),'rule-template');
  await page.locator('#techClose').click();await page.locator('#localMenuButton').click();await page.waitForURL('eff://game/local-version/index.html');
  assert.equal(await page.evaluate(()=>window.effDesktop.bootstrap.model.enabled),false);
  await page.locator('#modelName').fill(process.env.EFF_LIVE_MODEL);await page.locator('#enableModel').click();await page.waitForFunction(()=>document.getElementById('homeFeedback').textContent.includes('双代理已开启'));
  await page.getByRole('link',{name:'先练习一次现象争夺 →'}).click();await page.locator('#startButton').click();await page.locator('#repressionPanel').waitFor({state:'visible'});
  managed=await app.evaluate(({app})=>app.getAppMetrics().map(p=>p.pid));await page.locator('#techAnalyze').click();await page.waitForFunction(()=>RepressionUI.busy);await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>RepressionUI.busy),true);
  assert.deepEqual(errors,[]);await app.close();closed=true;
  await fs.writeFile(path.join(out,'native-ai-result.json'),JSON.stringify({errors,model:process.env.EFF_LIVE_MODEL,generated,sourceTracking:true,refreshReplay:true,cancelAndStop:true,exitDuringInference:true},null,2));
 }finally{if(!closed)await app.close();}
 const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
 for(let i=0;i<20&&managed.some(alive);i++)await new Promise(r=>setTimeout(r,100));assert.deepEqual(managed.filter(alive),[]);
 console.log(JSON.stringify({errors,realDualAgents:true,sourceTracking:true,refreshReplay:true,cancelAndStop:true,exitDuringInference:true,allGameProcessesStopped:true}));
})().catch(e=>{console.error(e);process.exitCode=1;});
