@echo off
setlocal

REM Run from the folder where this .bat file is located
cd /d "%~dp0"

REM Page to open (must exist in this folder)
set PAGE=108.html

REM Port for the local web server
set PORT=8000

REM Pick Python executable
set PYEXE=
where python >nul 2>nul && set PYEXE=python
if "%PYEXE%"=="" (
  where py >nul 2>nul && set PYEXE=py
)

if "%PYEXE%"=="" (
  echo.
  echo ERROR: Python was not found on PATH.
  echo Install Python 3, or add it to PATH, then try again.
  echo.
  pause
  exit /b 1
)

if not exist "%PAGE%" (
  echo.
  echo ERROR: "%PAGE%" not found in: %CD%
  echo Put run.bat next to 108.html and try again.
  echo.
  pause
  exit /b 1
)

REM Start Python HTTP server in a new window
start "Python HTTP Server" cmd /k "%PYEXE% -m http.server %PORT%"

REM Give the server a moment to start
timeout /t 1 /nobreak >nul

REM Open the page in the default browser
start "" "http://localhost:%PORT%/%PAGE%"

echo.
echo Server running at: http://localhost:%PORT%/
echo This is needed because browsers usually block ES-module imports from file:// pages.
echo Close the "Python HTTP Server" window to stop it.
echo.

endlocal
