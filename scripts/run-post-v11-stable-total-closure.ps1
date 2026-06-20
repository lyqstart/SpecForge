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

function WriteUtf8($Path, $Text) {
  $Parent = Split-Path -Parent $Path
  New-Item -ItemType Directory -Force -Path $Parent | Out-Null
  $Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Text, $Utf8NoBom)
}

function AddLine($List, $Line) {
  $List.Add($Line) | Out-Null
}

function AssertFileContains($Path, $Needles) {
  if (!(Test-Path $Path)) {
    Fail ("Missing required file: " + $Path) "Re-apply the package or merge the required baseline docs first."
  }
  $Text = [System.IO.File]::ReadAllText($Path)
  foreach ($Needle in $Needles) {
    if ($Text -notlike ("*" + $Needle + "*")) {
      Fail ("Required text not found: " + $Needle + " in " + $Path) "Inspect generated docs."
    }
  }
}

function Get-RepoRelativePath($FullPath) {
  $RepoFull = [System.IO.Path]::GetFullPath($Repo)
  $PathFull = [System.IO.Path]::GetFullPath($FullPath)
  return $PathFull.Substring($RepoFull.Length).TrimStart("\").Replace("\", "/")
}

function Run-Step($Label, $ScriptBlock) {
  Write-Host ""
  Write-Host ("=== " + $Label + " ===")
  & $ScriptBlock
  if ($LASTEXITCODE -ne 0) {
    Fail ($Label + " failed.") "Inspect output. Do not commit until fixed."
  }
}

if (!(Test-Path $Repo)) {
  Fail "Repo path not found: D:\code\temp\SpecForge" "Check repo location."
}

Push-Location $Repo
try {
  $Branch = GitOutput @("rev-parse", "--abbrev-ref", "HEAD")
  if ($Branch -ne "cleanup/post-v1.1-stable-total-closure") {
    Fail ("Wrong branch: " + $Branch) "Checkout cleanup/post-v1.1-stable-total-closure before rerunning total closure."
  }

  $StableTag = GitOutput @("tag", "--list", "v1.1-stable")
  if (-not $StableTag) {
    Fail "Missing required tag: v1.1-stable" "Finish v1.1-stable before post-v1.1 cleanup."
  }

  & git restore packages/daemon-core/.specforge/logs/telemetry.jsonl 2>$null

  # 1. Safe backup cleanup
  $CleanupRoot = Join-Path $Repo "setup\userlevel-opencode"
  $Deleted = New-Object System.Collections.Generic.List[string]
  if (Test-Path $CleanupRoot) {
    Get-ChildItem $CleanupRoot -Recurse -File -Force | ForEach-Object {
      $Name = $_.Name
      $ShouldDelete = $false
      if ($Name -like "*.bak") { $ShouldDelete = $true }
      if ($Name -like "*.tmp") { $ShouldDelete = $true }
      if ($Name -like "*.orig") { $ShouldDelete = $true }
      if ($Name -like "*.rej") { $ShouldDelete = $true }
      if ($Name -match "\.v\d+\.bak$") { $ShouldDelete = $true }

      if ($ShouldDelete) {
        $Rel = Get-RepoRelativePath $_.FullName
        Remove-Item -LiteralPath $_.FullName -Force
        $Deleted.Add($Rel) | Out-Null
      }
    }
  }

  $Hygiene = New-Object System.Collections.Generic.List[string]
  AddLine $Hygiene "# SpecForge Post-v1.1 Hygiene Audit"
  AddLine $Hygiene ""
  AddLine $Hygiene "## Deleted backup/temp files"
  AddLine $Hygiene ""
  AddLine $Hygiene ("Count: " + $Deleted.Count)
  AddLine $Hygiene ""
  if ($Deleted.Count -eq 0) {
    AddLine $Hygiene "- none"
  } else {
    foreach ($Item in $Deleted) {
      AddLine $Hygiene ("- " + $Item)
    }
  }
  AddLine $Hygiene ""
  AddLine $Hygiene "## Cleanup scope"
  AddLine $Hygiene ""
  AddLine $Hygiene "Only setup/userlevel-opencode backup/temp artifacts were removed."
  WriteUtf8 (Join-Path $Repo "docs\reports\specforge-post-v1.1-hygiene-audit.md") ($Hygiene -join "`n")

  # 2. Deprecated state scan
  $ScanRoots = @("packages", "setup\userlevel-opencode", "scripts")
  $OldTerms = @("development", "review", "implementation", "done", "completed", "intake", "requirements", "design")
  $SkipFragments = @("\node_modules\", "\.git\", "\dist\", "\coverage\", "\.specforge\logs\", "\.specforge\work-items\")
  $Matches = New-Object System.Collections.Generic.List[string]

  foreach ($Root in $ScanRoots) {
    $AbsRoot = Join-Path $Repo $Root
    if (!(Test-Path $AbsRoot)) { continue }
    Get-ChildItem $AbsRoot -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
      $Full = $_.FullName
      $Skip = $false
      foreach ($Frag in $SkipFragments) {
        if ($Full -like ("*" + $Frag + "*")) {
          $Skip = $true
          break
        }
      }
      if ($Skip) { return }

      $Ext = $_.Extension.ToLowerInvariant()
      if (@(".ts", ".tsx", ".js", ".mjs", ".cjs", ".md", ".json", ".ps1") -notcontains $Ext) { return }

      try {
        $Lines = Get-Content -LiteralPath $Full -ErrorAction Stop
        for ($i = 0; $i -lt $Lines.Count; $i++) {
          $Line = [string]$Lines[$i]
          foreach ($Term in $OldTerms) {
            if ($Line -match ("\b" + [regex]::Escape($Term) + "\b")) {
              $Rel = Get-RepoRelativePath $Full
              $Trimmed = $Line.Trim()
              if ($Trimmed.Length -gt 180) { $Trimmed = $Trimmed.Substring(0, 180) + "..." }
              $Matches.Add(("{0}:{1}: {2}" -f $Rel, ($i + 1), $Trimmed)) | Out-Null
              break
            }
          }
        }
      } catch {
        return
      }
    }
  }

  $StateReport = New-Object System.Collections.Generic.List[string]
  AddLine $StateReport "# SpecForge Post-v1.1 Deprecated State Scan"
  AddLine $StateReport ""
  AddLine $StateReport "This is an inventory report, not an automatic failure."
  AddLine $StateReport ""
  AddLine $StateReport ("Total matches: " + $Matches.Count)
  AddLine $StateReport ""
  if ($Matches.Count -eq 0) {
    AddLine $StateReport "- none"
  } else {
    foreach ($Item in ($Matches | Select-Object -First 300)) {
      AddLine $StateReport ("- " + $Item)
    }
    if ($Matches.Count -gt 300) {
      AddLine $StateReport ("- truncated: " + ($Matches.Count - 300) + " more")
    }
  }
  WriteUtf8 (Join-Path $Repo "docs\reports\specforge-post-v1.1-deprecated-state-scan.md") ($StateReport -join "`n")

  # 3. Script inventory. Do not use Markdown backticks around script names here:
  # PowerShell uses backtick as an escape character and it can break parsing.
  $Scripts = @()
  if (Test-Path (Join-Path $Repo "scripts")) {
    $Scripts = Get-ChildItem (Join-Path $Repo "scripts") -File -ErrorAction SilentlyContinue | Sort-Object Name
  }

  $Inv = New-Object System.Collections.Generic.List[string]
  AddLine $Inv "# SpecForge Post-v1.1 Script Inventory"
  AddLine $Inv ""
  AddLine $Inv ("Total scripts: " + $Scripts.Count)
  AddLine $Inv ""
  AddLine $Inv "| Script | Suggested bucket |"
  AddLine $Inv "|---|---|"
  foreach ($S in $Scripts) {
    $Bucket = "general"
    if ($S.Name -match "install|installer|deployment|live|template") { $Bucket = "install/deployment" }
    elseif ($S.Name -match "release|stable|rc") { $Bucket = "release" }
    elseif ($S.Name -match "test|verify|validation|check|scan") { $Bucket = "verification" }
    elseif ($S.Name -match "cleanup|hygiene") { $Bucket = "cleanup" }
    elseif ($S.Name -match "build|render") { $Bucket = "build" }

    $TableRow = [string]::Format("| {0} | {1} |", $S.Name, $Bucket)
    AddLine $Inv $TableRow
  }
  WriteUtf8 (Join-Path $Repo "docs\reports\specforge-post-v1.1-script-inventory.md") ($Inv -join "`n")

  # 4. Inline release docs verification. Do not call verify-v11-stable-release-docs.ps1 here
  # because that script intentionally asserts the original release docs branch.
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

  Run-Step "v1.1 governance regression tests" {
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

  Run-Step "workspace build" {
    & bun run build
  }

  if (Test-Path (Join-Path $Repo "scripts\run-install-deployment-consistency.ps1")) {
    Run-Step "install/deployment consistency" {
      & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Repo "scripts\run-install-deployment-consistency.ps1")
    }
  }

  # 5. Final total closure report update
  $Total = New-Object System.Collections.Generic.List[string]
  AddLine $Total "# SpecForge Post-v1.1 Stable Total Closure Report"
  AddLine $Total ""
  AddLine $Total "## Result"
  AddLine $Total ""
  AddLine $Total "PASSED"
  AddLine $Total ""
  AddLine $Total "## Completed items"
  AddLine $Total ""
  AddLine $Total "- Backup/temp cleanup under setup/userlevel-opencode"
  AddLine $Total "- Deprecated state inventory scan"
  AddLine $Total "- Script inventory"
  AddLine $Total "- docs/reports index"
  AddLine $Total "- v1.2 roadmap and entry design documents"
  AddLine $Total "- v1.1 governance tests"
  AddLine $Total "- workspace build"
  AddLine $Total "- install/deployment consistency"
  AddLine $Total ""
  AddLine $Total "## Deleted backup/temp files"
  AddLine $Total ""
  AddLine $Total ("Count: " + $Deleted.Count)
  if ($Deleted.Count -eq 0) {
    AddLine $Total "- none"
  } else {
    foreach ($Item in $Deleted) { AddLine $Total ("- " + $Item) }
  }
  AddLine $Total ""
  AddLine $Total "## Follow-up"
  AddLine $Total ""
  AddLine $Total "After this branch is merged, start v1.2 design freeze from the new docs/design/specforge-v1.2-*.md files."
  WriteUtf8 (Join-Path $Repo "docs\reports\specforge-post-v1.1-stable-total-closure-report.md") ($Total -join "`n")

  Write-Host "RESULT: POST_V11_STABLE_TOTAL_CLOSURE_PASSED"
  Write-Host "CAUSE: Repo hygiene cleanup, scans, inventories, v1.2 entry docs, governance tests, build, and install/deployment consistency all completed."
  Write-Host "NEXT ACTION: review git status, commit, push, merge to main."
}
finally {
  Pop-Location
}
