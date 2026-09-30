$ErrorActionPreference = "Stop"

$Repo = "D:\code\temp\SpecForge"

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

function Test-FileExists($Path, $Label) {
  if (!(Test-Path $Path)) {
    Fail ("Missing required file: " + $Label + " -> " + $Path) "Make sure v1.1.3-v1.1.6 branches were merged to main before RC closure."
  }
}

function Run-Step($Label, $ScriptBlock) {
  Write-Host ""
  Write-Host ("=== " + $Label + " ===")
  & $ScriptBlock
  if ($LASTEXITCODE -ne 0) {
    Fail ($Label + " failed.") "Inspect the command output. Do not commit or tag RC until this passes."
  }
}

if (!(Test-Path $Repo)) {
  Fail "Repo path not found: D:\code\temp\SpecForge" "Check repo location."
}

Push-Location $Repo
try {
  $Branch = GitOutput @("rev-parse", "--abbrev-ref", "HEAD")
  if ($Branch -ne "hardening/v1.1-stable-rc-closure") {
    Fail ("Wrong branch for RC run: " + $Branch) "Run apply_v11_stable_rc_closure.ps1 first or checkout hardening/v1.1-stable-rc-closure."
  }

  $RequiredTags = @(
    "v1.1.3-daemon-control-plane-alignment-complete",
    "v1.1.4-final-rule-test-coverage-closure-complete",
    "v1.1.5-agent-skill-contract-alignment-complete",
    "v1.1.6-install-deployment-consistency-complete"
  )

  foreach ($Tag in $RequiredTags) {
    $Found = GitOutput @("tag", "--list", $Tag)
    if (-not $Found) {
      Fail ("Missing required baseline tag: " + $Tag) "Merge/tag the previous completed baseline first, then rerun RC closure."
    }
  }

  Test-FileExists (Join-Path $Repo "packages\daemon-core\tests\v11-final-governance-regression.test.ts") "v1.1.4 final governance regression test"
  Test-FileExists (Join-Path $Repo "packages\daemon-core\tests\v11-agent-skill-contract-alignment.test.ts") "v1.1.5 Agent/Skill contract alignment test"
  Test-FileExists (Join-Path $Repo "packages\daemon-core\tests\v11-install-deployment-consistency.test.ts") "v1.1.6 install/deployment consistency test"
  Test-FileExists (Join-Path $Repo "scripts\run-install-deployment-consistency.ps1") "v1.1.6 install/deployment consistency runner"
  Test-FileExists (Join-Path $Repo "scripts\check-userlevel-live-consistency.ps1") "v1.1.6 live consistency checker"
  Test-FileExists (Join-Path $Repo "scripts\cleanup-userlevel-legacy-components.ps1") "v1.1.6 legacy cleanup script"
  Test-FileExists (Join-Path $Repo "scripts\sync-userlevel-template-library.ps1") "v1.1.6 template sync script"
  Test-FileExists (Join-Path $Repo "templates\.specforge\config\observability.json") "root observability template"
  Test-FileExists (Join-Path $Repo "setup\userlevel-opencode\templates\.specforge\config\observability.json") "userlevel observability template"

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

  Run-Step "stable RC smoke checks" {
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Repo "scripts\run-v11-stable-rc-smoke.ps1")
  }

  Write-Host ""
  Write-Host "RESULT: V11_STABLE_RC_CLOSURE_PASSED"
  Write-Host "CAUSE: Required v1.1.3-v1.1.6 baseline tags/files exist; governance tests, build, install/deployment consistency, installer verify, live SHA256, and RC smoke checks passed."
  Write-Host "NEXT ACTION: commit this RC closure branch, push, merge to main, then create v1.1-stable-rc tag."
}
finally {
  Pop-Location
}
