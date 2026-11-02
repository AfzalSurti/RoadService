"""Startup schema guard: idempotently apply columns the code needs.

Production (Neon) is not always migrated with `alembic upgrade head` — see
NEON_SQL_FIX.sql. A missing column makes every query on that table 500, which
browsers report as a CORS error. These statements mirror alembic 023-034 and are
safe to run on every boot.
"""

import asyncio
import json
import logging
from pathlib import Path

from sqlalchemy import text

from app.catalog.packages import (
    PACKAGE_IMAGES,
    PACKAGE_INVENTORY,
    DEFAULT_PARTIES,
    PACKAGE_CONCESSIONAIRES,
    PACKAGE_INVENTORY_WORKBOOKS,
    PACKAGE_OVERVIEWS,
    PLACEHOLDER_PREFIX,
)
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


# alembic 028: several files per vendor and type; existing work order / LOA copied in once.
VENDOR_DOCUMENTS_DDL = (
    "CREATE TABLE IF NOT EXISTS vendor_documents ("
    " id SERIAL PRIMARY KEY,"
    " vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,"
    " doc_type VARCHAR(32) NOT NULL,"
    " file_path VARCHAR(1024) NOT NULL,"
    " file_name VARCHAR(255),"
    " uploaded_by_id INTEGER REFERENCES users(id),"
    " created_at TIMESTAMPTZ DEFAULT NOW())",
    "CREATE INDEX IF NOT EXISTS ix_vendor_documents_vendor_id ON vendor_documents (vendor_id)",
)
VENDOR_DOCUMENTS_BACKFILL = (
    "INSERT INTO vendor_documents (vendor_id, doc_type, file_path) "
    "SELECT id, 'work_order', work_order_path FROM vendors WHERE work_order_path IS NOT NULL "
    "UNION ALL SELECT id, 'loa', loa_path FROM vendors WHERE loa_path IS NOT NULL"
)


# alembic 029: Project Inventory scope rows, seeded once from PACKAGE_INVENTORY.
INVENTORY_DDL = (
    "CREATE TABLE IF NOT EXISTS project_inventory_items ("
    " id SERIAL PRIMARY KEY,"
    " project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,"
    " sort_order INTEGER NOT NULL DEFAULT 0,"
    " scope VARCHAR(255) NOT NULL,"
    " description TEXT NOT NULL DEFAULT '')",
    "CREATE INDEX IF NOT EXISTS ix_project_inventory_items_project_id ON project_inventory_items (project_id)",
)


# alembic 031: vendor bills on quantity entries.
BILL_COLUMNS_DDL = (
    "ALTER TABLE quantity_entries ADD COLUMN IF NOT EXISTS vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL",
    "ALTER TABLE quantity_entries ADD COLUMN IF NOT EXISTS bill_no VARCHAR(64)",
    "ALTER TABLE quantity_entries ADD COLUMN IF NOT EXISTS bill_date DATE",
    "CREATE INDEX IF NOT EXISTS ix_quantity_entries_vendor_id ON quantity_entries (vendor_id)",
)


# alembic 032: package inventory workbooks as Project Inventory tabs.
INVENTORY_SHEETS_DDL = (
    "CREATE TABLE IF NOT EXISTS project_inventory_sheets ("
    " id SERIAL PRIMARY KEY,"
    " project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,"
    " sort_order INTEGER NOT NULL DEFAULT 0,"
    " name VARCHAR(120) NOT NULL,"
    " grid TEXT NOT NULL DEFAULT '[]',"
    " merges TEXT NOT NULL DEFAULT '[]',"
    " updated_at TIMESTAMPTZ DEFAULT NOW())",
    "CREATE INDEX IF NOT EXISTS ix_project_inventory_sheets_project_id ON project_inventory_sheets (project_id)",
)
WORKBOOK_DIR = Path(__file__).resolve().parent.parent / "catalog" / "inventory"


def load_bundled_workbooks() -> dict[str, list[dict]]:
    """Parse the bundled package workbooks (package name -> sheets); missing files are skipped."""
    from app.services.inventory_sheets import parse_workbook

    out: dict[str, list[dict]] = {}
    for name, filename in PACKAGE_INVENTORY_WORKBOOKS.items():
        path = WORKBOOK_DIR / filename
        if path.is_file():
            try:
                out[name] = parse_workbook(path)
            except Exception:  # noqa: BLE001
                log.exception("schema_guard: could not read %s", filename)
    return out


