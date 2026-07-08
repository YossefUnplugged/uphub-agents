# run-headless.ps1 — manual-trigger entry to the triage orchestrator.
#
# Delegates to scripts/triage.mjs, which realizes the two P0 guarantees:
#   #3  the work happens in an ISOLATED git worktree off origin/main — never the developer's checkout;
#   #2  the WRAPPER runs Gate A (the implement-phase agent has no tool to run it, push, or open a PR).
# Local-only (ADR-006). Uses the gh + Atlassian-MCP auth already on this machine.
#
# Usage:
#   pwsh -File scripts/run-headless.ps1 -Ticket UNP-1234            # real run (implement → gate → close)
#   pwsh -File scripts/run-headless.ps1 -Ticket UNP-1234 -Keep      # keep the worktree to inspect
#   pwsh -File scripts/run-headless.ps1 -Ticket TEST-1  -DryRun     # exercise the spine, no network
param(
    [Parameter(Mandatory = $true)][string]$Ticket,
    [string]$Target = "admin",
    [switch]$Keep,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$AgentRoot = Split-Path -Parent $PSScriptRoot

$cliArgs = @((Join-Path $AgentRoot "scripts\triage.mjs"), "--ticket", $Ticket, "--target", $Target)
if ($Keep)   { $cliArgs += "--keep" }
if ($DryRun) { $cliArgs += "--dry-run" }

Write-Host "run-headless → triage $Ticket ($Target)" -ForegroundColor Cyan
node @cliArgs
exit $LASTEXITCODE
