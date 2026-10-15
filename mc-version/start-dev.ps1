param([switch]$Verify,[switch]$Preview,[string]$Jdk)
$ErrorActionPreference='Stop'
if ($Jdk) { $env:JAVA_HOME=$Jdk }
$node=Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw 'Node.js 22+ is required for the bundled EFF story host.' }
$env:GRADLE_USER_HOME=Join-Path $PSScriptRoot '.gradle-user-home'
$effArguments=@('-p',$PSScriptRoot,'--no-daemon','--no-watch-fs')
if ($Verify) { $effArguments+=@('build','runClient','-PeffSelftest') }
elseif ($Preview) { $effArguments+=@('runClient','-PeffPreview') }
else { $effArguments+='build' }
& (Join-Path $PSScriptRoot 'gradlew.bat') @effArguments
exit $LASTEXITCODE
