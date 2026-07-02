"""Vercel serverless entry point.

Vercel's Python runtime discovers the ``app`` ASGI callable from this
module.  All HTTP requests are forwarded here via the ``routes`` block
in ``vercel.json``.

Differences from the local ``uvicorn`` server
----------------------------------------------
- **APScheduler is disabled** on Vercel — serverless functions are
  ephemeral; background threads are killed after each response.
  Marketplace-sync jobs should be triggered via Vercel Cron Jobs or an
  external scheduler instead.
- ``init_db()`` still runs on every cold start; it is idempotent
  (``CREATE TABLE IF NOT EXISTS``) so repeated calls are harmless.
- ``load_dotenv()`` inside ``database.py`` becomes a no-op on Vercel
  because the runtime injects environment variables directly from the
  project dashboard — no ``.env`` file is present or needed.
"""

from app.main import app  # noqa: F401 — re-exported for Vercel runtime

__all__ = ["app"]
