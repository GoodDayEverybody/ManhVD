@echo off
chcp 65001 >nul
title Order Creatives - Cap nhat
cd /d "%~dp0"

echo ============================================
echo    Dang tai ban moi nhat tu nhanh main...
echo ============================================
echo.

REM Luon ve nhanh main roi keo, tranh keo nham nhanh cu
git checkout main
if errorlevel 1 (
  echo.
  echo [!] Khong chuyen duoc sang nhanh main.
  echo     Co the dang co sua doi tay tren may. Thu chay:  git stash
  echo     roi chay lai file nay.
  echo.
  pause & exit /b
)

git pull origin main
if errorlevel 1 (
  echo.
  echo [!] Keo code that bai ^(loi mang hoac xung dot^). Xem dong loi o tren.
  echo.
  pause & exit /b
)

echo.
echo ============================================
echo   XONG! Da cap nhat len ban moi nhat (main).
echo.
echo   DE AP DUNG:
echo   1. DONG cua so den run-server.bat (neu dang chay).
echo   2. MO LAI bang cach bam-dup run-server.bat.
echo   3. Tren trinh duyet bam Ctrl + F5.
echo ============================================
echo.
pause
