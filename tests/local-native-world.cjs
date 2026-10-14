"use strict";
const {_electron}=require('playwright'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const out=path.resolve(process.env.EFF_TEST_OUTPUT||path.join(__dirname,'../../output/eff-live-world'));await fs.mkdir(out,{recursive:true});
 const profile=await fs.mkdtemp(path.join(out,'profile-')),errors=[];let metrics=[],video;
 const app=await _electron.launch({executablePath:process.env.EFF_ELECTRON_PATH,args:process.env.EFF_TEST_PACKAGED==='1'?[]:[path.resolve(__dirname,'../desktop')],env:{...process.env,EFF_DATA_DIR:profile},recordVideo:{dir:path.join(out,'video'),size:{width:1240,height:900}},timeout:60000});
 try{
  const page=await app.firstWindow();video=page.video();page.on('pageerror',e=>errors.push(e.message));
  await page.waitForURL('eff://game/local-version/index.html');await page.getByRole('link',{name:'先练习一次现象争夺 →'}).click();await page.locator('#startButton').click();await page.locator('#repressionPanel').waitFor({state:'visible'});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].focus());
  await page.waitForFunction(()=>WorldStage.context?.backend==='utility-process');assert.equal(await page.evaluate(()=>WorldStage.compositor.backend),'webgl2');
  const pid=await page.evaluate(()=>WorldStage.context.pid);assert.ok(await app.evaluate(({app},pid)=>app.getAppMetrics().some(m=>m.pid===pid),pid));
  const beforeMain=await page.evaluate(()=>JSON.stringify({area:G.area,px:G.px,py:G.py,flags:F}));
  await page.locator('#techCanvas').click();await page.keyboard.down('d');await page.waitForTimeout(250);await page.keyboard.up('d');
  assert.equal(await page.evaluate(()=>WorldStage.context.frame.input.x),0);assert.equal(await page.evaluate(()=>WorldStage.context.frame.bodyOwner),'contested');
  await page.screenshot({path:path.join(out,'world-contested.png')});
  const bad=await page.evaluate(()=>window.effDesktop.worldCommand({operation:'EVAL',session:WorldStage.context.config.session}));assert.equal(bad.ok,false);
  assert.equal(await page.evaluate(()=>WorldStage.context.pid),pid);
  for(const [index,goal] of ['body','attribution','bad_owned'].entries()){
   await page.locator('#techGoal').selectOption(goal);await page.locator('#techAnalyze').click();await page.locator('#techSubmit').click();await page.waitForFunction(()=>ScreenTheatre.active());
   assert.equal(await page.evaluate(()=>WorldStage.context.frame.revision),index+1);
   if(index===0){
    assert.equal(await page.evaluate(()=>WorldStage.context.frame.bodyOwner),'player');const x=await page.evaluate(()=>WorldStage.context.frame.avatar.x);
    await page.keyboard.down('d');await page.waitForTimeout(300);await page.keyboard.up('d');await page.waitForFunction(x=>WorldStage.context.frame.avatar.x>x,x);
    await page.locator('.theatre-pause').click();await page.waitForFunction(()=>!WorldStage.inflight);const tick=await page.evaluate(()=>WorldStage.context.frame.tick);await page.waitForTimeout(220);assert.equal(await page.evaluate(()=>WorldStage.context.frame.tick),tick);await page.locator('.theatre-pause').click();
    await page.waitForFunction(()=>ScreenTheatre.session.elapsed>2);await page.screenshot({path:path.join(out,'world-body-control.png')});
   }
   if(index===1){assert.equal(await page.evaluate(()=>WorldStage.context.frame.attribution),'rejected');assert.equal(await page.evaluate(()=>WorldStage.context.frame.endingLock),'pending');await page.screenshot({path:path.join(out,'world-attribution.png')});}
   if(index<2)await page.locator('.theatre-skip').click();
   else{
    await page.waitForFunction(()=>document.getElementById('screenTheatre').dataset.beat==='crash');const oldPid=await page.evaluate(()=>WorldStage.context.pid),pose=await page.evaluate(()=>WorldStage.context.frame.avatar);
    await page.screenshot({path:path.join(out,'world-engine-stopped.png')});await page.waitForFunction(()=>document.getElementById('screenTheatre').dataset.rebuilt==='true');
    assert.equal(await page.evaluate(()=>WorldStage.context.frame.generation),2);const newPid=await page.evaluate(()=>WorldStage.context.pid);assert.notEqual(newPid,oldPid);
    assert.equal(await app.evaluate((_,pid)=>{try{process.kill(pid,0);return true;}catch{return false;}},oldPid),false);
    assert.deepEqual(await page.evaluate(()=>WorldStage.context.frame.avatar),pose);assert.equal(await page.evaluate(()=>WorldStage.context.frame.bodyOwner),'player');
    await page.waitForFunction(()=>ScreenTheatre.session.elapsed>8);await page.screenshot({path:path.join(out,'world-new-engine.png')});
   }
   await page.waitForFunction(()=>!ScreenTheatre.active()&&!RepressionUI.busy,null,{timeout:20000});assert.equal(await page.evaluate(()=>WorldStage.lastError),null);
  }
  assert.equal(await page.evaluate(()=>JSON.stringify({area:G.area,px:G.px,py:G.py,flags:F})),beforeMain);
  assert.equal(await page.evaluate(()=>BattleEventAdapter.engineGeneration),2);
  await page.evaluate(()=>{WorldStage.input.clear();});await page.waitForFunction(()=>!WorldStage.inflight);await page.evaluate(()=>BattleEventAdapter.save());await page.evaluate(()=>EFFLocal.flush());
  const savedPose=await page.evaluate(()=>BattleEventAdapter.worldPose);await page.reload();await page.locator('#startButton').click();await page.locator('#repressionPanel').waitFor({state:'visible'});await page.waitForFunction(()=>WorldStage.context?.backend==='utility-process');
  assert.equal(await page.evaluate(()=>WorldStage.context.frame.generation),2);assert.equal(await page.evaluate(()=>WorldStage.context.frame.avatar.x),savedPose.x);
  const beforePreview=await page.evaluate(()=>JSON.stringify({checkpoint:PhenomenonRuntime.checkpoint(BattleEventAdapter.state),generation:BattleEventAdapter.engineGeneration}));await page.locator('#techPreview').click();await page.waitForFunction(()=>ScreenTheatre.active());await page.locator('.theatre-skip').click();await page.waitForFunction(()=>!WorldStage.context?.preview&&WorldStage.context?.backend==='utility-process');
  assert.equal(await page.evaluate(()=>JSON.stringify({checkpoint:PhenomenonRuntime.checkpoint(BattleEventAdapter.state),generation:BattleEventAdapter.engineGeneration})),beforePreview);
  // Terminate only the recorded utility child of this test app; restore the committed state.
  const crashPid=await page.evaluate(()=>WorldStage.context.pid);assert.ok(await app.evaluate(({app},pid)=>app.getAppMetrics().some(m=>m.pid===pid),crashPid));
  await app.evaluate((_,pid)=>process.kill(pid),crashPid);await page.waitForFunction(()=>WorldStage.context.backend==='stopped');await page.locator('#techWorldRecover').click();await page.waitForFunction(()=>WorldStage.context.backend==='utility-process'&&!RepressionUI.busy);
  assert.equal(await page.evaluate(()=>BattleEventAdapter.engineGeneration),3);assert.equal(await page.evaluate(()=>BattleEventAdapter.state.outcome),'won');assert.equal(await page.evaluate(()=>WorldStage.lastError),null);
  // Lose only this test WebGL context: the same authoritative frame remains usable.
  await page.evaluate(()=>WorldStage.compositor.gl.getExtension('WEBGL_lose_context').loseContext());await page.waitForFunction(()=>WorldStage.compositor.backend==='canvas');assert.equal(await page.evaluate(()=>WorldStage.context.frame.bodyOwner),'player');await page.screenshot({path:path.join(out,'world-canvas-fallback.png')});
  await page.locator('#techClose').click();
  // The original body response also controls the real blood-courtyard actor.
  await page.evaluate(()=>{closeDialog();G.area='blood';F.sister=true;F.parents=true;buildTileCache();playScript('refusal');for(let i=0;i<12&&!PhenomenonBattle.pending;i++)advanceDialog();if(!typeDone)advanceDialog();PhenomenonBattle.commit(0);});
  await page.waitForFunction(()=>ScreenTheatre.active()&&WorldStage.context?.frame.mode==='court'&&WorldStage.context.frame.bodyOwner==='player');await page.locator('.theatre-skip').click();
  await page.locator('#screen').focus();
  const canonX=await page.evaluate(()=>G.px);await page.keyboard.down('d');await page.waitForTimeout(280);await page.keyboard.up('d');await page.waitForFunction(x=>G.px>x,canonX);assert.equal(await page.evaluate(()=>G.px),await page.evaluate(()=>WorldStage.context.frame.avatar.x));
  await page.screenshot({path:path.join(out,'world-original-response.png')});
  await page.evaluate(()=>{closeDialog();G.area='meta';F.finaleStarted=true;G.counters.finaleFlow=2;G.counters.finaleNode=2;G.counters.finaleFrom=0;F.finaleSummoned=false;F.finaleRewritten=false;G.counters.finaleStep=0;Finale.open=true;buildTileCache();Finale.offer();});
  await page.waitForFunction(()=>ScreenTheatre.active()&&WorldStage.context?.frame.mode==='finale'&&WorldStage.context?.backend==='utility-process');assert.equal(await page.evaluate(()=>WorldStage.context.frame.narrative.authorizedPast),false);assert.equal(await page.evaluate(()=>WorldStage.context.frame.events.some(e=>e.id==='past')),false);await page.screenshot({path:path.join(out,'world-present-only.png')});await page.locator('.theatre-skip').click();
  await page.evaluate(()=>{closeDialog();F.finaleSummoned=true;G.counters.finaleStep=3;G.counters.finaleNode=5;Finale.raw=Finale.compose('meta_prequel');Finale.open=true;Finale.act({action:'rewriteChapter'});});await page.waitForFunction(()=>ScreenTheatre.active());await page.waitForFunction(()=>document.getElementById('screenTheatre').dataset.rebuilt==='true');
  assert.equal(await page.evaluate(()=>WorldStage.context.frame.narrative.authorizedPast),true);assert.equal(await page.evaluate(()=>WorldStage.context.frame.narrative.rewritten),true);assert.ok(await page.evaluate(()=>Finale.raw[0].text.includes('水晶花')));await page.screenshot({path:path.join(out,'world-authorized-past.png')});await page.locator('.theatre-skip').click();
  assert.deepEqual(errors,[]);metrics=await app.evaluate(({app})=>app.getAppMetrics().map(m=>m.pid));console.log(JSON.stringify({errors,nativeWorld:true,webgl:true,bodyInput:true,worldPause:true,independentObjects:true,oldProcessStopped:true,exactPoseReplay:true,refresh:true,previewIsolation:true,crashRecovery:true,gpuFallback:true,pastPermission:true,originalBodyControl:true}));
 }finally{await app.close();}
 for(let i=0;i<20;i++){const alive=metrics.filter(pid=>{try{process.kill(pid,0);return true;}catch{return false;}});if(!alive.length)break;if(i===19)assert.deepEqual(alive,[]);await new Promise(r=>setTimeout(r,100));}
 if(video)console.log('VIDEO '+await video.path());
})().catch(e=>{console.error(e);process.exitCode=1;});
