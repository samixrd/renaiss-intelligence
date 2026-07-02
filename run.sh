#!/bin/bash
# Renaiss Glass Insight - Backend Startup Script

# Exit immediately if a command exits with a non-zero status
set -e

echo "=== [1/3] Installing Python Dependencies ==="
pip install -r requirements.txt

echo "=== [2/3] Initializing SQLite Database ==="
# Invoking the database initializer through a lightweight Python import check/run.
# FastAPI's lifespan also automatically calls init_db() on startup.
python -c "import asyncio; from app.database import init_db; asyncio.run(init_db()); print('Database initialized successfully.')"

echo "=== [3/3] Starting FastAPI Server with Uvicorn ==="
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
