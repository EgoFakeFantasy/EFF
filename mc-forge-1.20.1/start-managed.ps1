param([string]$Jdk,[string]$Directory,[switch]$Verify,[string]$PolicyJdk)
$ErrorActionPreference='Stop'
$effRuntime=Join-Path $PSScriptRoot '../mc-1.20.1/runtime'
if ($Jdk) { $env:JAVA_HOME=(Resolve-Path -LiteralPath $Jdk).Path }
if (-not $env:JAVA_HOME) { throw 'Pass -Jdk with a Java 17 JDK directory.' }
if (-not (Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin/java.exe'))) { throw 'The JDK has no bin/java.exe.' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js 22+ is required.' }
if (-not $env:GRADLE_USER_HOME) { $env:GRADLE_USER_HOME=Join-Path $PSScriptRoot '.gradle-user-home' }
if (-not $Directory) { $Directory=Join-Path $PSScriptRoot $(if ($Verify) {'run-managed-qa-'+(Get-Date -Format 'yyyyMMdd-HHmmss')} else {'run-managed'}) }
$Directory=[IO.Path]::GetFullPath($Directory)
$effArgs=@('-p',$PSScriptRoot,'--no-daemon','--no-watch-fs','exportManagedLaunch',('-PeffManagedDir='+$Directory))
if ($Verify) { $effArgs+=@('build','-PeffManagedTest') }
& (Join-Path $PSScriptRoot 'gradlew.bat') @effArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$effManifest=Join-Path $Directory 'private-launch.json'
if ($PolicyJdk) {
 $effConfig=Get-Content -LiteralPath $effManifest -Raw -Encoding utf8 | ConvertFrom-Json
 $effConfig | Add-Member -MemberType NoteProperty -Name javaByRole -Value @{policy=(Join-Path (Resolve-Path -LiteralPath $PolicyJdk).Path 'bin/java.exe')} -Force
 [IO.File]::WriteAllText($effManifest,($effConfig | ConvertTo-Json -Depth 30),[Text.UTF8Encoding]::new($false))
}
if ($Verify) { & node (Join-Path $effRuntime 'native-test.cjs') $effManifest }
else { & node (Join-Path $effRuntime 'controller.cjs') $effManifest }
exit $LASTEXITCODE
