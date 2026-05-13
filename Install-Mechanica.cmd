@echo off
setlocal

cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-local.ps1" -StartDevServer

if errorlevel 1 (
  echo.
  echo Mechanica setup failed. Read the message above, fix it, then run this file again.
  pause
  exit /b %errorlevel%
)

echo.
echo Mechanica setup finished.
pause
