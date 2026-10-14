"use strict";
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const execFile=require('node:util').promisify(require('node:child_process').execFile);
(async()=>{
 const version=JSON.parse(await fs.readFile(path.join(__dirname,'package.json'),'utf8')).version;
 const runtime=process.argv[2],output=process.argv[3];if(!runtime||!output)throw Error('Usage: node desktop/package-local.cjs ELECTRON_DIRECTORY NEW_OUTPUT_DIRECTORY');
 const source=path.resolve(__dirname,'..'),dest=path.resolve(output),runtimeRoot=path.resolve(runtime);
 if(dest===source||source.startsWith(dest+path.sep)||dest===runtimeRoot||dest.startsWith(runtimeRoot+path.sep))throw Error('Unsafe output path');
 await fs.access(path.join(runtimeRoot,'electron.exe'));try{await fs.access(dest);throw Error('Output already exists; choose a new directory');}catch(e){if(e.code!=='ENOENT')throw e;}
 await fs.mkdir(dest,{recursive:true});await fs.cp(runtimeRoot,dest,{recursive:true});await fs.rename(path.join(dest,'electron.exe'),path.join(dest,'EFF.exe'));
 const appRoot=path.join(dest,'resources','app');await fs.mkdir(appRoot,{recursive:true});
 for(const dir of ['pixel-version','local-version'])await fs.cp(path.join(source,dir),path.join(appRoot,dir),{recursive:true});
 await fs.mkdir(path.join(appRoot,'desktop'));for(const name of ['main.cjs','preload.cjs','storage.cjs','model-client.cjs'])await fs.copyFile(path.join(__dirname,name),path.join(appRoot,'desktop',name));
 await fs.writeFile(path.join(appRoot,'package.json'),JSON.stringify({name:'eff-local',productName:'EFF Local',version,main:'desktop/main.cjs',private:true},null,2));
 let sourceRevision='unknown',sourceDirty=true;try{sourceRevision=(await execFile('git',['rev-parse','HEAD'],{cwd:source,timeout:5000})).stdout.trim();sourceDirty=Boolean((await execFile('git',['status','--porcelain'],{cwd:source,timeout:5000})).stdout.trim());}catch{}
 const files={};async function walk(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())await walk(p);else files[path.relative(appRoot,p).replaceAll('\\','/')]=crypto.createHash('sha256').update(await fs.readFile(p)).digest('hex');}}await walk(appRoot);
 await fs.writeFile(path.join(dest,'EFF-build-manifest.json'),JSON.stringify({version,electron:'44.7.2',base:'2acc2ff461dc1e07d0cda9e04e4d60cf7507f2a5',sourceRevision,sourceDirty,files},null,2));
 await fs.writeFile(path.join(dest,'开始游玩.txt'),'双击 EFF.exe。离线可玩，不需要 Node.js 或本地 HTTP 服务器。模型默认关闭。存档在应用专用目录，可在主菜单导入导出。\r\n','utf8');
 console.log('Built '+path.join(dest,'EFF.exe'));
})().catch(e=>{console.error(e);process.exitCode=1;});
