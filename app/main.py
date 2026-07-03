"""Renaiss Glass Insight — FastAPI application entry point."""

import logging
import time
import traceback
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import httpx

log = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

from app.background_job import start_scheduler, stop_scheduler
from app.database import close_db, get_recent_marketplace_listings, init_db, save_card_price
from app.inference import get_price_interval
from app.pack_ev import calculate_all_packs_ev, list_packs
from app.renaiss_service import close_client, search_by_cert


# ── Simple TTL Cache ──────────────────────────────────────────────────


class SimpleTTLCache:
    def __init__(self):
        self._cache = {}

    def get(self, key):
        if key in self._cache:
            val, expiry = self._cache[key]
            if expiry is None or time.time() < expiry:
                return val
            else:
                del self._cache[key]
        return None

    def set(self, key, value, ttl_seconds):
        expiry = time.time() + ttl_seconds if ttl_seconds is not None else None
        self._cache[key] = (value, expiry)

    def clear(self):
        self._cache.clear()


cache = SimpleTTLCache()


# ── Warmup Cache Helper ───────────────────────────────────────────────


async def warmup_cache():
    """Pre-fetch and cache pack-ev and recent-sales data."""
    log.info("Starting cache warmup...")
    # 1) Warm up pack-ev (5 minutes cache)
    try:
        results = await calculate_all_packs_ev()
        cache.set("pack-ev", results, 300)
        log.info("Warmed up pack-ev cache")
    except Exception as exc:
        log.error("Failed to warm up pack-ev: %s", exc)

    # 2) Warm up recent-sales (2 minutes cache)
    try:
        rows = await get_recent_marketplace_listings(limit=20)
        def verdict(gap: float) -> str:
            if gap > 10.0:
                return "Overpriced"
            if gap < -10.0:
                return "Underpriced"
            return "Fair"
        sales = [
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
        cache.set("recent-sales", sales, 120)
        log.info("Warmed up recent-sales cache")
    except Exception as exc:
        log.error("Failed to warm up recent-sales: %s", exc)


# ── Lifespan ──────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Manage startup / shutdown resources."""
    await init_db()  # Create tables on first run.
    start_scheduler()  # Start background periodic syncer.
    await warmup_cache()  # Warm up the cache before the first request.
    yield
    # Tear down shared resources on shutdown.
    stop_scheduler()  # Stop background periodic syncer.
    await close_client()
    await close_db()


# ── App ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="Renaiss Glass Insight",
    version="0.1.0",
    description="Backend proxy for the Renaiss Index public API.",
    lifespan=lifespan,
)

# Explicit origin list — required when allow_credentials=True.
# A wildcard origin ("*") combined with credentials is rejected by browsers.
CORS_ORIGINS = [
    "http://localhost:5173",   # Vite dev server (default)
    "http://localhost:5174",   # Vite fallback port
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://localhost:3000",   # CRA / other dev servers
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Routes ────────────────────────────────────────────────────────────


@app.get("/")
async def root():
    """Root endpoint — confirms the API is reachable."""
    return {"status": "Renaiss Intelligence API running"}


@app.get("/health")
async def health_check():
    """Simple liveness probe."""
    return {"status": "ok"}


@app.get("/warmup")
async def warmup():
    """Explicitly trigger cache warmup."""
    await warmup_cache()
    return {"status": "success", "message": "Warmup completed"}


@app.get("/search")
async def search(cert: str = Query(..., description="Certification number")):
    """Look up a graded cert, persist the price, and return FMV with a
    conformal (or fallback) prediction interval."""
    log.info("Search request: cert=%r", cert)
    cache_key = f"search:{cert}"
    cached = cache.get(cache_key)
    if cached is not None:
        log.info("Cache hit for cert=%r", cert)
        return cached

    try:
        # 1) Fetch live data from the Renaiss Index API.
        api_result = await search_by_cert(cert)
        log.info(
            "Upstream OK: cert=%r fmv=%.2f confidence=%s freshness=%s days",
            cert,
            api_result["best_estimate"],
            api_result["confidence_tier"],
            api_result["freshness_days"],
        )

        # 2) Persist card + price history (uses real card_name/set_name from API).
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

        # 3) Compute prediction interval — pass fmv_hint so a brand-new cert
        #    (0 history rows) still returns a useful interval without crashing.
        interval = await get_price_interval(
            cert, fmv_hint=api_result["best_estimate"]
        )

        # 4) Return combined response.
        response_data = {
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
        cache.set(cache_key, response_data, 60)
        return response_data

    except httpx.HTTPStatusError as exc:
        log.error(
            "Upstream HTTP error for cert=%r: %s %s",
            cert, exc.response.status_code, exc.response.text,
        )
        raise HTTPException(
            status_code=exc.response.status_code,
            detail=f"Upstream API error ({exc.response.status_code}): {exc.response.text}",
        ) from exc

    except httpx.RequestError as exc:
        log.error("Network error calling upstream for cert=%r: %s", cert, exc)
        raise HTTPException(
            status_code=503,
            detail=f"Could not reach the Renaiss API: {exc}",
        ) from exc

    except ValueError as exc:
        log.warning("Cert not found or bad data for cert=%r: %s", cert, exc)
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    except Exception as exc:  # noqa: BLE001 — catch-all with full logging
        log.error(
            "Unexpected error in /search?cert=%s\n%s",
            cert,
            traceback.format_exc(),
        )
        raise HTTPException(
            status_code=500,
            detail=f"Internal error: {type(exc).__name__}: {exc}",
        ) from exc


@app.get("/pack-ev")
async def pack_ev():
    """Calculate the expected value of opening all packs."""
    cached = cache.get("pack-ev")
    if cached is not None:
        log.info("Cache hit for pack-ev")
        return cached

    try:
        results = await calculate_all_packs_ev()
        cache.set("pack-ev", results, 300)
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
    cached = cache.get("recent-sales")
    if cached is not None:
        log.info("Cache hit for recent-sales")
        return cached

    rows = await get_recent_marketplace_listings(limit=20)

    def verdict(gap: float) -> str:
        if gap > 10.0:
            return "Overpriced"
        if gap < -10.0:
            return "Underpriced"
        return "Fair"

    results = [
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
    cache.set("recent-sales", results, 120)
    return results
