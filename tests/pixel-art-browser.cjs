const {chromium}=require('playwright');
// Optional native-browser QA: needs Playwright, Edge and a running static server.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const out=process.env.EFF_ART_OUTPUT||path.join(os.tmpdir(),'eff-pixel-art-preview');
const base=process.env.EFF_BASE_URL||'http://127.0.0.1:4179/pixel-version/';
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true}),report=[],errors=[];
 try {
 for(const [size,viewport,dpr] of [['desktop',{width:1280,height:900},1],['mobile',{width:390,height:844},2]]){
  const context=await browser.newContext({viewport,deviceScaleFactor:dpr});
  await context.addInitScript(()=>localStorage.setItem('wuzhong-returner-pixel-settings-v1',JSON.stringify({speed:0,hints:true,motion:true,volume:0})));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(size+': '+e.message));await page.goto(base);await page.locator('#startButton').click();
  const setup=()=>page.evaluate(()=>{NarrativeAgency.reset();NarrativeTrials.reset();Finale.reset();closeDialog();transitionLock=false;endingId=null;ui.ending.hidden=true;ui.fade.classList.remove('on');G.area='blood';G.px=195;G.py=226;G.walk=0;F={sister:true,parents:true};G.counters={};particles=[];StoryStaging.reset();buildTileCache();updateHud();Expedition.onAreaChange();Expedition.chapterTime=0;Expedition.dom.chapterCard.classList.remove('visible');});
  await setup();await page.evaluate(()=>{playScript('refusal');typeDone=true;});
  assert.equal(await page.evaluate(()=>StoryStaging.playerOptions().pose),'bound');
  for(const [round,index] of [[0,0],[1,2],[2,6]]){
   await page.evaluate(index=>{while(dialogIndex<index)advanceDialog();typeDone=true;},index);
   await page.locator('.screen-frame').screenshot({path:path.join(out,'slice-court-before-'+round+'-'+size+'.png')});
   await page.locator('#battleTargets button').nth(round).click();
   assert.equal(await page.evaluate(()=>StoryStaging.playerOptions().pose),'refuse');
   assert.equal(await page.evaluate(()=>PhenomenonBattle.claimed.filter(Boolean).length),round+1);
   await page.locator('.screen-frame').screenshot({path:path.join(out,'slice-court-after-'+round+'-'+size+'.png')});
  }
  await setup();await page.evaluate(()=>{NarrativeTrials.rain={mode:'play',elapsed:6000,mask:5,score:2,ordinary:0,keyIndex:0,nextId:0,drops:[]};NarrativeTrials.sync();});
  await page.locator('.screen-frame').screenshot({path:path.join(out,'slice-rain-'+size+'.png')});
  await setup();await page.evaluate(()=>{G.area='rain';F={repress:true};buildTileCache();playScript('rainMemory');for(let i=0;i<80&&!currentFullText().includes('这似乎是个死局');i++)advanceDialog();typeDone=true;advanceDialog();});
  await page.locator('.screen-frame').scrollIntoViewIfNeeded();
  const first=await page.locator('#agencyCards button').first().boundingBox(),last=await page.locator('#agencyActions button').last().boundingBox();
  report.push({size,bodyPanel:await page.locator('#agencyPanel').evaluate(e=>({height:e.clientHeight,content:e.scrollHeight})),sameViewport:first.y>=0&&last.y+last.height<=viewport.height});
  assert.ok(first.y>=0&&last.y+last.height<=viewport.height,'body object and actions must fit one viewport '+JSON.stringify({first,last,viewport}));
  const target=await page.locator('#agencyCards button').nth(1).boundingBox();
  await page.mouse.click(target.x+target.width/2,target.y+target.height/2);
  assert.equal(await page.evaluate(()=>NarrativeAgency.selected),1);
  await page.locator('#agencyActions button').first().click();assert.ok(await page.evaluate(()=>NarrativeAgency.body.held[1]));
  await context.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'slice-art-browser-qa.json'),JSON.stringify({errors,report},null,2));console.log(JSON.stringify({errors,report}));
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1)});
