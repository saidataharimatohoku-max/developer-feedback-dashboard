# Real-time OneDrive backup watcher (no admin / no scheduled task required).
#
# Runs quietly in the background while you are signed in. It watches the project
# folder and, a few seconds after you stop making changes, mirrors everything to
# OneDrive with robocopy /MIR. A safety sync also runs every 10 minutes even if
# the watcher missed an event. node_modules is excluded; the .git history is
# included. Launched automatically at logon from your Startup folder.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

$Source     = 'C:\Users\T495s\Downloads\Microsoft (Project 3)'
$Dest       = 'C:\Users\T495s\OneDrive\Project-Backups\Microsoft (Project 3)'
$SnapDir    = 'C:\Users\T495s\OneDrive\Project-Backups\Snapshots'
$LogDir     = Join-Path $env:LOCALAPPDATA 'DevFeedbackDashboard'
$Log        = Join-Path $LogDir 'onedrive-backup.log'
$DebounceSec = 15      # wait this long after the last change before syncing
$SafetyEvery = 600     # force a sync at least this often (seconds)
$SnapEveryDays = 7     # keep a dated ZIP snapshot at least this often
$SnapKeep      = 8      # how many recent snapshots to retain

New-Item -ItemType Directory -Force -Path $Dest   | Out-Null
New-Item -ItemType Directory -Force -Path $SnapDir | Out-Null
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Write-Log($msg) {
    $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Add-Content -Path $Log -Value "[$stamp] $msg"
}

function Sync-Now($reason) {
    Write-Log "sync ($reason) ..."
    # /MIR mirror, exclude node_modules, retry briefly, quiet output.
    robocopy "$Source" "$Dest" /MIR /XD "node_modules" /R:2 /W:2 /NFL /NDL /NP /NJH /NJS /LOG+:"$Log" | Out-Null
    $rc = $LASTEXITCODE
    if ($rc -ge 8) { Write-Log "ERROR robocopy exit $rc" } else { Write-Log "ok (exit $rc)" }
}

# Create a dated ZIP snapshot at most once every $SnapEveryDays, zipping the
# already-clean OneDrive mirror (node_modules excluded). Old snapshots beyond
# $SnapKeep are pruned. Lets you roll back to an earlier point in time, not just
# the latest mirror.
function Maybe-Snapshot {
    $existing = @(Get-ChildItem -Path $SnapDir -Filter '*.zip' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime)
    $newest = $existing | Select-Object -Last 1
    if ($newest -and ((Get-Date) - $newest.LastWriteTime).TotalDays -lt $SnapEveryDays) { return }

    $name = 'Microsoft (Project 3) ' + (Get-Date -Format 'yyyy-MM-dd') + '.zip'
    $final = Join-Path $SnapDir $name
    if (Test-Path $final) { return }   # already snapped today
    $tmp = Join-Path $env:TEMP ('snap-' + [guid]::NewGuid().ToString('N') + '.zip')
    try {
        Write-Log "snapshot -> $name ..."
        [System.IO.Compression.ZipFile]::CreateFromDirectory($Dest, $tmp)
        Move-Item -Path $tmp -Destination $final -Force
        # Prune: keep only the $SnapKeep newest snapshots.
        $all = @(Get-ChildItem -Path $SnapDir -Filter '*.zip' | Sort-Object LastWriteTime)
        if ($all.Count -gt $SnapKeep) {
            $all | Select-Object -First ($all.Count - $SnapKeep) | ForEach-Object {
                Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
                Write-Log "pruned old snapshot $($_.Name)"
            }
        }
        Write-Log 'snapshot done'
    }
    catch {
        Write-Log "ERROR snapshot: $($_.Exception.Message)"
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    }
}

# Single-instance guard: if another watcher is already running, exit.
$mutex = New-Object System.Threading.Mutex($false, 'Global\DevFeedbackOneDriveBackupWatcher')
if (-not $mutex.WaitOne(0)) { Write-Log 'another watcher already running; exiting'; return }

Write-Log 'watcher started'
Sync-Now 'startup'
Maybe-Snapshot

$fsw = New-Object System.IO.FileSystemWatcher
$fsw.Path = $Source
$fsw.IncludeSubdirectories = $true
$fsw.NotifyFilter = [System.IO.NotifyFilters]::FileName -bor `
                    [System.IO.NotifyFilters]::DirectoryName -bor `
                    [System.IO.NotifyFilters]::LastWrite -bor `
                    [System.IO.NotifyFilters]::Size
$fsw.EnableRaisingEvents = $true

# Shared state updated by event handlers; checked by the main loop.
$state = [hashtable]::Synchronized(@{ Dirty = $false; Last = (Get-Date) })

$onChange = {
    $full = $Event.SourceEventArgs.FullPath
    if ($full -like '*\node_modules\*') { return }   # ignore dependency churn
    $s = $Event.MessageData
    $s.Dirty = $true
    $s.Last  = Get-Date
}

foreach ($evt in 'Changed','Created','Deleted','Renamed') {
    Register-ObjectEvent -InputObject $fsw -EventName $evt -Action $onChange -MessageData $state | Out-Null
}

$lastSafety = Get-Date
try {
    while ($true) {
        Start-Sleep -Seconds 3
        $now = Get-Date
        if ($state.Dirty -and ($now - $state.Last).TotalSeconds -ge $DebounceSec) {
            $state.Dirty = $false
            Sync-Now 'change'
            Maybe-Snapshot
            $lastSafety = Get-Date
        }
        elseif (($now - $lastSafety).TotalSeconds -ge $SafetyEvery) {
            Sync-Now 'safety'
            Maybe-Snapshot
            $lastSafety = Get-Date
        }
    }
}
finally {
    $fsw.EnableRaisingEvents = $false
    $fsw.Dispose()
    $mutex.ReleaseMutex()
}
