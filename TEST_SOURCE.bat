@echo off
setlocal
cd /d "%~dp0"
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found. Install Node.js LTS first.
  pause
  exit /b 1
)
call npm.cmd test
if errorlevel 1 (
  echo [FAIL] Source syntax error found.
) else (
  echo [PASS] Source syntax is valid.
)
pause
