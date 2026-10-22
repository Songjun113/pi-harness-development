#Requires -Version 7.0
[CmdletBinding()]
param([switch]$Build,[switch]$CopyDependencies,[string[]]$ExtraSource = @())
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$source = Join-Path $root 'addons/pi-web-luna'
$releases = Join-Path $root 'agent-data/web-production/releases'
$id = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0,8)
$target = Join-Path $releases $id
New-Item -ItemType Directory -Path $target -Force | Out-Null
# Git's tracked file list is the publication boundary: no .env, caches, secrets,
# node_modules, runtime files or untracked test artifacts can enter the snapshot.
$files = & git -C $source ls-files --cached
if ($LASTEXITCODE -ne 0) { throw 'Cannot enumerate tracked source' }
foreach ($extra in $ExtraSource) {
 if ($extra -notmatch '^(lib|hooks|components)/[a-zA-Z0-9/_-]+\.(ts|tsx)$' -or $extra.Contains('..')) { throw 'ExtraSource must be an explicitly reviewed app source path' }
}
$files = @($files) + $ExtraSource | Sort-Object -Unique
$hashes = [Collections.Generic.List[string]]::new()
foreach ($file in $files) {
 if ($file -match '(^|/)(\.env[^/]*|\.git|node_modules|\.next|auth\.json|secrets?)(/|$)' -or $file -match '\.(pem|key)$') { throw "Forbidden tracked snapshot path: $file" }
 $src = Join-Path $source $file
 if (-not (Test-Path -LiteralPath $src -PathType Leaf)) { throw "Missing tracked source: $file" }
 $item = Get-Item -LiteralPath $src
 while ($null -ne $item) {
  if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Source or ancestor links refused' }
  if ($item.FullName -eq $source) { break }
  $item = if ($item -is [IO.DirectoryInfo]) { $item.Parent } else { $item.Directory }
 }
 $dst = Join-Path $target $file
 New-Item -ItemType Directory -Path (Split-Path $dst) -Force | Out-Null
 Copy-Item -LiteralPath $src -Destination $dst
 $hashes.Add("$file $((Get-FileHash -LiteralPath $dst -Algorithm SHA256).Hash)")
}
$commit = & git -C $root rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw 'Cannot read source revision' }
$hash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes(($hashes -join "`n"))))
$node = (Get-Command node -CommandType Application).Source
$dependencyMode = 'junction-candidate-only'
if ($CopyDependencies) {
 $dependencyMode = 'private-copy'
 & robocopy (Join-Path $source 'node_modules') (Join-Path $target 'node_modules') /E /XJ /NFL /NDL /NJH /NJS /NP | Out-Null
 if ($LASTEXITCODE -ge 8) { throw 'Dependency copy failed' }
} else {
 New-Item -ItemType Junction -Path (Join-Path $target 'node_modules') -Target (Join-Path $source 'node_modules') | Out-Null
}
$metadata = @{release=$id;commit="$commit";sourceSha256=$hash;dependencyMode=$dependencyMode;created=(Get-Date -Format o);status='prepared'}
$metadata | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $target 'release.json') -Encoding utf8
Write-Host "Snapshot: $target"
if ($Build) {
 Push-Location $target
 $oldPassword = $env:PI_WEB_PASSWORD
 try {
  Remove-Item Env:PI_WEB_PASSWORD -ErrorAction SilentlyContinue
  Get-ChildItem Env: | Where-Object { $_.Name -match '^(NEXT_|TURBOPACK|__NEXT)' } | ForEach-Object { Remove-Item -LiteralPath "Env:$($_.Name)" }
  $env:NODE_ENV = 'production'
  $env:NEXT_TELEMETRY_DISABLED = '1'
  $start = [Diagnostics.ProcessStartInfo]::new()
  $start.FileName = $node
  $start.WorkingDirectory = $target
  $start.UseShellExecute = $false
  # Next's file tracer evaluates homedir-based filesystem expressions. Keep
  # private runtime/home outside both build inputs and dependency traces.
  $buildHome = Join-Path $target '.build-home'
  New-Item -ItemType Directory -Path $buildHome -Force | Out-Null
  $start.Environment['HOME'] = $buildHome
  $start.Environment['USERPROFILE'] = $buildHome
  $start.Environment['PI_CODING_AGENT_DIR'] = Join-Path $buildHome 'agent'
  foreach ($arg in @((Join-Path $target 'node_modules/next/dist/bin/next'),'build','--webpack')) { $start.ArgumentList.Add($arg) }
  Add-Type -Path (Join-Path $PSScriptRoot 'process-job.cs')
  $buildJob = [PiWebProcessJob]::new()
  $buildProcess = $null
  try {
   $buildProcess = $buildJob.Start($start)
   $buildProcess.WaitForExit()
   if ($buildProcess.ExitCode -ne 0) { throw 'Isolated production build failed; release not marked ready' }
  } finally {
   try { $buildJob.Dispose() } finally { if ($null -ne $buildProcess) { $buildProcess.Dispose() } }
  }
  if (-not (Test-Path -LiteralPath (Join-Path $target '.next/BUILD_ID'))) { throw 'Missing build output' }
  Set-Content -LiteralPath (Join-Path $target 'ready') -Value $hash -Encoding utf8
 } finally {
  if ($null -ne $oldPassword) { $env:PI_WEB_PASSWORD = $oldPassword }
  Pop-Location
 }
}
Write-Output $target
