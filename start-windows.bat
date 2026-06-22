@echo off
chcp 65001 >nul
title Order Creatives
cd /d "%~dp0"

echo ============================================
echo    ORDER CREATIVES - dang khoi dong
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [!] May ban CHUA cai Node.js.
  echo     Dang mo trang tai Node.js trong trinh duyet...
  start https://nodejs.org/en/download
  echo.
  echo  =====================================================
  echo   Hay cai Node.js ^(ban LTS, bam Next lien tuc^),
  echo   sau do DONG cua so nay va bam-dup lai file nay.
  echo  =====================================================
  echo.
  pause
  exit /b
)

if not exist node_modules (
  echo [1/3] Dang cai dat thu vien... vui long doi 1-2 phut...
  call npm install
  if errorlevel 1 ( echo Loi khi cai dat. & pause & exit /b )
)

if not exist data\app.db (
  echo [2/3] Dang tao du lieu mau...
  call npm run seed
)

echo [3/3] Dang khoi dong server...
echo.
echo  Trinh duyet se tu mo http://localhost:3000 sau vai giay.
echo  ^>^> GIU NGUYEN cua so nay khi dang dung app. Dong = tat app.
echo.
start "" cmd /c "timeout /t 4 >nul & start http://localhost:3000"
call npm start
pause
