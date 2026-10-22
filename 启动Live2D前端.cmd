@echo off
chcp 65001 >nul
cd /d "%~dp0"
node "app\scripts\serve-live2d.cjs"
pause
