"""Pack expected-value calculator.

Calculates the expected value (EV) of card packs using statistical rarity
modeling or real-time pull data from the Renaiss Index API.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

import httpx

from app.database import check_cert_exists, save_card_price

log = logging.getLogger(__name__)

RENAISS_API_BASE = "https://api.renaissos.com"

# ── EV Modeling Configuration ─────────────────────────────────────────

# OMEGA expected value is calculated using a 3-tier probability model:
# - S tier (rare, ~3% of pulls) avg FMV $690
# - B tier (uncommon, ~10% of pulls) avg FMV $64
# - C tier (common, ~87% of pulls) avg FMV $36
# Formula: (0.03 × 690) + (0.10 × 64) + (0.87 × 36) = $58.42
OMEGA_PROB_EV = (0.03 * 690.0) + (0.10 * 64.0) + (0.87 * 36.0)

# RenaCrypt expected value is calculated using a 4-tier probability model:
# - common (60% probability, avg FMV $67)
# - uncommon (30%, avg FMV $117)
# - rare (3.3%, avg FMV $163)
# - epic (6.7%, avg FMV $332)
# Formula: (0.60 × 67) + (0.30 × 117) + (0.033 × 163) + (0.067 × 332) = $102.92
RENACRYPT_PROB_EV = (0.60 * 67.0) + (0.30 * 117.0) + (0.033 * 163.0) + (0.067 * 332.0)

# Eden Pack expected value is calculated using a 2-tier probability model:
# - common (67% probability, avg FMV $66)
# - uncommon (33% probability, avg FMV $263)
# Formula: (0.67 × 66) + (0.33 × 263) = 44.22 + 86.79 = $131.01
EDEN_PROB_EV = (0.67 * 66.0) + (0.33 * 263.0)

PACK_METADATA = {
    "omega": {
        "name": "OMEGA",
        "cost": 48.00,
        "expected_value": OMEGA_PROB_EV,
        "rarity_breakdown": [
            {"tier": "S", "probability": 0.03, "avg_fmv": 690.0},
            {"tier": "B", "probability": 0.10, "avg_fmv": 64.0},
            {"tier": "C", "probability": 0.87, "avg_fmv": 36.0},
        ],
    },
    "renacrypt-pack": {
        "name": "RenaCrypt Pack",
        "cost": 88.00,
        "expected_value": RENACRYPT_PROB_EV,
        "rarity_breakdown": [
            {"tier": "common", "probability": 0.60, "avg_fmv": 67.0},
            {"tier": "uncommon", "probability": 0.30, "avg_fmv": 117.0},
            {"tier": "rare", "probability": 0.033, "avg_fmv": 163.0},
            {"tier": "epic", "probability": 0.067, "avg_fmv": 332.0},
        ],
    },
    "eden-pack": {
        "name": "Eden Pack",
        "cost": 150.00,
        "expected_value": EDEN_PROB_EV,
        "rarity_breakdown": [
            {"tier": "common", "probability": 0.67, "avg_fmv": 66.0},
            {"tier": "uncommon", "probability": 0.33, "avg_fmv": 263.0},
        ],
    },
}


# ── Subprocess Pull Fetcher ───────────────────────────────────────────


async def fetch_recent_pulls(pack_slug: str) -> list[dict]:
    """Fetch recent pack opens from the Renaiss Index API and persist them.

    Calls **GET /v1/packs/{pack_slug}/recent-opens** directly instead of
    using the ``npx renaiss packs`` CLI, which is unavailable on Vercel
    serverless.  Falls back to an empty list on any error so the static
    probability-model EV is still returned.

    Returns
    -------
    list[dict]
        List of parsed pull dicts representing the raw cards pulled.
    """
    if pack_slug not in PACK_METADATA:
        log.error("Unknown pack slug for pulls fetch: %s", pack_slug)
        return []

    url = f"{RENAISS_API_BASE}/v1/packs/{pack_slug}/recent-opens"
    log.info("Fetching recent pulls from API: GET %s", url)

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()

        pulls = data.get("cardPack", {}).get("recentOpenedPacks", [])
        log.info("Parsed %d recent pulls for %s from API", len(pulls), pack_slug)

        saved_count = 0
        pack_name = PACK_METADATA[pack_slug]["name"]

        for pull in pulls:
            token_id = pull.get("collectibleTokenId")
            if not token_id:
                continue

            # Skip if this pull already exists in the database
            if await check_cert_exists(token_id):
                continue

            tier = pull.get("tier", "common")
            # Parse fmv (it comes in cents/sub-units, e.g. 5100 represents $51.00)
            raw_fmv = float(pull.get("fmv", 0))
            fmv_usd = raw_fmv / 100.0

            # Convert pulledAtTimestamp (UNIX timestamp) to offset-aware datetime.
            timestamp = datetime.fromtimestamp(pull.get("pulledAtTimestamp"), timezone.utc)

            # Persist pull to cards + price_history tables.
            await save_card_price(
                card_name=f"{pack_name} Pull ({tier} Tier)",
                set_name=f"{pack_name} Pulls",
                item_no=token_id[-8:],
                cert=token_id,
                grade=f"Tier {tier}",
                fmv=fmv_usd,
                confidence_tier="high" if tier in ("S", "epic") else "medium",
                freshness_days=0,
                fetched_at=timestamp,
                pack_name=pack_name,
                rarity=tier,
            )
            saved_count += 1

        log.info("Saved %d new pulls for %s into database", saved_count, pack_slug)
        return pulls

    except Exception:
        log.exception("Exception occurred during fetch_recent_pulls for %s", pack_slug)
        return []


# ── EV calculation ────────────────────────────────────────────────────


async def calculate_pack_ev(pack_name: str) -> dict:
    """Calculate the expected value of opening a pack.

    Parameters
    ----------
    pack_name:
        Key into the ``PACK_METADATA`` catalogue (case-sensitive or slug match).

    Returns
    -------
    dict
        ``pack_name``       – name of the pack.
        ``cost``            – purchase price of the pack.
        ``expected_value``  – average FMV across all pullable cards.
        ``ev_ratio``        – ``expected_value / cost``.
        ``verdict``         – ``"Positive EV"`` or ``"Below EV"``.
        ``cards_fetched``   – count of recent pulls fetched.
        ``cards_total``     – total recent pulls parsed.
        ``rarity_breakdown``– tier probability and average FMV list.
    """
    # Normalize lookup key to slug
    normalized_key = pack_name.lower().replace(" pack", "").replace(" ", "-")
    if normalized_key == "renacrypt":
        normalized_key = "renacrypt-pack"
    elif normalized_key == "eden":
        normalized_key = "eden-pack"

    meta = PACK_METADATA.get(normalized_key)
    if meta is None:
        available = ", ".join(sorted(PACK_METADATA.keys()))
        raise KeyError(
            f"Unknown pack {pack_name!r} (normalized: {normalized_key!r}). Available packs: {available}"
        )

    # Fetch pulls and populate database to get real historical data.
    pulls = await fetch_recent_pulls(normalized_key)
    cards_fetched = len(pulls)
    cards_total = len(pulls)

    expected_value = meta["expected_value"]
    cost = meta["cost"]
    ev_ratio = expected_value / cost

    return {
        "pack_name": meta["name"],
        "cost": cost,
        "expected_value": round(expected_value, 2),
        "ev_ratio": round(ev_ratio, 4),
        "verdict": "Positive EV" if expected_value > cost else "Below EV",
        "cards_fetched": cards_fetched,
        "cards_total": cards_total,
        "rarity_breakdown": meta["rarity_breakdown"],
    }


async def calculate_all_packs_ev() -> list[dict]:
    """Calculate EV for all packs concurrently."""
    tasks = [calculate_pack_ev(slug) for slug in PACK_METADATA.keys()]
    return await asyncio.gather(*tasks)


def list_packs() -> list[dict]:
    """Return a summary of every available pack."""
    return [
        {
            "name": meta["name"],
            "cost": meta["cost"],
            "card_count": 30 if slug == "omega" else 8,
        }
        for slug, meta in PACK_METADATA.items()
    ]
