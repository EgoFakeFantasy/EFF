param([switch]$Verify,[switch]$VerifyResearch,[switch]$Preview,[switch]$Research,[string]$Jdk)
$ErrorActionPreference='Stop'
if ($Jdk) { $env:JAVA_HOME=$Jdk }
$node=Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw 'Node.js 22+ is required for the bundled EFF story host.' }
if (-not $env:GRADLE_USER_HOME) { $env:GRADLE_USER_HOME=Join-Path $PSScriptRoot '.gradle-user-home' }
$effArguments=@('-p',$PSScriptRoot,'--no-daemon','--no-watch-fs')
if ($VerifyResearch) { $effArguments+=@('build','runClient','-PeffResearchtest',("-PeffRunDir="+(Join-Path $PSScriptRoot 'run-research-qa'))) }
elseif ($Verify) { $effArguments+=@('build','runClient','-PeffSelftest',("-PeffRunDir="+(Join-Path $PSScriptRoot 'run-story-qa'))) }
elseif ($Research) { $effArguments+=@('runClient','-PeffResearchpreview',("-PeffRunDir="+(Join-Path $PSScriptRoot 'run-research'))) }
elseif ($Preview) { $effArguments+=@('runClient','-PeffPreview') }
else { $effArguments+='build' }
& (Join-Path $PSScriptRoot 'gradlew.bat') @effArguments
exit $LASTEXITCODE
