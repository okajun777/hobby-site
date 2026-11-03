@echo off
cd /d "%~dp0"
echo http://localhost:5173/
echo Press Ctrl+C to stop.
start "" "http://localhost:5173/"
node server.js
