'use strict';
// Native Node harness; never changes PowerShell execution policy or evaluates a
// blocked .ps1 file. Uses icacls for this fresh owned test directory only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const [binaryArg,outputArg]=process.argv.slice(2);
if(process.platform!=='win32'||!binaryArg||!outputArg)throw Error('USAGE_WINDOWS: node native-budget-smoke.cjs BINARY FRESH_OUTPUT');
const binary=path.resolve(binaryArg),lab=path.resolve(outputArg);
if(fs.existsSync(lab))throw Error('FRESH_TEST_DIRECTORY_REQUIRED');
fs.mkdirSync(lab);
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function run(exe,args,timeout=30000){
 const result=spawnSync(exe,args,{encoding:'utf8',windowsHide:true,timeout,maxBuffer:1024*1024});
 if(result.error)throw result.error;
 return result;
}
function root(mode,cfg,pin,log){
 const r=run(binary,[mode,cfg,pin]);
 if(log)fs.writeFileSync(path.join(lab,log),r.stdout+r.stderr);
 return r;
}
try{
 const groups=run('whoami.exe',['/groups','/fo','csv']);assert.equal(groups.status,0,groups.stderr);
 assert.match(groups.stdout,/S-1-16-8192/,'ACTUAL_MEDIUM_TOKEN_REQUIRED');
 const user=run('whoami.exe',['/user','/fo','csv']);assert.equal(user.status,0,user.stderr);
 const sid=user.stdout.match(/S-1-5-21-(?:\d+-){2}\d+-\d+/)?.[0];if(!sid)throw Error('CURRENT_USER_SID_REQUIRED');
 const original=path.join(process.env.SystemRoot,'System32','where.exe');
 // Independent read-only signature query, not a script-file execution fallback.
 const signature=run(path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),[
  '-NoProfile','-NonInteractive','-Command',
  "if ((Get-AuthenticodeSignature -LiteralPath (Join-Path $env:SystemRoot 'System32\\where.exe')).Status -ne 'Valid') { exit 2 }; Write-Output 'SIGNED_WINDOWS_UTILITY_VERIFIED'"
 ]);
 assert.equal(signature.status,0,signature.stderr);assert.match(signature.stdout,/SIGNED_WINDOWS_UTILITY_VERIFIED/);
 fs.writeFileSync(path.join(lab,'signature.log'),signature.stdout);
 const exe=path.join(lab,'where.exe');fs.copyFileSync(original,exe);fs.writeFileSync(exe+'.config','<configuration/>');
 const manifest=path.join(lab,'manifest.json');fs.writeFileSync(manifest,'{}');
 const parent=path.join(lab,'state-parent');fs.mkdirSync(parent);
 const acl=run('icacls.exe',[parent,'/inheritance:r','/grant:r',`*${sid}:(OI)(CI)M`,'*S-1-5-18:(OI)(CI)F']);
 fs.writeFileSync(path.join(lab,'acl.log'),acl.stdout+acl.stderr);assert.equal(acl.status,0,acl.stderr);
 const state=path.join(parent,'state');fs.mkdirSync(state);
 const cfg=path.join(lab,'config.json');fs.writeFileSync(cfg,JSON.stringify({schema:1,guard:exe,guard_sha256:hash(exe),guard_config_sha256:hash(exe+'.config'),manifest,manifest_sha256:hash(manifest),directory:state,max_generations:2}));
 const pin=hash(cfg),alias=path.join(lab,'junction-probe');fs.symlinkSync(lab,alias,'junction');
 try{const r=root('--init',path.join(alias,'config.json'),pin,'junction.log');assert.equal(r.status,2,r.stderr);assert.match(r.stderr,/REPARSE_PATH_REJECTED/);}finally{fs.unlinkSync(alias);}
 const init=root('--init',cfg,pin,'init.log');assert.equal(init.status,0,init.stderr);
 const events=root('--run',cfg,pin,'events.log');assert.equal(events.status,2,events.stderr);assert.match(events.stderr,/GENERATION_BUDGET/);
 const parsed=events.stdout.trim().split(/\r?\n/).filter(s=>s.startsWith('{')).map(s=>JSON.parse(s));
 const starts=parsed.filter(e=>e.event==='generation-start'),drains=parsed.filter(e=>e.event==='generation-drained');
 assert.equal(starts.length,2);assert.equal(drains.length,2);assert.notEqual(starts[0].pid,starts[1].pid);
 const budget=path.join(state,'rust-generations.json'),before=fs.readFileSync(budget);
 const restart=root('--run',cfg,pin,'restart.log');assert.equal(restart.status,2);assert.match(restart.stderr,/GENERATION_BUDGET/);assert.deepEqual(fs.readFileSync(budget),before);
 fs.writeFileSync(exe+'.config','<changed/>');const tamper=root('--run',cfg,pin,'tamper.log');assert.equal(tamper.status,2);assert.match(tamper.stderr,/GUARD_CONFIG_HASH_MISMATCH/);
 const result={native:true,actualMedium:true,mediumInheritedModifyPrepared:true,reparseAncestorRejected:true,generations:2,distinctRustPids:true,jobDrainReturnedEmpty:true,budgetSurvivedRestart:true,preCLRConfigTamperRejected:true,descendantFixtureVerified:false,actualMC:false,actualOpponent:false};
 fs.writeFileSync(path.join(lab,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(e){
 fs.writeFileSync(path.join(lab,'failure.json'),JSON.stringify({accepted:false,error:e.message,actualMC:false,actualOpponent:false},null,2));
 console.error(e);process.exitCode=1;
}
