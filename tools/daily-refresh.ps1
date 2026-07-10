# Daily public-feedback refresh.
#
# Runs tools/refresh.js with Node, from the project root, and appends output to
# a log. Intended to be launched once a day by Windows Task Scheduler (see the
# "DevFeedbackDailyRefresh" task). Updating data/*.json advances the dashboard's
# "Data last updated" timestamp automatically.
#
# Note: refresh.js writes progress/warnings (e.g. GitHub rate-limit notices) to
# stderr but still exits 0 on success. We therefore judge success by Node's
# actual exit code, not by the presence of stderr output.

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$NodeExe     = Join-Path $env:ProgramFiles 'nodejs\node.exe'
$RefreshJs   = Join-Path $ProjectRoot 'tools\refresh.js'
$LogDir      = Join-Path $env:LOCALAPPDATA 'DevFeedbackDashboard'
$Log         = Join-Path $LogDir 'daily-refresh.log'

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

function Write-Log($msg) {
    $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Add-Content -Path $Log -Value "[$stamp] $msg" -Encoding utf8
}

if (-not (Test-Path $NodeExe)) {
    Write-Log "ERROR node.exe not found at $NodeExe"
    exit 1
}

Set-Location $ProjectRoot
Write-Log 'refresh start'

# Capture stdout+stderr without letting non-fatal stderr abort the script.
$ErrorActionPreference = 'Continue'
& $NodeExe $RefreshJs 2>&1 | ForEach-Object {
    Add-Content -Path $Log -Value ($_.ToString()) -Encoding utf8
}
$code = $LASTEXITCODE

Write-Log "refresh done (exit $code)"
exit $code
