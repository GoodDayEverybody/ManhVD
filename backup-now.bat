@echo off
chcp 65001 >nul
title Order Creatives - Sao luu du lieu
cd /d "%~dp0"
node server\backup.js
echo.
echo Cac ban backup nam trong thu muc: backups\
pause
