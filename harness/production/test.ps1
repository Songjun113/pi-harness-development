#Requires -Version 7.0
$ErrorActionPreference='Stop'
foreach($file in Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.ps1') {
 $tokens=$null;$errors=$null
 [Management.Automation.Language.Parser]::ParseFile($file.FullName,[ref]$tokens,[ref]$errors) | Out-Null
 if($errors.Count) { throw "Parser errors in $($file.Name): $errors" }
}
$temp=Join-Path ([IO.Path]::GetTempPath()) ('pi-deployment-test-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
 $value=[Guid]::NewGuid().ToString('N')
 $secure=ConvertTo-SecureString $value -AsPlainText -Force
 $path=Join-Path $temp 'credential.xml'
 $secure | Export-Clixml -LiteralPath $path
 if((Get-Content -LiteralPath $path -Raw).Contains($value)) { throw 'Credential plaintext leak' }
 $restored=Import-Clixml -LiteralPath $path
 $credential=[PSCredential]::new('test',$restored)
 if($credential.GetNetworkCredential().Password -ne $value) { throw 'DPAPI roundtrip failed' }
 Add-Type -Path (Join-Path $PSScriptRoot 'process-job.cs')
 $job=[PiWebProcessJob]::new()
 $p=[Diagnostics.ProcessStartInfo]::new()
 $p.FileName=(Get-Command node -CommandType Application).Source
 $p.UseShellExecute=$false
 $p.ArgumentList.Add('-e');$p.ArgumentList.Add('setInterval(()=>{},1000)')
 $child=$job.Start($p)
 try {
  $job.Dispose()
  if(-not $child.WaitForExit(5000)) { throw 'Job close did not terminate owned child' }
 } finally { if(-not $child.HasExited){$child.Kill($true)};$child.Dispose();$job.Dispose() }
 $job=[PiWebProcessJob]::new()
 try {
  $quick=[Diagnostics.ProcessStartInfo]::new()
  $quick.FileName=(Get-Command node -CommandType Application).Source
  $quick.ArgumentList.Add('-e');$quick.ArgumentList.Add('process.exit(process.env.PI_JOB_TEST === "yes" ? 0 : 9)')
  $quick.Environment['PI_JOB_TEST']='yes'
  $quick.UseShellExecute=$false
  $fast=$job.Start($quick)
  $fast.WaitForExit()
  if($fast.ExitCode -ne 0) { throw "Native exit code/environment failed: $($fast.ExitCode)" }
  $fast.Dispose()
 } finally { $job.Dispose() }
 Write-Host 'PASS: parsing, encrypted DPAPI roundtrip, suspended job cleanup, native exit code/environment.'
} finally { Remove-Item -LiteralPath $temp -Recurse -Force }
