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


VENDOR_CONTACT_COLUMNS = (
    ("contact_person", "VARCHAR(255)"),
    ("contact_phone", "VARCHAR(64)"),
    ("contact_email", "VARCHAR(255)"),
    ("contact_address", "TEXT"),
    ("gst_no", "VARCHAR(32)"),
)
VENDOR_CONTACT_BACKFILL = (
    "UPDATE vendors SET contact_person = LEFT(TRIM(substring(remarks from 'Contact: ([^\n]+)')), 255) "
    "WHERE contact_person IS NULL AND remarks LIKE '%Contact: %'"
)


async def insert_tracker(execute, project_id: int, orders: list[dict], items: list[dict]) -> tuple[int, int]:
    """Add tracker orders as vendors (with their BOQ items) to a package, skipping WO numbers
    already present. `execute` is an AsyncConnection / AsyncSession `execute`."""
    have = {
        (r or "").split("\n", 1)[0].removeprefix("WO No: ").strip()
        for r in (
            await execute(
                text("SELECT remarks FROM vendors WHERE project_id = :p AND remarks LIKE 'WO No: %'"), {"p": project_id}
            )
        ).scalars()
    }
    added_orders = added_items = 0
    for o in orders:
        if o["wo"] in have:
            continue
        have.add(o["wo"])
        remarks = f"WO No: {o['wo']}\n{o['type']} · {o['location']}"
        if o["contact"]:
            remarks += f"\nContact: {o['contact']}"
        if o["net"]:
            remarks += f"\nNet order value: Rs {float(o['net']):,.2f} (excl. GST)"
        vid = (
            await execute(
                text(
                    "INSERT INTO vendors (project_id, name, brief, type_of_work, work_order_date, commencement_date, "
                    "time_limit_completion, progress_notes, remarks, contact_person) "
                    "VALUES (:p, :name, :brief, :tw, :wod, :cd, :tl, :pn, :rm, :cp) RETURNING id"
                ),
                {
                    "p": project_id,
                    "name": o["supplier"][:255] or o["wo"][:255],
                    "brief": o["scope"],
                    "tw": o["category"],
                    "wod": o["order_date"],
                    "cd": o["commencement"],
                    "tl": o["days"],
                    "pn": o["status"] or None,
                    "rm": remarks,
                    "cp": (o["contact"] or None) and o["contact"][:255],
                },
            )
        ).scalar()
        added_orders += 1
        for it in (i for i in items if i["wo"] == o["wo"]):
            await execute(
                text(
                    "INSERT INTO rate_items (project_id, vendor_id, item_no, description, unit, boq_quantity, rate, "
                    "boq_amount, executed_quantity, executed_amount) "
                    "VALUES (:p, :v, :no, :d, :u, :q, :r, :a, :eq, :ea)"
                ),
                {
                    "p": project_id,
                    "v": vid,
                    "no": it["item_no"],
                    "d": it["description"],
                    "u": it["unit"],
                    "q": it["qty"],
                    "r": it["rate"],
                    "a": round(it["qty"] * it["rate"], 2),
                    "eq": it["done"],
                    "ea": round(it["done"] * it["rate"], 2),
                },
            )
            added_items += 1
    return added_orders, added_items


async def delete_vendors(execute, vendor_ids: list[int]) -> None:
    """Remove vendors with their BOQ items (and those items' quantity entries / bills)."""
    if not vendor_ids:
        return
    ids = {"ids": list(vendor_ids)}
    await execute(
        text(
            "DELETE FROM quantity_entries WHERE vendor_id = ANY(:ids) OR rate_item_id IN "
            "(SELECT id FROM rate_items WHERE vendor_id = ANY(:ids))"
        ),
        ids,
    )
    await execute(text("DELETE FROM rate_items WHERE vendor_id = ANY(:ids)"), ids)
    await execute(text("DELETE FROM vendors WHERE id = ANY(:ids)"), ids)


