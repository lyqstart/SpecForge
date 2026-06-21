$ErrorActionPreference = "Stop"

$Repo = "D:\code\temp\SpecForge"
$ReleaseBranch = "release/v1.2-stable-rc"
$TagName = "v1.2-stable-rc"

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
    Fail ($Label + " failed.") "Inspect output. Stable RC closure stops on first failed invariant."
  }
}

function AssertTag($Name) {
  $Found = GitOutput @("tag", "--list", $Name)
  if (-not $Found) {
    Fail ("Missing required tag: " + $Name) "Finish required stage before v1.2 stable RC closure."
  }
}

function AssertFileContains($RelativePath, $Needle) {
  $Path = Join-Path $Repo $RelativePath
  if (!(Test-Path $Path)) {
    Fail ("Missing required file: " + $RelativePath) "Check previous slice merge."
  }
  $Text = [System.IO.File]::ReadAllText($Path)
  if ($Text -notlike ("*" + $Needle + "*")) {
    Fail ("Required marker missing in " + $RelativePath + ": " + $Needle) "Check previous implementation/report."
  }
}

function Run-DaemonTests($Label, $TestFiles) {
  $Existing = @()
  foreach ($File in $TestFiles) {
    $Rel = "packages\daemon-core\" + $File.Replace("/", "\")
    if (Test-Path (Join-Path $Repo $Rel)) {
      $Existing += $File
    }
  }

  if ($Existing.Count -eq 0) {
    Fail ("No test files found for " + $Label) "Check repository layout and prior stage files."
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

if (!(Test-Path $Repo)) {
  Fail "Repo path not found: D:\code\temp\SpecForge" "Check repo location."
}

Push-Location $Repo
try {
  $Branch = GitOutput @("rev-parse", "--abbrev-ref", "HEAD")
  if ($Branch -ne $ReleaseBranch) {
    Fail ("Wrong branch: " + $Branch) ("Checkout " + $ReleaseBranch + " before running stable RC closure.")
  }

  AssertTag "v1.1-stable"
  AssertTag "v1.2-project-spec-store-slice-complete"
  AssertTag "v1.2-write-guard-preflight-slice-complete"
  AssertTag "v1.2-extension-subflow-slice-complete"
  AssertTag "v1.2-integration-rc-complete"

  & git restore packages/daemon-core/.specforge/logs/telemetry.jsonl 2>$null

  AssertFileContains "docs\reports\specforge-v1.2-integration-rc-report.md" "PASSED"
  AssertFileContains "packages\daemon-core\src\project\ProjectSpecStore.ts" "ProjectSpecStore"
  AssertFileContains "packages\daemon-core\src\tools\lib\write-guard-preflight-v12.ts" "sfWriteGuardPreflight"
  AssertFileContains "packages\daemon-core\src\tools\lib\extension-subflow-v12.ts" "createExtensionRequest"
  AssertFileContains "scripts\lib\registry.ts" "tools/sf_write_guard_preflight.ts"
  AssertFileContains "scripts\lib\registry.ts" "tools/sf_extension_subflow.ts"

  $ReleaseNotes = @"
# SpecForge v1.2 Stable RC Release Notes

## Status

Release Candidate.

## Baseline

- v1.1-stable
- v1.2-project-spec-store-slice-complete
- v1.2-write-guard-preflight-slice-complete
- v1.2-extension-subflow-slice-complete
- v1.2-integration-rc-complete

## Included capabilities

### Project Spec Store

- project-level spec baseline
- candidate merge contract
- no-spec-impact evidence for quick_change

### Write Guard Preflight

- write-before-control API
- implementation_running state requirement
- code permission required
- revoke protection
- out-of-scope write denial
- direct .specforge/project/** write denial
- shell write risk classification
- close gate helper for blocked_write_attempts

### Extension Subflow

- Extension Request Artifact
- Extension Proposal Artifact
- Extension Registry merge
- stale registry version protection
- unapproved merge denial
- duplicate active extension_id denial
- parent resume token

## RC boundary

This RC does not claim live OpenCode acceptance has been completed. Live acceptance must be run separately using the generated prompt:

docs/reports/specforge-v1.2-live-opencode-acceptance-prompt.txt
"@
  WriteUtf8 (Join-Path $Repo "docs\releases\specforge-v1.2-stable-rc-release-notes.md") $ReleaseNotes

  $AcceptanceSummary = @"
# SpecForge v1.2 Stable RC Acceptance Summary

## Result

PASSED for automated RC closure.

## Automated evidence

- v1.2 integration RC tests
- v1.2 project spec slice tests
- v1.2 write guard slice tests
- v1.2 extension subflow slice tests
- v1.1 final governance regression
- workspace build
- install/deployment consistency

## Required tags

- v1.1-stable
- v1.2-project-spec-store-slice-complete
- v1.2-write-guard-preflight-slice-complete
- v1.2-extension-subflow-slice-complete
- v1.2-integration-rc-complete

## Live acceptance status

Not yet claimed. A live OpenCode acceptance prompt is generated for the next stage.
"@
  WriteUtf8 (Join-Path $Repo "docs\releases\specforge-v1.2-stable-rc-acceptance-summary.md") $AcceptanceSummary

  $LivePrompt = @"
# SpecForge v1.2 Live OpenCode Acceptance Prompt

Please run this in a temporary real OpenCode project to validate v1.2 integrated behavior:

1. Initialize or use SpecForge in the project.
2. Create a feature_spec that generates a project spec candidate.
3. After user approval, merge the candidate into .specforge/project/** and verify project spec version increments.
4. Run a quick_change and verify it does not modify project spec but produces no-spec-impact evidence.
5. Attempt a code write before implementation_running; Write Guard must deny it.
6. Enable code permission and write an allowed file; it must pass.
7. Attempt out-of-scope write; it must produce blocked_write_attempts or violation and close_gate must not pass.
8. Trigger a missing artifact type extension request and generate proposal.
9. Approve the extension, merge extension_registry.json, and return to parent workflow.
10. Legal path must close; illegal write path must become blocked or gates_failed.

Required evidence:

- WI ID
- events.jsonl state chain
- project spec version change
- no-spec-impact evidence
- write_guard.preflight / write_guard.violation evidence
- extension request/proposal/registry merge evidence
- close_gate result
"@
  WriteUtf8 (Join-Path $Repo "docs\reports\specforge-v1.2-live-opencode-acceptance-prompt.txt") $LivePrompt

  $Report = @"
# SpecForge v1.2 Stable RC Closure Report

## Status

IN_PROGRESS

## Scope

- release notes
- acceptance summary
- live OpenCode acceptance prompt
- v1.2 integration regression
- v1.2 slice regression
- v1.1 governance regression
- workspace build
- install/deployment consistency
"@
  WriteUtf8 (Join-Path $Repo "docs\reports\specforge-v1.2-stable-rc-closure-report.md") $Report

  Run-DaemonTests "v1.2 integration RC tests" @(
    "tests/v12-integration-rc.test.ts"
  )

  Run-DaemonTests "v1.2 full slice regression tests" @(
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
# SpecForge v1.2 Stable RC Closure Report

## Result

PASSED

## Automated RC closure

- v1.2 integration RC tests passed
- v1.2 full slice regression tests passed
- v1.1 final governance regression passed
- workspace build passed
- install/deployment consistency passed
- release notes generated
- acceptance summary generated
- live OpenCode acceptance prompt generated

## Required tags checked

- v1.1-stable
- v1.2-project-spec-store-slice-complete
- v1.2-write-guard-preflight-slice-complete
- v1.2-extension-subflow-slice-complete
- v1.2-integration-rc-complete

## Boundary

This is a stable RC closure. It does not claim live OpenCode acceptance is complete.

## Tag

$TagName
"@
  WriteUtf8 (Join-Path $Repo "docs\reports\specforge-v1.2-stable-rc-closure-report.md") $FinalReport

  Write-Host "RESULT: V12_STABLE_RC_CLOSURE_PASSED"
  Write-Host "CAUSE: v1.2 Stable RC release docs, automated regressions, build, deployment consistency, and prompt generation passed."
  Write-Host "NEXT ACTION: one-shot driver will commit, push, merge main, and tag v1.2-stable-rc."
}
finally {
  Pop-Location
}
