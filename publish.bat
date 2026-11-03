@echo off
cd /d "%~dp0"
echo Publishing travel photos to GitHub Pages...
node publish.js
echo.
pause
