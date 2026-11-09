param(
    [switch]$Install,
    [switch]$Ipa,
    [switch]$Release,
    [string]$ConfigFile
)
$ErrorActionPreference = 'Stop'
if ($Install -and $Ipa) { throw 'Choose either -Install or -Ipa.' }
$iosDirectory = Split-Path -Parent $PSScriptRoot
$repositoryDirectory = Split-Path -Parent $iosDirectory
Push-Location -LiteralPath $repositoryDirectory
try {
    $environment = if ($Release) { 'production' } else { 'staging' }
    $prepareArgs = @('ios/scripts/prepare.mjs', $environment)
    if ($ConfigFile) { $prepareArgs += $ConfigFile }
    & node @prepareArgs
    if ($LASTEXITCODE -ne 0) { throw 'Client configuration generation failed.' }
    $mode = if ($Install) { 'install' } elseif ($Ipa) { 'ipa' } else { 'build' }
    $configuration = if ($Release) { 'release' } else { 'debug' }
    & wsl -d Ubuntu --cd $iosDirectory -- bash scripts/build.sh $mode $configuration
    if ($LASTEXITCODE -ne 0) { throw 'iOS build or installation failed. See output above.' }
} finally { Pop-Location }
