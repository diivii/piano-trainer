@echo off
rem Opens the sheet music catalog (PDMX, see tools/catalog.py) on http://localhost:8020.
rem Pieces added there are committed and pushed, so they appear on the live site.
cd /d "%~dp0"
start "" http://localhost:8020
python -X utf8 tools\catalog.py
