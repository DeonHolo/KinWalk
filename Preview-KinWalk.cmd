@echo off
setlocal
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
    echo Python 3 is required. Install it from https://www.python.org/downloads/
    pause
    exit /b 1
)
echo KinWalk preview: http://127.0.0.1:4173
echo Leave this window open. Press Ctrl+C to stop the preview.
echo Phone step counting is available only in the Android app.
start "" "http://127.0.0.1:4173"
python -m http.server 4173 --bind 127.0.0.1 --directory app/src/main/assets
pause
