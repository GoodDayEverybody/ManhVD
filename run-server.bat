@echo off
chcp 65001 >nul
title Order Creatives - Server 24/7
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [!] May chua cai Node.js. Tai ban LTS tai https://nodejs.org roi chay lai.
  start https://nodejs.org/en/download
  pause & exit /b
)

if not exist node_modules (
  echo [*] Dang cai thu vien lan dau...
  call npm install
)
if not exist data\app.db (
  echo [*] Dang tao du lieu mau...
  call npm run seed
)

echo.
echo ============================================
echo    ORDER CREATIVES - SERVER DANG CHAY
echo ============================================
echo    Tren may nay   : http://localhost:3000
powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.*'} | ForEach-Object { '   May khac (LAN): http://' + $_.IPAddress + ':3000' }" 2>nul
echo ============================================
echo    GIU NGUYEN cua so nay. Dong = tat server.
echo    (Server tu khoi dong lai neu bi loi)
echo ============================================
echo.

:loop
node server\index.js
echo.
echo [!] Server vua dung. Tu khoi dong lai sau 3 giay... (Ctrl+C de thoat han)
timeout /t 3 >nul
goto loop
