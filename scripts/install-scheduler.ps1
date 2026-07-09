# install-scheduler.ps1 — register the triage loop as a Windows Scheduled Task (Phase 2b).
# Run this ONCE, in an elevated PowerShell, only after Phase 2a is trusted via manual runs.
# Local-only (ADR-006): the agent runs on THIS machine, using its existing gh + MCP auth.
#
#   pwsh -File scripts/install-scheduler.ps1                  # install (every 30 min, work hours)
#   pwsh -File scripts/install-scheduler.ps1 -Uninstall      # remove
param(
    [int]$IntervalMinutes = 30,
    [switch]$Uninstall,
    # The UNATTENDED GATE (docs/architecture/12 Loops.md): live smoke test + ~5 attended tick runs
    # green + pilot dailyTicketCap of 1. Passing this switch is the owner's explicit statement that
    # the gate has been met — without it, registration refuses.
    [switch]$AcknowledgeUnattendedGate
)

if (-not $Uninstall -and -not $AcknowledgeUnattendedGate) {
    Write-Error "GATED: registering the schedule requires -AcknowledgeUnattendedGate (the unattended gate in docs/architecture/12 Loops.md: live smoke test + ~5 attended tick runs + pilot cap 1). (-Uninstall still works.)"
    exit 1
}

$TaskName = "UnpluggedAgentTriage"
$AgentRoot = Split-Path -Parent $PSScriptRoot
$Loop = Join-Path $PSScriptRoot "triage-loop.ps1"

if ($Uninstall) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Removed scheduled task '$TaskName'." -ForegroundColor Yellow
    return
}

$pwshCmd = Get-Command pwsh -ErrorAction SilentlyContinue
if ($pwshCmd) { $pwsh = $pwshCmd.Source } else { $pwsh = (Get-Command powershell).Source }

$Action = New-ScheduledTaskAction -Execute $pwsh `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$Loop`"" `
    -WorkingDirectory $AgentRoot

# Repeat every N minutes during work hours (Sun-Thu), wake the machine if asleep.
$Trigger = New-ScheduledTaskTrigger -Daily -At 7am
$Trigger.Repetition = (New-ScheduledTaskTrigger -Once -At 7am `
    -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) `
    -RepetitionDuration (New-TimeSpan -Hours 11)).Repetition

# 2h: implement + up to 2 fix rounds x a full nx gate + close can exceed the old 1h limit.
$Settings = New-ScheduledTaskSettingsSet `
    -WakeToRun `
    -StartWhenAvailable `
    -DontStopOnIdleEnd `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2)

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger `
    -Settings $Settings -Description "Unplugged autonomous triage tick (local-only, ADR-007). Mechanical poll of ai-ready UNP tickets -> triage.mjs -> draft PR. Human reviews + merges. Pause: create state/pause." `
    -RunLevel Limited -Force

Write-Host "Installed '$TaskName' — every $IntervalMinutes min, 7am–6pm, wake-to-run." -ForegroundColor Green
Write-Host "Logs: $(Join-Path $AgentRoot 'triage.log')  ·  Remove with: -Uninstall" -ForegroundColor DarkGray
