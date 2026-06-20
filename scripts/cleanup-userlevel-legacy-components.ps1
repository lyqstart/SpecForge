$ErrorActionPreference = "Stop"

$Repo = "D:\code\temp\SpecForge"
$SetupRoot = Join-Path $Repo "setup\userlevel-opencode"

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

if (!(Test-Path $SetupRoot)) {
  Fail "setup/userlevel-opencode not found." "Check repo checkout."
}

$LiveRoot = Resolve-LiveRoot
$LiveSkills = Join-Path $LiveRoot "skills"
$SetupSkills = Join-Path $SetupRoot "skills"

if (!(Test-Path $LiveSkills)) {
  Write-Host "RESULT: USERLEVEL_LEGACY_CLEANUP_SKIPPED"
  Write-Host "CAUSE: live skills directory does not exist."
  Write-Host "NEXT ACTION: continue."
  exit 0
}

$ExpectedSkillDirs = New-Object 'System.Collections.Generic.HashSet[string]'
if (Test-Path $SetupSkills) {
  Get-ChildItem $SetupSkills -Directory | ForEach-Object {
    [void]$ExpectedSkillDirs.Add($_.Name)
  }
}

$Removed = New-Object System.Collections.Generic.List[string]
$Candidates = Get-ChildItem $LiveSkills -Directory | Where-Object {
  $_.Name -like "sf-skill-*" -and -not $ExpectedSkillDirs.Contains($_.Name)
}

foreach ($Candidate in $Candidates) {
  $Rel = "skills/" + $Candidate.Name
  Remove-Item -LiteralPath $Candidate.FullName -Recurse -Force
  $Removed.Add($Rel)
}

Write-Host ("legacy_unmanaged_removed: " + $Removed.Count)
foreach ($Item in $Removed) {
  Write-Host ("  removed: " + $Item)
}

Write-Host "RESULT: USERLEVEL_LEGACY_CLEANUP_PASSED"
Write-Host "CAUSE: Removed unmanaged legacy sf-skill-* directories that are not present in setup/userlevel-opencode/skills."
Write-Host "NEXT ACTION: continue installer verify."
