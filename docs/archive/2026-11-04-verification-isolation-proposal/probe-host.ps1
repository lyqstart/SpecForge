$ErrorActionPreference = 'Stop'
$probeTools = foreach ($toolName in @('docker','podman','wsl','hcsdiag','cl','clang','dotnet','node')) {
  $toolCommand = Get-Command $toolName -CommandType Application -ErrorAction SilentlyContinue
  [pscustomobject]@{name=$toolName;found=($null -ne $toolCommand);path=$(if ($toolCommand) {$toolCommand.Source} else {$null})}
}
$probePaths = foreach ($probePath in @('C:/Windows/System32/WindowsSandbox.exe','C:/Windows/System32/wsb.exe','C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe','C:/Program Files/Docker/Docker/resources/bin/docker.exe')) {
  [pscustomobject]@{path=$probePath;exists=(Test-Path -LiteralPath $probePath)}
}
$probeServices = @(Get-Service -Name 'com.docker.service','vmcompute','WslService' -ErrorAction SilentlyContinue | ForEach-Object {[pscustomobject]@{name=$_.Name;status=$_.Status.ToString()}})
$probeDistroKey = 'HKCU:/Software/Microsoft/Windows/CurrentVersion/Lxss'
$probeDistroCount = if(Test-Path -LiteralPath $probeDistroKey){@(Get-ChildItem -LiteralPath $probeDistroKey).Count}else{0}
$hostProbeResult = [ordered]@{utc=[DateTime]::UtcNow.ToString('o');os_description=[System.Runtime.InteropServices.RuntimeInformation]::OSDescription;os_architecture=[System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString();process_architecture=[System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture.ToString();tools=@($probeTools);paths=@($probePaths);services=$probeServices;wsl_registered_distro_key_count=$probeDistroCount;limitation='Read-only discovery only. WSL binary/registry presence is not proof of usable confinement; no isolation process or system feature was started.';inner_exit_code=0}
$hostProbeResult | ConvertTo-Json -Depth 6
