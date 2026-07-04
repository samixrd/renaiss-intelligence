"""Background scheduler — three periodic jobs:

  1. sync_recent_pulls        – gacha pack pull history (every 2 min)
  2. sync_marketplace_sales   – marketplace listing snapshots as sales (every 2 min)
  3. sync_marketplace_listings– marketplace listings with ask vs FMV gap (every 2 min)
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.database import (
    check_marketplace_sale_exists,
    get_recent_marketplace_listings,
    save_marketplace_listing,
    save_marketplace_sale,
)
from app.pack_ev import fetch_recent_pulls

RENAISS_API_BASE = "https://api.renaiss.xyz"

log = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


async def _fetch_marketplace_items(offset: int = 0) -> list[dict]:
    """Fetch marketplace listings directly from the Renaiss Index API.

    Calls GET /v0/marketplace?offset=<offset> and returns the
    ``collection`` list from the JSON response.  Falls back to an empty
    list and logs the error so callers can continue gracefully.
    """
    url = f"{RENAISS_API_BASE}/v0/marketplace"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url, params={"offset": offset})
            resp.raise_for_status()
            return resp.json().get("collection", [])
    except Exception:
        log.exception("Failed to fetch marketplace listings from %s", url)
        return []

# ── Job 1: Gacha pull history ─────────────────────────────────────────

async def sync_recent_pulls() -> None:
    """Fetch fresh pull events from the Renaiss CLI for all three packs."""
    log.info("▶ sync_recent_pulls started")
    for pack in ("omega", "renacrypt-pack", "eden-pack"):
        try:
            new_pulls = await fetch_recent_pulls(pack)
            log.info("  %s → %d new pull(s)", pack, len(new_pulls))
        except Exception:
            log.exception("  Error syncing pulls for pack: %s", pack)
    log.info("✔ sync_recent_pulls done")


# ── Job 2: Marketplace sales snapshot ────────────────────────────────

async def sync_marketplace_sales() -> None:
    """Snapshot current marketplace listings into marketplace_sales.

    Fetches data directly from the Renaiss Index API instead of using
    the ``npx renaiss marketplace`` CLI (which is unavailable on Vercel
    serverless).
    """
    log.info("▶ sync_marketplace_sales started")
    try:
        items = await _fetch_marketplace_items(offset=0)
        saved = 0
        now = datetime.now(timezone.utc)

        for item in items:
            token_id = item.get("tokenId")
            if not token_id:
                continue
            if await check_marketplace_sale_exists(token_id):
                continue

            raw_fmv = float(item.get("fmvPriceInUSD", 0))
            await save_marketplace_sale(
                token_id=token_id,
                card_name=item.get("name", "Unknown"),
                grade=item.get("grade"),
                price=raw_fmv / 100.0,
                sold_at=now,
            )
            saved += 1

        log.info("✔ sync_marketplace_sales done — %d new row(s)", saved)
    except Exception:
        log.exception("Exception in sync_marketplace_sales")


# ── Job 3: Marketplace listings with price-gap analysis ──────────────

def _calc_verdict(gap: float) -> str:
    if gap > 10.0:
        return "Overpriced"
    if gap < -10.0:
        return "Underpriced"
    return "Fair"


async def sync_marketplace_listings() -> None:
    """Fetch marketplace listings, compute ask-vs-FMV gap, upsert into
    marketplace_listings table.

    Fetches data directly from the Renaiss Index API instead of using
    the ``npx renaiss marketplace`` CLI (which is unavailable on Vercel
    serverless).
    """
    log.info("▶ sync_marketplace_listings started")
    try:
        items = await _fetch_marketplace_items(offset=0)
        upserted = 0
        now = datetime.now(timezone.utc)

        for item in items:
            token_id = item.get("tokenId")
            if not token_id:
                continue

            # ask price: raw wei value → USDT (divide by 1e18)
            ask_raw = float(item.get("askPriceInUSDT", 0))
            ask_price = ask_raw / 1e18

            # FMV: already in cents → USD
            fmv_raw = float(item.get("fmvPriceInUSD", 0))
            fmv = fmv_raw / 100.0

            if fmv <= 0:
                log.debug("  Skipping token %s — zero FMV", token_id)
                continue

            price_gap = (ask_price - fmv) / fmv * 100.0

            await save_marketplace_listing(
                token_id=token_id,
                card_name=item.get("name", "Unknown Collectible"),
                set_name=item.get("setName"),
                year=item.get("year"),
                grade=item.get("grade"),
                ask_price=round(ask_price, 2),
                fmv=round(fmv, 2),
                price_gap=round(price_gap, 2),
                fetched_at=now,
            )
            upserted += 1

        log.info("✔ sync_marketplace_listings done — %d listing(s) upserted", upserted)
    except Exception:
        log.exception("Exception in sync_marketplace_listings")


# ── Scheduler lifecycle ───────────────────────────────────────────────

def start_scheduler() -> None:
    """Register all three jobs and start the scheduler."""
    if scheduler.running:
        return

    log.info("Initializing background scheduler (3 jobs)…")

    scheduler.add_job(
        sync_recent_pulls,
        "interval",
        minutes=2,
        id="sync_pulls_job",
        replace_existing=True,
    )
    scheduler.add_job(
        sync_marketplace_sales,
        "interval",
        minutes=2,
        id="sync_marketplace_sales_job",
        replace_existing=True,
    )
    scheduler.add_job(
        sync_marketplace_listings,
        "interval",
        minutes=2,
        id="sync_marketplace_listings_job",
        replace_existing=True,
    )

    scheduler.start()
    log.info("Background scheduler started — 3 jobs active.")


def stop_scheduler() -> None:
    """Gracefully shut down the scheduler."""
    if scheduler.running:
        log.info("Stopping background scheduler…")
        scheduler.shutdown()
        log.info("Background scheduler stopped.")
