$ErrorActionPreference = "Stop"

$Repo = "D:\code\temp\SpecForge"
$FeatureBranch = "feature/v1.2-extension-subflow-slice"
$TagName = "v1.2-extension-subflow-slice-complete"

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
    Fail ($Label + " failed.") "Inspect output. This one-shot package stops on first failed invariant."
  }
}

function EnsureIndexExport($IndexPath) {
  if (!(Test-Path $IndexPath)) {
    Fail "packages/daemon-core/src/index.ts not found." "Check repository layout."
  }

  $Text = [System.IO.File]::ReadAllText($IndexPath)
  if ($Text -notlike "*extension-subflow-v12*") {
    $Append = @"

export {
  createExtensionRequest,
  createExtensionProposal,
  validateExtensionProposal,
  createEmptyExtensionRegistry,
  mergeExtensionRegistry,
  createParentResumeToken,
  shouldTriggerExtensionSubflow,
  SF_EXTENSION_SUBFLOW_V12_CONTRACT,
} from './tools/lib/extension-subflow-v12';
export type {
  V12ExtensionKind,
  V12ExtensionRequestArtifact,
  V12ExtensionProposalArtifact,
  V12ExtensionRegistry,
  V12ExtensionMergeResult,
  V12ParentResumeToken,
} from './tools/lib/extension-subflow-v12';
"@
    WriteUtf8 $IndexPath ($Text.TrimEnd() + "`n" + $Append.TrimStart())
  }
}

function EnsureRegistryIncludesExtensionTool() {
  $RegistryPath = Join-Path $Repo "scripts\lib\registry.ts"
  if (!(Test-Path $RegistryPath)) {
    Fail "scripts/lib/registry.ts not found." "Check repository layout."
  }

  $Text = [System.IO.File]::ReadAllText($RegistryPath)
  if ($Text -like "*tools/sf_extension_subflow.ts*") {
    Write-Host "registry already contains tools/sf_extension_subflow.ts"
    return
  }

  $Anchor = '{ path: "tools/sf_write_guard_preflight.ts", type: "tool" },'
  if ($Text -notlike ("*" + $Anchor + "*")) {
    $Anchor = '{ path: "tools/sf_close_gate.ts", type: "tool" },'
  }

  if ($Text -notlike ("*" + $Anchor + "*")) {
    Fail "Could not find registry tool anchor." "Add tools/sf_extension_subflow.ts to SHARED_COMPONENT_REGISTRY manually."
  }

  $Replacement = $Anchor + "`n  { path: ""tools/sf_extension_subflow.ts"", type: ""tool"" },"
  $Text = $Text.Replace($Anchor, $Replacement)
  WriteUtf8 $RegistryPath $Text
  Write-Host "patched: scripts/lib/registry.ts includes tools/sf_extension_subflow.ts"
}

function AssertRequiredFiles() {
  $Required = @(
    "packages\daemon-core\src\tools\lib\extension-subflow-v12.ts",
    "packages\daemon-core\tests\v12-extension-subflow.test.ts",
    "packages\daemon-core\tests\v12-extension-subflow-negative.test.ts",
    "setup\userlevel-opencode\tools\sf_extension_subflow.ts"
  )

  foreach ($Rel in $Required) {
    if (!(Test-Path (Join-Path $Repo $Rel))) {
      Fail ("Missing generated file: " + $Rel) "Re-run the fix01 apply script."
    }
  }
}

