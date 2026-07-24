@echo off
setlocal
cd /d "%~dp0"
echo ==============================================
echo BOSSMASTER AI CHAT ^& BATCH - Install and Run
echo ==============================================
where node.exe >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js LTS was not found.
  echo Install Node.js LTS and run this file again.
  pause
  exit /b 1
)
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found.
  echo Reinstall Node.js LTS with npm enabled.
  pause
  exit /b 1
)
if exist "node_modules\.pnpm" (
  echo [INFO] Removing packages created by a different package manager...
  rmdir /s /q "node_modules"
)
if exist "pnpm-lock.yaml" del /q "pnpm-lock.yaml"
if exist "pnpm-workspace.yaml" del /q "pnpm-workspace.yaml"
call npm.cmd install --legacy-peer-deps --no-audit --no-fund
if errorlevel 1 (
  echo [ERROR] npm install failed.
  pause
  exit /b 1
)
call npm.cmd test
if errorlevel 1 (
  echo [ERROR] Source syntax test failed.
  pause
  exit /b 1
)
call npm.cmd start
