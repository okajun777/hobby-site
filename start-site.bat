@echo off
cd /d "%~dp0"
echo Local:   http://localhost:5173/
echo Travel:  http://localhost:5173/travel.html
echo Publish: publish.bat  (or auto-push 15s after photo changes)
echo Press Ctrl+C to stop.
start "" "http://localhost:5173/travel.html"
node server.js
