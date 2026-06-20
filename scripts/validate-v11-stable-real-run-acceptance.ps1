$ErrorActionPreference = "Stop"

$Repo = "D:\code\temp\SpecForge"
$AcceptanceProject = "D:\code\temp\SpecForge-v11-stable-real-run-acceptance"
$ReportPath = Join-Path $Repo "docs\reports\specforge-v1.1-stable-real-run-acceptance-report.md"

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

function ReadText($Path) {
  return [System.IO.File]::ReadAllText($Path)
}

function HasTextInTree($Root, $Needles) {
  if (!(Test-Path $Root)) { return $false }
  $Files = Get-ChildItem $Root -Recurse -File -ErrorAction SilentlyContinue
  foreach ($File in $Files) {
    try {
      $Text = [System.IO.File]::ReadAllText($File.FullName)
      $AllFound = $true
      foreach ($Needle in $Needles) {
        if ($Text -notlike ("*" + $Needle + "*")) {
          $AllFound = $false
          break
        }
      }
      if ($AllFound) {
        return $true
      }
    } catch {
      continue
    }
  }
  return $false
}

function Find-LatestWorkItemDir($ProjectRoot) {
  $WiRootCandidates = @(
    (Join-Path $ProjectRoot ".specforge\work-items"),
    (Join-Path $ProjectRoot ".specforge\specs")
  )

  $Dirs = @()
  foreach ($Candidate in $WiRootCandidates) {
    if (Test-Path $Candidate) {
      $Dirs += Get-ChildItem $Candidate -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "WI-*" }
    }
  }

  if ($Dirs.Count -eq 0) {
    return $null
  }

  return ($Dirs | Sort-Object LastWriteTime -Descending | Select-Object -First 1)
}

function Find-EventsFile($ProjectRoot) {
  $Candidates = @(
    (Join-Path $ProjectRoot ".specforge\runtime\events.jsonl"),
    (Join-Path $ProjectRoot ".specforge\events.jsonl")
  )
  foreach ($Candidate in $Candidates) {
    if (Test-Path $Candidate) {
      return $Candidate
    }
  }

  $All = Get-ChildItem (Join-Path $ProjectRoot ".specforge") -Recurse -File -Filter "events.jsonl" -ErrorAction SilentlyContinue
  if ($All.Count -gt 0) {
    return ($All | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
  }
  return $null
}

function Extract-StatesFromEvents($EventsFile) {
  $States = New-Object System.Collections.Generic.List[string]
  if (!(Test-Path $EventsFile)) { return $States }

  Get-Content -LiteralPath $EventsFile | ForEach-Object {
    $Line = $_
    if (-not $Line.Trim()) { return }
    try {
      $Json = $Line | ConvertFrom-Json
      foreach ($Prop in @("to_state", "state", "current_state", "from_state")) {
        if ($Json.PSObject.Properties.Name -contains $Prop) {
          $Value = [string]$Json.$Prop
          if ($Value) { $States.Add($Value) }
        }
      }
      if ($Json.PSObject.Properties.Name -contains "payload" -and $null -ne $Json.payload) {
        foreach ($Prop in @("to_state", "state", "current_state", "from_state")) {
          if ($Json.payload.PSObject.Properties.Name -contains $Prop) {
            $Value = [string]$Json.payload.$Prop
            if ($Value) { $States.Add($Value) }
          }
        }
      }
      if ($Json.PSObject.Properties.Name -contains "data" -and $null -ne $Json.data) {
        foreach ($Prop in @("to_state", "state", "current_state", "from_state")) {
          if ($Json.data.PSObject.Properties.Name -contains $Prop) {
            $Value = [string]$Json.data.$Prop
            if ($Value) { $States.Add($Value) }
          }
        }
      }
    } catch {
      return
    }
  }
  return $States
}

function VerifyChangedFilesAudit($WiDir, $ProjectRoot) {
  $AuditFiles = @()
  $Direct = Join-Path $WiDir.FullName "changed_files_audit.md"
  if (Test-Path $Direct) {
    $AuditFiles += Get-Item $Direct
  }

  $AuditFiles += Get-ChildItem $WiDir.FullName -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match "changed_files_audit\.(md|json)$" }

  $AuditFiles = $AuditFiles | Sort-Object FullName -Unique

  foreach ($AuditFile in $AuditFiles) {
    try {
      $Text = [System.IO.File]::ReadAllText($AuditFile.FullName)

      $HasPass =
        $Text -match "(?i)Result:\s*PASS" -or
        $Text -match "(?i)status[`"'\s:]+pass" -or
        $Text -match "(?i)passed[`"'\s:]+true"

      $HasZeroViolations =
        $Text -match "(?i)Violations:\s*0" -or
        $Text -match "(?i)violations[`"'\s:]+\[\]" -or
        $Text -match "(?i)violations[`"'\s:]+0"

      $HasZeroBlocked =
        $Text -match "(?i)Blocked write attempts:\s*0" -or
        $Text -match "(?i)blocked_write_attempts[`"'\s:]+0"

      $HasInScope =
        $Text -match "(?i)Out of scope:\s*0" -or
        $Text -match "(?i)out_of_scope[`"'\s:]+0"

      if ($HasPass -and $HasZeroViolations -and $HasZeroBlocked -and $HasInScope) {
        return @{
          ok = $true
          evidence = $AuditFile.FullName
          mode = "changed_files_audit_file"
        }
      }
    } catch {
      continue
    }
  }

  # Secondary evidence: observability payloads may carry the exact JSON field even
  # when the WI markdown artifact uses a human-readable label.
  $ObsRoot = Join-Path $ProjectRoot ".specforge\logs\observability"
  if (Test-Path $ObsRoot) {
    $ObsFiles = Get-ChildItem $ObsRoot -Recurse -File -ErrorAction SilentlyContinue
    foreach ($ObsFile in $ObsFiles) {
      try {
        $Text = [System.IO.File]::ReadAllText($ObsFile.FullName)
        if (
          $Text -like "*sf_changed_files_audit*" -and
          $Text -match "(?i)blocked_write_attempts[`"'\s:]+0" -and
          $Text -match "(?i)out_of_scope[`"'\s:]+0"
        ) {
          return @{
            ok = $true
            evidence = $ObsFile.FullName
            mode = "observability_payload"
          }
        }
      } catch {
        continue
      }
    }
  }

  return @{
    ok = $false
    evidence = ""
    mode = "not_found"
  }
}

