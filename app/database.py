"""Database layer — libsql_client (Turso / libSQL).

Tables
------
- **cards** – snapshot of each graded-card lookup
- **price_history** – every API result over time (feeds conformal prediction)
- **marketplace_sales** – historical record of marketplace sales
- **marketplace_listings** – snapshot of active marketplace listings

Credentials are loaded from a ``.env`` file in the project root (or from
real environment variables when deployed).  Required keys::

    TURSO_DATABASE_URL=libsql://<db>.<org>.turso.io
    TURSO_AUTH_TOKEN=<token>
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import libsql_client
from dotenv import load_dotenv

# ── Load .env (project root, two levels up from this file) ───────────
# load_dotenv() is a no-op when variables are already set in the environment,
# so this is safe to call in production deployments too.
_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_ENV_FILE)

# ── Connection factory ────────────────────────────────────────────────

TURSO_DATABASE_URL: str = os.getenv("TURSO_DATABASE_URL", "")
TURSO_AUTH_TOKEN: str = os.getenv("TURSO_AUTH_TOKEN", "")

if not TURSO_DATABASE_URL or not TURSO_AUTH_TOKEN:
    raise EnvironmentError(
        "Missing Turso credentials. Set TURSO_DATABASE_URL and "
        "TURSO_AUTH_TOKEN in your .env file or environment."
    )


def _get_client() -> libsql_client.Client:
    """Return a new libsql_client.Client for a single operation.

    The Turso dashboard shows ``libsql://`` URLs, but the Python client's
    HTTP transport requires ``https://``.  We normalise the scheme here so
    the env-var value can be copy-pasted verbatim from the dashboard.
    """
    url = TURSO_DATABASE_URL
    if url.startswith("libsql://"):
        url = "https://" + url[len("libsql://"):]
    return libsql_client.create_client(
        url=url,
        auth_token=TURSO_AUTH_TOKEN,
    )


# ── Row dataclasses (mimic SQLAlchemy ORM attribute access) ──────────


@dataclass
class Card:
    """Snapshot of a graded-card lookup from the Renaiss Index API."""

    id: int | None
    card_name: str
    set_name: str
    item_no: str
    cert: str
    grade: str | None
    fmv: float | None
    confidence_tier: str | None
    freshness_days: int | None
    pack_name: str | None
    rarity: str | None
    fetched_at: datetime

    def __repr__(self) -> str:
        return (
            f"<Card id={self.id} cert={self.cert!r} "
            f"fmv={self.fmv} fetched_at={self.fetched_at}>"
        )


@dataclass
class PriceHistory:
    """Historical price record — one row per API call, used for
    building conformal-prediction intervals over time."""

    id: int | None
    cert: str
    price: float
    pack_name: str | None
    rarity: str | None
    fetched_at: datetime

    def __repr__(self) -> str:
        return (
            f"<PriceHistory id={self.id} cert={self.cert!r} "
            f"price={self.price} fetched_at={self.fetched_at}>"
        )


@dataclass
class MarketplaceSale:
    """Historical record of marketplace sales pulled from the Renaiss CLI."""

    id: int | None
    token_id: str
    card_name: str
    grade: str | None
    price: float
    sold_at: datetime

    def __repr__(self) -> str:
        return (
            f"<MarketplaceSale id={self.id} token_id={self.token_id!r} "
            f"price={self.price} sold_at={self.sold_at}>"
        )


@dataclass
class MarketplaceListing:
    """Snapshot of active marketplace listings pulled from the Renaiss CLI."""

    id: int | None
    token_id: str
    card_name: str
    set_name: str | None
    year: int | None
    grade: str | None
    ask_price: float
    fmv: float
    price_gap: float
    fetched_at: datetime

    def __repr__(self) -> str:
        return (
            f"<MarketplaceListing id={self.id} token_id={self.token_id!r} "
            f"ask={self.ask_price} fmv={self.fmv} gap={self.price_gap:.2f}%>"
        )


# ── Datetime helpers ──────────────────────────────────────────────────


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_dt(value: str | None) -> datetime:
    """Parse an ISO-8601 string (or None) back to a datetime."""
    if not value:
        return datetime.now(timezone.utc)
    # Handle both offset-aware and naive strings stored by older rows
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return datetime.now(timezone.utc)


# ── Lifecycle helpers ─────────────────────────────────────────────────


async def init_db() -> None:
    """Create all tables if they don't already exist."""
    statements = [
        """
        CREATE TABLE IF NOT EXISTS cards (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            card_name        TEXT    NOT NULL,
            set_name         TEXT    NOT NULL,
            item_no          TEXT    NOT NULL,
            cert             TEXT    NOT NULL,
            grade            TEXT,
            fmv              REAL,
            confidence_tier  TEXT,
            freshness_days   INTEGER,
            pack_name        TEXT,
            rarity           TEXT,
            fetched_at       TEXT    NOT NULL
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_cards_cert ON cards (cert)",
        """
        CREATE TABLE IF NOT EXISTS price_history (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            cert       TEXT    NOT NULL,
            price      REAL    NOT NULL,
            pack_name  TEXT,
            rarity     TEXT,
            fetched_at TEXT    NOT NULL
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_price_history_cert ON price_history (cert)",
        """
        CREATE TABLE IF NOT EXISTS marketplace_sales (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            token_id   TEXT    NOT NULL UNIQUE,
            card_name  TEXT    NOT NULL,
            grade      TEXT,
            price      REAL    NOT NULL,
            sold_at    TEXT    NOT NULL
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_marketplace_sales_token ON marketplace_sales (token_id)",
        """
        CREATE TABLE IF NOT EXISTS marketplace_listings (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            token_id   TEXT    NOT NULL UNIQUE,
            card_name  TEXT    NOT NULL,
            set_name   TEXT,
            year       INTEGER,
            grade      TEXT,
            ask_price  REAL    NOT NULL,
            fmv        REAL    NOT NULL,
            price_gap  REAL    NOT NULL,
            fetched_at TEXT    NOT NULL
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_marketplace_listings_token ON marketplace_listings (token_id)",
    ]
    async with _get_client() as client:
        for sql in statements:
            await client.execute(sql)


async def close_db() -> None:
    """No-op — libsql_client connections are closed per-operation."""
    pass


# ── Data-access functions ─────────────────────────────────────────────


async def save_card_price(
    *,
    card_name: str,
    set_name: str,
    item_no: str,
    cert: str,
    grade: str | None = None,
    fmv: float | None = None,
    confidence_tier: str | None = None,
    freshness_days: int | None = None,
    fetched_at: datetime | None = None,
    pack_name: str | None = None,
    rarity: str | None = None,
) -> Card:
    """Persist a card lookup **and** append a price-history record.

    Parameters
    ----------
    card_name:
        Human-readable card name.
    set_name:
        Name of the card set.
    item_no:
        Item number within the set.
    cert:
        Certification / serial number from the grading slab.
    grade:
        Graded condition (e.g. ``"PSA 10"``).
    fmv:
        Fair-market-value / best estimate returned by the API.
    confidence_tier:
        Confidence level of the estimate.
    freshness_days:
        Days since the upstream data was refreshed.
    fetched_at:
        Optional custom timestamp. Defaults to now.
    pack_name:
        Optional pack name this card was pulled from.
    rarity:
        Optional rarity tier of this card/pull.

    Returns
    -------
    Card
        The newly created ``Card`` row.
    """
    ts = (fetched_at or datetime.now(timezone.utc)).isoformat()

    async with _get_client() as client:
        result = await client.execute(
            """
            INSERT INTO cards
                (card_name, set_name, item_no, cert, grade, fmv,
                 confidence_tier, freshness_days, pack_name, rarity, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [card_name, set_name, item_no, cert, grade, fmv,
             confidence_tier, freshness_days, pack_name, rarity, ts],
        )
        new_id = result.last_insert_rowid

        if fmv is not None:
            await client.execute(
                """
                INSERT INTO price_history (cert, price, pack_name, rarity, fetched_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                [cert, fmv, pack_name, rarity, ts],
            )

    return Card(
        id=new_id,
        card_name=card_name,
        set_name=set_name,
        item_no=item_no,
        cert=cert,
        grade=grade,
        fmv=fmv,
        confidence_tier=confidence_tier,
        freshness_days=freshness_days,
        pack_name=pack_name,
        rarity=rarity,
        fetched_at=_parse_dt(ts),
    )


async def get_price_history(cert: str) -> list[PriceHistory]:
    """Return all historical price records for a given cert, oldest first.

    Parameters
    ----------
    cert:
        Certification number to look up.

    Returns
    -------
    list[PriceHistory]
        Chronologically ordered list of price snapshots.
    """
    async with _get_client() as client:
        result = await client.execute(
            "SELECT id, cert, price, pack_name, rarity, fetched_at "
            "FROM price_history WHERE cert = ? ORDER BY fetched_at ASC",
            [cert],
        )
    return [
        PriceHistory(
            id=row[0],
            cert=row[1],
            price=float(row[2]),
            pack_name=row[3],
            rarity=row[4],
            fetched_at=_parse_dt(row[5]),
        )
        for row in result.rows
    ]


async def get_recent_cards(limit: int = 20) -> list[Card]:
    """Return the most recent card entries, newest first.

    Parameters
    ----------
    limit:
        Maximum number of rows to return (default 20).

    Returns
    -------
    list[Card]
        The *limit* most-recently-fetched card rows.
    """
    async with _get_client() as client:
        result = await client.execute(
            "SELECT id, card_name, set_name, item_no, cert, grade, fmv, "
            "       confidence_tier, freshness_days, pack_name, rarity, fetched_at "
            "FROM cards ORDER BY fetched_at DESC LIMIT ?",
            [limit],
        )
    return [
        Card(
            id=row[0],
            card_name=row[1],
            set_name=row[2],
            item_no=row[3],
            cert=row[4],
            grade=row[5],
            fmv=float(row[6]) if row[6] is not None else None,
            confidence_tier=row[7],
            freshness_days=int(row[8]) if row[8] is not None else None,
            pack_name=row[9],
            rarity=row[10],
            fetched_at=_parse_dt(row[11]),
        )
        for row in result.rows
    ]


async def check_cert_exists(cert: str) -> bool:
    """Check if a certification (token ID) exists in the cards table.

    Parameters
    ----------
    cert:
        Certification / token ID to check.

    Returns
    -------
    bool
        True if the cert exists, False otherwise.
    """
    async with _get_client() as client:
        result = await client.execute(
            "SELECT id FROM cards WHERE cert = ? LIMIT 1",
            [cert],
        )
    return len(result.rows) > 0


async def save_marketplace_sale(
    *,
    token_id: str,
    card_name: str,
    grade: str | None = None,
    price: float,
    sold_at: datetime | None = None,
) -> MarketplaceSale:
    """Save a new marketplace sale transaction."""
    ts = (sold_at or datetime.now(timezone.utc)).isoformat()
    async with _get_client() as client:
        result = await client.execute(
            """
            INSERT INTO marketplace_sales (token_id, card_name, grade, price, sold_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            [token_id, card_name, grade, price, ts],
        )
        new_id = result.last_insert_rowid

    return MarketplaceSale(
        id=new_id,
        token_id=token_id,
        card_name=card_name,
        grade=grade,
        price=price,
        sold_at=_parse_dt(ts),
    )


async def check_marketplace_sale_exists(token_id: str) -> bool:
    """Check if a sale exists for the given token_id."""
    async with _get_client() as client:
        result = await client.execute(
            "SELECT id FROM marketplace_sales WHERE token_id = ? LIMIT 1",
            [token_id],
        )
    return len(result.rows) > 0


async def get_recent_marketplace_sales(limit: int = 20) -> list[MarketplaceSale]:
    """Retrieve the last N marketplace sales, newest first."""
    async with _get_client() as client:
        result = await client.execute(
            "SELECT id, token_id, card_name, grade, price, sold_at "
            "FROM marketplace_sales ORDER BY sold_at DESC LIMIT ?",
            [limit],
        )
    return [
        MarketplaceSale(
            id=row[0],
            token_id=row[1],
            card_name=row[2],
            grade=row[3],
            price=float(row[4]),
            sold_at=_parse_dt(row[5]),
        )
        for row in result.rows
    ]


# ── Marketplace Listing helpers ────────────────────────────────────────


async def save_marketplace_listing(
    *,
    token_id: str,
    card_name: str,
    set_name: str | None = None,
    year: int | None = None,
    grade: str | None = None,
    ask_price: float,
    fmv: float,
    price_gap: float,
    fetched_at: datetime | None = None,
) -> MarketplaceListing:
    """Upsert a marketplace listing snapshot.

    If the token_id already exists we UPDATE the numeric fields so the
    snapshot always reflects the latest ask price & FMV from the CLI.
    """
    ts = (fetched_at or datetime.now(timezone.utc)).isoformat()
    async with _get_client() as client:
        # Check if row exists
        existing = await client.execute(
            "SELECT id FROM marketplace_listings WHERE token_id = ? LIMIT 1",
            [token_id],
        )
        if existing.rows:
            row_id = existing.rows[0][0]
            await client.execute(
                """
                UPDATE marketplace_listings
                SET ask_price = ?, fmv = ?, price_gap = ?, fetched_at = ?
                WHERE token_id = ?
                """,
                [ask_price, fmv, price_gap, ts, token_id],
            )
        else:
            result = await client.execute(
                """
                INSERT INTO marketplace_listings
                    (token_id, card_name, set_name, year, grade,
                     ask_price, fmv, price_gap, fetched_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [token_id, card_name, set_name, year, grade,
                 ask_price, fmv, price_gap, ts],
            )
            row_id = result.last_insert_rowid

    return MarketplaceListing(
        id=row_id,
        token_id=token_id,
        card_name=card_name,
        set_name=set_name,
        year=year,
        grade=grade,
        ask_price=ask_price,
        fmv=fmv,
        price_gap=price_gap,
        fetched_at=_parse_dt(ts),
    )


async def get_recent_marketplace_listings(
    limit: int = 20,
) -> list[MarketplaceListing]:
    """Return the most-recently-fetched marketplace listings, newest first."""
    async with _get_client() as client:
        result = await client.execute(
            "SELECT id, token_id, card_name, set_name, year, grade, "
            "       ask_price, fmv, price_gap, fetched_at "
            "FROM marketplace_listings ORDER BY fetched_at DESC LIMIT ?",
            [limit],
        )
    return [
        MarketplaceListing(
            id=row[0],
            token_id=row[1],
            card_name=row[2],
            set_name=row[3],
            year=int(row[4]) if row[4] is not None else None,
            grade=row[5],
            ask_price=float(row[6]),
            fmv=float(row[7]),
            price_gap=float(row[8]),
            fetched_at=_parse_dt(row[9]),
        )
        for row in result.rows
    ]
