@echo off
chcp 65001 >nul
cd /d "%~dp0"
call npm test
if errorlevel 1 (
  echo [FAIL] พบ Syntax Error
) else (
  echo [PASS] Source syntax ถูกต้อง
)
pause
