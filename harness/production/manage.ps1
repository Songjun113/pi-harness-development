#Requires -Version 7.0
[CmdletBinding()]
param(
 [Parameter(Mandatory)][ValidateSet('configure','run','select','rollback','status','install-task','remove-task')][string]$Action,
 [string]$Release,
 [string]$AllowedHost,
 [ValidateRange(1024,65535)][int]$Port = 30141,
 [switch]$ConfirmInstall,
 [string]$TestStateDirectory
)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$releaseRoot = Join-Path $root 'agent-data/web-production/releases'
$state = Join-Path $root 'agent-data/web-production'
if ($TestStateDirectory) {
 $testRoot = [IO.Path]::GetFullPath((Join-Path $state 'testing')) + [IO.Path]::DirectorySeparatorChar
 $testPath = [IO.Path]::GetFullPath($TestStateDirectory)
 if (-not $testPath.StartsWith($testRoot,[StringComparison]::OrdinalIgnoreCase) -or $Action -ne 'run') { throw 'Test state only supports run inside private testing directory' }
 $state = $testPath
}
$settingsFile = Join-Path $state 'settings.json'
$credentialFile = Join-Path $state 'password.xml'
$pointer = Join-Path $state 'active.json'
$previous = Join-Path $state 'previous.json'
$taskName = 'PiHarness-Web-Production'
function Write-Json($Path, $Value) {
 $tmp = "$Path.tmp"
 $Value | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $tmp -Encoding utf8
 Move-Item -LiteralPath $tmp -Destination $Path -Force
}
function Assert-Release($Path) {
 $releases = [IO.Path]::GetFullPath($releaseRoot) + [IO.Path]::DirectorySeparatorChar
 $full = [IO.Path]::GetFullPath($Path)
 if (-not $full.StartsWith($releases,[StringComparison]::OrdinalIgnoreCase)) { throw 'Release outside private release directory' }
 if ((Get-Item -LiteralPath $full).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked release directory refused' }
 foreach ($file in @('ready','.next/BUILD_ID','node_modules/next/dist/bin/next')) {
  if (-not (Test-Path -LiteralPath (Join-Path $full $file))) { throw "Incomplete release: $file" }
 }
 $metadata = Get-Content -LiteralPath (Join-Path $full 'release.json') -Raw | ConvertFrom-Json
 if ($metadata.dependencyMode -ne 'private-copy') { throw 'Production requires private dependency copy; junction is candidate-only' }
 return $full
}
function Read-Settings {
 if (-not (Test-Path -LiteralPath $settingsFile)) { throw 'Run configure first' }
 $c = Get-Content -LiteralPath $settingsFile -Raw | ConvertFrom-Json
 if ($c.allowedHost -notmatch '^[a-zA-Z0-9][a-zA-Z0-9.-]+\.ts\.net$' -or $c.port -lt 1024 -or $c.port -gt 65535) { throw 'Invalid private host/port configuration' }
 return $c
}
function Assert-PortFree($Number) {
 if (Get-NetTCPConnection -State Listen -LocalPort $Number -ErrorAction SilentlyContinue) { throw "Port $Number is occupied; stop the old service explicitly first" }
}
New-Item -ItemType Directory -Path $state -Force | Out-Null
$changeMutex = $null
$changeOwned = $false
try {
 if ($Action -in @('select','rollback','configure','install-task')) {
  $changeMutex = [Threading.Mutex]::new($false,'Local\PiHarness-Web-Production')
  try { $changeOwned = $changeMutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $changeOwned = $true }
  if (-not $changeOwned) { throw 'Stop production supervisor before changing deployment' }
  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($task -and $task.State -ne 'Disabled') { throw 'Disable and stop scheduled task before changing deployment; re-enable after validation' }
 }
switch ($Action) {
 'configure' {
  if ($AllowedHost -notmatch '^[a-zA-Z0-9][a-zA-Z0-9.-]+\.ts\.net$') { throw 'Supply exact Tailscale DNS hostname via -AllowedHost' }
  $secret = Read-Host 'Independent Web password (16+ characters)' -AsSecureString
  if ($secret.Length -lt 16) { throw 'Password must have at least 16 characters' }
  $secret | Export-Clixml -LiteralPath $credentialFile
  Write-Json $settingsFile @{allowedHost=$AllowedHost;port=$Port;node=(Get-Command node -CommandType Application).Source;agentDir=(Join-Path $root 'agent-data')}
  $secret.Dispose()
  Write-Host 'Saved current-user DPAPI encrypted password; no plaintext stored.'
 }
 'select' {
  $c = Read-Settings
  Assert-PortFree $c.port
  $full = Assert-Release $Release
  $old = if (Test-Path -LiteralPath $pointer) { Get-Content -LiteralPath $pointer -Raw | ConvertFrom-Json } else { $null }
  if ($null -ne $old -and $old.release -eq $full) { Write-Host 'Release already selected'; return }
  Write-Json $pointer @{release=$full;previousRelease=$old.release}
  Write-Host 'Selected release. No process started or stopped.'
 }
 'rollback' {
  $c = Read-Settings
  Assert-PortFree $c.port
  $current = Get-Content -LiteralPath $pointer -Raw | ConvertFrom-Json
  if (-not $current.previousRelease) { throw 'No previous production release' }
  $full = Assert-Release $current.previousRelease
  Write-Json $pointer @{release=$full;previousRelease=$current.release}
  Write-Host 'Rollback selected; start service separately.'
 }
 'run' {
  $mutex = [Threading.Mutex]::new($false,'Local\PiHarness-Web-Production')
  $owned = $false
  $proc = $null
  $job = $null
  try {
   try { $owned = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $owned = $true }
   if (-not $owned) { throw 'Production supervisor already running' }
   $c = Read-Settings
   $selected = Get-Content -LiteralPath $pointer -Raw | ConvertFrom-Json
   $full = Assert-Release $selected.release
   Assert-PortFree $c.port
   $secret = Import-Clixml -LiteralPath $credentialFile
   if ($secret -isnot [Security.SecureString] -or $secret.Length -lt 16) { throw 'Invalid encrypted password' }
   $info = [Diagnostics.ProcessStartInfo]::new()
   $info.FileName = $c.node
   $info.WorkingDirectory = $full
   $info.UseShellExecute = $false
   foreach ($arg in @((Join-Path $full 'node_modules/next/dist/bin/next'),'start','-H','127.0.0.1','-p',"$($c.port)")) { $info.ArgumentList.Add($arg) }
   $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
   try { $info.Environment['PI_WEB_PASSWORD'] = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
   finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr); $secret.Dispose() }
   $info.Environment['PI_WEB_ALLOWED_HOSTS'] = $c.allowedHost
   $info.Environment['PI_CODING_AGENT_DIR'] = $c.agentDir
   $info.Environment['NEXT_TELEMETRY_DISABLED'] = '1'
   $info.Environment['NODE_ENV'] = 'production'
   foreach ($key in @($info.Environment.Keys)) { if ($key -match '^(TURBOPACK|__NEXT|NEXT_PRIVATE)') { $info.Environment.Remove($key) | Out-Null } }
   Add-Type -Path (Join-Path $PSScriptRoot 'process-job.cs')
   $job = [PiWebProcessJob]::new()
   $proc = $job.Start($info)
   $info.Environment.Remove('PI_WEB_PASSWORD') | Out-Null
   $proc.WaitForExit()
   $exitCode = $proc.ExitCode
   if ($exitCode -ne 0) { exit $exitCode }
  } finally {
   try {
    if ($null -ne $proc) { if (-not $proc.HasExited) { $proc.Kill($true); $proc.WaitForExit() }; $proc.Dispose() }
   } finally {
    try { if ($null -ne $job) { $job.Dispose() } }
    finally { if ($owned) { $mutex.ReleaseMutex() }; $mutex.Dispose() }
   }
  }
 }
 'status' {
  $c = Read-Settings
  $url = "http://127.0.0.1:$($c.port)"
  $auth = Invoke-RestMethod "$url/api/web-auth" -TimeoutSec 10
  $r = Invoke-WebRequest "$url/api/sessions" -SkipHttpErrorCheck -TimeoutSec 10
  if (-not $auth.enabled -or $r.StatusCode -ne 401) { throw 'Authentication gate failed' }
  Write-Host 'Healthy: password enabled; anonymous session access rejected (401).'
 }
 'install-task' {
  if (-not $ConfirmInstall) { throw 'Explicit -ConfirmInstall required; select and test release first' }
  $c = Read-Settings
  $selected = Get-Content -LiteralPath $pointer -Raw | ConvertFrom-Json
  Assert-Release $selected.release | Out-Null
  if (-not (Test-Path -LiteralPath $credentialFile)) { throw 'Configure credentials first' }
  $pwsh = (Get-Process -Id $PID).Path
  $script = Join-Path $PSScriptRoot 'manage.ps1'
  $user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  $a = New-ScheduledTaskAction -Execute $pwsh -Argument "-NoProfile -NonInteractive -File `"$script`" -Action run"
  $t = New-ScheduledTaskTrigger -AtLogOn -User $user
  $p = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
  $s = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  Register-ScheduledTask -TaskName $taskName -Action $a -Trigger $t -Principal $p -Settings $s -Force | Out-Null
  Write-Host 'Logon task installed, NOT started. No pre-logon availability guarantee.'
 }
 'remove-task' { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }
}
} finally {
 if ($null -ne $changeMutex) { if ($changeOwned) { $changeMutex.ReleaseMutex() }; $changeMutex.Dispose() }
}
