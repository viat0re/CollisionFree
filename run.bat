@echo off
setlocal

set PORT=8000
set HOST=127.0.0.1
set URL=http://%HOST%:%PORT%/index.html

echo Starting local Python web server...
echo.

start "" cmd /c "python -m http.server --bind %HOST% %PORT%"
timeout /t 1 >nul
start "" "%URL%"

pause
