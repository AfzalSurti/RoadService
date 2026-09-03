"""Toll Plaza Performances — four Excel-imported report steps.

Steps / report types:
  1. etc_monthly              — Monthly ETC Report
  2. infrastructure           — On-Ground Infrastructure Report
  3. sla_adherence            — On-Ground ETC Operations And SLA Adherence
  4. toll_collection_summary  — Summary Report: Monthly Toll Collection Report
"""

import json
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import require_roles
from app.models.enums import UserRole
from app.models.portal_ops import TollPerfNote, TollPerfRow
from app.models.user import User
from app.services.audit import write_audit

router = APIRouter(prefix="/toll-perf", tags=["toll-perf"])

TOLL_PERF_COLUMNS: dict[str, list[str]] = {
    "etc_monthly": [
        "Vehicle Type",
        "No of Vehicles (For Corresponding month of previous year)",
        "Fee Collected (For Corresponding month of previous year)",
        "No of Vehicles (For Previous Month)",
        "Fee Collected (For Previous Month)",
        "Fee Per Vehicle (For Current Month)",
        "No of Vehicles (For Current Month)",
        "Fee Collected (For Current Month)",
    ],
    "infrastructure": [
        "Hardware /Software Description",
        "Total Units",
        "Units Damaged/Missing",
        "Equipment Owner /Provider",
        "Equipment as per specifications (Y / N)",
        "Remarks",
    ],
    "sla_adherence": [
        "Lane",
        "Average Queue length during peak time",
        "Average Queue length during no peak time",
        "Average Transaction (Cash)",
        "Average Transaction (RFID)",
        "Average Transaction (Cards)",
        "Average Transaction (Wallet)",
        "Average Transaction time (others)",
    ],
    "toll_collection_summary": [
        "Vehicle Type",
        "No of Vehicles (For Corresponding month of previous year)",
        "Fee Collected (For Corresponding month of previous year)",
        "No of Vehicles (For Previous Month)",
        "Fee Collected (For Previous Month)",
        "Fee Per Vehicle (For Current Month)",
        "No of Vehicles (For Current Month)",
        "Fee Collected (For Current Month)",
    ],
}

NOTE_KEYS = ["pd_comments", "ae_compliance"]

Roles = require_roles(UserRole.ADMIN, UserRole.GOVERNMENT, UserRole.CONTRACTOR)
Editors = require_roles(UserRole.ADMIN, UserRole.GOVERNMENT)


def _norm(v: Any) -> str:
    return "".join(ch for ch in ("" if v is None else str(v)).lower() if ch.isalnum())


def _rows_from_upload(filename: str, content: bytes) -> list[list[Any]]:
    name = (filename or "").lower()
    if name.endswith(".csv"):
        import csv
        import io

        return [list(r) for r in csv.reader(io.StringIO(content.decode("utf-8-sig", errors="ignore")))]
    import io

    import openpyxl

    wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    ws = wb.active
    out = [list(row) for row in ws.iter_rows(values_only=True)]
    wb.close()
    return out


def _parse(report_type: str, rows: list[list[Any]]) -> list[dict[str, Any]]:
    canon = TOLL_PERF_COLUMNS[report_type]
    canon_norm = {_norm(c): c for c in canon}

    best_idx, best_hits = -1, 0
    for i, row in enumerate(rows[:15]):
        hits = sum(1 for c in row if _norm(c) in canon_norm)
        if hits > best_hits:
            best_idx, best_hits = i, hits
    if best_idx < 0 or best_hits < 2:
        for i, row in enumerate(rows):
            if any(c not in (None, "") for c in row):
                best_idx = i
                break
    if best_idx < 0:
        return []

    labels: list[str] = []
    for j, cell in enumerate(rows[best_idx]):
        key = _norm(cell)
        if key in canon_norm:
            labels.append(canon_norm[key])
        elif cell not in (None, ""):
            labels.append(str(cell).strip())
        elif j < len(canon):
            labels.append(canon[j])
        else:
            labels.append(f"Column {j + 1}")

    parsed: list[dict[str, Any]] = []
    blanks = 0
    for row in rows[best_idx + 1:]:
        vals = list(row) + [None] * (len(labels) - len(row))
        if all(v in (None, "") for v in vals[: len(labels)]):
            blanks += 1
            if blanks >= 3:
                break
            continue
        blanks = 0
        rec: dict[str, Any] = {}
        for label, value in zip(labels, vals, strict=False):
            if value is None:
                rec[label] = ""
            elif isinstance(value, float) and value.is_integer():
                rec[label] = str(int(value))
            else:
                rec[label] = str(value).strip()
        parsed.append(rec)
    return parsed


