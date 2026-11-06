$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
function ExactHash([string]$path) { $digest=[Security.Cryptography.SHA256]::Create(); try{return [BitConverter]::ToString($digest.ComputeHash([IO.File]::ReadAllBytes($path))).Replace('-','').ToLowerInvariant()}finally{$digest.Dispose()} }
$binary='D:\code\SpecForge\.tmp\verification-lpac-build\OwnedSymbolicFixtureFactory.exe'
$plan='D:\code\SpecForge\.tmp\verification-lpac-symbolic\b138f0060a5249768b420dd94a6ff798\plan.json'
if ((ExactHash $binary) -ne '98d8b28eef446c5f1f702e48188935aae896296b22d738078d7998804e8612f7') {throw 'FACTORY_BINARY_DRIFT'}
if ((ExactHash $plan) -ne '32406b5a5c46cccbe50973f223f8963516eb5c3168dd7d14b9b201105f264ffe') {throw 'PLAN_DRIFT'}
$started=[DateTime]::UtcNow.ToString('o')
$info=[Activator]::CreateInstance([Diagnostics.ProcessStartInfo])
$info.FileName=$binary
$info.Arguments='--create b138f0060a5249768b420dd94a6ff798 32406b5a5c46cccbe50973f223f8963516eb5c3168dd7d14b9b201105f264ffe'
$info.WorkingDirectory='D:\code\SpecForge'
$info.Verb='runas'
$info.UseShellExecute=$true
$info.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$process=[Diagnostics.Process]::Start($info)
$process.WaitForExit()
$code=[int]$process.ExitCode
'{"started_utc":"'+$started+'","finished_utc":"'+[DateTime]::UtcNow.ToString('o')+'","factory_pid":'+$process.Id+',"inner_exit_code":'+$code+',"application_launcher_elevated":false}'
exit $code
