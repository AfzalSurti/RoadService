from datetime import date
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import get_current_user, require_roles
from app.models.billing import Invoice, InvoiceActivity
from app.models.enums import InvoiceStatus, PaymentMode, UserRole
from app.models.project import Project
from app.models.user import User
from app.schemas import InvoiceAction, InvoiceActivityOut, InvoiceCreate, InvoiceOut, InvoiceRecommend
from app.services.issue_service import notify

router = APIRouter(prefix="/billing", tags=["billing"])


def _dec(v: float | Decimal) -> Decimal:
    return Decimal(str(v))


def _out(inv: Invoice) -> InvoiceOut:
    return InvoiceOut(
        id=inv.id,
        project_id=inv.project_id,
        transaction_id=inv.transaction_id,
        invoice_no=inv.invoice_no,
        invoice_date=inv.invoice_date,
        payment_type=inv.payment_type,
        payment_mode=inv.payment_mode.value if hasattr(inv.payment_mode, "value") else str(inv.payment_mode),
        amount=float(inv.amount),
        recommended_amount=float(inv.recommended_amount) if inv.recommended_amount is not None else None,
        approved_amount=float(inv.approved_amount) if inv.approved_amount is not None else None,
        upc=inv.upc,
        chainage_from=inv.chainage_from,
        chainage_to=inv.chainage_to,
        status=inv.status.value if hasattr(inv.status, "value") else str(inv.status),
        submitted_by_id=inv.submitted_by_id,
        notes=inv.notes,
        calculation_json=inv.calculation_json,
        created_at=inv.created_at,
        updated_at=inv.updated_at,
        activities=[
            InvoiceActivityOut(
                id=a.id,
                invoice_id=a.invoice_id,
                actor_id=a.actor_id,
                action=a.action,
                note=a.note,
                created_at=a.created_at,
            )
            for a in (inv.activities or [])
        ],
    )


async def _load(db: AsyncSession, invoice_id: int) -> Invoice:
    inv = (
        await db.execute(
            select(Invoice)
            .where(Invoice.id == invoice_id)
            .options(selectinload(Invoice.activities))
        )
    ).scalar_one_or_none()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return inv


async def _add_activity(db: AsyncSession, invoice: Invoice, user: User, action: str, note: str | None) -> None:
    db.add(
        InvoiceActivity(
            invoice_id=invoice.id,
            actor_id=user.id,
            action=action,
            note=note,
        )
    )


@router.get("/invoices", response_model=list[InvoiceOut])
async def list_invoices(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT, UserRole.CONTRACTOR))],
):
    stmt = select(Invoice).options(selectinload(Invoice.activities)).order_by(Invoice.id.desc())
    if user.role == UserRole.CONTRACTOR:
        stmt = stmt.where(Invoice.submitted_by_id == user.id)
    elif user.role == UserRole.GOVERNMENT:
        stmt = stmt.where(
            Invoice.status.in_(
                [
                    InvoiceStatus.RECOMMENDED,
                    InvoiceStatus.CLARIFICATION,
                    InvoiceStatus.APPROVED,
                    InvoiceStatus.REJECTED,
                ]
            )
        )
    rows = (await db.execute(stmt)).scalars().unique().all()
    return [_out(i) for i in rows]


@router.post("/invoices", response_model=InvoiceOut, status_code=201)
async def create_invoice(
    body: InvoiceCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.CONTRACTOR))],
):
    project = (await db.execute(select(Project).where(Project.id == body.project_id))).scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    count = (await db.execute(select(func.count(Invoice.id)))).scalar_one() + 1
    txn = f"RS/{project.id:04d}/{count:05d}"
    inv = Invoice(
        project_id=body.project_id,
        transaction_id=txn,
        invoice_no=body.invoice_no.strip(),
        invoice_date=body.invoice_date or date.today(),
        payment_type=body.payment_type.strip(),
        payment_mode=PaymentMode.FULL,
        amount=_dec(body.amount),
        chainage_from=body.chainage_from,
        chainage_to=body.chainage_to,
        status=InvoiceStatus.SUBMITTED,
        submitted_by_id=user.id,
        notes=body.notes,
    )
    db.add(inv)
    await db.flush()
    await _add_activity(db, inv, user, "submitted", body.notes or "Invoice submitted")
    # notify admins
    admins = (await db.execute(select(User).where(User.role == UserRole.ADMIN, User.is_active.is_(True)))).scalars().all()
    for admin in admins:
        await notify(db, admin.id, "New invoice submitted", f"{txn} needs review.", None)
    await db.commit()
    return _out(await _load(db, inv.id))


@router.get("/invoices/{invoice_id}", response_model=InvoiceOut)
async def get_invoice(
    invoice_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT, UserRole.CONTRACTOR))],
):
    inv = await _load(db, invoice_id)
    if user.role == UserRole.CONTRACTOR and inv.submitted_by_id != user.id:
        raise HTTPException(status_code=403, detail="Not your invoice")
    return _out(inv)


