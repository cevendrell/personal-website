# One-time setup on an always-on Windows PC at home (the Matebook).
# Relays the antenna's live data to https://radar.cevenlabs.com/ through a
# Cloudflare Tunnel. Nothing changes on the Pi and no router ports are opened.
#
# Steps are in README.md. In PowerShell opened with "Run as administrator":
#   powershell -ExecutionPolicy Bypass -File .\setup-windows.ps1 -Token <tunnel token>
param(
  [Parameter(Mandatory = $true)][string]$Token,
  [string]$Upstream = 'http://192.168.1.98/tar1090/data/'
)
$ErrorActionPreference = 'Stop'

$me = [Security.Principal.WindowsIdentity]::GetCurrent()
if (-not ([Security.Principal.WindowsPrincipal]$me).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Open PowerShell with "Run as administrator" and run this again.'
}

Write-Host '== 1/4 Check this PC can reach the antenna'
try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 ($Upstream + 'aircraft.json') | Out-Null; Write-Host 'antenna OK' }
catch { throw "Can't reach $Upstream from this PC. Is it on the home network?" }

Write-Host '== 2/4 Install the relay (starts with Windows)'
$exe = ''
try { $exe = (& python -c 'import sys; print(sys.executable)' 2>$null | Select-Object -First 1) } catch {}
if (-not $exe -or -not (Test-Path $exe)) { throw 'Python not found. Install it from python.org (tick "Add python.exe to PATH"), then run this again.' }
$pyw = Join-Path (Split-Path $exe) 'pythonw.exe'
if (-not (Test-Path $pyw)) { $pyw = $exe }

$dir = Join-Path $env:ProgramData 'RadarRelay'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
Copy-Item -Force (Join-Path $PSScriptRoot 'radar-relay.py') $dir
$script = Join-Path $dir 'radar-relay.py'

$task = 'Radar relay'
Stop-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue
$action    = New-ScheduledTaskAction -Execute $pyw -Argument "`"$script`" $Upstream"
$trigger   = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId $me.Name -LogonType S4U -RunLevel Limited
$settings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
               -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $task -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $task
Start-Sleep -Seconds 3
try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 'http://127.0.0.1:8504/aircraft.json' | Out-Null; Write-Host 'relay OK' }
catch { throw 'The relay did not start. Check the "Radar relay" task in Task Scheduler.' }

Write-Host '== 3/4 Install cloudflared'
function Find-Cloudflared {
  $c = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  foreach ($p in "${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe", "$env:ProgramFiles\cloudflared\cloudflared.exe") { if (Test-Path $p) { return $p } }
}
$cf = Find-Cloudflared
if (-not $cf) {
  winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
  $cf = Find-Cloudflared
  if (-not $cf) { throw 'cloudflared did not install. Install it from Cloudflare''s site, then run this again.' }
}

Write-Host '== 4/4 Run the tunnel as a Windows service'
if (Get-Service cloudflared -ErrorAction SilentlyContinue) { & $cf service uninstall | Out-Null; Start-Sleep -Seconds 2 }
& $cf service install $Token

Write-Host ''
Write-Host 'Done. In a minute, https://radar.cevenlabs.com/aircraft.json should show aircraft data.'
Write-Host 'Keep this PC from sleeping (Settings > System > Power > Sleep: Never), or the radar falls back to the replay.'
