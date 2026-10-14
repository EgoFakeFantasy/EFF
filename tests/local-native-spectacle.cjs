"use strict";
const {_electron}=require('playwright'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const out=path.resolve(process.env.EFF_TEST_OUTPUT||path.join(__dirname,'../../output/eff-local-spectacle'));await fs.mkdir(out,{recursive:true});
 const profile=await fs.mkdtemp(path.join(out,'profile-'));
 const app=await _electron.launch({executablePath:process.env.EFF_ELECTRON_PATH,args:process.env.EFF_TEST_PACKAGED==='1'?[]:[path.resolve(__dirname,'../desktop')],env:{...process.env,EFF_DATA_DIR:profile},recordVideo:{dir:path.join(out,'video'),size:{width:1240,height:900}},timeout:60000});
 const errors=[];let video;
 try{
  const page=await app.firstWindow();video=page.video();page.on('pageerror',e=>errors.push(e.message));
  await page.waitForURL('eff://game/local-version/index.html');await page.getByRole('link',{name:'先练习一次现象争夺 →'}).click();await page.locator('#startButton').click();await page.locator('#repressionPanel').waitFor({state:'visible'});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].focus());
  await page.evaluate(()=>{Expedition.prefs.motion=false;ScreenTheatre.focused=true;});
  for(const [index,goal] of ['body','attribution','bad_owned'].entries()){
   await page.locator('#techGoal').selectOption(goal);await page.locator('#techAnalyze').click();await page.locator('#techSubmit').click();
   await page.waitForFunction(()=>ScreenTheatre.active());assert.equal(await page.evaluate(()=>BattleEventAdapter.state.round),index+1);
   assert.equal(await page.evaluate(()=>Expedition.paused()),true);
   assert.equal(await page.evaluate(()=>document.getElementById('screenTheatre').matches(':modal')),true);
   assert.equal(await page.locator('#screenTheatre .theatre-snapshot [id]').count(),0);
   assert.equal(await page.locator('#screenTheatre .theatre-snapshot script').count(),0);
   await page.waitForFunction(()=>ScreenTheatre.session?.elapsed>1.2);
   if(index===0){
    await page.locator('.theatre-pause').click();const saved=await page.evaluate(()=>ScreenTheatre.session.elapsed);await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>ScreenTheatre.session.elapsed),saved);
    await page.locator('.theatre-pause').click();await page.evaluate(()=>Expedition.open(Expedition.dom.settingsDialog));const toolFreeze=await page.evaluate(()=>ScreenTheatre.session.elapsed);await page.waitForTimeout(180);assert.equal(await page.evaluate(()=>ScreenTheatre.session.elapsed),toolFreeze);await page.evaluate(()=>Expedition.dom.settingsDialog.close());await page.evaluate(()=>window.dispatchEvent(new Event('blur')));const freeze=await page.evaluate(()=>ScreenTheatre.session.elapsed);await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>ScreenTheatre.session.elapsed),freeze);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
   }
   if(index<2){await page.screenshot({path:path.join(out,goal+'-rift.png')});await page.locator('.theatre-skip').click();}
   else{
    await page.waitForFunction(()=>ScreenTheatre.session?.elapsed>3.7);await page.screenshot({path:path.join(out,'trace-exposed.png')});
    await page.waitForFunction(()=>document.getElementById('screenTheatre').dataset.beat==='crash');await page.screenshot({path:path.join(out,'visual-crash.png')});
    await page.waitForFunction(()=>document.getElementById('screenTheatre').dataset.rebuilt==='true');assert.equal(await page.evaluate(()=>BattleEventAdapter.engineGeneration),2);
    await page.waitForFunction(()=>ScreenTheatre.session?.elapsed>8.1);await page.screenshot({path:path.join(out,'new-runtime.png')});
   }
   await page.waitForFunction(()=>!ScreenTheatre.active()&&!RepressionUI.busy,{},{timeout:20000});assert.equal(await page.evaluate(()=>ScreenTheatre.lastError||null),null);
  }
  assert.equal(await page.evaluate(()=>BattleEventAdapter.state.outcome),'won');await page.evaluate(()=>EFFLocal.flush());await page.reload();await page.locator('#startButton').click();await page.locator('#repressionPanel').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>BattleEventAdapter.engineGeneration),2);assert.equal(await page.evaluate(()=>ScreenTheatre.active()),false);
  const beforePreview=await page.evaluate(()=>JSON.stringify({checkpoint:PhenomenonRuntime.checkpoint(BattleEventAdapter.state),generation:BattleEventAdapter.engineGeneration}));await page.locator('#techPreview').click();await page.waitForFunction(()=>ScreenTheatre.active());assert.match(await page.locator('.theatre-kicker').innerText(),/不提交剧情/);await page.locator('.theatre-skip').click();assert.equal(await page.evaluate(()=>JSON.stringify({checkpoint:PhenomenonRuntime.checkpoint(BattleEventAdapter.state),generation:BattleEventAdapter.engineGeneration})),beforePreview);
  await page.locator('#techClose').click();
  await page.evaluate(()=>{closeDialog();G.area='meta';F.finaleStarted=true;G.counters.finaleFlow=2;G.counters.finaleNode=2;G.counters.finaleFrom=0;F.finaleSummoned=false;Finale.open=true;buildTileCache();Finale.offer();});
  await page.waitForFunction(()=>ScreenTheatre.active());assert.equal(await page.evaluate(()=>F.finaleSummoned),false);
  assert.match(await page.locator('.theatre-verses del').innerText(),/侵略者被赶出/);assert.match(await page.locator('.theatre-verses ins').innerText(),/无能为力的谎言/);
  await page.waitForFunction(()=>ScreenTheatre.session?.elapsed>2.6);await page.screenshot({path:path.join(out,'finale-rewrite.png')});await page.locator('.theatre-skip').click();
  assert.equal(await page.evaluate(()=>F.finaleSummoned),false);assert.equal(await page.evaluate(()=>Finale.node()),'meta_state_2');
  // The original authorised action rebuilds the chapter surface, preserving all raw text.
  await page.evaluate(()=>{closeDialog();F.finaleSummoned=true;G.counters.finaleStep=3;G.counters.finaleNode=5;Finale.raw=Finale.compose('meta_prequel');Finale.open=true;Finale.act({action:'rewriteChapter'});});
  await page.waitForFunction(()=>ScreenTheatre.active());assert.equal(await page.evaluate(()=>F.finaleRewritten),true);
  await page.waitForFunction(()=>ScreenTheatre.session?.elapsed>7);await page.screenshot({path:path.join(out,'chapter-rebuilt.png')});await page.locator('.theatre-skip').click();
  assert.equal(await page.evaluate(()=>Finale.raw[0].text.includes('水晶花')),true);
  // Reduced motion keeps a static meaningful response; restarting cancels a live projection.
  await page.evaluate(()=>{closeDialog();Expedition.prefs.motion=true;void ScreenTheatre.preview();});await page.waitForFunction(()=>ScreenTheatre.active());assert.equal(await page.evaluate(()=>ScreenTheatre.session.reduced),true);
  await page.screenshot({path:path.join(out,'reduced-motion.png')});await page.locator('.theatre-skip').click();
  await page.evaluate(()=>{Expedition.prefs.motion=false;void ScreenTheatre.preview();});await page.waitForFunction(()=>ScreenTheatre.active());await page.evaluate(()=>resetRun());assert.equal(await page.evaluate(()=>ScreenTheatre.active()),false);assert.equal(await page.evaluate(()=>G.area),'mirror');assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({errors,wholeViewport:true,modalInputIsolation:true,realRuntimeRebuild:true,refreshReplay:true,pauseAndBlur:true,originalFinaleRewrite:true,chapterRebuild:true,reducedMotion:true,resetCleanup:true}));
 }finally{await app.close();}
 if(video)console.log('VIDEO '+await video.path());
})().catch(e=>{console.error(e);process.exitCode=1;});
