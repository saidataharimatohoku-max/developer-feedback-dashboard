# Mirrors the project folder to OneDrive so there is always an up-to-date,
# cloud-synced backup. Uses robocopy /MIR (mirror): new/changed files are copied
# and files deleted from the source are removed from the backup, so the OneDrive
# copy is always an exact reflection of the working project.
#
# node_modules is excluded (large and regenerable via the bundled Node); the
# .git history IS included so the full project is recoverable.

$ErrorActionPreference = 'Stop'

$Source = 'C:\Users\T495s\Downloads\Microsoft (Project 3)'
$Dest   = 'C:\Users\T495s\OneDrive\Project-Backups\Microsoft (Project 3)'
$LogDir = Join-Path $env:LOCALAPPDATA 'DevFeedbackDashboard'
$Log    = Join-Path $LogDir 'onedrive-backup.log'

New-Item -ItemType Directory -Force -Path $Dest   | Out-Null
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
Add-Content -Path $Log -Value "[$stamp] starting mirror -> $Dest"

# /MIR  mirror tree (copy changes + prune deletions)
# /XD   exclude directories (node_modules anywhere)
# /R:2 /W:2  retry twice, wait 2s (don't hang on a transiently locked file)
# /NFL /NDL /NP  quieter output (no per-file/dir lists, no progress %)
robocopy "$Source" "$Dest" /MIR /XD "node_modules" /R:2 /W:2 /NFL /NDL /NP /TEE /LOG+:"$Log"

# robocopy exit codes: 0-7 = success (0 = no change, 1 = files copied, etc.);
# 8+ = at least one failure. Normalize so a "files copied" result isn't an error.
$rc = $LASTEXITCODE
$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
if ($rc -ge 8) {
    Add-Content -Path $Log -Value "[$stamp] ERROR: robocopy exit code $rc"
    exit $rc
}
Add-Content -Path $Log -Value "[$stamp] done (robocopy exit code $rc)"
exit 0
