@echo off
setlocal
cd /d "%~dp0"
title Archer's Long Shot

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get it from https://nodejs.org and run this again.
  pause
  exit /b 1
)

if not exist "node_modules\vite" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

echo Starting Archer's Long Shot... (close this window or press Ctrl+C to stop)
call npx vite --open
pause
