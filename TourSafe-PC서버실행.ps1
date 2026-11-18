param([switch]$Wifi)
$ErrorActionPreference='Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath 'dist\backend\src\index.js')) { & npm.cmd run build; if ($LASTEXITCODE -ne 0) { throw 'PC 서버 빌드를 확인해 주세요.' } }
$priorHost=$env:HOST; $priorPort=$env:PORT
try {
  $env:HOST=if ($Wifi) {'0.0.0.0'} else {'127.0.0.1'}
  $env:PORT='8787'
  if ($Wifi) {
    Write-Output '같은 Wi-Fi에서 PC의 내부 IP:8787을 앱에 입력해 주세요. Windows 방화벽 허용이 필요할 수 있어요.'
    Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | Select-Object IPAddress
  } else { Write-Output 'PC 서버를 USB 연결용으로 시작합니다. 휴대폰 설치 스크립트에서 USB 연결을 설정해 주세요.' }
  & node.exe dist/backend/src/index.js
} finally { $env:HOST=$priorHost; $env:PORT=$priorPort }
