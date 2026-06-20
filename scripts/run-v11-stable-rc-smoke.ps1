$ErrorActionPreference = "Stop"

$Repo = "D:\code\temp\SpecForge"

function Fail($Cause, $Next) {
  Write-Host "RESULT: FAILED"
  Write-Host ("CAUSE: " + $Cause)
  Write-Host ("NEXT ACTION: " + $Next)
  exit 1
}

function Resolve-LiveRoot {
  if ($env:XDG_CONFIG_HOME -and (Test-Path $env:XDG_CONFIG_HOME)) {
    return (Join-Path $env:XDG_CONFIG_HOME "opencode")
  }
  return (Join-Path $env:USERPROFILE ".config\opencode")
}

function Assert-Contains($Path, $Needle, $Label) {
  if (!(Test-Path $Path)) {
    Fail ("Missing file for smoke check: " + $Path) "Install/upgrade SpecForge userlevel components and rerun RC closure."
  }
  $Text = [System.IO.File]::ReadAllText($Path)
  if ($Text -notlike ("*" + $Needle + "*")) {
    Fail ("Smoke check failed: " + $Label + " missing " + $Needle + " in " + $Path) "Inspect installed live component; it may be stale."
  }
}

if (!(Test-Path $Repo)) {
  Fail "Repo path not found: D:\code\temp\SpecForge" "Check repo location."
}

$LiveRoot = Resolve-LiveRoot
if (!(Test-Path $LiveRoot)) {
  Fail ("Live OpenCode userlevel root not found: " + $LiveRoot) "Run installer upgrade before smoke checks."
}

$RequiredLive = @(
  "plugins\sf_specforge.ts",
  "agents\sf-orchestrator.md",
  "agents\sf-executor.md",
  "agents\sf-verifier.md",
  "tools\sf_state_transition.ts",
  "tools\sf_user_decision_record.ts",
  "tools\sf_merge_run.ts",
  "tools\sf_code_permission.ts",
  "tools\sf_changed_files_audit.ts",
  "tools\sf_close_gate.ts",
  "tools\sf_artifact_write.ts",
  "skills\sf-workflow-quick-change\SKILL.md",
  "skills\sf-workflow-bugfix-spec\SKILL.md",
  "sf-user\templates\.specforge\config\observability.json",
  "sf-user\install.json"
)

foreach ($Rel in $RequiredLive) {
  $Path = Join-Path $LiveRoot $Rel
  if (!(Test-Path $Path)) {
    Fail ("Required live RC smoke file missing: " + $Rel) "Run scripts/run-install-deployment-consistency.ps1 and rerun RC closure."
  }
}

Assert-Contains (Join-Path $LiveRoot "agents\sf-orchestrator.md") "SPECFORGE_V11_FINAL_GOVERNANCE_CONTRACT" "orchestrator final governance contract"
Assert-Contains (Join-Path $LiveRoot "skills\sf-workflow-quick-change\SKILL.md") "SPECFORGE_V11_FINAL_GOVERNANCE_CONTRACT" "quick_change skill final governance contract"
Assert-Contains (Join-Path $LiveRoot "tools\sf_state_transition.ts") "workflow_type" "state transition wrapper workflow_type"
Assert-Contains (Join-Path $LiveRoot "tools\sf_state_transition.ts") "workflow_path" "state transition wrapper workflow_path"
Assert-Contains (Join-Path $LiveRoot "tools\sf_user_decision_record.ts") "user_response_quote" "decision wrapper user_response_quote"
Assert-Contains (Join-Path $LiveRoot "tools\sf_user_decision_record.ts") "auto_approval_policy_id" "decision wrapper auto_approval_policy_id"
Assert-Contains (Join-Path $LiveRoot "tools\sf_code_permission.ts") "allowed_write_files" "code permission wrapper allowed_write_files"
Assert-Contains (Join-Path $LiveRoot "tools\sf_close_gate.ts") "work_item_id" "close gate wrapper work_item_id"

$InstallJsonPath = Join-Path $LiveRoot "sf-user\install.json"
$InstallJson = Get-Content -LiteralPath $InstallJsonPath -Raw | ConvertFrom-Json
if ($null -eq $InstallJson) {
  Fail "install.json could not be parsed." "Inspect live install.json."
}

$ObsPath = Join-Path $LiveRoot "sf-user\templates\.specforge\config\observability.json"
$Obs = Get-Content -LiteralPath $ObsPath -Raw | ConvertFrom-Json
if ($Obs.schema_version -ne "1.1" -or $Obs.enabled -ne $true) {
  Fail "Live observability template is not schema_version=1.1 enabled=true." "Inspect live sf-user/templates observability template."
}

Write-Host ("live_root: " + $LiveRoot)
Write-Host "RESULT: V11_STABLE_RC_SMOKE_PASSED"
Write-Host "CAUSE: Live userlevel plugin/agents/skills/tools/templates are present and contain final governance markers/fields."
Write-Host "NEXT ACTION: continue RC closure."
