@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
start "" "%SCRIPT_DIR%FasaNotifierApp.exe" --self-test --preview-popup
endlocal