async def sync_tracker(execute, project_id: int, orders: list[dict], items: list[dict]) -> dict:
    """Make a package match an updated tracker workbook: update existing orders (details and
    BOQ quantities / work done), add new orders and items, and remove orders and items that are
    no longer in the workbook. Vendors added by hand (not from a tracker) are left alone."""
    rows = (
        await execute(
            text("SELECT id, remarks FROM vendors WHERE project_id = :p AND remarks LIKE 'WO No: %'"),
            {"p": project_id},
        )
    ).all()
    by_wo: dict[str, int] = {}
    for vid, remarks in rows:
        by_wo.setdefault((remarks or "").split("\n", 1)[0].removeprefix("WO No: ").strip(), vid)
    wanted = {o["wo"] for o in orders}
    removed = [vid for wo, vid in by_wo.items() if wo not in wanted]
    await delete_vendors(execute, removed)

    updated_orders = updated_items = removed_items = 0
    for o in orders:
        vid = by_wo.get(o["wo"])
        if vid is None:
            continue
        remarks = f"WO No: {o['wo']}\n{o['type']} · {o['location']}"
        if o["contact"]:
            remarks += f"\nContact: {o['contact']}"
        if o["net"]:
            remarks += f"\nNet order value: Rs {float(o['net']):,.2f} (excl. GST)"
        await execute(
            text(
                "UPDATE vendors SET name = :name, brief = :brief, type_of_work = :tw, work_order_date = :wod, "
                "commencement_date = :cd, time_limit_completion = :tl, progress_notes = :pn, remarks = :rm, "
                "contact_person = COALESCE(contact_person, :cp), updated_at = now() WHERE id = :id"
            ),
            {
                "id": vid,
                "name": o["supplier"][:255] or o["wo"][:255],
                "brief": o["scope"],
                "tw": o["category"],
                "wod": o["order_date"],
                "cd": o["commencement"],
                "tl": o["days"],
                "pn": o["status"] or None,
                "rm": remarks,
                "cp": (o["contact"] or None) and o["contact"][:255],
            },
        )
        updated_orders += 1
        have = {
            no: iid
            for iid, no in (
                await execute(text("SELECT id, item_no FROM rate_items WHERE vendor_id = :v"), {"v": vid})
            ).all()
        }
        seen = set()
        for it in (i for i in items if i["wo"] == o["wo"]):
            seen.add(it["item_no"])
            params = {
                "p": project_id,
                "v": vid,
                "no": it["item_no"],
                "d": it["description"],
                "u": it["unit"],
                "q": it["qty"],
                "r": it["rate"],
                "a": round(it["qty"] * it["rate"], 2),
                "eq": it["done"],
                "ea": round(it["done"] * it["rate"], 2),
            }
            if it["item_no"] in have:
                params["id"] = have[it["item_no"]]
                await execute(
                    text(
                        "UPDATE rate_items SET description = :d, unit = :u, boq_quantity = :q, rate = :r, "
                        "boq_amount = :a, executed_quantity = :eq, executed_amount = :ea WHERE id = :id"
                    ),
                    params,
                )
            else:
                await execute(
                    text(
                        "INSERT INTO rate_items (project_id, vendor_id, item_no, description, unit, boq_quantity, "
                        "rate, boq_amount, executed_quantity, executed_amount) "
                        "VALUES (:p, :v, :no, :d, :u, :q, :r, :a, :eq, :ea)"
                    ),
                    params,
                )
            updated_items += 1
        gone = [iid for no, iid in have.items() if no not in seen]
        if gone:
            await execute(text("DELETE FROM quantity_entries WHERE rate_item_id = ANY(:ids)"), {"ids": gone})
            await execute(text("DELETE FROM rate_items WHERE id = ANY(:ids)"), {"ids": gone})
            removed_items += len(gone)

    new_orders = [o for o in orders if o["wo"] not in by_wo]
    added_orders, added_items = await insert_tracker(execute, project_id, new_orders, items)
    return {
        "updated_orders": updated_orders,
        "added_orders": added_orders,
        "removed_orders": len(removed),
        "items_updated": updated_items,
        "items_added": added_items,
        "items_removed": removed_items,
    }


async def seed_rkjl_tracker(conn) -> None:
    """If the RKJL tracker workbook is bundled, load it into Jabalpur - Lakhnadon (once per WO)."""
    from app.services.rkjl_tracker import PACKAGE, WORKBOOK, read_tracker

    if not WORKBOOK.is_file():
        return
    pid = (await conn.execute(text("SELECT id FROM projects WHERE name = :n"), {"n": PACKAGE})).scalar()
    if not pid:
        return
    orders, items = await asyncio.to_thread(read_tracker)
    added, _ = await insert_tracker(conn.execute, pid, orders, items)
    if added:
        log.warning("schema_guard: loaded %s RKJL work orders into %s", added, PACKAGE)


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
            for col, typ in VENDOR_CONTACT_COLUMNS:
                await conn.execute(text(f"ALTER TABLE vendors ADD COLUMN IF NOT EXISTS {col} {typ}"))
            # Vendors imported from the WO/PO trackers carry "Contact: ..." in remarks.
            await conn.execute(text(VENDOR_CONTACT_BACKFILL))
            # One-off clean-up: the sample defects (#10-#21) got their photos by a setup script on
            # 20 Nov 2026 that ran three times; drop those setup-only "photo replaced" entries.
            await conn.execute(
                text(
                    "DELETE FROM issue_status_history WHERE issue_id BETWEEN 10 AND 21 "
                    "AND from_status = to_status AND note LIKE '%photo replaced by GMC Experts%' "
                    "AND created_at < '2026-11-21'"
                )
            )
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
            await seed_rkjl_tracker(conn)
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
