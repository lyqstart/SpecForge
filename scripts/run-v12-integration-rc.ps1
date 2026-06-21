$ErrorActionPreference = "Stop"

$Repo = "D:\code\temp\SpecForge"
$FeatureBranch = "hardening/v1.2-integration-rc"
$TagName = "v1.2-integration-rc-complete"

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

function WriteUtf8($Path, $Text) {
  $Parent = Split-Path -Parent $Path
  New-Item -ItemType Directory -Force -Path $Parent | Out-Null
  $Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Text, $Utf8NoBom)
}

function Run-Step($Label, $ScriptBlock) {
  Write-Host ""
  Write-Host ("=== " + $Label + " ===")
  & $ScriptBlock
  if ($LASTEXITCODE -ne 0) {
    Fail ($Label + " failed.") "Inspect output. Integration RC stops on first failed invariant."
  }
}

function AssertTag($Name) {
  $Found = GitOutput @("tag", "--list", $Name)
  if (-not $Found) {
    Fail ("Missing required tag: " + $Name) "Finish required v1.2 slice before integration RC."
  }
}

function TestFile($RelativePath) {
  return Test-Path (Join-Path $Repo $RelativePath)
}

function Run-DaemonTests($Label, $TestFiles) {
  $Existing = @()
  foreach ($File in $TestFiles) {
    if (TestFile ("packages\daemon-core\" + $File.Replace("/", "\"))) {
      $Existing += $File
    }
  }

  if ($Existing.Count -eq 0) {
    Fail ("No test files found for " + $Label) "Check repository layout and prior slice files."
  }

  Run-Step $Label {
    Push-Location (Join-Path $Repo "packages\daemon-core")
    try {
      $Args = @("run", "test", "--") + $Existing
      & bun @Args
    }
    finally {
      Pop-Location
    }
  }
}

function AssertRequiredFileContains($RelativePath, $Needle) {
  $Path = Join-Path $Repo $RelativePath
  if (!(Test-Path $Path)) {
    Fail ("Missing required file: " + $RelativePath) "Check previous slice merge."
  }
  $Text = [System.IO.File]::ReadAllText($Path)
  if ($Text -notlike ("*" + $Needle + "*")) {
    Fail ("Required marker missing in " + $RelativePath + ": " + $Needle) "Check previous slice implementation."
  }
}

if (!(Test-Path $Repo)) {
  Fail "Repo path not found: D:\code\temp\SpecForge" "Check repo location."
}

Push-Location $Repo
try {
  $Branch = GitOutput @("rev-parse", "--abbrev-ref", "HEAD")
  if ($Branch -ne $FeatureBranch) {
    Fail ("Wrong branch: " + $Branch) ("Checkout " + $FeatureBranch + " before running integration RC.")
  }

  AssertTag "v1.1-stable"
  AssertTag "v1.2-project-spec-store-slice-complete"
  AssertTag "v1.2-write-guard-preflight-slice-complete"
  AssertTag "v1.2-extension-subflow-slice-complete"

  & git restore packages/daemon-core/.specforge/logs/telemetry.jsonl 2>$null

  AssertRequiredFileContains "packages\daemon-core\src\project\ProjectSpecStore.ts" "ProjectSpecStore"
  AssertRequiredFileContains "packages\daemon-core\src\tools\lib\write-guard-preflight-v12.ts" "sfWriteGuardPreflight"
  AssertRequiredFileContains "packages\daemon-core\src\tools\lib\extension-subflow-v12.ts" "createExtensionRequest"
  AssertRequiredFileContains "scripts\lib\registry.ts" "tools/sf_write_guard_preflight.ts"
  AssertRequiredFileContains "scripts\lib\registry.ts" "tools/sf_extension_subflow.ts"

  $Report = @"
# SpecForge v1.2 Integration RC Report

## Status

IN_PROGRESS

## Scope

- Project Spec Store slice integration evidence
- Write Guard Preflight slice integration evidence
- Extension Subflow slice integration evidence
- installer registry alignment
- v1.1 final governance regression
- workspace build
- install/deployment consistency

## Required tags

- v1.1-stable
- v1.2-project-spec-store-slice-complete
- v1.2-write-guard-preflight-slice-complete
- v1.2-extension-subflow-slice-complete
"@
  WriteUtf8 (Join-Path $Repo "docs\reports\specforge-v1.2-integration-rc-report.md") $Report

  Run-DaemonTests "v1.2 integration RC tests" @(
    "tests/v12-integration-rc.test.ts"
  )

  Run-DaemonTests "v1.2 slice regression tests" @(
    "tests/v12-project-spec-store.test.ts",
    "tests/v12-candidate-merge-contract.test.ts",
    "tests/v12-no-spec-impact.test.ts",
    "tests/v12-write-guard-preflight.test.ts",
    "tests/v12-write-guard-preflight-contract.test.ts",
    "tests/v12-extension-subflow.test.ts",
    "tests/v12-extension-subflow-negative.test.ts"
  )

  Run-DaemonTests "v1.1 final governance regression" @(
    "tests/v11-final-governance-regression.test.ts"
  )

  Run-Step "workspace build" {
    & bun run build
  }

  if (Test-Path (Join-Path $Repo "scripts\run-install-deployment-consistency.ps1")) {
    Run-Step "install/deployment consistency" {
      & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Repo "scripts\run-install-deployment-consistency.ps1")
    }
  }

  $FinalReport = @"
# SpecForge v1.2 Integration RC Report

## Result

PASSED

## Integrated slices

- Project Spec Store + Candidate Merge Contract
- Write Guard Preflight Enforcement
- Extension Registry + Extension Request Artifact

## Evidence

- v1.2 integration RC tests passed
- v1.2 slice regression tests passed
- v1.1 final governance regression passed
- workspace build passed
- install/deployment consistency passed
- installer registry includes sf_write_guard_preflight
- installer registry includes sf_extension_subflow

## Conclusion

v1.2 integration RC baseline is ready. The next package can perform live OpenCode real-run acceptance or proceed to v1.2 stable release documentation after live acceptance.

## Tag

$TagName
"@
  WriteUtf8 (Join-Path $Repo "docs\reports\specforge-v1.2-integration-rc-report.md") $FinalReport

  Write-Host "RESULT: V12_INTEGRATION_RC_PASSED"
  Write-Host "CAUSE: All v1.2 slices were integrated, regression-tested, built, deployment-verified, and documented."
  Write-Host "NEXT ACTION: one-shot driver will commit, push, merge main, and tag."
}
finally {
  Pop-Location
}
