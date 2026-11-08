param([Parameter(Mandatory=$true)][string]$Label)
$ErrorActionPreference='Stop'
if($Label -notmatch '^ci-[a-z0-9-]+$'){throw 'INVALID_LABEL'}
$archiveRoot=[IO.Path]::GetFullPath($PSScriptRoot)
$source=Join-Path $archiveRoot $Label
$target=Join-Path $source 'report'
if(Test-Path -LiteralPath $target){throw 'DESTINATION_EXISTS'}
[IO.Directory]::CreateDirectory($target) | Out-Null
$zip=[IO.Compression.ZipFile]::OpenRead((Join-Path $source 'artifact.zip'))
try{
  $total=0L
  foreach($entry in $zip.Entries){
    if($entry.FullName -notmatch '^[A-Za-z0-9_.-]+$' -or $entry.Length -gt 16MB -or (($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000){throw 'UNSAFE_ZIP_MEMBER'}
    $total+=$entry.Length;if($total -gt 32MB){throw 'ZIP_BUDGET_EXCEEDED'}
    $stream=$entry.Open();$output=[IO.File]::Open((Join-Path $target $entry.FullName),[IO.FileMode]::CreateNew)
    try{$stream.CopyTo($output)}finally{$output.Dispose();$stream.Dispose()}
  }
}finally{$zip.Dispose()}
$result=Get-Content -LiteralPath (Join-Path $target 'result.json') -Raw | ConvertFrom-Json
if($result.inner_exit_code -ne 0 -or $result.failure -ne $null -or $result.checks.help_cases -ne 23){throw 'ACTUAL_PLATFORM_RESULT_FAILED'}
[pscustomobject]@{label=$Label;platform=$result.platform;architecture=$result.architecture;exit=$result.inner_exit_code;checks=$result.checks} | ConvertTo-Json -Depth 8