async def _notes(db: AsyncSession) -> dict[str, str]:
    out = {k: "" for k in NOTE_KEYS}
    for r in (await db.execute(select(TollPerfNote))).scalars().all():
        out[r.note_key] = r.note_value or ""
    return out


@router.get("")
async def get_all(db: Annotated[AsyncSession, Depends(get_db)], _: Annotated[User, Depends(Roles)]):
    empty = {"columns": TOLL_PERF_COLUMNS, "rows": {k: [] for k in TOLL_PERF_COLUMNS}, "notes": {k: "" for k in NOTE_KEYS}}
    try:
        db_rows = (
            await db.execute(
                select(TollPerfRow).order_by(TollPerfRow.report_type, TollPerfRow.sort_order, TollPerfRow.id)
            )
        ).scalars().all()
    except Exception:
        await db.rollback()
        return empty
    by_type: dict[str, list[dict[str, Any]]] = {k: [] for k in TOLL_PERF_COLUMNS}
    for r in db_rows:
        try:
            by_type.setdefault(r.report_type, []).append(json.loads(r.payload or "{}"))
        except json.JSONDecodeError:
            continue
    return {"columns": TOLL_PERF_COLUMNS, "rows": by_type, "notes": await _notes(db)}


@router.post("/{report_type}/import")
async def import_report(
    report_type: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(Editors)],
    file: UploadFile = File(...),
):
    if report_type not in TOLL_PERF_COLUMNS:
        raise HTTPException(status_code=404, detail="Unknown report type")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    try:
        parsed = _parse(report_type, _rows_from_upload(file.filename or "upload.xlsx", content))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Could not read the file: {exc}") from exc

    for r in (await db.execute(select(TollPerfRow).where(TollPerfRow.report_type == report_type))).scalars().all():
        await db.delete(r)
    for i, rec in enumerate(parsed):
        db.add(TollPerfRow(report_type=report_type, payload=json.dumps(rec, ensure_ascii=False), sort_order=i))
    await write_audit(
        db, actor_id=user.id, action="toll_perf_import", entity_type="toll_perf",
        entity_id=report_type, detail=f"{len(parsed)} rows",
    )
    await db.commit()
    return {"ok": True, "report_type": report_type, "imported": len(parsed), "rows": parsed}


@router.put("/notes")
async def save_notes(
    body: dict[str, str],
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(Editors)],
):
    for key in NOTE_KEYS:
        if key not in body:
            continue
        row = (await db.execute(select(TollPerfNote).where(TollPerfNote.note_key == key))).scalar_one_or_none()
        if row:
            row.note_value = body[key]
        else:
            db.add(TollPerfNote(note_key=key, note_value=body[key]))
    await db.commit()
    return await _notes(db)


@router.delete("/{report_type}", status_code=204)
async def clear_report(
    report_type: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(Editors)],
):
    if report_type not in TOLL_PERF_COLUMNS:
        raise HTTPException(status_code=404, detail="Unknown report type")
    for r in (await db.execute(select(TollPerfRow).where(TollPerfRow.report_type == report_type))).scalars().all():
        await db.delete(r)
    await db.commit()
