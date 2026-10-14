"use strict";
const {_electron}=require('playwright'),path=require('node:path'),fs=require('node:fs/promises'),assert=require('node:assert/strict');
(async()=>{
 const out=path.resolve(process.env.EFF_TEST_OUTPUT||path.join(__dirname,'../../output/eff-local-preview'));await fs.mkdir(out,{recursive:true});
 const profile=await fs.mkdtemp(path.join(out,'profile-smoke-'));
 const app=await _electron.launch({executablePath:process.env.EFF_ELECTRON_PATH,args:process.env.EFF_TEST_PACKAGED==='1'?[]:[path.resolve(__dirname,'../desktop')],env:{...process.env,EFF_DATA_DIR:profile},timeout:60000});
 const errors=[];let managed=[];
 try{
  const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')console.log('BROWSER',m.text());});
  await page.waitForURL('eff://game/local-version/index.html');await page.screenshot({path:path.join(out,'local-home.png')});
  assert.equal(await page.evaluate(()=>typeof require),'undefined');assert.equal(await page.evaluate(()=>typeof process),'undefined');assert.equal(await page.evaluate(()=>!!window.effDesktop),true);
  await page.getByRole('link',{name:'先练习一次现象争夺 →'}).click();await page.locator('#startButton').click();
  await page.locator('#repressionPanel').waitFor({state:'visible'});await page.screenshot({path:path.join(out,'local-lab.png')});
  for(const goal of ['body','attribution','bad_owned']){await page.locator('#techGoal').selectOption(goal);await page.locator('#techAnalyze').click();await page.locator('#techSubmit').click();await page.waitForFunction(()=>!RepressionUI.busy);}
  assert.equal(await page.evaluate(()=>BattleEventAdapter.state.outcome),'won');assert.equal(await page.evaluate(()=>F.finaleSummoned===true),false);assert.equal(await page.evaluate(()=>G.area),'mirror');
  await page.screenshot({path:path.join(out,'local-lab-won.png')});await page.locator('#techClose').click();
  await page.evaluate(()=>{closeDialog();F.m1=true;saveRun();});await page.evaluate(()=>EFFLocal.flush());
  const data=JSON.parse(await fs.readFile(path.join(profile,'saves/save-state.json'),'utf8'));assert.ok(data.entries['tech:wuzhong-returner-pixel-v1']);assert.ok(data.entries['tech:wuzhong-returner-phenomenon-lab-v1']);
  const evil=await page.evaluate(async()=>{try{return await fetch('eff://game/desktop/main.cjs').then(r=>r.status);}catch{return 'blocked';}});assert.ok(evil==='blocked'||evil===403);
  managed=await app.evaluate(({app})=>app.getAppMetrics().map(p=>p.pid));
  assert.deepEqual(errors,[]);console.log(JSON.stringify({errors,offline:true,sandbox:true,outcome:'won',diskSave:true}));
 }finally{await app.close();}
 const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
 for(let i=0;i<20&&managed.some(alive);i++)await new Promise(r=>setTimeout(r,100));
 assert.deepEqual(managed.filter(alive),[]);console.log('Managed Electron processes stopped.');
})().catch(e=>{console.error(e);process.exitCode=1;});
