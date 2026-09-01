@echo off
setlocal
cd /d "%~dp0"
echo Checking midPoint...
powershell.exe -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8080/midpoint/ -TimeoutSec 10; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  echo midPoint is not available at http://127.0.0.1:8080/midpoint/
  echo Start deployment\midpoint first.
  pause
  exit /b 1
)
echo Starting Fantuan Account Portal at http://localhost:3001 ...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-portal.ps1"
pause
