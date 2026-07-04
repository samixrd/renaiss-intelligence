"""Conformal-prediction inference for price intervals.

On Vercel serverless, scikit-learn and MAPIE exceed the 250 MB Lambda
size limit, so we use a lightweight pure-Python implementation:

- **≥5 history points** → jackknife-style interval using mean ± k·std
  where k is chosen so the coverage matches the requested confidence level
  (normal approximation: k ≈ 1.28 for 80 %).
- **1–4 history points** → simple ±15 % heuristic around the latest price.
- **0 history points** → ±15 % around the supplied ``fmv_hint``.

This gives sensible, calibrated-ish intervals without any compiled
dependencies.

All returned dicts include:
  ``n_samples``     – number of historical observations used.
  ``calibrated_at`` – ISO-8601 UTC timestamp of this calibration run.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone

from app.database import get_price_history

# Minimum number of historical data points required to run
# the statistical interval.  Below this we use the ±15 % fallback.
_MIN_HISTORY = 5

# Fallback band half-width (fraction of FMV).
_FALLBACK_PCT = 0.15

# Normal quantile for each supported confidence level (two-tailed).
# z = scipy.stats.norm.ppf((1 + confidence) / 2)
_Z_TABLE = {
    0.80: 1.2816,
    0.85: 1.4395,
    0.90: 1.6449,
    0.95: 1.9600,
}


def _z_for(confidence: float) -> float:
    """Return the normal quantile z for a given confidence level."""
    if confidence in _Z_TABLE:
        return _Z_TABLE[confidence]
    # Generic approximation for any confidence in (0, 1).
    # Uses the rational approximation from Abramowitz & Stegun §26.2.17.
    p = (1 + confidence) / 2
    t = math.sqrt(-2 * math.log(1 - p))
    c0, c1, c2 = 2.515517, 0.802853, 0.010328
    d1, d2, d3 = 1.432788, 0.189269, 0.001308
    return t - (c0 + c1 * t + c2 * t ** 2) / (1 + d1 * t + d2 * t ** 2 + d3 * t ** 3)


async def get_price_interval(
    cert: str,
    confidence: float = 0.80,
    fmv_hint: float | None = None,
) -> dict:
    """Return a prediction interval for the current FMV of *cert*.

    Parameters
    ----------
    cert:
        Certification number whose price history is queried.
    confidence:
        Desired confidence level for the interval (default 80 %).
    fmv_hint:
        If supplied, used as the FMV when the database has no history yet
        for this cert (avoids raising on a brand-new lookup).

    Returns
    -------
    dict
        ``fmv``        – point estimate (latest observed price).
        ``low``        – lower bound of the interval.
        ``high``       – upper bound of the interval.
        ``confidence`` – confidence level that was used.
        ``method``     – ``"conformal"``, ``"fallback"``, or ``"hint"``.
    """
    history = await get_price_history(cert)

    now_iso = datetime.now(timezone.utc).isoformat()

    # ── No history at all ──────────────────────────────────────────
    if not history:
        if fmv_hint is not None:
            fmv = fmv_hint
        else:
            raise ValueError(
                f"No price history found for cert {cert!r}. "
                "Fetch at least one price before requesting an interval."
            )
        margin = fmv * _FALLBACK_PCT
        return {
            "fmv": round(fmv, 2),
            "low": round(fmv - margin, 2),
            "high": round(fmv + margin, 2),
            "confidence": confidence,
            "method": "hint",
            "n_samples": 0,
            "calibrated_at": now_iso,
        }

    # ── Not enough data → simple heuristic ────────────────────────
    if len(history) < _MIN_HISTORY:
        fmv = history[-1].price  # most recent observation
        margin = fmv * _FALLBACK_PCT
        return {
            "fmv": round(fmv, 2),
            "low": round(fmv - margin, 2),
            "high": round(fmv + margin, 2),
            "confidence": confidence,
            "method": "fallback",
            "n_samples": len(history),
            "calibrated_at": now_iso,
        }

    # ── Enough data → lightweight statistical interval ─────────────
    prices = [h.price for h in history]
    n = len(prices)
    mean = sum(prices) / n
    variance = sum((p - mean) ** 2 for p in prices) / (n - 1)  # sample variance
    std = math.sqrt(variance) if variance > 0 else mean * _FALLBACK_PCT

    # Use the most recent price as the point estimate (mirrors the API FMV).
    fmv = prices[-1]

    # Prediction interval: fmv ± z * std  (normal approximation)
    z = _z_for(confidence)
    margin = z * std

    return {
        "fmv": round(fmv, 2),
        "low": round(max(0.0, fmv - margin), 2),
        "high": round(fmv + margin, 2),
        "confidence": confidence,
        "method": "conformal",
        "n_samples": n,
        "calibrated_at": now_iso,
    }
