param([Parameter(Mandatory=$true)][string]$Label)
$ErrorActionPreference='Stop'
if($Label -notmatch '^ci-[a-z0-9-]+$'){throw 'INVALID_LABEL'}
$archiveRoot=[IO.Path]::GetFullPath($PSScriptRoot)
$source=Join-Path $archiveRoot $Label
$target=[IO.Path]::GetFullPath((Join-Path $source 'report'))
if(-not $target.StartsWith($archiveRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'EXTRACTION_ROOT_ESCAPE'}
if(Test-Path -LiteralPath $target){throw 'DESTINATION_EXISTS'}
[IO.Directory]::CreateDirectory($target)|Out-Null
$zip=[IO.Compression.ZipFile]::OpenRead((Join-Path $source 'artifact.zip'))
$seen=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
try{
 $total=0L
 foreach($entry in $zip.Entries){
  $name=$entry.FullName.TrimEnd('/')
  if($name -notmatch '^[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*$' -or @($name.Split('/')|Where-Object {$_ -eq '..' -or $_ -eq '.'}).Count -gt 0 -or $entry.Length -gt 16MB -or (($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000 -or -not $seen.Add($name)){throw 'UNSAFE_ZIP_MEMBER'}
  $total+=$entry.Length;if($total -gt 64MB){throw 'ZIP_BUDGET_EXCEEDED'}
  $destination=[IO.Path]::GetFullPath((Join-Path $target $name))
  if(-not $destination.StartsWith($target+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'ZIP_PATH_ESCAPE'}
  if($entry.FullName.EndsWith('/')){[IO.Directory]::CreateDirectory($destination)|Out-Null;continue}
  [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination))|Out-Null
  $inputStream=$entry.Open();$output=[IO.File]::Open($destination,[IO.FileMode]::CreateNew)
  try{$inputStream.CopyTo($output)}finally{$output.Dispose();$inputStream.Dispose()}
 }
}finally{$zip.Dispose()}
[pscustomobject]@{label=$Label;entries=$seen.Count;uncompressed_bytes=$total;result='EXTRACTED_WITHOUT_EXECUTING_CONTENT'}|ConvertTo-Json -Compress
