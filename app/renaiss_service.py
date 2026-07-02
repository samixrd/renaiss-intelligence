"""Service layer for calling the Renaiss Index API.

Base URL: https://api.renaissos.com
No authentication headers are required for the public tier.

Real response shape for GET /v1/graded/{cert}:
{
  "cert": "PSA...",
  "found": true,
  "grade": "10 Gem Mint",
  "gradeLabel": "PSA 10",
  "card": {
    "name": "Charizard",
    "setName": "Base Set",
    "priceUsdCents": 11164,   ← FMV in cents  (÷100 → USD)
    "confidence": "low",      ← "high" | "medium" | "low"
    "lastSaleAt": "2026-06-21T00:00:00.000Z"
  }
}
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

import httpx

log = logging.getLogger(__name__)

BASE_URL = "https://api.renaissos.com"

# Re-used across calls for connection pooling.  Created lazily so the
# module can be imported without side-effects during testing.
_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    """Return (and lazily create) a module-level async HTTP client."""
    global _client
    if _client is None:
        _client = httpx.AsyncClient(base_url=BASE_URL, timeout=30.0)
    return _client


async def close_client() -> None:
    """Gracefully close the shared HTTP client (called on app shutdown)."""
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


# ── Helpers ───────────────────────────────────────────────────────────

def _freshness_days(last_sale_at: str | None) -> int:
    """Convert an ISO-8601 lastSaleAt string to days-since-last-sale."""
    if not last_sale_at:
        return -1
    try:
        sale_dt = datetime.fromisoformat(last_sale_at.replace("Z", "+00:00"))
        delta = datetime.now(timezone.utc) - sale_dt
        return max(0, delta.days)
    except Exception:
        return -1


# ── Public API ────────────────────────────────────────────────────────


async def search_by_cert(cert: str) -> dict:
    """Look up a graded item by its certification number.

    Calls **GET /v1/graded/{cert}** and returns a normalised dict with:
    - ``best_estimate``   – FMV in USD (float)
    - ``confidence_tier`` – "high" | "medium" | "low"
    - ``freshness_days``  – days since the last recorded sale (int)
    - ``card_name``       – card name from the index
    - ``set_name``        – set name
    - ``grade``           – grade label (e.g. "10 Gem Mint")

    Raises
    ------
    httpx.HTTPStatusError
        If the upstream API returns a non-2xx status code.
    ValueError
        If the cert is not found (``found == false``) or the response is
        missing expected fields.
    """
    client = _get_client()
    url = f"/v1/graded/{cert}"
    log.debug("Calling upstream API: GET %s%s", BASE_URL, url)

    response = await client.get(url)
    response.raise_for_status()

    payload = response.json()
    log.debug("Upstream response for cert=%r: %s", cert, payload)

    # ── Guard: cert not found ──────────────────────────────────────
    if not payload.get("found", False):
        reason = payload.get("reason") or "Cert not found in the Renaiss index."
        raise ValueError(f"Cert {cert!r} not found: {reason}")

    card = payload.get("card") or {}

    # ── Extract FMV ────────────────────────────────────────────────
    price_cents = card.get("priceUsdCents")
    if price_cents is None:
        raise ValueError(
            f"Upstream response for cert {cert!r} is missing 'card.priceUsdCents'. "
            f"Raw payload: {payload}"
        )
    best_estimate = price_cents / 100.0

    # ── Confidence tier ────────────────────────────────────────────
    confidence_tier = (card.get("confidence") or "unknown").lower()

    # ── Freshness ──────────────────────────────────────────────────
    freshness_days = _freshness_days(card.get("lastSaleAt"))

    return {
        "best_estimate": best_estimate,
        "confidence_tier": confidence_tier,
        "freshness_days": freshness_days,
        "card_name": card.get("name", cert),
        "set_name": card.get("setName", ""),
        "grade": payload.get("gradeLabel") or payload.get("grade", ""),
    }


async def search_by_card(
    set_name: str,
    item_no: str,
    variation: str,
    language: str,
) -> dict:
    """Look up a card's index entry by its item number and attributes.

    Calls **GET /v1/index/item-by-no** with query parameters and
    returns the full JSON payload from the upstream API.

    Raises
    ------
    httpx.HTTPStatusError
        If the upstream API returns a non-2xx status code.
    """
    client = _get_client()
    response = await client.get(
        "/v1/index/item-by-no",
        params={
            "set_name": set_name,
            "item_no": item_no,
            "variation": variation,
            "language": language,
        },
    )
    response.raise_for_status()
    return response.json()
