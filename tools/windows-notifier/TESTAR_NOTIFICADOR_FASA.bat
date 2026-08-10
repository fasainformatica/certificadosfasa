@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -File "%SCRIPT_DIR%FasaInternalNotifier.ps1" -SelfTest -PreviewPopup
pause
endlocal
