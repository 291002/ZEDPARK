@echo off
cd /d "%~dp0"
echo ZED Park dashboard: http://localhost:5185
start "" http://localhost:5185
python serve.py
