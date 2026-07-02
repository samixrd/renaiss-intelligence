"""Conformal-prediction inference for price intervals.

Uses `MAPIE <https://mapie.readthedocs.io>`_ to produce calibrated
prediction intervals when enough history is available, and falls back
to a simple ±15 % heuristic otherwise.
"""

from __future__ import annotations

import numpy as np
from mapie.regression import CrossConformalRegressor
from sklearn.linear_model import Ridge

from app.database import get_price_history

# Minimum number of historical data points required to run
# conformal prediction.  Below this we use the ±15 % fallback.
_MIN_HISTORY = 5

# Fallback band half-width (fraction of FMV).
_FALLBACK_PCT = 0.15


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
        }


    # ── Enough data → conformal prediction via MAPIE ──────────────
    prices = np.array([h.price for h in history], dtype=np.float64)

    # Feature: sequential time-step index (0, 1, 2, …).
    X = np.arange(len(prices)).reshape(-1, 1)
    y = prices

    # Base learner — Ridge is fast, regularised, and works well for
    # the small sample sizes we typically see here.
    base_model = Ridge(alpha=1.0)

    mapie = CrossConformalRegressor(
        estimator=base_model,
        method="plus",           # jackknife+ for tighter intervals
        cv=min(5, len(prices)),  # leave-one-out when n < 5 folds
        confidence_level=confidence,
    )
    mapie.fit(X, y)

    # Predict the *next* time step (i.e. "now").
    X_next = np.array([[len(prices)]])
    y_pred, y_intervals = mapie.predict(X_next)

    fmv = float(y_pred[0])
    low = float(y_intervals[0, 0, 0])
    high = float(y_intervals[0, 1, 0])

    return {
        "fmv": round(fmv, 2),
        "low": round(low, 2),
        "high": round(high, 2),
        "confidence": confidence,
        "method": "conformal",
    }

