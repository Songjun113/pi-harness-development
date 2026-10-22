#Requires -Version 7.0
param([Parameter(Mandatory)][string]$Release)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$fixture=Join-Path $root ('agent-data/web-production/testing/'+[Guid]::NewGuid().ToString('N'))
if(Get-NetTCPConnection -State Listen -LocalPort 30142 -ErrorAction SilentlyContinue){throw 'Test port occupied'}
New-Item -ItemType Directory -Path (Join-Path $fixture 'agent') -Force | Out-Null
$secretValue=[Guid]::NewGuid().ToString('N')
$secret=ConvertTo-SecureString $secretValue -AsPlainText -Force
$secret | Export-Clixml -LiteralPath (Join-Path $fixture 'password.xml')
@{port=30142;allowedHost='smoke.ts.net';node=(Get-Command node -CommandType Application).Source;agentDir=(Join-Path $fixture 'agent')}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $fixture 'settings.json')
@{release=[IO.Path]::GetFullPath($Release)}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $fixture 'active.json')
Add-Type -Path (Join-Path $PSScriptRoot 'process-job.cs')
$job=[PiWebProcessJob]::new()
$supervisor=$null
try {
 $info=[Diagnostics.ProcessStartInfo]::new()
 $info.FileName=(Get-Process -Id $PID).Path
 $info.UseShellExecute=$false
 foreach($arg in @('-NoProfile','-NonInteractive','-File',(Join-Path $PSScriptRoot 'manage.ps1'),'-Action','run','-TestStateDirectory',$fixture)){$info.ArgumentList.Add($arg)}
 $supervisor=$job.Start($info)
 $healthy=$false
 for($i=0;$i -lt 60;$i++){
  if($supervisor.HasExited){throw "Supervisor exited early: $($supervisor.ExitCode)"}
  try{$auth=Invoke-RestMethod 'http://127.0.0.1:30142/api/web-auth' -TimeoutSec 2;if($auth.enabled){$healthy=$true;break}}catch{}
  Start-Sleep -Milliseconds 500
 }
 if(-not $healthy){throw 'Production runner did not become healthy'}
 $r=Invoke-WebRequest 'http://127.0.0.1:30142/api/sessions' -SkipHttpErrorCheck
 if($r.StatusCode -ne 401){throw 'Unauthenticated runner allowed sessions'}
 $headers=@{Authorization=('Basic '+[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('pi:'+$secretValue)))}
 $r=Invoke-WebRequest 'http://127.0.0.1:30142/api/sessions' -Headers $headers
 if($r.StatusCode -ne 200){throw 'Encrypted credential not applied to child'}
 $job.Dispose()
 $supervisor.WaitForExit(5000)|Out-Null
 Start-Sleep -Milliseconds 500
 if(Get-NetTCPConnection -State Listen -LocalPort 30142 -ErrorAction SilentlyContinue){throw 'Orphan listener after supervisor termination'}
 Write-Host 'PASS: real production runner, DPAPI password -> child, anonymous 401, authenticated 200, entire tree/port cleanup.'
}finally{
 $job.Dispose()
 if($null -ne $supervisor){$supervisor.Dispose()}
 $secret.Dispose()
 Remove-Item -LiteralPath $fixture -Recurse -Force
}
