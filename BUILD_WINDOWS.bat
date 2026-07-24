@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==============================================
echo Build BOSSMASTER AI CHAT ^& BATCH for Windows
echo ==============================================
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] ไม่พบ Node.js LTS
  pause
  exit /b 1
)
call npm install
if errorlevel 1 goto :error
call npm test
if errorlevel 1 goto :error
call npm run dist:win
if errorlevel 1 goto :error
echo.
echo [OK] Build สำเร็จ ดูไฟล์ในโฟลเดอร์ release
explorer "%~dp0release"
pause
exit /b 0
:error
echo.
echo [ERROR] Build ไม่สำเร็จ กรุณาส่งข้อความ Error กลับมา
pause
exit /b 1