function AssertAllowedStatus() {
  $AllowedPrefixes = @(
    "packages/daemon-core/src/tools/lib/extension-subflow-v12.ts",
    "packages/daemon-core/src/index.ts",
    "packages/daemon-core/tests/v12-extension-subflow.test.ts",
    "packages/daemon-core/tests/v12-extension-subflow-negative.test.ts",
    "setup/userlevel-opencode/tools/sf_extension_subflow.ts",
    "setup/userlevel-opencode/skills/",
    "scripts/lib/registry.ts",
    "docs/reports/specforge-v1.2-extension-subflow-slice-report.md",
    "scripts/run-v12-extension-subflow-slice.ps1"
  )

  $StatusLines = @(& git status --short)
  foreach ($Line in $StatusLines) {
    if (!$Line) { continue }
    if ($Line.Length -lt 4) { continue }
    $PathText = $Line.Substring(3).Replace("\", "/")
    $Allowed = $false
    foreach ($Prefix in $AllowedPrefixes) {
      if ($PathText -eq $Prefix -or $PathText.StartsWith($Prefix)) {
        $Allowed = $true
        break
      }
    }
    if (-not $Allowed) {
      Fail ("Unrelated working tree change detected: " + $Line) "Remove unrelated changes before continuing."
    }
  }
}

if (!(Test-Path $Repo)) {
  Fail "Repo path not found: D:\code\temp\SpecForge" "Check repo location."
}

Push-Location $Repo
try {
  $Branch = GitOutput @("rev-parse", "--abbrev-ref", "HEAD")
  if ($Branch -ne $FeatureBranch) {
    Fail ("Wrong branch: " + $Branch) ("Checkout " + $FeatureBranch + " before running slice script.")
  }

  $WriteGuardTag = GitOutput @("tag", "--list", "v1.2-write-guard-preflight-slice-complete")
  if (-not $WriteGuardTag) {
    Fail "Missing v1.2-write-guard-preflight-slice-complete tag." "Finish Write Guard preflight slice before Extension Subflow slice."
  }

  & git restore packages/daemon-core/.specforge/logs/telemetry.jsonl 2>$null

  AssertRequiredFiles
  EnsureIndexExport (Join-Path $Repo "packages\daemon-core\src\index.ts")
  EnsureRegistryIncludesExtensionTool

  $Report = @"
# SpecForge v1.2 Extension Subflow Slice Report

## Status

IN_PROGRESS

## Scope

- Extension Request Artifact
- Extension Proposal Artifact
- Extension Registry merge
- parent workflow resume token
- registry stale-version protection
- unapproved merge protection
- duplicate active extension protection
- recursive extension subflow protection
- userlevel sf_extension_subflow wrapper
"@
  WriteUtf8 (Join-Path $Repo "docs\reports\specforge-v1.2-extension-subflow-slice-report.md") $Report

  AssertAllowedStatus

  Run-Step "v1.2 extension subflow tests" {
    Push-Location (Join-Path $Repo "packages\daemon-core")
    try {
      & bun run test -- `
        tests/v12-extension-subflow.test.ts `
        tests/v12-extension-subflow-negative.test.ts
    }
    finally {
      Pop-Location
    }
  }

  Run-Step "v1.2 write guard regression" {
    Push-Location (Join-Path $Repo "packages\daemon-core")
    try {
      & bun run test -- `
        tests/v12-write-guard-preflight.test.ts `
        tests/v12-write-guard-preflight-contract.test.ts
    }
    finally {
      Pop-Location
    }
  }

  Run-Step "v1.1 final governance regression" {
    Push-Location (Join-Path $Repo "packages\daemon-core")
    try {
      & bun run test -- tests/v11-final-governance-regression.test.ts
    }
    finally {
      Pop-Location
    }
  }

  Run-Step "workspace build" {
    & bun run build
  }

  if (Test-Path (Join-Path $Repo "scripts\run-install-deployment-consistency.ps1")) {
    Run-Step "install/deployment consistency" {
      & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Repo "scripts\run-install-deployment-consistency.ps1")
    }
  }

  $FinalReport = @"
# SpecForge v1.2 Extension Subflow Slice Report

## Result

PASSED

## Implemented

- createExtensionRequest
- createExtensionProposal
- validateExtensionProposal
- createEmptyExtensionRegistry
- mergeExtensionRegistry
- createParentResumeToken
- shouldTriggerExtensionSubflow
- SF_EXTENSION_SUBFLOW_V12_CONTRACT
- userlevel sf_extension_subflow wrapper
- installer registry entry in SHARED_COMPONENT_REGISTRY

## Positive evidence

- missing extension creates deterministic Extension Request
- proposal validates
- approved proposal merges into registry
- registry version increments
- parent resume token is created
- missing type/user request triggers Extension Subflow

## Negative evidence

- unapproved registry merge is denied
- stale registry version is denied
- duplicate active extension_id is denied
- recursive extension subflow is denied

## Verification

- v1.2 extension subflow tests passed
- v1.2 write guard regression passed
- v1.1 final governance regression passed
- workspace build passed
- install/deployment consistency passed

## Tag

$TagName
"@
  WriteUtf8 (Join-Path $Repo "docs\reports\specforge-v1.2-extension-subflow-slice-report.md") $FinalReport

  Write-Host "RESULT: V12_EXTENSION_SUBFLOW_SLICE_PASSED"
  Write-Host "CAUSE: v1.2 Extension Subflow implementation/tests/build/deployment consistency passed."
  Write-Host "NEXT ACTION: fix01 driver will commit, push, merge main, and tag."
}
finally {
  Pop-Location
}
