param([switch]$SkipWeb, [string]$ToolsRoot = 'D:\CodexData\TourSafe-Android')
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$prior = @{ JAVA_HOME=$env:JAVA_HOME; ANDROID_HOME=$env:ANDROID_HOME; GRADLE_USER_HOME=$env:GRADLE_USER_HOME; ANDROID_USER_HOME=$env:ANDROID_USER_HOME }
$javaRoot = Get-ChildItem -LiteralPath (Join-Path $ToolsRoot 'jdk') -Directory | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'bin\java.exe') } | Select-Object -First 1
if (-not $javaRoot) { throw 'JDK 21을 ToolsRoot\jdk에 설치해 주세요.' }
$sdkRoot = Join-Path $ToolsRoot 'sdk'
if (-not (Test-Path -LiteralPath (Join-Path $sdkRoot 'platform-tools\adb.exe'))) { throw 'Android SDK 설치 경로를 확인해 주세요.' }
try {
  $env:JAVA_HOME = $javaRoot.FullName
  $env:ANDROID_HOME = $sdkRoot
  $env:GRADLE_USER_HOME = Join-Path $ToolsRoot 'gradle-cache'
  $env:ANDROID_USER_HOME = Join-Path $ToolsRoot 'android-user'
  Set-Location -LiteralPath $projectRoot
  if (-not $SkipWeb) { & npm.cmd run build:android:web; if ($LASTEXITCODE -ne 0) { throw 'Android 화면 빌드 실패' } }
  & npx.cmd cap sync android
  if ($LASTEXITCODE -ne 0) { throw 'Android 동기화 실패' }
  ('sdk.dir=' + $sdkRoot.Replace('\', '/')) | Set-Content -LiteralPath (Join-Path $projectRoot 'android\local.properties') -Encoding ascii
  & (Join-Path $projectRoot 'android\gradlew.bat') -p (Join-Path $projectRoot 'android') --no-daemon --max-workers=2 assembleDebug
  if ($LASTEXITCODE -ne 0) { throw 'APK 빌드 실패' }
  $releaseRoot = Join-Path $projectRoot 'releases'
  New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null
  $apk = Join-Path $releaseRoot 'TripFit-0.1.2-test.apk'
  Copy-Item -LiteralPath (Join-Path $projectRoot 'android\app\build\outputs\apk\debug\app-debug.apk') -Destination $apk -Force
  Get-FileHash -LiteralPath $apk -Algorithm SHA256 | Format-List
  Write-Output "APK: $apk"
} finally {
  foreach ($key in $prior.Keys) { [Environment]::SetEnvironmentVariable($key, $prior[$key], 'Process') }
}
