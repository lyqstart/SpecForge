$ErrorActionPreference = "Stop"

$Repo = "D:\code\temp\SpecForge"
$SetupRoot = Join-Path $Repo "setup\userlevel-opencode"
$RepoTemplatesRoot = Join-Path $Repo "templates"

function Fail($Cause, $Next) {
  Write-Host "RESULT: FAILED"
  Write-Host ("CAUSE: " + $Cause)
  Write-Host ("NEXT ACTION: " + $Next)
  exit 1
}

function Get-Sha256($Path) {
  $FullPath = [System.IO.Path]::GetFullPath($Path)
  $Stream = [System.IO.File]::OpenRead($FullPath)
  try {
    $Sha = [System.Security.Cryptography.SHA256]::Create()
    try {
      $Bytes = $Sha.ComputeHash($Stream)
      return (($Bytes | ForEach-Object { $_.ToString("x2") }) -join "")
    } finally {
      $Sha.Dispose()
    }
  } finally {
    $Stream.Dispose()
  }
}

function Get-RelativePathCompat($Base, $Path) {
  $BaseFull = [System.IO.Path]::GetFullPath($Base)
  $PathFull = [System.IO.Path]::GetFullPath($Path)
  if (-not $BaseFull.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
    $BaseFull = $BaseFull + [System.IO.Path]::DirectorySeparatorChar
  }
  $BaseUri = New-Object System.Uri($BaseFull)
  $PathUri = New-Object System.Uri($PathFull)
  $RelativeUri = $BaseUri.MakeRelativeUri($PathUri)
  $Relative = [System.Uri]::UnescapeDataString($RelativeUri.ToString())
  return $Relative.Replace("/", "\").Replace("\", "/")
}

function Resolve-LiveRoot {
  if ($env:XDG_CONFIG_HOME -and (Test-Path $env:XDG_CONFIG_HOME)) {
    return (Join-Path $env:XDG_CONFIG_HOME "opencode")
  }
  return (Join-Path $env:USERPROFILE ".config\opencode")
}

function IsDeployableSharedSourceFile($FilePath) {
  $Name = [System.IO.Path]::GetFileName($FilePath)
  if ($Name -like "*.bak") { return $false }
  if ($Name -like "*.tmp") { return $false }
  if ($Name -match "\.v\d+\.bak$") { return $false }
  return $true
}

if (!(Test-Path $Repo)) { Fail "Repo path not found: D:\code\temp\SpecForge" "Check repo path." }
if (!(Test-Path $SetupRoot)) { Fail "setup/userlevel-opencode not found." "Check repo checkout." }

$LiveRoot = Resolve-LiveRoot
if (!(Test-Path $LiveRoot)) {
  Fail ("Live OpenCode userlevel directory not found: " + $LiveRoot) "Run bun scripts/sf-installer.ts upgrade --force first."
}

# Shared userlevel components are deployed directly below the OpenCode userlevel root.
# Exclude local backup artifacts such as *.bak; these are not manifest/deployment sources.
$ComponentRoots = @( "plugins", "agents", "tools", "skills" )
$SourceFiles = New-Object System.Collections.Generic.List[string]
foreach ($Root in $ComponentRoots) {
  $Dir = Join-Path $SetupRoot $Root
  if (Test-Path $Dir) {
    Get-ChildItem $Dir -Recurse -File -Force | ForEach-Object {
      if (IsDeployableSharedSourceFile $_.FullName) { $SourceFiles.Add($_.FullName) }
    }
  }
}

$RootAgent = Join-Path $SetupRoot "AGENTS.md"
if (Test-Path $RootAgent) { $SourceFiles.Add($RootAgent) }

if ($SourceFiles.Count -eq 0) {
  Fail "No shared component source files found under setup/userlevel-opencode." "Check setup source layout."
}

$Missing = New-Object System.Collections.Generic.List[string]
$Mismatch = New-Object System.Collections.Generic.List[string]
$Checked = 0
foreach ($Source in $SourceFiles) {
  $Rel = Get-RelativePathCompat $SetupRoot $Source
  $Dest = Join-Path $LiveRoot ($Rel -replace "/", "\")
  if (!(Test-Path $Dest)) {
    $Missing.Add($Rel)
    continue
  }
  $SrcHash = Get-Sha256 $Source
  $DestHash = Get-Sha256 $Dest
  if ($SrcHash -ne $DestHash) {
    $Mismatch.Add($Rel)
    continue
  }
  $Checked += 1
}

# Verify repository template library deployment separately.
# Use -Force so hidden folders such as .specforge are included.
$TemplateMissing = New-Object System.Collections.Generic.List[string]
$TemplateMismatch = New-Object System.Collections.Generic.List[string]
$TemplateChecked = 0
$LiveTemplatesRoot = Join-Path $LiveRoot "sf-user\templates"
if (Test-Path $RepoTemplatesRoot) {
  Get-ChildItem $RepoTemplatesRoot -Recurse -File -Force | ForEach-Object {
    $Rel = Get-RelativePathCompat $RepoTemplatesRoot $_.FullName
    $Dest = Join-Path $LiveTemplatesRoot ($Rel -replace "/", "\")
    if (!(Test-Path $Dest)) {
      $TemplateMissing.Add($Rel)
      return
    }
    $SrcHash = Get-Sha256 $_.FullName
    $DestHash = Get-Sha256 $Dest
    if ($SrcHash -ne $DestHash) {
      $TemplateMismatch.Add($Rel)
      return
    }
    $TemplateChecked += 1
  }
}

Write-Host ("live_root: " + $LiveRoot)
Write-Host ("shared_source_files: " + $SourceFiles.Count)
Write-Host ("shared_matched_files: " + $Checked)
Write-Host ("shared_missing_files: " + $Missing.Count)
Write-Host ("shared_mismatch_files: " + $Mismatch.Count)
Write-Host ("template_live_root: " + $LiveTemplatesRoot)
Write-Host ("template_matched_files: " + $TemplateChecked)
Write-Host ("template_missing_files: " + $TemplateMissing.Count)
Write-Host ("template_mismatch_files: " + $TemplateMismatch.Count)

if ($Missing.Count -gt 0) {
  Write-Host "shared missing:"
  $Missing | Select-Object -First 50 | ForEach-Object { Write-Host (" " + $_) }
}
if ($Mismatch.Count -gt 0) {
  Write-Host "shared mismatch:"
  $Mismatch | Select-Object -First 50 | ForEach-Object { Write-Host (" " + $_) }
}
if ($TemplateMissing.Count -gt 0) {
  Write-Host "template missing:"
  $TemplateMissing | Select-Object -First 50 | ForEach-Object { Write-Host (" " + $_) }
}
if ($TemplateMismatch.Count -gt 0) {
  Write-Host "template mismatch:"
  $TemplateMismatch | Select-Object -First 50 | ForEach-Object { Write-Host (" " + $_) }
}

if (
  $Missing.Count -gt 0 -or
  $Mismatch.Count -gt 0 -or
  $TemplateMissing.Count -gt 0 -or
  $TemplateMismatch.Count -gt 0
) {
  Fail "Live userlevel directory is not byte-for-byte aligned with setup/shared components and template library." "Run installer upgrade, template sync, cleanup legacy components, then rerun this script."
}

Write-Host "RESULT: USERLEVEL_LIVE_CONSISTENCY_PASSED"
Write-Host "CAUSE: Shared setup components and repository template library match live OpenCode userlevel deployment by SHA256. Backup artifacts are excluded from deployment-source checks."
Write-Host "NEXT ACTION: continue release closure."
