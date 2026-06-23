@echo off
chcp 65001 >nul
title Order Creatives - Xoa du lieu mau
cd /d "%~dp0"

echo ============================================
echo   XOA DU LIEU MAU (chuan bi nhap du lieu that)
echo ============================================
echo.
echo   - SE XOA: nhan vien mau, app mau, order mau.
echo   - GIU LAI: tai khoan admin + cau hinh (loai order/diem, size, doi tac).
echo.
echo   *** HAY DONG cua so server (run-server.bat) TRUOC khi chay file nay ***
echo   Truoc khi xoa se TU DONG BACKUP vao thu muc backups\
echo.
set /p OK=Go chu "XOA" (in hoa) roi Enter de tiep tuc:
if /I not "%OK%"=="XOA" (
  echo.
  echo Da huy. Khong xoa gi ca.
  pause & exit /b
)

echo.
echo [1/2] Dang backup du lieu hien tai...
node server\backup.js
if errorlevel 1 ( echo [!] Backup loi - DUNG LAI de an toan. & pause & exit /b )

echo.
echo [2/2] Dang xoa du lieu mau...
node server\reset.js

echo.
echo XONG! Mo lai trinh duyet, dang nhap admin va nhap du lieu that.
pause
