# triage-loop.ps1 — single-instance wrapper for scheduled runs (Phase 2b).
# Holds a lock so overlapping scheduler ticks don't double-run; interactive sessions
# take precedence (if the lock is held, this tick exits). Local-only (ADR-006).
# Usage (manual): pwsh -File scripts/triage-loop.ps1
# Scheduled:      registered by install-scheduler.ps1
param(
    [string]$Target = "admin"
)
Write-Error "ORPHANED: this script predates the triage.mjs orchestrator (it calls run-headless.ps1 without the now-mandatory -Ticket, and the poll model moved to triage-tick.mjs). Being rebuilt - see docs/architecture/12 Loops.md."
exit 1

$AgentRoot = Split-Path -Parent $PSScriptRoot
$LockFile  = Join-Path $env:TEMP "unplugged-agent-triage.lock"
$LogFile   = Join-Path $AgentRoot "triage.log"

function Log($m) { "$([DateTime]::UtcNow.ToString('o'))  $m" | Tee-Object -FilePath $LogFile -Append }

# single-instance lock
if (Test-Path $LockFile) {
    $age = (Get-Date) - (Get-Item $LockFile).LastWriteTime
    if ($age.TotalMinutes -lt 90) { Log "SKIP: lock held ($([int]$age.TotalMinutes)m old)"; exit 0 }
    Log "stale lock ($([int]$age.TotalMinutes)m) - reclaiming"
}
"$PID" | Out-File $LockFile

try {
    Log "triage tick start"
    & (Join-Path $PSScriptRoot "run-headless.ps1") -Target $Target 2>&1 | Tee-Object -FilePath $LogFile -Append
    Log "triage tick done"
}
catch {
    Log "ERROR: $($_.Exception.Message)"
}
finally {
    Remove-Item $LockFile -ErrorAction SilentlyContinue
}
