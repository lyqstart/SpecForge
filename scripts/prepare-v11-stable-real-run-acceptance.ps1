$ErrorActionPreference = "Stop"

$Repo = "D:\code\temp\SpecForge"
$AcceptanceProject = "D:\code\temp\SpecForge-v11-stable-real-run-acceptance"
$PromptPath = Join-Path $AcceptanceProject "OPEN_THIS_PROMPT_IN_OPENCODE.txt"

function Fail($Cause, $Next) {
  Write-Host "RESULT: FAILED"
  Write-Host ("CAUSE: " + $Cause)
  Write-Host ("NEXT ACTION: " + $Next)
  exit 1
}

function GitOutput($ArgsArray) {
  $Output = & git @ArgsArray 2>$null
  if ($null -eq $Output) { return "" }
  return (($Output | Out-String).Trim())
}

function Run-Step($Label, $ScriptBlock) {
  Write-Host ""
  Write-Host ("=== " + $Label + " ===")
  & $ScriptBlock
  if ($LASTEXITCODE -ne 0) {
    Fail ($Label + " failed.") "Inspect output. Do not run OpenCode acceptance until preflight passes."
  }
}

if (!(Test-Path $Repo)) {
  Fail "Repo path not found: D:\code\temp\SpecForge" "Check repo location."
}

Push-Location $Repo
try {
  $Branch = GitOutput @("rev-parse", "--abbrev-ref", "HEAD")
  if ($Branch -ne "hardening/v1.1-stable-real-run-acceptance") {
    Fail ("Wrong branch: " + $Branch) "Run apply_v11_stable_real_run_acceptance.ps1 first."
  }

  $RequiredTags = @(
    "v1.1-stable-rc",
    "v1.1.3-daemon-control-plane-alignment-complete",
    "v1.1.4-final-rule-test-coverage-closure-complete",
    "v1.1.5-agent-skill-contract-alignment-complete",
    "v1.1.6-install-deployment-consistency-complete"
  )

  foreach ($Tag in $RequiredTags) {
    $Found = GitOutput @("tag", "--list", $Tag)
    if (-not $Found) {
      Fail ("Missing required baseline tag: " + $Tag) "Finish previous baseline merge/tag before real-run acceptance."
    }
  }

  Run-Step "governance regression tests" {
    Push-Location (Join-Path $Repo "packages\daemon-core")
    try {
      & bun run test -- `
        tests/v11-final-governance-regression.test.ts `
        tests/v11-agent-skill-contract-alignment.test.ts `
        tests/v11-install-deployment-consistency.test.ts
    }
    finally {
      Pop-Location
    }
  }

  Run-Step "workspace deterministic build" {
    & bun run build
  }

  Run-Step "install/deployment consistency closure" {
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Repo "scripts\run-install-deployment-consistency.ps1")
  }

  if (Test-Path $AcceptanceProject) {
    Remove-Item -LiteralPath $AcceptanceProject -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $AcceptanceProject | Out-Null

  $Readme = @"
# SpecForge v1.1 Stable Real Run Acceptance Project

Open this directory in OpenCode:

D:\code\temp\SpecForge-v11-stable-real-run-acceptance

Paste the prompt from:

OPEN_THIS_PROMPT_IN_OPENCODE.txt

After OpenCode finishes and reports a WI ID, run:

powershell -NoProfile -ExecutionPolicy Bypass -File D:\code\temp\SpecForge\scripts\validate-v11-stable-real-run-acceptance.ps1
"@
  [System.IO.File]::WriteAllText((Join-Path $AcceptanceProject "README.md"), $Readme, (New-Object System.Text.UTF8Encoding($false)))

  $PromptSource = Join-Path $Repo "docs\reports\specforge-v1.1-stable-real-run-opencode-prompt.txt"
  if (!(Test-Path $PromptSource)) {
    Fail "Acceptance prompt source missing." "Re-apply the real-run acceptance package."
  }
  Copy-Item -LiteralPath $PromptSource -Destination $PromptPath -Force

  Write-Host ""
  Write-Host "RESULT: V11_STABLE_REAL_RUN_ACCEPTANCE_PREPARED"
  Write-Host "CAUSE: Baseline tests, build, install/deployment consistency passed and acceptance project was created."
  Write-Host ("NEXT ACTION: Open this directory in OpenCode: " + $AcceptanceProject)
  Write-Host ("PROMPT FILE: " + $PromptPath)
  Write-Host "AFTER OPENCODE FINISHES: run scripts\validate-v11-stable-real-run-acceptance.ps1"
}
finally {
  Pop-Location
}
