@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
set EXIT_CODE=%ERRORLEVEL%
echo.
if not "%EXIT_CODE%"=="0" (
  echo Deployment failed with exit code %EXIT_CODE%.
  echo Keep this window open and send the error text for diagnosis.
) else (
  echo Open http://localhost:8080/midpoint/ in your browser.
)
pause
exit /b %EXIT_CODE%
