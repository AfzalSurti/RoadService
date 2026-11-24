import json
import asyncio
from datetime import date, datetime, timezone
from decimal import Decimal
from io import BytesIO
from typing import Annotated

from pydantic import BaseModel
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import get_current_user, require_roles
from app.models.enums import UserRole
from app.models.billing import Vendor
from app.models.project import Project
from app.models.rate import QuantityEntry, RateItem
from app.models.user import User
from app.services.boq_excel import read_boq_rows, template_bytes
from app.services.issue_service import notify_involved
from app.services.storage import save_upload
from app.schemas import (
    VendorBillCancel,
    ProjectRateSummary,
    QuantityEntryCreate,
    QuantityEntryOut,
    RateItemCreate,
    RateItemOut,
    RateItemSurveyorOut,
    RateItemUpdate,
    VendorBillIn,
    VendorBillLineOut,
    VendorBillOut,
)

router = APIRouter(prefix="/rates", tags=["rates"])


def _dec(value: float | Decimal) -> Decimal:
    return Decimal(str(value))


def _to_out(item: RateItem, *, hide_money: bool = False) -> RateItemOut | RateItemSurveyorOut:
    boq_qty = float(item.boq_quantity)
    executed_qty = float(item.executed_quantity)
    progress = None
    if boq_qty > 0:
        progress = round((float(item.executed_amount) / float(item.boq_amount)) * 100, 2) if float(item.boq_amount) else round(
            (executed_qty / boq_qty) * 100, 2
        )
    if hide_money:
        return RateItemSurveyorOut(
            id=item.id,
            project_id=item.project_id,
            item_no=item.item_no,
            description=item.description,
            unit=item.unit,
            executed_quantity=executed_qty,
        )
    return RateItemOut(
        id=item.id,
        project_id=item.project_id,
        vendor_id=item.vendor_id,
        item_no=item.item_no,
        description=item.description,
        unit=item.unit,
        boq_quantity=boq_qty,
        rate=float(item.rate),
        boq_amount=float(item.boq_amount),
        executed_quantity=executed_qty,
        executed_amount=float(item.executed_amount),
        remaining_quantity=max(boq_qty - executed_qty, 0),
        remaining_amount=max(float(item.boq_amount) - float(item.executed_amount), 0),
        progress_pct=progress,
        remarks=item.remarks,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


async def _get_project(db: AsyncSession, project_id: int) -> Project:
    project = (
        await db.execute(
            select(Project)
            .where(Project.id == project_id)
            .options(selectinload(Project.surveyors), selectinload(Project.contractors))
        )
    ).scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _can_view_project(user: User, project: Project) -> bool:
    if user.role in (UserRole.ADMIN, UserRole.GOVERNMENT):
        return True
    if user.role == UserRole.SURVEYOR:
        return any(s.id == user.id for s in project.surveyors)
    if user.role == UserRole.CONTRACTOR:
        return any(c.id == user.id for c in project.contractors)
    return False


async def _check_vendor(db: AsyncSession, vendor_id: int | None, project_id: int) -> None:
    if vendor_id is None:
        return
    vendor = (await db.execute(select(Vendor).where(Vendor.id == vendor_id))).scalar_one_or_none()
    if not vendor:
        raise HTTPException(status_code=400, detail="Vendor not found")
    if vendor.project_id not in (None, project_id):
        raise HTTPException(status_code=400, detail="Vendor belongs to another package")


def _set_completed(db: AsyncSession, item: RateItem, completed: Decimal, user: User, note: str) -> None:
    """Set the completed (executed) quantity, logging the change as a quantity entry."""
    if completed > item.boq_quantity:
        raise HTTPException(status_code=400, detail="Completed quantity cannot exceed the BOQ quantity")
    delta = completed - (item.executed_quantity or Decimal("0"))
    item.executed_quantity = completed
    item.executed_amount = (completed * item.rate).quantize(Decimal("0.01"))
    if delta:
        db.add(
            QuantityEntry(
                rate_item_id=item.id,
                project_id=item.project_id,
                quantity=delta,
                amount=(delta * item.rate).quantize(Decimal("0.01")),
                entered_by_id=user.id,
                note=note,
            )
        )


@router.get("")
async def list_rates(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    project_id: int | None = Query(default=None),
):
    stmt = select(RateItem).order_by(RateItem.project_id, RateItem.id)
    if project_id:
        stmt = stmt.where(RateItem.project_id == project_id)
    elif user.role == UserRole.SURVEYOR:
        project_ids = (
            await db.execute(select(Project.id).where(Project.surveyors.any(User.id == user.id)))
        ).scalars().all()
        stmt = stmt.where(RateItem.project_id.in_(project_ids or [-1]))

    items = (await db.execute(stmt)).scalars().all()
    hide = user.role == UserRole.SURVEYOR
    return [_to_out(i, hide_money=hide) for i in items]


@router.get("/summary/{project_id}", response_model=ProjectRateSummary)
async def project_rate_summary(
    project_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    project = await _get_project(db, project_id)
    if not _can_view_project(user, project):
        raise HTTPException(status_code=403, detail="Not allowed for this project")
    if user.role == UserRole.SURVEYOR:
        raise HTTPException(status_code=403, detail="Surveyors cannot view rate amounts")

    items = (
        await db.execute(select(RateItem).where(RateItem.project_id == project_id).order_by(RateItem.id))
    ).scalars().all()
    outs = [_to_out(i) for i in items]
    total_boq = sum(i.boq_amount for i in outs)
    total_exec = sum(i.executed_amount for i in outs)
    progress = round((total_exec / total_boq) * 100, 2) if total_boq else None
    return ProjectRateSummary(
        project_id=project.id,
        project_name=project.name,
        total_boq_amount=total_boq,
        total_executed_amount=total_exec,
        progress_pct=progress,
        items=outs,  # type: ignore[arg-type]
    )


@router.post("", response_model=RateItemOut, status_code=201)
async def create_rate_item(
    body: RateItemCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
):
    await _get_project(db, body.project_id)
    await _check_vendor(db, body.vendor_id, body.project_id)
    qty = _dec(body.boq_quantity)
    rate = _dec(body.rate)
    item = RateItem(
        project_id=body.project_id,
        vendor_id=body.vendor_id,
        item_no=body.item_no.strip(),
        description=body.description.strip(),
        unit=body.unit.strip(),
        boq_quantity=qty,
        rate=rate,
        boq_amount=(qty * rate).quantize(Decimal("0.01")),
        executed_quantity=Decimal("0"),
        executed_amount=Decimal("0"),
        remarks=body.remarks,
    )
    db.add(item)
    await db.flush()
    if body.completed_quantity:
        _set_completed(db, item, _dec(body.completed_quantity), user, "Completed quantity entered with BOQ item")
    await db.commit()
    await db.refresh(item)
    return _to_out(item)


@router.patch("/{item_id}", response_model=RateItemOut)
async def update_rate_item(
    item_id: int,
    body: RateItemUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
):
    item = (await db.execute(select(RateItem).where(RateItem.id == item_id))).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Rate item not found")
    data = body.model_dump(exclude_unset=True)
    completed = data.pop("completed_quantity", None)
    if "vendor_id" in data:
        await _check_vendor(db, data["vendor_id"], item.project_id)
        item.vendor_id = data.pop("vendor_id")
    for key, value in data.items():
        if key in ("boq_quantity", "rate") and value is not None:
            setattr(item, key, _dec(value))
        elif value is not None and key != "remarks":
            setattr(item, key, value.strip() if isinstance(value, str) else value)
        elif key == "remarks":
            item.remarks = value
    item.boq_amount = (item.boq_quantity * item.rate).quantize(Decimal("0.01"))
    item.executed_amount = (item.executed_quantity * item.rate).quantize(Decimal("0.01"))
    if completed is not None:
        _set_completed(db, item, _dec(completed), user, "Completed quantity updated")
    await db.commit()
    await db.refresh(item)
    return _to_out(item)


@router.delete("/{item_id}", status_code=204)
async def delete_rate_item(
    item_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
):
    item = (await db.execute(select(RateItem).where(RateItem.id == item_id))).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Rate item not found")
    await db.delete(item)
    await db.commit()


@router.post("/{item_id}/quantity", response_model=QuantityEntryOut, status_code=201)
async def add_quantity(
    item_id: int,
    body: QuantityEntryCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.SURVEYOR, UserRole.ADMIN, UserRole.CONTRACTOR))],
):
    item = (await db.execute(select(RateItem).where(RateItem.id == item_id))).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Rate item not found")

    project = await _get_project(db, item.project_id)
    if user.role == UserRole.SURVEYOR and not any(s.id == user.id for s in project.surveyors):
        raise HTTPException(status_code=403, detail="Surveyor not assigned to this project")
    if user.role == UserRole.CONTRACTOR and not any(c.id == user.id for c in project.contractors):
        raise HTTPException(status_code=403, detail="Contractor not assigned to this project")

    qty = _dec(body.quantity)
    amount = (qty * item.rate).quantize(Decimal("0.01"))
    entry = QuantityEntry(
        rate_item_id=item.id,
        project_id=item.project_id,
        quantity=qty,
        amount=amount,
        entered_by_id=user.id,
        note=body.note,
    )
    item.executed_quantity = (item.executed_quantity or Decimal("0")) + qty
    item.executed_amount = (item.executed_quantity * item.rate).quantize(Decimal("0.01"))
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return QuantityEntryOut(
        id=entry.id,
        rate_item_id=entry.rate_item_id,
        project_id=entry.project_id,
        quantity=float(entry.quantity),
        amount=float(entry.amount),
        entered_by_id=entry.entered_by_id,
        note=entry.note,
        created_at=entry.created_at,
    )


