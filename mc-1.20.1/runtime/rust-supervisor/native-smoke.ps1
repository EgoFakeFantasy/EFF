param([Parameter(Mandatory=$true)][string]$Binary,[Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
$Binary=(Resolve-Path -LiteralPath $Binary).Path
if(Test-Path -LiteralPath $OutputDirectory){throw 'FRESH_TEST_DIRECTORY_REQUIRED'}
$lab=New-Item -ItemType Directory -Path $OutputDirectory
$source=@'
using System; using System.IO; using System.Diagnostics; using System.Threading;
class Fixture {
 static int Main(string[] a) {
  if(a.Length==1 && a[0]=="--descendant"){Thread.Sleep(60000);return 0;}
  string marker=Path.Combine(Environment.CurrentDirectory,"counter.txt");
  int n=File.Exists(marker)?int.Parse(File.ReadAllText(marker))+1:1;File.WriteAllText(marker,n.ToString());
  var s=new ProcessStartInfo(System.Reflection.Assembly.GetExecutingAssembly().Location,"--descendant");s.UseShellExecute=false;s.CreateNoWindow=true;
  var child=Process.Start(s);File.AppendAllText(Path.Combine(Environment.CurrentDirectory,"descendants.txt"),child.Id+"\n");
  Thread.Sleep(150);return n==1?7:0;
 }
}
'@
$src=Join-Path $lab.FullName 'fixture.cs';[IO.File]::WriteAllText($src,$source)
$exe=Join-Path $lab.FullName 'fixture.exe'
& "$env:SystemRoot\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /target:exe /platform:x64 ("/out:"+$exe) $src
if($LASTEXITCODE){throw 'FIXTURE_BUILD_FAILED'}
$manifest=Join-Path $lab.FullName 'manifest.json';[IO.File]::WriteAllText($manifest,'{}')
[IO.File]::WriteAllText(($exe+'.config'),'<configuration><startup><supportedRuntime version="v4.0" sku=".NETFramework,Version=v4.8"/></startup></configuration>')
$state=New-Item -ItemType Directory -Path (Join-Path $lab.FullName 'state')
$cfg=Join-Path $lab.FullName 'config.json'
$settings=@{schema=1;guard=$exe;guard_sha256=(Get-FileHash $exe).Hash.ToLower();guard_config_sha256=(Get-FileHash ($exe+'.config')).Hash.ToLower();manifest=$manifest;manifest_sha256=(Get-FileHash $manifest).Hash.ToLower();directory=$state.FullName;max_generations=2}
[IO.File]::WriteAllText($cfg,($settings|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false));$pin=(Get-FileHash $cfg).Hash.ToLower()
& $Binary --init $cfg $pin
if($LASTEXITCODE){throw 'ROOT_PROVISION_FAILED'}
& $Binary --run $cfg $pin *> (Join-Path $lab.FullName 'events.log')
if($LASTEXITCODE){Get-Content (Join-Path $lab.FullName 'events.log');throw 'RECOVERY_FAILED'}
$budget=Get-Content (Join-Path $state.FullName 'rust-generations.json') -Raw|ConvertFrom-Json
if($budget.entries.Count -ne 2 -or $budget.entries[1].parent -ne $budget.entries[0].id){throw 'LINEAGE_FAILED'}
foreach($effDescendant in (Get-Content (Join-Path $state.FullName 'descendants.txt'))){if(Get-Process -Id ([int]$effDescendant) -ErrorAction SilentlyContinue){throw 'DESCENDANT_SURVIVED_DRAIN'}}
& $Binary --run $cfg $pin *> (Join-Path $lab.FullName 'budget-rejection.log')
if($LASTEXITCODE -ne 2 -or -not (Select-String -Path (Join-Path $lab.FullName 'budget-rejection.log') -SimpleMatch 'GENERATION_BUDGET' -Quiet)){throw 'RESTART_RESET_DURABLE_BUDGET'}
[IO.File]::WriteAllText($manifest,'changed')
& $Binary --run $cfg $pin *> (Join-Path $lab.FullName 'tamper-rejection.log')
if($LASTEXITCODE -ne 2 -or -not (Select-String -Path (Join-Path $lab.FullName 'tamper-rejection.log') -SimpleMatch 'MANIFEST_HASH_MISMATCH' -Quiet)){throw 'TAMPER_ACCEPTED'}
@{native=$true;generations=2;descendantsDrained=$true;budgetSurvivedRestart=$true;manifestTamperRejected=$true;actualMC=$false;actualOpponent=$false}|ConvertTo-Json|Set-Content (Join-Path $lab.FullName 'result.json')
Get-Content (Join-Path $lab.FullName 'result.json')
