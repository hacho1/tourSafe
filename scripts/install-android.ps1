param([string]$Serial, [string]$ToolsRoot = 'D:\CodexData\TourSafe-Android')
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$adb = Join-Path $ToolsRoot 'sdk\platform-tools\adb.exe'
$apk = Join-Path $projectRoot 'releases\TourSafe-0.1.0-test.apk'
if (-not (Test-Path -LiteralPath $apk)) { throw '먼저 npm run android:apk로 APK를 만들어 주세요.' }
$devices = & $adb devices
$ready = @($devices | ForEach-Object { if ($_ -match '^([^\s]+)\s+device$') { $Matches[1] } })
if ($Serial) { if ($Serial -notin $ready) { throw '선택한 기기의 USB 디버깅 허용 여부를 확인해 주세요.' } }
elseif ($ready.Count -eq 1) { $Serial = $ready[0] }
else { Write-Output $devices; throw 'USB 디버깅을 허용한 기기 한 대를 연결하거나 -Serial로 선택해 주세요.' }
& $adb -s $Serial install -r $apk
if ($LASTEXITCODE -ne 0) { throw 'APK 설치를 완료하지 못했어요.' }
& $adb -s $Serial reverse tcp:8787 tcp:8787
if ($LASTEXITCODE -ne 0) { throw 'PC 서버 USB 연결을 만들지 못했어요.' }
& $adb -s $Serial shell am start -n 'kr.toursafe.app/.MainActivity'
Write-Output '설치 완료. PC에서 npm start를 실행한 상태로 앱을 사용해 주세요.'
