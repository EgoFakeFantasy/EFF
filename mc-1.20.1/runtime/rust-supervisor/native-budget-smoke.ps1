# A bounded lifecycle check with Windows' existing signed file lookup utility.
# This deliberately does not substitute for the descendant fixture or MC acceptance.
param([Parameter(Mandatory=$true)][string]$Binary,[Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
$Binary=(Resolve-Path -LiteralPath $Binary).Path
if(Test-Path -LiteralPath $OutputDirectory){throw 'FRESH_TEST_DIRECTORY_REQUIRED'}
$lab=New-Item -ItemType Directory -Path $OutputDirectory
$original=Join-Path $env:SystemRoot 'System32\where.exe'
if((Get-AuthenticodeSignature -LiteralPath $original).Status -ne 'Valid'){throw 'SIGNED_WINDOWS_UTILITY_REQUIRED'}
$exe=Join-Path $lab.FullName 'where.exe';Copy-Item -LiteralPath $original -Destination $exe
[IO.File]::WriteAllText(($exe+'.config'),'<configuration/>')
$manifest=Join-Path $lab.FullName 'manifest.json';[IO.File]::WriteAllText($manifest,'{}')
$stateParent=New-Item -ItemType Directory -Path (Join-Path $lab.FullName 'state-parent')
$acl=[Security.AccessControl.DirectorySecurity]::new();$me=[Security.Principal.WindowsIdentity]::GetCurrent().User
$acl.SetOwner($me);$acl.SetAccessRuleProtection($true,$false)
$inherit=[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'
$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($me,'Modify',$inherit,'None','Allow'))
$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-18'),'FullControl',$inherit,'None','Allow'))
Set-Acl -LiteralPath $stateParent.FullName -AclObject $acl
$state=New-Item -ItemType Directory -Path (Join-Path $stateParent.FullName 'state')
$cfg=Join-Path $lab.FullName 'config.json'
$settings=@{schema=1;guard=$exe;guard_sha256=(Get-FileHash $exe).Hash.ToLower();guard_config_sha256=(Get-FileHash ($exe+'.config')).Hash.ToLower();manifest=$manifest;manifest_sha256=(Get-FileHash $manifest).Hash.ToLower();directory=$state.FullName;max_generations=2}
[IO.File]::WriteAllText($cfg,($settings|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false));$pin=(Get-FileHash $cfg).Hash.ToLower()
$alias=Join-Path $lab.FullName 'junction-probe'
New-Item -ItemType Junction -Path $alias -Target $lab.FullName | Out-Null
try {
 & $Binary --init (Join-Path $alias 'config.json') $pin *> (Join-Path $lab.FullName 'junction.log')
 if($LASTEXITCODE -ne 2 -or -not (Select-String -LiteralPath (Join-Path $lab.FullName 'junction.log') -SimpleMatch 'REPARSE_PATH_REJECTED' -Quiet)){throw 'JUNCTION_ACCEPTED'}
} finally { [IO.Directory]::Delete($alias) }
& $Binary --init $cfg $pin
if($LASTEXITCODE){throw 'ROOT_PROVISION_FAILED'}
& $Binary --run $cfg $pin *> (Join-Path $lab.FullName 'events.log')
if($LASTEXITCODE -ne 2){throw 'EXPECTED_FINITE_FAILURE'}
$events=Get-Content (Join-Path $lab.FullName 'events.log')|Where-Object {$_ -like '{*'}|ForEach-Object {$_|ConvertFrom-Json}
$starts=@($events|Where-Object event -eq 'generation-start');$drains=@($events|Where-Object event -eq 'generation-drained')
if($starts.Count -ne 2 -or $drains.Count -ne 2 -or $starts[0].pid -eq $starts[1].pid){throw 'GENERATION_REPLACEMENT_FAILED'}
$before=[IO.File]::ReadAllText((Join-Path $state.FullName 'rust-generations.json'))
& $Binary --run $cfg $pin *> (Join-Path $lab.FullName 'restart.log')
if($LASTEXITCODE -ne 2 -or -not (Select-String -Path (Join-Path $lab.FullName 'restart.log') -SimpleMatch 'GENERATION_BUDGET' -Quiet)){throw 'DURABLE_BUDGET_RESET'}
if([IO.File]::ReadAllText((Join-Path $state.FullName 'rust-generations.json')) -ne $before){throw 'BUDGET_CHANGED_AFTER_EXHAUSTION'}
[IO.File]::WriteAllText(($exe+'.config'),'<changed/>')
& $Binary --run $cfg $pin *> (Join-Path $lab.FullName 'tamper.log')
if($LASTEXITCODE -ne 2 -or -not (Select-String -Path (Join-Path $lab.FullName 'tamper.log') -SimpleMatch 'GUARD_CONFIG_HASH_MISMATCH' -Quiet)){throw 'CONFIG_TAMPER_ACCEPTED'}
@{native=$true;mediumInheritedModifyPrepared=$true;reparseAncestorRejected=$true;generations=2;distinctRustPids=$true;jobDrainReturnedEmpty=$true;budgetSurvivedRestart=$true;preCLRConfigTamperRejected=$true;descendantFixtureVerified=$false;actualMC=$false;actualOpponent=$false}|ConvertTo-Json|Set-Content (Join-Path $lab.FullName 'result.json')
Get-Content (Join-Path $lab.FullName 'result.json')