def inventory_sheet_inserts(workbooks: dict[str, list[dict]]):
    """INSERT statements for every sheet of every bundled workbook."""
    stmt = (
        "INSERT INTO project_inventory_sheets (project_id, sort_order, name, grid, merges) "
        "SELECT id, :o, :s, :g, :m FROM projects WHERE name = :n"
    )
    for name, sheets in workbooks.items():
        for order, sheet in enumerate(sheets, start=1):
            yield stmt, {
                "n": name,
                "o": order,
                "s": sheet["name"][:120],
                "g": json.dumps(sheet["grid"], ensure_ascii=False),
                "m": json.dumps(sheet["merges"]),
            }


# alembic 033: parties on RFI reports; defaults fill only empty values.
PARTY_COLUMNS = ("authority", "project_impl_authority", "concessionaire", "gmc_name", "epc_contractor")


def party_statements():
    for col in PARTY_COLUMNS:
        yield f"ALTER TABLE projects ADD COLUMN IF NOT EXISTS {col} VARCHAR(255)", {}
    for col, value in DEFAULT_PARTIES.items():
        yield f"UPDATE projects SET {col} = :v WHERE {col} IS NULL", {"v": value}
    for name, value in PACKAGE_CONCESSIONAIRES.items():
        yield "UPDATE projects SET concessionaire = :v WHERE concessionaire IS NULL AND name = :n", {"v": value, "n": name}


# alembic 034: MPR -> MSR folder name (files stay in the renamed folder).
MSR_FOLDER_RENAME = (
    "UPDATE document_folders SET name = 'Monthly Status Reports (MSR)' "
    "WHERE name = 'Monthly Progress Reports (MPR)'"
)


async def seed_inventory(conn) -> None:
    """Fill each package's table from the Project Location sheets."""
    for name, rows in PACKAGE_INVENTORY.items():
        for order, (scope, description) in enumerate(rows, start=1):
            await conn.execute(
                text(
                    "INSERT INTO project_inventory_items (project_id, sort_order, scope, description) "
                    "SELECT id, :o, :s, :d FROM projects WHERE name = :n"
                ),
                {"n": name, "o": order, "s": scope, "d": description},
            )


async def _table_exists(conn, table: str) -> bool:
    row = await conn.execute(
        text(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema = current_schema() AND table_name = :t"
        ),
        {"t": table},
    )
    return row.first() is not None


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
            await conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS image_url VARCHAR(1024)"))
            await conn.execute(text("ALTER TABLE vendors ADD COLUMN IF NOT EXISTS extension_of_time VARCHAR(128)"))
            if not await _table_exists(conn, "vendor_documents"):
                for stmt in VENDOR_DOCUMENTS_DDL:
                    await conn.execute(text(stmt))
                await conn.execute(text(VENDOR_DOCUMENTS_BACKFILL))
                log.warning("schema_guard: created vendor_documents")
            await conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS location_map_url VARCHAR(1024)"))
            await conn.execute(
                text(
                    "ALTER TABLE rate_items ADD COLUMN IF NOT EXISTS vendor_id INTEGER "
                    "REFERENCES vendors(id) ON DELETE SET NULL"
                )
            )
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_rate_items_vendor_id ON rate_items (vendor_id)"))
            for stmt in BILL_COLUMNS_DDL:
                await conn.execute(text(stmt))
            for stmt, params in party_statements():
                await conn.execute(text(stmt), params)
            # MPR is now MSR (Monthly Status Report): rename the package folders in place.
            await conn.execute(text(MSR_FOLDER_RENAME))
            if not await _table_exists(conn, "project_inventory_sheets"):
                for stmt in INVENTORY_SHEETS_DDL:
                    await conn.execute(text(stmt))
                workbooks = await asyncio.to_thread(load_bundled_workbooks)
                for stmt, params in inventory_sheet_inserts(workbooks):
                    await conn.execute(text(stmt), params)
                log.warning("schema_guard: created project_inventory_sheets")
            if not await _table_exists(conn, "project_inventory_items"):
                for stmt in INVENTORY_DDL:
                    await conn.execute(text(stmt))
                await seed_inventory(conn)
                log.warning("schema_guard: created project_inventory_items")
            for name, image in PACKAGE_IMAGES.items():
                await conn.execute(
                    text("UPDATE projects SET image_url = :i WHERE name = :n AND image_url IS NULL"),
                    {"n": name, "i": image},
                )
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
