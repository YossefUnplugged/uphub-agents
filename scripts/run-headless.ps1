# run-headless.ps1 — run the triage protocol once, headless, on the owner's machine.
# Local-only (ADR-006). Uses the gh + Atlassian-MCP auth already on this machine.
# Usage:  pwsh -File scripts/run-headless.ps1
param(
    [string]$Target = "admin"
)

$ErrorActionPreference = "Stop"
$AgentRoot = Split-Path -Parent $PSScriptRoot
$Targets   = Get-Content (Join-Path $AgentRoot "config\targets.json") | ConvertFrom-Json
$RepoPath  = $Targets.targets.$Target.path
$Triage    = Get-Content (Join-Path $AgentRoot "prompts\triage.md") -Raw

# Tools the triage protocol needs, non-interactively. Mirrors admin/.claude/settings.local.json
# (expanded with the Atlassian write tools triage requires — keep these two in sync).
$AllowedTools = @(
    "Read","Edit","Write","Glob","Grep",
    "Bash(npx *)","Bash(npm *)","Bash(node *)","Bash(git *)","Bash(gh *)",
    "mcp__atlassian__atlassianUserInfo",
    "mcp__atlassian__searchJiraIssuesUsingJql",
    "mcp__atlassian__getJiraIssue",
    "mcp__atlassian__transitionJiraIssue",
    "mcp__atlassian__addCommentToJiraIssue",
    # Browser — so the agent reaches IP-restricted internal resources ITSELF (standards/internal-access.md)
    "mcp__claude-in-chrome__tabs_context_mcp",
    "mcp__claude-in-chrome__tabs_create_mcp",
    "mcp__claude-in-chrome__navigate",
    "mcp__claude-in-chrome__get_page_text",
    "mcp__claude-in-chrome__read_page",
    "mcp__claude-in-chrome__read_network_requests",
    "mcp__claude-in-chrome__javascript_tool",
    # AAA permission sync — register new actions/routes in the AAA DB (standards/aaa-permissions.md)
    "mcp__up-aaa-sync__list_service_types",
    "mcp__up-aaa-sync__add_service_type",
    "mcp__up-aaa-sync__scan_routes",
    "mcp__up-aaa-sync__sync_actions",
    "mcp__up-aaa-sync__list_policies",
    "mcp__up-aaa-sync__add_policy",
    "mcp__up-aaa-sync__assign_action_to_policy"
) -join ","

$Prompt = "Agent-system root: $AgentRoot`n`n$Triage"

Push-Location $RepoPath
try {
    Write-Host "run-headless → $Target ($RepoPath)" -ForegroundColor Cyan
    claude -p $Prompt --permission-mode acceptEdits --allowedTools $AllowedTools --max-turns 60
}
finally {
    Pop-Location
}
