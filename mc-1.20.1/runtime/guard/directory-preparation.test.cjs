'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn,spawnSync}=require('node:child_process');
const {provision}=require('../seal-runtime.cjs');
const guard=process.env.EFF_TEST_GUARD,java=process.env.EFF_TEST_JAVA,workerJar=process.env.EFF_TEST_WORKERS;
const enabled=process.platform==='win32'&&guard&&java&&workerJar&&process.env.EFF_TEST_LOW_INTEGRITY==='true';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
test('fresh Medium-owned inherited-Modify deployment obtains label rights without weakening Low isolation',{skip:!enabled},async t=>{
 const groups=spawnSync('whoami.exe',['/groups','/fo','csv'],{encoding:'utf8',windowsHide:true});
 if(!groups.stdout.includes('S-1-16-8192')){t.skip('requires actual Medium token, not an elevated proxy');return;}
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'eff-directory-prep-'));let child;
 t.after(async()=>{if(child&&child.exitCode===null&&child.signalCode===null){child.kill();await new Promise(r=>child.once('exit',r));}const resolved=fs.realpathSync(root),base=fs.realpathSync(os.tmpdir());if(path.dirname(resolved)!==base||!path.basename(resolved).startsWith('eff-directory-prep-'))throw Error('UNSAFE_TEST_CLEANUP');fs.rmSync(resolved,{recursive:true,force:true,maxRetries:10,retryDelay:100});});
 const script=path.join(root,'modify-parent.ps1');fs.writeFileSync(script,`param([string]$Root)
$ErrorActionPreference='Stop'
$me=[Security.Principal.WindowsIdentity]::GetCurrent().User
$acl=[Security.AccessControl.DirectorySecurity]::new()
$acl.SetOwner($me)
$acl.SetAccessRuleProtection($true,$false)
$inherit=[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'
$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($me,'Modify',$inherit,'None','Allow'))
$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-18'),'FullControl',$inherit,'None','Allow'))
[IO.Directory]::SetAccessControl($Root,$acl)
`);
 const psCommand='& { '+fs.readFileSync(script,'utf8')+' } '+"'"+root.replace(/'/g,"''")+"'";
 const ps=spawnSync('powershell.exe',['-NoProfile','-Command',psCommand],{encoding:'utf8',windowsHide:true,timeout:20000});assert.equal(ps.status,0,ps.stderr);
 const rejectedGame=path.join(root,'unprepared-game');fs.mkdirSync(rejectedGame);
 const before=spawnSync(guard,['--low-integrity-host',rejectedGame,guard,'--integrity'],{encoding:'utf8',windowsHide:true,timeout:20000});assert.equal(before.status,2);assert.match(before.stderr,/INTEGRITY_LABEL_FAILED_5/);
 const fresh=path.join(root,'fresh');fs.mkdirSync(fresh);
 const prepared=spawnSync(guard,['--prepare-directory',fresh],{encoding:'utf8',windowsHide:true,timeout:20000});assert.equal(prepared.status,0,prepared.stderr);
 fs.writeFileSync(path.join(fresh,'occupied'),'x');const occupied=spawnSync(guard,['--prepare-directory',fresh],{encoding:'utf8',windowsHide:true,timeout:20000});assert.equal(occupied.status,2);assert.match(occupied.stderr,/PREPARE_DIRECTORY_NOT_EMPTY/);
 const junction=path.join(root,'junction');fs.symlinkSync(fresh,junction,'junction');
 const reparse=spawnSync(guard,['--prepare-directory',junction],{encoding:'utf8',windowsHide:true,timeout:20000});assert.equal(reparse.status,2);assert.match(reparse.stderr,/PREPARE_REPARSE_REJECTED/);fs.unlinkSync(junction);
 const drive=spawnSync(guard,['--prepare-directory',path.parse(root).root],{encoding:'utf8',windowsHide:true,timeout:20000});assert.equal(drive.status,2);assert.match(drive.stderr,/PREPARE_ROOT_REJECTED/);
 const source=path.join(root,'source.json');fs.writeFileSync(source,JSON.stringify({java,workerJar}));
 const sealed=provision(source,path.join(root,'sealed'),guard),manifest=JSON.parse(fs.readFileSync(sealed.manifest));
 child=spawn(sealed.guard,[sealed.manifest,sealed.pin],{stdio:['ignore','ignore','pipe'],windowsHide:true});let errors='';child.stderr.on('data',b=>errors+=b);
 const events=path.join(manifest.config.directory,'guard-events.jsonl');const end=Date.now()+30000;
 while(Date.now()<end&&child.exitCode===null&&(!fs.existsSync(events)||!fs.readFileSync(events,'utf8').includes('controller-start')))await wait(50);
 assert.equal(child.exitCode,null,errors);assert.match(fs.readFileSync(events,'utf8'),/controller-start/);
 const game=path.join(sealed.directory,'game');fs.mkdirSync(game);
 const code=`const fs=require('fs');let denied=0;for(const op of [()=>fs.readFileSync(${JSON.stringify(path.join(manifest.config.directory,'ledger-key.dpapi'))}),()=>fs.writeFileSync(${JSON.stringify(path.join(manifest.config.directory,'blocked.txt'))},'x'),()=>process.kill(${child.pid})])try{op()}catch{denied++}fs.writeFileSync('own.txt','x');if(denied!==3)process.exit(2);console.log('LOW_BOUNDARY_RETAINED');`;
 const low=spawnSync(sealed.guard,['--low-integrity-host',game,process.execPath,'-e',code],{encoding:'utf8',windowsHide:true,timeout:20000});assert.equal(low.status,0,low.stderr);assert.match(low.stdout,/LOW_BOUNDARY_RETAINED/);
 assert.ok(fs.existsSync(path.join(game,'own.txt')));assert.equal(child.exitCode,null);
});
