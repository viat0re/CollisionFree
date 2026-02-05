@echo off
setlocal

set PORT=8000
set URL=http://127.0.0.1:%PORT%/index.html

echo Starting local Python web server...
echo.

start "" cmd /c "python -m http.server %PORT%"
timeout /t 1 >nul
start "" "%URL%"

pause
