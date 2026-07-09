# triage-loop.ps1 — thin single-instance shell for scheduled ticks (Task Scheduler entry point).
# All tick logic (pause / quiet-hours / auth gate / caps / poll / dispatch) lives in
# scripts/triage-tick.mjs (ADR-007: deterministic loop shell; the model runs only inside triage.mjs).
#
#   pwsh -File scripts/triage-loop.ps1              # one locked tick
#   pwsh -File scripts/triage-loop.ps1 -ForceHours  # attended testing outside work hours
#
# UNATTENDED GATE: do not register the schedule (install-scheduler.ps1) until the gate in
# docs/architecture/12 Loops.md passes.
param(
    [string]$Target = "admin",
    [switch]$ForceHours
)

$AgentRoot = Split-Path -Parent $PSScriptRoot
$LockFile  = Join-Path $env:TEMP "unplugged-agent-triage.lock"
$LogFile   = Join-Path $AgentRoot "triage.log"

function Log($m) { "$([DateTime]::UtcNow.ToString('o'))  $m" | Tee-Object -FilePath $LogFile -Append }

# Single-instance lock — CREATE-EXCLUSIVE (no check-then-write race: CreateNew fails atomically
# if the file exists). A lock older than 2h 15m (> the 2h dispatch timeout) is stale — reclaim it.
$lockStream = $null
try {
    try {
        $lockStream = [System.IO.File]::Open($LockFile, [System.IO.FileMode]::CreateNew,
            [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
    }
    catch [System.IO.IOException] {
        $age = (Get-Date) - (Get-Item $LockFile -ErrorAction Stop).LastWriteTime
        if ($age.TotalMinutes -lt 135) { Log "SKIP: lock held ($([int]$age.TotalMinutes)m old)"; exit 0 }
        Log "stale lock ($([int]$age.TotalMinutes)m) - reclaiming"
        Remove-Item $LockFile -Force -ErrorAction Stop
        $lockStream = [System.IO.File]::Open($LockFile, [System.IO.FileMode]::CreateNew,
            [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
    }
    $bytes = [System.Text.Encoding]::UTF8.GetBytes("$PID")
    $lockStream.Write($bytes, 0, $bytes.Length); $lockStream.Flush()

    Log "tick start (target=$Target)"
    $tickArgs = @((Join-Path $PSScriptRoot "triage-tick.mjs"), "--target", $Target)
    if ($ForceHours) { $tickArgs += "--force-hours" }
    & node @tickArgs 2>&1 | Tee-Object -FilePath $LogFile -Append
    Log "tick done (exit $LASTEXITCODE)"
    exit $LASTEXITCODE
}
catch {
    Log "ERROR: $($_.Exception.Message)"
    exit 1
}
finally {
    if ($lockStream) { $lockStream.Dispose() }
    Remove-Item $LockFile -Force -ErrorAction SilentlyContinue
}
