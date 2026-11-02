"""Startup schema guard: idempotently apply columns the code needs.

Production (Neon) is not always migrated with `alembic upgrade head` — see
NEON_SQL_FIX.sql. A missing column makes every query on that table 500, which
browsers report as a CORS error. These statements mirror alembic 023-025 and are
safe to run on every boot.
"""

import logging

from sqlalchemy import text

from app.catalog.packages import PACKAGE_OVERVIEWS, PLACEHOLDER_PREFIX
from app.core.database import engine

log = logging.getLogger(__name__)

# (name, title, location, chainage_from, chainage_to) — same data as alembic 023.
_PACKAGES = [
    (
        "Jabalpur - Lakhnadon",
        "Tolling, Operation, Maintenance & Transfer of four lane section from Jabalpur to "
        "Lakhnadon section of NH-30 (Km 880.600 to Km 891.780) and NH-34 (Km 1358.000 to "
        "Km 1428.557) in the State of Madhya Pradesh.",
        "NH-30 & NH-34, Madhya Pradesh",
        "880+600 (NH-30) / 1358+000 (NH-34)",
        "891+780 (NH-30) / 1428+557 (NH-34)",
    ),
    (
        "Lakhnadon - Khawasa",
        "Tolling, Operation, Maintenance & Transfer of Lakhnadon-Mohagaon-Khawasa Section of "
        "NH-44 in the State of Madhya Pradesh (Mohagaon-Khawasa Section existing Chainage "
        "624+480 km to 653+770 km, Length of the Section = 29.29 km).",
        "NH-44, Madhya Pradesh",
        "624+480",
        "653+770",
    ),
    (
        "Bokhedi - Kelapur",
        "Tolling, Operation, Maintenance & Transfer of Borkhedi–Wadner–Deodhari from "
        "km 36+600 to km 175+000 of NH-44 section in the State of Maharashtra.",
        "NH-44, Maharashtra",
        "36+600",
        "175+000",
    ),
]


# Dashboard tile labels (alembic 025).
_SHORT_NAMES = {
    "Jabalpur - Lakhnadon": "Jabalpur – Lakhnadon",
    "Lakhnadon - Khawasa": "Mahagaon – Khawasa",
    "Bokhedi - Kelapur": "Borkhedi – Wadner – Kelapur",
}


async def _column_exists(conn, table: str, column: str) -> bool:
    row = await conn.execute(
        text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_schema = current_schema() AND table_name = :t AND column_name = :c"
        ),
        {"t": table, "c": column},
    )
    return row.first() is not None


async def ensure_schema() -> None:
    try:
        async with engine.begin() as conn:
            if not await _column_exists(conn, "projects", "title"):
                # First boot with project titles: add the column and load the three packages
                # (same as alembic 023). Runs once, so later admin edits are not overwritten.
                await conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS title VARCHAR(512)"))
                for name, title, location, ch_from, ch_to in _PACKAGES:
                    await conn.execute(
                        text(
                            "UPDATE projects SET title = :t, location = :l, chainage_from = :f, "
                            "chainage_to = :c, is_active = true WHERE name = :n"
                        ),
                        {"n": name, "t": title, "l": location, "f": ch_from, "c": ch_to},
                    )
                await conn.execute(
                    text("UPDATE projects SET is_active = false WHERE name = 'NH Demo Corridor'")
                )
                log.warning("schema_guard: added projects.title and loaded package titles")
            if not await _column_exists(conn, "projects", "short_name"):
                await conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS short_name VARCHAR(120)"))
                for name, short in _SHORT_NAMES.items():
                    await conn.execute(
                        text("UPDATE projects SET short_name = :s WHERE name = :n AND short_name IS NULL"),
                        {"n": name, "s": short},
                    )
                log.warning("schema_guard: added projects.short_name")
            await conn.execute(text("ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link VARCHAR(255)"))
            # Package overview text replaces only the auto placeholder, never a portal edit.
            for name, overview in PACKAGE_OVERVIEWS.items():
                await conn.execute(
                    text(
                        "UPDATE projects SET description = :d WHERE name = :n "
                        "AND (description IS NULL OR description LIKE :p)"
                    ),
                    {"n": name, "d": overview, "p": PLACEHOLDER_PREFIX + "%"},
                )
    except Exception:  # noqa: BLE001 — never block startup; endpoints will surface the error
        log.exception("schema_guard: could not verify schema")
