# Current-user startup only. The helper and Node worker launch without a window.
$ErrorActionPreference = 'Stop'
$spatialRepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$spatialLauncherScript = Join-Path $PSScriptRoot 'start.ps1'
$spatialShortcutPath = Join-Path ([Environment]::GetFolderPath('Startup')) 'Pic4Pick Spatial GPU.lnk'
$spatialShortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($spatialShortcutPath)
$spatialShortcut.TargetPath = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
# Keep the command short: WScript.Shell truncates long shortcut arguments,
# which previously cut the encoded inline script in the middle of a string.
$spatialShortcut.Arguments = "-NoProfile -WindowStyle Hidden -File `"$spatialLauncherScript`""
$spatialShortcut.WorkingDirectory = $spatialRepoRoot
$spatialShortcut.Description = 'Pic4Pick SharpDepth GPU background worker'
$spatialShortcut.Save()
Write-Output "Startup installed: $spatialShortcutPath"
