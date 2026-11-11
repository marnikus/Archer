@echo off
setlocal
cd /d "%~dp0"
title Archer's Long Shot - build

if not exist "node_modules\vite" call npm install
call npx vite build
if errorlevel 1 (
  echo Build failed.
  pause
  exit /b 1
)

echo.
echo Done. Standalone game: %~dp0dist\index.html
echo (single file, double-click to play, no server needed)
start "" "%~dp0dist\index.html"
pause
