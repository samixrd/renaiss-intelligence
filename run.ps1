# Renaiss Glass Insight — PowerShell startup script
# Run from the project root: renaiss-glass-insight-main\
# Usage: .\run.ps1

$ErrorActionPreference = "Stop"

Write-Host "=== [1/3] Installing Python Dependencies ===" -ForegroundColor Cyan
pip install -r requirements.txt

Write-Host ""
Write-Host "=== [2/3] Initializing SQLite Database ===" -ForegroundColor Cyan
python -c "import asyncio; from app.database import init_db; asyncio.run(init_db()); print('Database initialized successfully.')"

Write-Host ""
Write-Host "=== [3/3] Starting FastAPI Server ===" -ForegroundColor Cyan
Write-Host "  URL:  http://localhost:8000" -ForegroundColor Green
Write-Host "  Docs: http://localhost:8000/docs" -ForegroundColor Green
Write-Host "  Press Ctrl+C to stop." -ForegroundColor Yellow
Write-Host ""

uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