@router.get("/{item_id}/quantity", response_model=list[QuantityEntryOut])
async def list_quantity_entries(
    item_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    item = (await db.execute(select(RateItem).where(RateItem.id == item_id))).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Rate item not found")
    project = await _get_project(db, item.project_id)
    if not _can_view_project(user, project):
        raise HTTPException(status_code=403, detail="Not allowed")
    if user.role == UserRole.SURVEYOR:
        raise HTTPException(status_code=403, detail="Surveyors cannot view calculated amounts")

    entries = (
        await db.execute(
            select(QuantityEntry).where(QuantityEntry.rate_item_id == item_id).order_by(QuantityEntry.id.desc())
        )
    ).scalars().all()
    return [
        QuantityEntryOut(
            id=e.id,
            rate_item_id=e.rate_item_id,
            project_id=e.project_id,
            quantity=float(e.quantity),
            amount=float(e.amount),
            entered_by_id=e.entered_by_id,
            note=e.note,
            vendor_id=e.vendor_id,
            bill_no=e.bill_no,
            bill_date=e.bill_date,
            created_at=e.created_at,
        )
        for e in entries
    ]


@router.get("/bills", response_model=list[VendorBillOut])
async def list_vendor_bills(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    project_id: int = Query(),
    vendor_id: int | None = Query(default=None),
):
    """Bills (RA bills) for a package, newest first; optionally one vendor's."""
    project = await _get_project(db, project_id)
    if not _can_view_project(user, project) or user.role == UserRole.SURVEYOR:
        raise HTTPException(status_code=403, detail="Not allowed to view bills")
    stmt = (
        select(QuantityEntry, RateItem)
        .join(RateItem, RateItem.id == QuantityEntry.rate_item_id)
        .where(QuantityEntry.project_id == project_id, QuantityEntry.bill_no.is_not(None))
        .order_by(QuantityEntry.id)
    )
    if vendor_id is not None:
        stmt = stmt.where(QuantityEntry.vendor_id == vendor_id)
    bills: dict[tuple[int | None, str], VendorBillOut] = {}
    for entry, item in (await db.execute(stmt)).all():
        key = (entry.vendor_id, entry.bill_no)
        bill = bills.get(key)
        if not bill:
            bill = VendorBillOut(
                vendor_id=entry.vendor_id,
                bill_no=entry.bill_no,
                bill_date=entry.bill_date,
                note=entry.note,
                total_amount=0,
                created_at=entry.created_at,
                lines=[],
            )
            bills[key] = bill
        bill.lines.append(
            VendorBillLineOut(
                entry_id=entry.id,
                rate_item_id=item.id,
                item_no=item.item_no,
                description=item.description,
                unit=item.unit,
                quantity=float(entry.quantity),
                rate=float(item.rate),
                amount=float(entry.amount),
            )
        )
        bill.total_amount = round(bill.total_amount + float(entry.amount), 2)
    # Attached documents and cancelled bills (kept with their comments).
    await db.execute(text(BILL_RECORDS_DDL))
    q = "SELECT * FROM vendor_bill_records WHERE project_id = :p"
    params: dict = {"p": project_id}
    if vendor_id is not None:
        q += " AND vendor_id = :v"
        params["v"] = vendor_id
    for r in (await db.execute(text(q + " AND kind = 'cancelled' ORDER BY id"), params)).mappings():
        bills[(r["vendor_id"], f"{r['bill_no']}#cancelled{r['id']}")] = VendorBillOut(
            vendor_id=r["vendor_id"],
            bill_no=r["bill_no"],
            bill_date=r["bill_date"],
            note=None,
            total_amount=float(r["amount"] or 0),
            created_at=r["created_at"],
            lines=[],
            status="cancelled",
            cancel_comments=r["comments"],
            cancelled_by=r["user_name"],
            cancelled_at=r["created_at"],
        )
    for r in (await db.execute(text(q + " AND kind = 'details' ORDER BY id"), params)).mappings():
        bill = bills.get((r["vendor_id"], r["bill_no"]))
        if bill and bill.status == "active":
            try:
                bill.details = json.loads(r["comments"] or "{}")
            except ValueError:
                bill.details = None
    for r in (await db.execute(text(q + " AND kind = 'document' ORDER BY id"), params)).mappings():
        bill = bills.get((r["vendor_id"], r["bill_no"]))
        if bill and bill.status == "active":
            bill.documents.append(
                {
                    "id": r["id"],
                    "file_path": r["file_path"],
                    "file_name": r["file_name"],
                    "uploaded_by": r["user_name"],
                    "created_at": r["created_at"].isoformat(),
                }
            )
    return sorted(bills.values(), key=lambda b: (b.bill_date or b.created_at.date(), b.created_at), reverse=True)


BILL_RECORDS_DDL = (
    "CREATE TABLE IF NOT EXISTS vendor_bill_records ("
    "id SERIAL PRIMARY KEY, project_id INTEGER NOT NULL, vendor_id INTEGER, bill_no VARCHAR(64) NOT NULL, "
    "kind VARCHAR(16) NOT NULL, file_path VARCHAR(1024), file_name VARCHAR(255), comments TEXT, "
    "amount NUMERIC(18, 2), bill_date DATE, user_id INTEGER, user_name VARCHAR(255), "
    "created_at TIMESTAMPTZ NOT NULL DEFAULT now())"
)


async def _bill_entries(db: AsyncSession, project_id: int, vendor_id: int, bill_no: str):
    return (
        await db.execute(
            select(QuantityEntry, RateItem)
            .join(RateItem, RateItem.id == QuantityEntry.rate_item_id)
            .where(
                QuantityEntry.project_id == project_id,
                QuantityEntry.vendor_id == vendor_id,
                QuantityEntry.bill_no == bill_no,
            )
        )
    ).all()


@router.post("/bills/documents")
async def upload_bill_documents(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    project_id: Annotated[int, Form()],
    vendor_id: Annotated[int, Form()],
    bill_no: Annotated[str, Form()],
    files: list[UploadFile] = File(...),
):
    """Attach supporting documents (measurement sheets, invoices, photos ...) to a bill."""
    if not await _bill_entries(db, project_id, vendor_id, bill_no):
        raise HTTPException(status_code=404, detail="Bill not found")
    await db.execute(text(BILL_RECORDS_DDL))
    for f in files:
        path = await save_upload(f, f"bill_{vendor_id}")
        await db.execute(
            text(
                "INSERT INTO vendor_bill_records (project_id, vendor_id, bill_no, kind, file_path, file_name, "
                "user_id, user_name) VALUES (:p, :v, :b, 'document', :fp, :fn, :u, :un)"
            ),
            {
                "p": project_id,
                "v": vendor_id,
                "b": bill_no,
                "fp": path,
                "fn": (f.filename or "document")[:255],
                "u": user.id,
                "un": user.full_name,
            },
        )
    await db.commit()
    return {"ok": True, "added": len(files)}


class VendorBillDetails(BaseModel):
    project_id: int
    vendor_id: int
    bill_no: str
    details: dict


BILL_DETAIL_KEYS = (
    "invoice_no", "invoice_date", "submission_date", "payment_type", "invoice_amount", "bill_from", "bill_to",
    "recommended_gmc", "recommended_nhipmpl", "net_released", "voucher_no", "status", "remarks",
)


@router.put("/bills/details")
async def save_bill_details(
    body: VendorBillDetails,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
):
    """GMC Experts: invoice and recommendation details of a vendor bill (can be filled in later)."""
    if not await _bill_entries(db, body.project_id, body.vendor_id, body.bill_no):
        raise HTTPException(status_code=404, detail="Bill not found")
    clean = {k: str(v).strip()[:255] for k, v in body.details.items() if k in BILL_DETAIL_KEYS and v not in (None, "")}
    await db.execute(text(BILL_RECORDS_DDL))
    await db.execute(
        text("DELETE FROM vendor_bill_records WHERE project_id = :p AND vendor_id = :v AND bill_no = :b AND kind = 'details'"),
        {"p": body.project_id, "v": body.vendor_id, "b": body.bill_no},
    )
    await db.execute(
        text(
            "INSERT INTO vendor_bill_records (project_id, vendor_id, bill_no, kind, comments, user_id, user_name) "
            "VALUES (:p, :v, :b, 'details', :c, :u, :un)"
        ),
        {"p": body.project_id, "v": body.vendor_id, "b": body.bill_no, "c": json.dumps(clean),
         "u": user.id, "un": user.full_name},
    )
    await db.commit()
    return {"ok": True, "details": clean}


@router.delete("/bills/documents/{doc_id}")
async def delete_bill_document(
    doc_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
):
    await db.execute(text(BILL_RECORDS_DDL))
    await db.execute(text("DELETE FROM vendor_bill_records WHERE id = :i AND kind = 'document'"), {"i": doc_id})
    await db.commit()
    return {"ok": True}


@router.post("/bills/cancel")
async def cancel_vendor_bill(
    body: VendorBillCancel,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
):
    """Cancel a bill with comments: its quantities go back to the BOQ items (work done and
    balance are recalculated) and the bill stays in the history as cancelled."""
    rows = await _bill_entries(db, body.project_id, body.vendor_id, body.bill_no)
    if not rows:
        raise HTTPException(status_code=404, detail="Bill not found")
    total = Decimal("0")
    for entry, item in rows:
        total += entry.amount or Decimal("0")
        item.executed_quantity = max(Decimal("0"), (item.executed_quantity or Decimal("0")) - entry.quantity)
        item.executed_amount = (item.executed_quantity * item.rate).quantize(Decimal("0.01"))
        await db.delete(entry)
    await db.execute(text(BILL_RECORDS_DDL))
    await db.execute(
        text(
            "INSERT INTO vendor_bill_records (project_id, vendor_id, bill_no, kind, comments, amount, bill_date, "
            "user_id, user_name) VALUES (:p, :v, :b, 'cancelled', :c, :a, :d, :u, :un)"
        ),
        {
            "p": body.project_id,
            "v": body.vendor_id,
            "b": body.bill_no,
            "c": body.comments.strip(),
            "a": total,
            "d": rows[0][0].bill_date,
            "u": user.id,
            "un": user.full_name,
        },
    )
    vendor = (await db.execute(select(Vendor).where(Vendor.id == body.vendor_id))).scalar_one_or_none()
    await notify_involved(
        db,
        f"Bill {body.bill_no} cancelled",
        f"{vendor.name if vendor else 'Vendor'}: {body.bill_no} (\u20b9 {total:,.2f}) cancelled by "
        f"{user.full_name}. Comments: {body.comments.strip()}",
        project_id=body.project_id,
        extra_ids=[vendor.contractor_user_id] if vendor else [],
        link=f"/rates?project={body.project_id}",
        actor=user,
        include_team=False,
    )
    await db.commit()
    return {"ok": True, "returned_amount": float(total)}




@router.get("/bills/ra")
async def ra_bill(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    project_id: int = Query(),
    vendor_id: int = Query(),
    bill_no: str = Query(),
):
    """RA bill in the proforma-invoice layout: vendor / work order header, and the abstract sheet
    (work-order qty, rate, amount; quantity and amount up to date / previous / this bill)."""
    from datetime import timedelta

    project = await _get_project(db, project_id)
    if not _can_view_project(user, project) or user.role == UserRole.SURVEYOR:
        raise HTTPException(status_code=403, detail="Not allowed to view bills")
    vendor = (await db.execute(select(Vendor).where(Vendor.id == vendor_id))).scalar_one_or_none()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    items = (
        await db.execute(select(RateItem).where(RateItem.vendor_id == vendor_id).order_by(RateItem.id))
    ).scalars().all()
    entries = (
        await db.execute(
            select(QuantityEntry).where(QuantityEntry.vendor_id == vendor_id).order_by(QuantityEntry.id)
        )
    ).scalars().all()

    # The vendor's bills in order (by bill date, then entry order).
    first: dict[str, QuantityEntry] = {}
    for e in entries:
        if e.bill_no and e.bill_no not in first:
            first[e.bill_no] = e
    order = sorted(first, key=lambda b: (first[b].bill_date or first[b].created_at.date(), first[b].id))
    if bill_no not in order:
        raise HTTPException(status_code=404, detail="Bill not found")
    idx = order.index(bill_no)
    later = set(order[idx + 1:])
    this_ids = [e.id for e in entries if e.bill_no == bill_no]
    last_this_id = max(this_ids)
    bill_date = first[bill_no].bill_date
    if idx > 0 and first[order[idx - 1]].bill_date:
        period_from = first[order[idx - 1]].bill_date + timedelta(days=1)
    else:
        period_from = vendor.commencement_date or vendor.work_order_date

    lines = []
    for it in items:
        mine = [e for e in entries if e.rate_item_id == it.id]
        this_q = sum((e.quantity for e in mine if e.bill_no == bill_no), Decimal("0"))
        # Quantities recorded after this bill (later bills, or entries without a bill made later).
        after = sum(
            (e.quantity for e in mine if (e.bill_no in later) or (not e.bill_no and e.id > last_this_id)),
            Decimal("0"),
        )
        upto = max(Decimal("0"), (it.executed_quantity or Decimal("0")) - after)
        prev = max(Decimal("0"), upto - this_q)
        rate = it.rate or Decimal("0")
        lines.append(
            {
                "item_no": it.item_no,
                "description": it.description,
                "unit": it.unit,
                "wo_qty": float(it.boq_quantity or 0),
                "rate": float(rate),
                "wo_amount": float(it.boq_amount or 0),
                "qty_upto": float(upto),
                "qty_prev": float(prev),
                "qty_this": float(this_q),
                "amt_upto": float((upto * rate).quantize(Decimal("0.01"))),
                "amt_prev": float((prev * rate).quantize(Decimal("0.01"))),
                "amt_this": float((this_q * rate).quantize(Decimal("0.01"))),
            }
        )
    wo_no = ""
    if vendor.remarks and vendor.remarks.startswith("WO No: "):
        wo_no = vendor.remarks.split("\n", 1)[0].removeprefix("WO No: ").strip()
    digits = "".join(ch for ch in bill_no if ch.isdigit())
    # Invoice no. / date / bill period entered in the bill details take precedence.
    det: dict = {}
    if (await db.execute(text("SELECT to_regclass('public.vendor_bill_records')"))).scalar():
        raw = (
            await db.execute(
                text(
                    "SELECT comments FROM vendor_bill_records WHERE project_id = :p AND vendor_id = :v "
                    "AND bill_no = :b AND kind = 'details' ORDER BY id DESC LIMIT 1"
                ),
                {"p": project_id, "v": vendor_id, "b": bill_no},
            )
        ).scalar()
        try:
            det = json.loads(raw or "{}")
        except ValueError:
            det = {}
    if det.get("invoice_date"):
        bill_date = date.fromisoformat(det["invoice_date"][:10])
    if det.get("bill_from"):
        period_from = date.fromisoformat(det["bill_from"][:10])
    period_to = date.fromisoformat(det["bill_to"][:10]) if det.get("bill_to") else bill_date
    return {
        "project": {"id": project.id, "name": project.name, "title": getattr(project, "title", None)},
        "vendor": {
            "id": vendor.id,
            "name": vendor.name,
            "work_order_no": wo_no,
            "work_description": vendor.brief or vendor.type_of_work or "",
            "address": vendor.contact_address,
            "gst_no": vendor.gst_no,
        },
        "bill_no": bill_no,
        "invoice_no": det.get("invoice_no") or digits or str(idx + 1),
        "bill_index": idx + 1,
        "bill_date": bill_date.isoformat() if bill_date else None,
        "period_from": period_from.isoformat() if period_from else None,
        "period_to": period_to.isoformat() if period_to else None,
        "lines": lines,
    }


@router.post("/bills", response_model=VendorBillOut, status_code=201)
async def create_vendor_bill(
    body: VendorBillIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
):
    """Record a vendor bill: completed quantity for some of its BOQ items, each capped
    at the item's remaining quantity."""
    await _get_project(db, body.project_id)
    await _check_vendor(db, body.vendor_id, body.project_id)
    bill_no = body.bill_no.strip()
    duplicate = (
        await db.execute(
            select(QuantityEntry.id).where(
                QuantityEntry.project_id == body.project_id,
                QuantityEntry.vendor_id == body.vendor_id,
                QuantityEntry.bill_no == bill_no,
            )
        )
    ).first()
    if duplicate:
        raise HTTPException(status_code=400, detail=f"Bill {bill_no} already exists for this vendor")

    item_ids = [line.rate_item_id for line in body.lines]
    if len(set(item_ids)) != len(item_ids):
        raise HTTPException(status_code=400, detail="Each BOQ item can appear only once in a bill")
    items = {
        i.id: i
        for i in (await db.execute(select(RateItem).where(RateItem.id.in_(item_ids)))).scalars().all()
    }
    lines: list[VendorBillLineOut] = []
    total = Decimal("0")
    for line in body.lines:
        item = items.get(line.rate_item_id)
        if not item or item.project_id != body.project_id:
            raise HTTPException(status_code=400, detail="BOQ item not found in this package")
        if item.vendor_id != body.vendor_id:
            raise HTTPException(status_code=400, detail=f"BOQ item {item.item_no} belongs to another vendor")
        qty = _dec(line.quantity)
        remaining = item.boq_quantity - (item.executed_quantity or Decimal("0"))
        if qty > remaining:
            raise HTTPException(
                status_code=400,
                detail=f"BOQ item {item.item_no}: only {remaining.normalize():f} {item.unit} remaining",
            )
        amount = (qty * item.rate).quantize(Decimal("0.01"))
        entry = QuantityEntry(
            rate_item_id=item.id,
            project_id=item.project_id,
            quantity=qty,
            amount=amount,
            entered_by_id=user.id,
            note=body.note,
            vendor_id=body.vendor_id,
            bill_no=bill_no,
            bill_date=body.bill_date,
        )
        db.add(entry)
        item.executed_quantity = (item.executed_quantity or Decimal("0")) + qty
        item.executed_amount = (item.executed_quantity * item.rate).quantize(Decimal("0.01"))
        await db.flush()
        total += amount
        lines.append(
            VendorBillLineOut(
                entry_id=entry.id,
                rate_item_id=item.id,
                item_no=item.item_no,
                description=item.description,
                unit=item.unit,
                quantity=float(qty),
                rate=float(item.rate),
                amount=float(amount),
            )
        )
    vendor = (await db.execute(select(Vendor).where(Vendor.id == body.vendor_id))).scalar_one()
    await notify_involved(
        db,
        f"Bill {bill_no} recorded",
        f"{vendor.name}: {bill_no} for \u20b9 {total:,.2f} ({len(lines)} BOQ item(s)) by {user.full_name}",
        project_id=body.project_id,
        extra_ids=[vendor.contractor_user_id],
        link=f"/rates?project={body.project_id}",
        actor=user,
        include_team=False,
    )
    await db.commit()
    return VendorBillOut(
        vendor_id=body.vendor_id,
        bill_no=bill_no,
        bill_date=body.bill_date,
        note=body.note,
        total_amount=float(total),
        created_at=datetime.now(timezone.utc),
        lines=lines,
    )


@router.get("/template")
async def boq_template(_: Annotated[User, Depends(get_current_user)]):
    """Sample BOQ sheet to fill in and import (Item No., Description, Unit, Quantity, Rate, Executed)."""
    content = await asyncio.to_thread(template_bytes)
    return StreamingResponse(
        BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="BOQ_format.xlsx"'},
    )


@router.post("/import")
async def import_boq(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    project_id: Annotated[int, Form()],
    file: Annotated[UploadFile, File()],
    vendor_id: Annotated[int | None, Form()] = None,
):
    """Import BOQ items from the filled sample sheet into a package (optionally for a vendor).

    A row whose Item No. already exists for that package / vendor updates the item;
    other rows are added. "Quantity Executed till Date" sets the completed quantity.
    """
    await _get_project(db, project_id)
    await _check_vendor(db, vendor_id, project_id)
    if not (file.filename or "").lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=400, detail="Upload the BOQ Excel file (.xlsx)")
    try:
        rows, problems = await asyncio.to_thread(read_boq_rows, await file.read())
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Could not read the Excel file: {exc}") from exc
    if not rows and not problems:
        raise HTTPException(status_code=400, detail="No BOQ rows found — fill the sheet from row 2 (Item No., Description, Unit, Quantity, Rate)")

    existing = {
        i.item_no.strip().lower(): i
        for i in (
            await db.execute(
                select(RateItem).where(
                    RateItem.project_id == project_id,
                    RateItem.vendor_id.is_(None) if vendor_id is None else RateItem.vendor_id == vendor_id,
                )
            )
        ).scalars().all()
    }
    created = updated = 0
    for row in rows:
        item = existing.get(row["item_no"].lower())
        if item is None:
            item = RateItem(
                project_id=project_id,
                vendor_id=vendor_id,
                item_no=row["item_no"],
                description=row["description"],
                unit=row["unit"],
                boq_quantity=row["quantity"],
                rate=row["rate"],
                boq_amount=(row["quantity"] * row["rate"]).quantize(Decimal("0.01")),
                executed_quantity=Decimal("0"),
                executed_amount=Decimal("0"),
            )
            db.add(item)
            await db.flush()
            existing[row["item_no"].lower()] = item
            created += 1
        else:
            item.description = row["description"]
            item.unit = row["unit"]
            item.boq_quantity = row["quantity"]
            item.rate = row["rate"]
            item.boq_amount = (row["quantity"] * row["rate"]).quantize(Decimal("0.01"))
            item.executed_amount = ((item.executed_quantity or Decimal("0")) * row["rate"]).quantize(Decimal("0.01"))
            updated += 1
        if row["executed"] is not None:
            if (item.executed_quantity or Decimal("0")) > row["quantity"]:
                problems.append(f"Row {row['row']} (item {row['item_no']}): executed quantity is above the new BOQ quantity")
            else:
                _set_completed(db, item, row["executed"], user, f"Imported from Excel ({file.filename})")
    await notify_involved(
        db,
        "BOQ imported",
        f"{created} BOQ item(s) added and {updated} updated from {file.filename} by {user.full_name}",
        project_id=project_id,
        link=f"/rates?project={project_id}",
        actor=user,
        include_team=False,
    )
    await db.commit()
    return {"created": created, "updated": updated, "skipped": len(problems), "problems": problems[:50]}

