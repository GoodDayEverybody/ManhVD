@echo off
chcp 65001 >nul
title Order Creatives - Cai dat tu chay 24/7
cd /d "%~dp0"

net session >nul 2>&1
if errorlevel 1 (
  echo ============================================
  echo  [!] Hay chay file nay bang quyen ADMIN.
  echo      Chuot phai file setup-autostart.bat
  echo      -^> Run as administrator
  echo ============================================
  pause & exit /b
)

echo [1/3] Mo port 3000 tren Windows Firewall (cho may khac truy cap)...
netsh advfirewall firewall delete rule name="Order Creatives 3000" >nul 2>&1
netsh advfirewall firewall add rule name="Order Creatives 3000" dir=in action=allow protocol=TCP localport=3000 >nul
echo     -^> Done.

echo [2/3] Tu khoi dong server moi khi dang nhap Windows...
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup')+'\OrderCreatives.lnk'); $s.TargetPath='%~dp0run-server.bat'; $s.WorkingDirectory='%~dp0'; $s.WindowStyle=7; $s.Save()"
echo     -^> Done.

echo [3/3] Tu dong sao luu du lieu hang ngay (12:30 va 23:00)...
schtasks /Create /TN "OrderCreatives-Backup-Trua" /TR "cmd /c cd /d \"%~dp0\" ^&^& node server\backup.js" /SC DAILY /ST 12:30 /F >nul
schtasks /Create /TN "OrderCreatives-Backup-Toi"  /TR "cmd /c cd /d \"%~dp0\" ^&^& node server\backup.js" /SC DAILY /ST 23:00 /F >nul
echo     -^> Done.

echo.
echo ============================================
echo   XONG! Tu gio:
echo   - Server tu chay moi khi may bat (ban dang nhap Windows).
echo   - May khac trong cong ty vao: http://[IP-cua-PC]:3000
echo   - Du lieu tu backup vao thu muc backups\ moi ngay.
echo.
echo   CHAY NGAY BAY GIO: bam-dup file run-server.bat
echo ============================================
pause
