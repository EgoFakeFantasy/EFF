"use strict";
const {app,BrowserWindow,ipcMain,protocol,session,dialog,Menu}=require('electron');
const path=require('node:path'),fs=require('node:fs/promises');
const {SaveStore,importData}=require('./storage.cjs');
const {ModelClient}=require('./model-client.cjs');
const {WorldHost}=require('./world-host.cjs');
const world=new WorldHost((...args)=>require('electron').utilityProcess.fork(...args));
protocol.registerSchemesAsPrivileged([{scheme:'eff',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
app.setName('EFF Local');
if(process.env.EFF_DATA_DIR)app.setPath('userData',path.resolve(process.env.EFF_DATA_DIR));
const root=path.resolve(__dirname,'..'),model=new ModelClient();let store,window,closing=false;
const trusted=url=>{try{const u=new URL(url);return u.protocol==='eff:'&&u.host==='game'&&/^\/(pixel-version|local-version)\//.test(u.pathname);}catch{return false;}};
function checkSender(event,allowClose=false){if(closing&&!allowClose||!window||event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame||!trusted(event.senderFrame.url))throw Error('SENDER_NOT_ALLOWED');}
const handle=(name,fn)=>ipcMain.handle(name,async(event,...args)=>{checkSender(event,name==='eff:persist');try{return await fn(...args,event);}catch(e){return {ok:false,error:String(e.message).slice(0,180)};}});
async function start(){
 store=new SaveStore(path.join(app.getPath('userData'),'saves'));await store.load();
 session.defaultSession.setPermissionRequestHandler((_w,_p,callback)=>callback(false));
 session.defaultSession.setPermissionCheckHandler(()=>false);
 session.defaultSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!trusted(details.url)}));
 protocol.handle('eff',async request=>{
  try{
   const url=new URL(request.url);if(request.method!=='GET'||!trusted(request.url))return new Response('',{status:403});
   const rel=decodeURIComponent(url.pathname).slice(1);if(!/\.(html|js|css|json|png|ico)$/.test(rel)||rel.includes('\\'))return new Response('',{status:403});
   const resolved=path.resolve(root,rel),real=await fs.realpath(resolved);
   if(!real.startsWith(root+path.sep))return new Response('',{status:403});
   const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.ico':'image/x-icon'};
   const headers=new Headers({'Content-Type':mime[path.extname(real)]});
   headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'self'");
   return new Response(await fs.readFile(real),{headers});
  }catch{return new Response('',{status:404});}
 });
 ipcMain.on('eff:bootstrap',(event)=>{try{checkSender(event);event.returnValue={...store.bootstrap(),model:{...model.config(),name:model.model}};}catch{event.returnValue={version:1,entries:{}};}});
 handle('eff:persist',(entries,event)=>{const mode=new URL(event.senderFrame.url).searchParams.get('mode')==='tech'?'tech':'story';if(entries&&Object.keys(entries).some(key=>!key.startsWith(mode+':')))throw Error('PROFILE_NOT_ALLOWED');return store.commit(entries);});
 handle('eff:world',request=>world.dispatch(request));
 handle('eff:model-status',()=>model.status());
 handle('eff:model-plan',request=>model.plan(request));
 handle('eff:model-configure',config=>model.configure(config));
 handle('eff:model-propose',request=>model.propose(request));
 handle('eff:model-cancel',()=>{model.cancel();return {ok:true};});
 handle('eff:export',async()=>{
  await store.flush();const result=await dialog.showSaveDialog(window,{title:'导出 EFF 本地存档',defaultPath:'EFF-save.json',filters:[{name:'JSON',extensions:['json']}]});
  if(result.canceled)return {ok:false,cancelled:true};await fs.writeFile(result.filePath,JSON.stringify(store.packet(),null,2),'utf8');return {ok:true};
 });
 handle('eff:import',async profile=>{
  if(!['story','tech'].includes(profile))throw Error('INVALID_PROFILE');
  const result=await dialog.showOpenDialog(window,{title:'导入到当前模式：'+profile,properties:['openFile'],filters:[{name:'JSON',extensions:['json']}]});
  if(result.canceled)return {ok:false,cancelled:true};const info=await fs.stat(result.filePaths[0]);if(info.size>6*1024*1024)throw Error('SAVE_TOO_LARGE');
  const changes=importData(await fs.readFile(result.filePaths[0],'utf8'),profile);await store.commit(changes);return {ok:true,entries:store.entries};
 });
 handle('eff:quit',()=>{setImmediate(()=>window.close());return {ok:true};});
 window=new BrowserWindow({width:1240,height:940,minWidth:760,minHeight:620,show:false,title:'EFF · 无中归来者 · 第四版',backgroundColor:'#0b101b',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true,spellcheck:false}});
 Menu.setApplicationMenu(null);
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 window.webContents.on('will-navigate',(event,url)=>{if(!trusted(url))event.preventDefault();else void world.dispatch({operation:'dispose'}).catch(()=>{});});
 window.webContents.on('render-process-gone',()=>{void world.dispatch({operation:'dispose'}).catch(()=>{});});
 window.webContents.on('will-attach-webview',event=>event.preventDefault());
 session.defaultSession.on('will-download',event=>event.preventDefault());
 window.on('close',event=>{
  if(closing)return;event.preventDefault();closing=true;model.close();
  const finish=async()=>{try{await Promise.race([window.webContents.executeJavaScript('window.EFFLocal ? window.EFFLocal.flush() : null'),new Promise(resolve=>setTimeout(resolve,2000))]);await store.flush();}catch{}finally{window.destroy();app.quit();}};
  void world.close().then(finish,finish);
 });
 window.once('ready-to-show',()=>window.show());
 await window.loadURL('eff://game/local-version/index.html');
}
if(!app.requestSingleInstanceLock())app.quit();else{
 app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.focus();}});
 app.on('window-all-closed',()=>{model.close();app.quit();});
 app.on('before-quit',()=>model.close());
 app.whenReady().then(start).catch(error=>{dialog.showErrorBox('EFF 启动失败',error.message);app.quit();});
}
