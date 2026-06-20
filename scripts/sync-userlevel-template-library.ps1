$ErrorActionPreference = "Stop"

$Repo = "D:\code\temp\SpecForge"
$RepoTemplatesRoot = Join-Path $Repo "templates"

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

if (!(Test-Path $RepoTemplatesRoot)) {
  Fail "Repository templates directory not found." "Check repo/templates."
}

$LiveRoot = Resolve-LiveRoot
$LiveTemplatesRoot = Join-Path $LiveRoot "sf-user\templates"
New-Item -ItemType Directory -Force -Path $LiveTemplatesRoot | Out-Null

$Copied = 0
Get-ChildItem $RepoTemplatesRoot -Recurse -File -Force | ForEach-Object {
  $Source = $_.FullName

  $BaseFull = [System.IO.Path]::GetFullPath($RepoTemplatesRoot)
  $PathFull = [System.IO.Path]::GetFullPath($Source)
  if (-not $BaseFull.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
    $BaseFull = $BaseFull + [System.IO.Path]::DirectorySeparatorChar
  }

  $BaseUri = New-Object System.Uri($BaseFull)
  $PathUri = New-Object System.Uri($PathFull)
  $RelativeUri = $BaseUri.MakeRelativeUri($PathUri)
  $Rel = [System.Uri]::UnescapeDataString($RelativeUri.ToString()).Replace("/", "\")
  $Dest = Join-Path $LiveTemplatesRoot $Rel

  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Dest) | Out-Null
  Copy-Item -LiteralPath $Source -Destination $Dest -Force
  $Copied += 1
}

Write-Host ("template_files_synced: " + $Copied)
Write-Host ("template_live_root: " + $LiveTemplatesRoot)
Write-Host "RESULT: USERLEVEL_TEMPLATE_SYNC_PASSED"
Write-Host "CAUSE: Repository templates, including hidden .specforge templates, were synchronized to live sf-user/templates."
Write-Host "NEXT ACTION: continue SHA256 consistency check."
