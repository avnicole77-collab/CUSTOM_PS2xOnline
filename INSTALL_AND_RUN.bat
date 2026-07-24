@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==============================================
echo BOSSMASTER AI CHAT ^& BATCH - Install and Run
echo ==============================================
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] ไม่พบ Node.js กรุณาติดตั้ง Node.js LTS ก่อน
  pause
  exit /b 1
)
call npm install
if errorlevel 1 (
  echo [ERROR] npm install ไม่สำเร็จ
  pause
  exit /b 1
)
call npm test
if errorlevel 1 (
  echo [ERROR] Source syntax test ไม่ผ่าน
  pause
  exit /b 1
)
call npm start
