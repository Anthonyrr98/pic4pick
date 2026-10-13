# Current-user startup only. The helper and Node worker launch without a window.
$ErrorActionPreference = 'Stop'
$spatialRepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$spatialWorkerScript = Join-Path $PSScriptRoot 'worker.mjs'
$spatialLockPath = Join-Path $spatialRepoRoot '.artifacts/spatial-worker/worker.lock'
$spatialNodePath = (Get-Command node -ErrorAction Stop).Source
$spatialLaunchTemplate = @'
$spatialLock = '__LOCK__'
if (Test-Path -LiteralPath $spatialLock) {
    $spatialOwnerPid = [int](Get-Content -LiteralPath $spatialLock -Raw)
    $spatialOwner = Get-CimInstance Win32_Process -Filter "ProcessId=$spatialOwnerPid" -ErrorAction SilentlyContinue
    if (([string]$spatialOwner.CommandLine).Replace('/', '\') -like '*scripts\spatial-gpu\worker.mjs*') { exit }
    Remove-Item -LiteralPath $spatialLock
}
Start-Process -FilePath '__NODE__' -ArgumentList '"__SCRIPT__"' -WorkingDirectory '__ROOT__' -WindowStyle Hidden
'@
$spatialLaunchCommand = $spatialLaunchTemplate.Replace('__LOCK__', $spatialLockPath.Replace("'", "''")).Replace('__NODE__', $spatialNodePath.Replace("'", "''")).Replace('__SCRIPT__', $spatialWorkerScript.Replace("'", "''")).Replace('__ROOT__', $spatialRepoRoot.Replace("'", "''"))
$spatialEncodedCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($spatialLaunchCommand))
$spatialShortcutPath = Join-Path ([Environment]::GetFolderPath('Startup')) 'Pic4Pick Spatial GPU.lnk'
$spatialShortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($spatialShortcutPath)
$spatialShortcut.TargetPath = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
$spatialShortcut.Arguments = "-NoProfile -WindowStyle Hidden -EncodedCommand $spatialEncodedCommand"
$spatialShortcut.WorkingDirectory = $spatialRepoRoot
$spatialShortcut.Description = 'Pic4Pick SharpDepth GPU background worker'
$spatialShortcut.Save()
Write-Output "Startup installed: $spatialShortcutPath"
