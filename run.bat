@echo off
REM Renaiss Glass Insight — Windows startup script
REM Run from the project root: renaiss-glass-insight-main\

echo === [1/3] Installing Python Dependencies ===
pip install -r requirements.txt
if errorlevel 1 (
    echo ERROR: pip install failed. Make sure Python is installed and on your PATH.
    exit /b 1
)

echo.
echo === [2/3] Initializing SQLite Database ===
python -c "import asyncio; from app.database import init_db; asyncio.run(init_db()); print('Database initialized successfully.')"
if errorlevel 1 (
    echo ERROR: Database initialization failed.
    exit /b 1
)

echo.
echo === [3/3] Starting FastAPI Server ===
echo   URL: http://localhost:8000
echo   Docs: http://localhost:8000/docs
echo   Press Ctrl+C to stop.
echo.
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
