@echo off
cd /d "%~dp0"
if not exist "dist\backend\src\index.js" (
  echo Please run npm install and npm run build first.
  pause
  exit /b 1
)
echo TourSafe: http://127.0.0.1:8787
node "dist\backend\src\index.js"
