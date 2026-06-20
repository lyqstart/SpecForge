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

function AssertFileContains($RelativePath, $Needles) {
  $Path = Join-Path $Repo $RelativePath
  if (!(Test-Path $Path)) {
    Fail ("Missing file: " + $RelativePath) "Re-apply the v1.2 design freeze package."
  }
  $Text = [System.IO.File]::ReadAllText($Path)
  foreach ($Needle in $Needles) {
    if ($Text -notlike ("*" + $Needle + "*")) {
      Fail ("Missing required text in " + $RelativePath + ": " + $Needle) "Inspect v1.2 design freeze docs."
    }
  }
}

function WriteUtf8($Path, $Text) {
  $Parent = Split-Path -Parent $Path
  New-Item -ItemType Directory -Force -Path $Parent | Out-Null
  $Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Text, $Utf8NoBom)
}

if (!(Test-Path $Repo)) {
  Fail "Repo path not found: D:\code\temp\SpecForge" "Check repo location."
}

Push-Location $Repo
try {
  $Branch = GitOutput @("rev-parse", "--abbrev-ref", "HEAD")
  if ($Branch -ne "design/v1.2-design-freeze") {
    Fail ("Wrong branch: " + $Branch) "Checkout design/v1.2-design-freeze before verifying."
  }

  $StableTag = GitOutput @("tag", "--list", "v1.1-stable")
  if (-not $StableTag) {
    Fail "Missing v1.1-stable tag." "Finish v1.1-stable before freezing v1.2 design."
  }

  AssertFileContains "docs/design/specforge-v1.2-design-freeze-roadmap.md" @(
    "SF_V12_DESIGN_FREEZE_ROADMAP",
    "Project Spec Architecture",
    "Write Guard Control Plane",
    "Extension Subflow",
    "Slice 1"
  )

  AssertFileContains "docs/design/specforge-v1.2-project-spec-architecture.md" @(
    "SF_V12_PROJECT_SPEC_ARCHITECTURE",
    ".specforge/project/**",
    ".specforge/work-items/WI-XXXX/**",
    "Candidate Merge Contract",
    "no-spec-impact"
  )

  AssertFileContains "docs/design/specforge-v1.2-write-guard-control-plane.md" @(
    "SF_V12_WRITE_GUARD_CONTROL_PLANE",
    "sf_write_guard_preflight",
    "implementation_running",
    "blocked_write_attempts",
    ".specforge/project/**"
  )

  AssertFileContains "docs/design/specforge-v1.2-extension-subflow-design.md" @(
    "SF_V12_EXTENSION_SUBFLOW_DESIGN",
    "extension_registry.json",
    "Extension Request",
    "parent_work_item_id",
    "return_state"
  )

  AssertFileContains "docs/design/specforge-v1.2-acceptance-matrix.md" @(
    "SF_V12_ACCEPTANCE_MATRIX",
    "PSA-P1",
    "WG-N3",
    "EXT-N2",
    "REG-9"
  )

  AssertFileContains "docs/design/specforge-v1.2-first-development-slice.md" @(
    "SF_V12_FIRST_DEVELOPMENT_SLICE",
    "Project Spec Store",
    "Candidate Merge Contract",
    "no_spec_impact.json",
    "v1.2-project-spec-store-slice-complete"
  )

  Push-Location (Join-Path $Repo "packages\daemon-core")
  try {
    & bun run test -- tests/v11-final-governance-regression.test.ts
    if ($LASTEXITCODE -ne 0) {
      Fail "v1.1 final governance regression failed." "Do not freeze v1.2 design until v1.1 baseline passes."
    }
  }
  finally {
    Pop-Location
  }

  & bun run build
  if ($LASTEXITCODE -ne 0) {
    Fail "workspace build failed." "Fix build before committing design freeze."
  }

  $Report = @"
# SpecForge v1.2 Design Freeze Report

## Result

PASSED

## Scope

- Design Freeze Roadmap
- Project Spec Architecture
- Write Guard Control Plane
- Extension Subflow
- Acceptance Matrix
- First Development Slice

## Baseline

- v1.1-stable tag exists
- v1.1 final governance regression passed
- workspace build passed

## Conclusion

v1.2 design is frozen enough to start the first development slice: Project Spec Store + Candidate Merge Contract.
"@
  WriteUtf8 (Join-Path $Repo "docs\reports\specforge-v1.2-design-freeze-report.md") $Report

  Write-Host "RESULT: V12_DESIGN_FREEZE_VERIFIED"
  Write-Host "CAUSE: v1.2 design freeze docs exist, required rule content is present, v1.1 regression passed, and build passed."
  Write-Host "NEXT ACTION: commit, push, merge to main, then start v1.2 first development slice."
}
finally {
  Pop-Location
}
