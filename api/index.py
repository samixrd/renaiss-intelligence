"""Vercel serverless entry point for the Renaiss Glass Insight FastAPI app.

Vercel discovers the ``app`` ASGI callable from this module and handles
all HTTP routing.  All requests are forwarded here via ``vercel.json``.

Key differences vs. local ``uvicorn`` execution
------------------------------------------------
- **APScheduler is disabled** — serverless functions are stateless; background
  threads are killed after each response.  The sync jobs (pulls, marketplace
  sales & listings) must be triggered externally (e.g. Vercel Cron Jobs or a
  separate scheduled worker).
- **init_db()** is called once per cold start — it is idempotent
  (``CREATE TABLE IF NOT EXISTS``) so repeated calls are safe.
- **load_dotenv()** in ``database.py`` is a no-op on Vercel because the real
  environment variables are injected by the Vercel runtime from the project
  settings dashboard.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import httpx

log = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

from app.database import close_db, get_recent_marketplace_listings, init_db, save_card_price
from app.inference import get_price_interval
from app.pack_ev import calculate_all_packs_ev, list_packs
from app.renaiss_service import close_client, search_by_cert


# ── Lifespan (serverless-safe) ────────────────────────────────────────


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Startup: create tables.  Shutdown: release HTTP client.

    APScheduler is intentionally omitted — background threads cannot
    survive between serverless invocations.
    """
    await init_db()          # idempotent — safe on every cold start
    yield
    await close_client()
    await close_db()


# ── App ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="Renaiss Glass Insight",
    version="0.1.0",
    description="Backend proxy for the Renaiss Index public API.",
    lifespan=lifespan,
)

CORS_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://localhost:3000",
    # Add your Vercel frontend URL here, e.g.:
    # "https://renaiss-glass-insight.vercel.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Routes (identical to app/main.py) ────────────────────────────────


@app.get("/")
async def root():
    """Root endpoint — confirms the API is reachable."""
    return {"status": "Renaiss Intelligence API running"}


@app.get("/health")
async def health_check():
    """Simple liveness probe."""
    return {"status": "ok"}


@app.get("/search")
async def search(cert: str = Query(..., description="Certification number")):
    """Look up a graded cert, persist the price, and return FMV with a
    conformal (or fallback) prediction interval."""
    log.info("Search request: cert=%r", cert)
    try:
        api_result = await search_by_cert(cert)
        log.info(
            "Upstream OK: cert=%r fmv=%.2f confidence=%s freshness=%s days",
            cert,
            api_result["best_estimate"],
            api_result["confidence_tier"],
            api_result["freshness_days"],
        )

        await save_card_price(
            card_name=api_result.get("card_name", cert),
            set_name=api_result.get("set_name", ""),
            item_no="",
            cert=cert,
            grade=api_result.get("grade"),
            fmv=api_result["best_estimate"],
            confidence_tier=api_result["confidence_tier"],
            freshness_days=api_result["freshness_days"],
        )

        interval = await get_price_interval(
            cert, fmv_hint=api_result["best_estimate"]
        )

        return {
            "cert": cert,
            "card_name": api_result.get("card_name", cert),
            "set_name": api_result.get("set_name", ""),
            "grade": api_result.get("grade", ""),
            "fmv": interval["fmv"],
            "low": interval["low"],
            "high": interval["high"],
            "confidence": interval["confidence"],
            "method": interval["method"],
            "confidence_tier": api_result["confidence_tier"],
            "freshness_days": api_result["freshness_days"],
        }

    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=exc.response.status_code,
            detail=f"Upstream API error ({exc.response.status_code}): {exc.response.text}",
        ) from exc
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"Could not reach the Renaiss API: {exc}") from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        import traceback
        log.error("Unexpected error in /search?cert=%s\n%s", cert, traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Internal error: {type(exc).__name__}: {exc}") from exc


@app.get("/pack-ev")
async def pack_ev():
    """Calculate the expected value of opening all packs."""
    try:
        results = await calculate_all_packs_ev()
        return results
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/packs")
async def packs():
    """List all available packs (no API calls)."""
    return list_packs()


@app.get("/recent-sales")
async def recent_sales():
    """Return the last 20 marketplace listings with price-gap analysis."""
    rows = await get_recent_marketplace_listings(limit=20)

    def verdict(gap: float) -> str:
        if gap > 10.0:
            return "Overpriced"
        if gap < -10.0:
            return "Underpriced"
        return "Fair"

    return [
        {
            "id": row.id,
            "card_name": row.card_name,
            "set_name": row.set_name,
            "year": row.year,
            "grade": row.grade,
            "ask_price": row.ask_price,
            "fmv": row.fmv,
            "price_gap": row.price_gap,
            "verdict": verdict(row.price_gap),
            "fetched_at": row.fetched_at.isoformat() if row.fetched_at else None,
        }
        for row in rows
    ]
