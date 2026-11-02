import asyncio
from datetime import datetime, timezone
from decimal import Decimal
from io import BytesIO
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import select
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
from app.schemas import (
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
    return sorted(bills.values(), key=lambda b: (b.bill_date or b.created_at.date(), b.created_at), reverse=True)


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

