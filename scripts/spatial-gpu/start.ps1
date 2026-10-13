$ErrorActionPreference = 'Stop'
$spatialRepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$spatialWorkDir = Join-Path $spatialRepoRoot '.artifacts/spatial-worker'
New-Item -ItemType Directory -Force -Path $spatialWorkDir | Out-Null
$spatialWorkerLock = Join-Path $spatialWorkDir 'worker.lock'
if (Test-Path -LiteralPath $spatialWorkerLock) {
    $spatialExistingPid = [int](Get-Content -LiteralPath $spatialWorkerLock -Raw)
    $spatialExistingProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$spatialExistingPid" -ErrorAction SilentlyContinue
    if (([string]$spatialExistingProcess.CommandLine).Replace('/', '\') -like '*scripts\spatial-gpu\worker.mjs*') {
        Write-Output "Spatial worker already running: $spatialExistingPid"
        exit 0
    }
    Remove-Item -LiteralPath $spatialWorkerLock
}
$spatialNodeExecutable = (Get-Command node -ErrorAction Stop).Source
$spatialWorkerScript = Join-Path $PSScriptRoot 'worker.mjs'
$spatialProcess = Start-Process -FilePath $spatialNodeExecutable -ArgumentList "`"$spatialWorkerScript`"" -WorkingDirectory $spatialRepoRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $spatialWorkDir 'worker.log') -RedirectStandardError (Join-Path $spatialWorkDir 'worker-errors.log')
Write-Output "Spatial worker started: $($spatialProcess.Id). Logs: $spatialWorkDir"