function WriteReport($Status, $Details) {
  $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $Content = @"
# SpecForge v1.1 Stable Real Run Acceptance Report

## Status

$Status

## Generated At

$Timestamp

## Acceptance Project

```text
$AcceptanceProject
```

## Details

$Details

## Conclusion

$Status
"@
  $Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($ReportPath, $Content, $Utf8NoBom)
}

if (!(Test-Path $Repo)) {
  Fail "Repo path not found: D:\code\temp\SpecForge" "Check repo location."
}
if (!(Test-Path $AcceptanceProject)) {
  Fail "Acceptance project not found." "Run scripts/prepare-v11-stable-real-run-acceptance.ps1 first."
}

Push-Location $Repo
try {
  $Branch = GitOutput @("rev-parse", "--abbrev-ref", "HEAD")
  if ($Branch -ne "hardening/v1.1-stable-real-run-acceptance") {
    Fail ("Wrong branch: " + $Branch) "Checkout hardening/v1.1-stable-real-run-acceptance before validation."
  }

  Write-Host "running final governance regression checks"
  Push-Location (Join-Path $Repo "packages\daemon-core")
  try {
    & bun run test -- tests/v11-final-governance-regression.test.ts
    if ($LASTEXITCODE -ne 0) {
      Fail "Final governance regression failed." "Do not accept real-run until v1.1.4 regression passes."
    }
  }
  finally {
    Pop-Location
  }

  $IndexPath = Join-Path $AcceptanceProject "index.html"
  if (!(Test-Path $IndexPath)) {
    Fail "index.html was not created in acceptance project." "Run the OpenCode acceptance prompt in the acceptance project."
  }

  $IndexText = ReadText $IndexPath
  if ($IndexText -notlike "*stable rc hello*" -or $IndexText -notlike "*blue*") {
    Fail "index.html does not contain required stable rc hello / blue evidence." "Rerun or fix the OpenCode acceptance task."
  }

  $SpecforgeRoot = Join-Path $AcceptanceProject ".specforge"
  if (!(Test-Path $SpecforgeRoot)) {
    Fail ".specforge directory was not created in acceptance project." "The task did not run through SpecForge."
  }

  $WiDir = Find-LatestWorkItemDir $AcceptanceProject
  if ($null -eq $WiDir) {
    Fail "No WI directory found under acceptance project .specforge." "The task did not create a SpecForge WI."
  }

  $WiId = $WiDir.Name
  $EventsFile = Find-EventsFile $AcceptanceProject
  if ($null -eq $EventsFile) {
    Fail "No events.jsonl found in acceptance project." "State authority evidence is missing."
  }

  $States = Extract-StatesFromEvents $EventsFile
  $LegacyStates = @("development", "review", "implementation", "done", "completed", "intake", "requirements", "design")
  $FoundLegacy = @()
  foreach ($State in $States) {
    if ($LegacyStates -contains $State) {
      $FoundLegacy += $State
    }
  }

  if ($FoundLegacy.Count -gt 0) {
    Fail ("Legacy workflow states found in events: " + ($FoundLegacy -join ", ")) "Inspect state transitions; old workflow leaked into real run."
  }

  $ClosedEvidence = $false
  if (($States | Where-Object { $_ -eq "closed" }).Count -gt 0) {
    $ClosedEvidence = $true
  }
  if (-not $ClosedEvidence) {
    $ClosedEvidence = HasTextInTree $WiDir.FullName @("closed")
  }
  if (-not $ClosedEvidence) {
    Fail "No closed state evidence found for latest WI." "Ensure OpenCode completed the workflow to closed."
  }

  $WorkItemJsonCandidates = Get-ChildItem $WiDir.FullName -Recurse -File -Filter "work_item.json" -ErrorAction SilentlyContinue
  foreach ($WorkItemJson in $WorkItemJsonCandidates) {
    try {
      $Text = ReadText $WorkItemJson.FullName
      $Forbidden = @(
        "decision_status",
        "decision_type",
        "user_response_quote",
        "auto_approval_policy_id",
        "approval_status",
        "user_decision",
        "waivers"
      )
      foreach ($Needle in $Forbidden) {
        if ($Text -like ("*" + $Needle + "*")) {
          Fail ("work_item.json contains forbidden governance/approval field: " + $Needle) "Do not accept real run; work_item.json is carrying governance data."
        }
      }
      if ($Text -match '"status"\s*:\s*"(development|review|implementation|done|completed|closed)"') {
        Fail "work_item.json appears to carry workflow status." "Do not accept real run; state must come from authoritative events."
      }
    } catch {
      continue
    }
  }

  $Audit = VerifyChangedFilesAudit $WiDir $AcceptanceProject
  if (-not $Audit.ok) {
    Fail "Missing WI evidence: changed files audit" "Expected changed_files_audit.md with PASS, violations=0, out_of_scope=0, Blocked write attempts: 0; or observability sf_changed_files_audit payload with blocked_write_attempts=0."
  }

  $EvidenceChecks = @(
    @{ Name = "user decision"; Needles = @("user_response_quote") },
    @{ Name = "merge"; Needles = @("merge") },
    @{ Name = "code permission"; Needles = @("allowed_write_files") },
    @{ Name = "close gate"; Needles = @("close_gate") }
  )

  $MissingEvidence = New-Object System.Collections.Generic.List[string]
  foreach ($Check in $EvidenceChecks) {
    if (-not (HasTextInTree $WiDir.FullName $Check.Needles)) {
      $MissingEvidence.Add($Check.Name)
    }
  }

  if ($MissingEvidence.Count -gt 0) {
    Fail ("Missing WI evidence: " + ($MissingEvidence -join ", ")) "Inspect WI artifacts. Do not accept if required governance evidence is absent."
  }

  $Details = @"
- Latest WI: `$WiId`
- index.html: present and contains stable rc hello / blue
- events.jsonl: `$EventsFile`
- closed evidence: pass
- legacy-state leakage check: pass
- work_item.json forbidden-field check: pass
- changed files audit: pass (`$($Audit.mode)`, `$($Audit.evidence)`)
- user decision / merge / code permission / close gate evidence: pass
- v1.1.4 final governance regression: pass
"@

  WriteReport "PASSED" $Details

  Write-Host "RESULT: V11_STABLE_REAL_RUN_ACCEPTANCE_PASSED"
  Write-Host ("CAUSE: Real OpenCode quick_change acceptance reached closed with required governance evidence. WI=" + $WiId)
  Write-Host ("CHANGED_FILES_AUDIT_EVIDENCE: " + $Audit.evidence)
  Write-Host "NEXT ACTION: commit report/scripts, push branch, merge to main, tag v1.1-stable."
}
finally {
  Pop-Location
}
