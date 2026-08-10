from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import get_current_user, require_roles
from app.models.enums import UserRole
from app.models.project import Project
from app.models.rate import QuantityEntry, RateItem
from app.models.user import User
from app.schemas import (
    ProjectRateSummary,
    QuantityEntryCreate,
    QuantityEntryOut,
    RateItemCreate,
    RateItemOut,
    RateItemSurveyorOut,
    RateItemUpdate,
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
        item_no=item.item_no,
        description=item.description,
        unit=item.unit,
        boq_quantity=boq_qty,
        rate=float(item.rate),
        boq_amount=float(item.boq_amount),
        executed_quantity=executed_qty,
        executed_amount=float(item.executed_amount),
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
    _: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
):
    await _get_project(db, body.project_id)
    qty = _dec(body.boq_quantity)
    rate = _dec(body.rate)
    item = RateItem(
        project_id=body.project_id,
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
    await db.commit()
    await db.refresh(item)
    return _to_out(item)


@router.patch("/{item_id}", response_model=RateItemOut)
async def update_rate_item(
    item_id: int,
    body: RateItemUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
):
    item = (await db.execute(select(RateItem).where(RateItem.id == item_id))).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Rate item not found")
    data = body.model_dump(exclude_unset=True)
    for key, value in data.items():
        if key in ("boq_quantity", "rate") and value is not None:
            setattr(item, key, _dec(value))
        elif value is not None and key != "remarks":
            setattr(item, key, value.strip() if isinstance(value, str) else value)
        elif key == "remarks":
            item.remarks = value
    item.boq_amount = (item.boq_quantity * item.rate).quantize(Decimal("0.01"))
    item.executed_amount = (item.executed_quantity * item.rate).quantize(Decimal("0.01"))
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
            created_at=e.created_at,
        )
        for e in entries
    ]
