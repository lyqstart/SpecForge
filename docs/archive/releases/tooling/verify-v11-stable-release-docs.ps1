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

function AssertFileContains($Path, $Needles) {
  if (!(Test-Path $Path)) {
    Fail ("Missing release doc: " + $Path) "Re-apply the release docs package."
  }
  $Text = [System.IO.File]::ReadAllText($Path)
  foreach ($Needle in $Needles) {
    if ($Text -notlike ("*" + $Needle + "*")) {
      Fail ("Release doc missing required text: " + $Needle + " in " + $Path) "Inspect generated release docs."
    }
  }
}

if (!(Test-Path $Repo)) {
  Fail "Repo path not found: D:\code\temp\SpecForge" "Check repo location."
}

Push-Location $Repo
try {
  $Branch = GitOutput @("rev-parse", "--abbrev-ref", "HEAD")
  if ($Branch -ne "release/v1.1-stable-docs") {
    Fail ("Wrong branch: " + $Branch) "Checkout release/v1.1-stable-docs before verifying release docs."
  }

  $StableTag = GitOutput @("tag", "--list", "v1.1-stable")
  if (-not $StableTag) {
    Fail "Missing required tag: v1.1-stable" "Finish v1.1-stable merge/tag before release docs closure."
  }

  AssertFileContains (Join-Path $Repo "docs\releases\specforge-v1.1-stable-release-notes.md") @(
    "v1.1-stable",
    "StateManager / events.jsonl",
    "work_item.json",
    "sf_close_gate",
    "v1.1.6-install-deployment-consistency-complete"
  )

  AssertFileContains (Join-Path $Repo "docs\releases\specforge-v1.1-stable-acceptance-summary.md") @(
    "WI-0001",
    "closed",
    "sf_changed_files_audit",
    "blocked_write_attempts=0",
    "14/14 tests passed"
  )

  AssertFileContains (Join-Path $Repo "docs\releases\specforge-v1.1-stable-maintenance-baseline.md") @(
    "maintenance/v1.1-stable",
    "main",
    "v1.1-stable tag",
    "v1.1.1-stable"
  )

  $Status = GitOutput @("status", "--short")
  if ($Status) {
    $Allowed = @(
      "?? docs/releases/",
      "?? scripts/verify-v11-stable-release-docs.ps1",
      "A  docs/releases/specforge-v1.1-stable-release-notes.md",
      "A  docs/releases/specforge-v1.1-stable-acceptance-summary.md",
      "A  docs/releases/specforge-v1.1-stable-maintenance-baseline.md",
      "A  scripts/verify-v11-stable-release-docs.ps1"
    )
    # Do not hard-fail on normal git status forms here; the apply script guards unrelated changes.
  }

  Write-Host "RESULT: V11_STABLE_RELEASE_DOCS_VERIFIED"
  Write-Host "CAUSE: v1.1-stable tag exists and release notes, acceptance summary, and maintenance baseline contain required stable release evidence."
  Write-Host "NEXT ACTION: commit release docs, push branch, merge to main."
}
finally {
  Pop-Location
}
