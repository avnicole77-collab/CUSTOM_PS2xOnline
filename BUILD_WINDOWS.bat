@echo off
setlocal
cd /d "%~dp0"
echo ==============================================
echo Build BOSSMASTER AI CHAT ^& BATCH for Windows
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
if errorlevel 1 goto error
call npm.cmd test
if errorlevel 1 goto error
call npm.cmd run dist:win
if errorlevel 1 goto error
echo.
echo [OK] Build completed. Output is in the release folder.
start "" explorer.exe "%~dp0release"
pause
exit /b 0

:error
echo.
echo [ERROR] Build failed. Copy the error above and send it for review.
pause
exit /b 1
