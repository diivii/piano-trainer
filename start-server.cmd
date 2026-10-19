@echo off
rem Serves the app on http://localhost:8000 (localhost counts as secure, so Web MIDI works)
rem and opens it in the default browser.
cd /d "%~dp0"
start "" http://localhost:8000
python tools\serve.py 8000
