param([string]$Directory,[switch]$Prepare,[switch]$Verify,[string]$Jdk,[switch]$AllowRuleFallback)
$ErrorActionPreference='Stop'
if (-not $Directory) { $Directory=Join-Path $PSScriptRoot $(if($Verify){'run-protected-qa-'+(Get-Date -Format 'yyyyMMdd-HHmmss')}else{'run-protected'}) }
$Directory=[IO.Path]::GetFullPath($Directory)
if ($Prepare -or $Verify) {
 if (Test-Path -LiteralPath $Directory) { throw 'Provisioning requires a NEW directory. Existing seals and ledgers are never reset automatically.' }
 if ($Jdk) { $env:JAVA_HOME=(Resolve-Path -LiteralPath $Jdk).Path }
 if (-not $env:JAVA_HOME) { throw 'Pass -Jdk with a Java 17 JDK directory.' }
 if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js 22+ is required.' }
 if (-not $env:GRADLE_USER_HOME) { $env:GRADLE_USER_HOME=Join-Path $PSScriptRoot '.gradle-user-home' }
 $effBuildDir=$Directory+'-build'
 $effArgs=@('-p',$PSScriptRoot,'--no-daemon','--no-watch-fs','build','exportManagedLaunch',('-PeffManagedDir='+$effBuildDir))
 if ($Verify) { $effArgs+='-PeffGuardedTest'; if ($AllowRuleFallback) { $effArgs+='-PeffGuardedFallbackTest' } }
 & (Join-Path $PSScriptRoot 'gradlew.bat') @effArgs
 if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
 $effConfig=Join-Path $effBuildDir 'private-launch.json'
 $effGuard=Join-Path $PSScriptRoot 'build/guard/eff-guard.exe'
 if ($Verify) { & node (Join-Path $PSScriptRoot 'runtime/guard/native-test.cjs') $effConfig $Directory $effGuard; exit $LASTEXITCODE }
 & node (Join-Path $PSScriptRoot 'runtime/seal-runtime.cjs') $effConfig $Directory $effGuard
 exit $LASTEXITCODE
}
$effLauncher=Join-Path $Directory 'Start-Protected.cmd'
if (-not (Test-Path -LiteralPath $effLauncher)) { throw 'No prepared deployment. First use -Prepare -Jdk <Java17> -Directory <new directory>.' }
& $effLauncher
exit $LASTEXITCODE
