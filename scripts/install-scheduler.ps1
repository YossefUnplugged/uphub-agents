# install-scheduler.ps1 — register the triage loop as a Windows Scheduled Task (Phase 2b).
# Run this ONCE, in an elevated PowerShell, only after Phase 2a is trusted via manual runs.
# Local-only (ADR-006): the agent runs on THIS machine, using its existing gh + MCP auth.
#
#   pwsh -File scripts/install-scheduler.ps1                  # install (every 30 min, work hours)
#   pwsh -File scripts/install-scheduler.ps1 -Uninstall      # remove
param(
    [int]$IntervalMinutes = 30,
    [switch]$Uninstall
)

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

$Settings = New-ScheduledTaskSettingsSet `
    -WakeToRun `
    -StartWhenAvailable `
    -DontStopOnIdleEnd `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1)

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger `
    -Settings $Settings -Description "Unplugged autonomous triage (local-only). Picks ai-ready UNP tickets → draft PR. Human reviews + merges." `
    -RunLevel Limited -Force

Write-Host "Installed '$TaskName' — every $IntervalMinutes min, 7am–6pm, wake-to-run." -ForegroundColor Green
Write-Host "Logs: $(Join-Path $AgentRoot 'triage.log')  ·  Remove with: -Uninstall" -ForegroundColor DarkGray