@router.post("/invoices/{invoice_id}/recommend", response_model=InvoiceOut)
async def recommend_invoice(
    invoice_id: int,
    body: InvoiceRecommend,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
):
    inv = await _load(db, invoice_id)
    if inv.status not in (InvoiceStatus.SUBMITTED, InvoiceStatus.CLARIFICATION):
        raise HTTPException(status_code=400, detail="Invoice cannot be recommended in current status")
    mode = body.payment_mode.lower()
    if mode not in ("full", "provisional", "balance"):
        raise HTTPException(status_code=400, detail="payment_mode must be full, provisional, or balance")
    inv.payment_mode = PaymentMode(mode)
    inv.recommended_amount = _dec(body.recommended_amount)
    if mode == "provisional" and not inv.transaction_id.endswith("_P"):
        inv.transaction_id = f"{inv.transaction_id}_P"
    elif mode == "balance" and not inv.transaction_id.endswith("_B"):
        base = inv.transaction_id.replace("_P", "").replace("_F", "").replace("_B", "")
        inv.transaction_id = f"{base}_B"
    elif mode == "full" and not inv.transaction_id.endswith("_F"):
        base = inv.transaction_id.replace("_P", "").replace("_F", "").replace("_B", "")
        inv.transaction_id = f"{base}_F"
    inv.calculation_json = body.calculation_note
    inv.status = InvoiceStatus.RECOMMENDED
    await _add_activity(
        db,
        inv,
        user,
        "recommended",
        body.note or f"Recommended {mode} payment of {body.recommended_amount}",
    )
    govs = (await db.execute(select(User).where(User.role == UserRole.GOVERNMENT, User.is_active.is_(True)))).scalars().all()
    for g in govs:
        await notify(db, g.id, "Invoice recommended", f"{inv.transaction_id} awaits approval.", None)
    await db.commit()
    return _out(await _load(db, inv.id))


@router.post("/invoices/{invoice_id}/seek-clarification", response_model=InvoiceOut)
async def seek_clarification(
    invoice_id: int,
    body: InvoiceAction,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT))],
):
    inv = await _load(db, invoice_id)
    inv.status = InvoiceStatus.CLARIFICATION
    await _add_activity(db, inv, user, "seek_clarification", body.note or "Clarification sought")
    target_id = inv.submitted_by_id
    if user.role == UserRole.GOVERNMENT:
        admin = (
            await db.execute(select(User).where(User.role == UserRole.ADMIN, User.is_active.is_(True)))
        ).scalars().first()
        if admin:
            target_id = admin.id
    await notify(
        db,
        target_id,
        "Clarification required",
        f"{inv.transaction_id}: {body.note or 'Please clarify'}",
        None,
    )
    await db.commit()
    return _out(await _load(db, inv.id))


@router.post("/invoices/{invoice_id}/clarify", response_model=InvoiceOut)
async def submit_clarification(
    invoice_id: int,
    body: InvoiceAction,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.CONTRACTOR))],
):
    inv = await _load(db, invoice_id)
    if inv.status != InvoiceStatus.CLARIFICATION:
        raise HTTPException(status_code=400, detail="Invoice is not awaiting clarification")
    inv.status = InvoiceStatus.SUBMITTED if user.role == UserRole.CONTRACTOR else InvoiceStatus.RECOMMENDED
    await _add_activity(db, inv, user, "clarification_submitted", body.note or "Clarification submitted")
    await db.commit()
    return _out(await _load(db, inv.id))


@router.post("/invoices/{invoice_id}/approve", response_model=InvoiceOut)
async def approve_invoice(
    invoice_id: int,
    body: InvoiceAction,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.GOVERNMENT))],
):
    inv = await _load(db, invoice_id)
    if inv.status != InvoiceStatus.RECOMMENDED:
        raise HTTPException(status_code=400, detail="Only recommended invoices can be approved")
    if not body.upc:
        raise HTTPException(status_code=400, detail="UPC is required to approve")
    inv.status = InvoiceStatus.APPROVED
    inv.upc = body.upc
    inv.approved_amount = _dec(body.approved_amount) if body.approved_amount is not None else inv.recommended_amount
    await _add_activity(db, inv, user, "approved", body.note or f"Approved with UPC {body.upc}")
    await notify(db, inv.submitted_by_id, "Invoice approved", f"{inv.transaction_id} approved.", None)
    await db.commit()
    return _out(await _load(db, inv.id))


@router.post("/invoices/{invoice_id}/reject", response_model=InvoiceOut)
async def reject_invoice(
    invoice_id: int,
    body: InvoiceAction,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT))],
):
    inv = await _load(db, invoice_id)
    inv.status = InvoiceStatus.REJECTED
    await _add_activity(db, inv, user, "rejected", body.note or "Invoice rejected")
    await notify(db, inv.submitted_by_id, "Invoice rejected", f"{inv.transaction_id} was rejected.", None)
    await db.commit()
    return _out(await _load(db, inv.id))


@router.post("/invoices/{invoice_id}/withdraw", response_model=InvoiceOut)
async def withdraw_invoice(
    invoice_id: int,
    body: InvoiceAction,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.CONTRACTOR))],
):
    inv = await _load(db, invoice_id)
    if user.role == UserRole.CONTRACTOR and inv.submitted_by_id != user.id:
        raise HTTPException(status_code=403, detail="Not your invoice")
    if inv.status not in (InvoiceStatus.SUBMITTED, InvoiceStatus.CLARIFICATION):
        raise HTTPException(status_code=400, detail="Cannot withdraw after processing has started")
    inv.status = InvoiceStatus.WITHDRAWN
    await _add_activity(db, inv, user, "withdrawn", body.note or "Invoice withdrawn")
    await db.commit()
    return _out(await _load(db, inv.id))
