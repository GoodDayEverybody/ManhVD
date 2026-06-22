@echo off
chcp 65001 >nul
title Order Creatives - Cap nhat
cd /d "%~dp0"

echo ============================================
echo    Dang tai cac sua doi moi nhat ve...
echo ============================================
echo.
git pull
echo.
echo ============================================
echo   XONG!
echo   - Neu app DANG CHAY: chi can quay ra trinh duyet va bam F5.
echo     ^(App tu khoi dong lai nho che do --watch^)
echo   - Neu app CHUA CHAY: bam-dup file start-windows.bat
echo ============================================
echo.
pause
