from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import get_current_user, require_roles
from app.models.billing import Invoice, InvoiceActivity
from app.models.enums import InvoiceStatus, PaymentMode, UserRole
from app.models.project import Project
from app.models.user import User
from app.schemas import (
    InvoiceAction,
    InvoiceActivityOut,
    InvoiceCreate,
    InvoiceOut,
    InvoiceRecommend,
    InvoiceSummaryUpdate,
)
from app.services.invoice_summary import default_summary, dumps_summary, loads_summary
from app.services.issue_service import notify
from app.services.storage import save_upload

router = APIRouter(prefix="/billing", tags=["billing"])


def _dec(v: float | Decimal) -> Decimal:
    return Decimal(str(v))


def _status_detail(status: InvoiceStatus | str) -> str:
    key = status.value if hasattr(status, "value") else str(status)
    return {
        "submitted": "Send for Scrutiny to F&A / AE-IE (1st Signatory)",
        "recommended": "Recommended by AE/IE — awaiting NHIPMPL acceptance",
        "clarification": "Seek Clarification",
        "approved": "Payment Credited / Approved with UPC",
        "rejected": "Rejected by AE/IE or Client",
        "withdrawn": "Invoice Withdrawn",
        "draft": "Draft",
    }.get(key, key)


def _out(inv: Invoice) -> InvoiceOut:
    summary = loads_summary(inv.summary_json)
    state = getattr(inv, "__dict__", {})

    def _f(key: str) -> float | None:
        v = state.get(key)
        return float(v) if v is not None else None

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
        piu=inv.piu,
        faro=inv.faro,
        chainage_from=inv.chainage_from,
        chainage_to=inv.chainage_to,
        bill_from=inv.bill_from,
        bill_to=inv.bill_to,
        recommended_ae_amount=float(inv.recommended_ae_amount) if inv.recommended_ae_amount is not None else None,
        recommended_piu_amount=float(inv.recommended_piu_amount) if inv.recommended_piu_amount is not None else None,
        net_amount_released=float(inv.net_amount_released) if inv.net_amount_released is not None else None,
        voucher_no=inv.voucher_no,
        status_detail=inv.status_detail or _status_detail(inv.status),
        status=inv.status.value if hasattr(inv.status, "value") else str(inv.status),
        submitted_by_id=inv.submitted_by_id,
        notes=inv.notes,
        calculation_json=inv.calculation_json,
        project_title=inv.project_title,
        authority_engineer=inv.authority_engineer,
        contractor_name=inv.contractor_name,
        contract_price=float(inv.contract_price) if inv.contract_price is not None else None,
        summary=summary,
        signature_name=inv.signature_name,
        signature_at=inv.signature_at,
        this_bill_amount=_f("this_bill_amount"),
        cumulative_amount=_f("cumulative_amount"),
        contract_amount_cr=_f("contract_amount_cr"),
        invoice_pdf_path=state.get("invoice_pdf_path"),
        final_bill_pdf_path=state.get("final_bill_pdf_path"),
        diary_note=state.get("diary_note"),
        diary_signature=state.get("diary_signature"),
        correspondence_path=state.get("correspondence_path"),
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
    project_id: int | None = None,
):
    # Admin + NHIPMPL + contractor share the same billing register (interlinked)
    try:
        stmt = select(Invoice).options(selectinload(Invoice.activities)).order_by(Invoice.id.desc())
        if project_id is not None:
            stmt = stmt.where(Invoice.project_id == project_id)
        if user.role == UserRole.CONTRACTOR:
            stmt = stmt.where(
                or_(Invoice.submitted_by_id == user.id, Invoice.contractor_name.ilike(f"%{user.full_name}%"))
            )
        rows = (await db.execute(stmt)).scalars().unique().all()
        return [_out(i) for i in rows]
    except Exception as exc:  # noqa: BLE001
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Billing list failed (run Neon SQL for invoices claim columns): {exc}",
        ) from exc


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
    summary = dumps_summary(body.summary) if body.summary is not None else dumps_summary(default_summary())
    parsed = loads_summary(summary)
    amount = body.amount
    if body.summary is not None:
        amount = float(parsed.get("totals", {}).get("absolute_amount") or body.amount)
    inv = Invoice(
        project_id=body.project_id,
        transaction_id=txn,
        invoice_no=body.invoice_no.strip(),
        invoice_date=body.invoice_date or date.today(),
        payment_type=body.payment_type.strip(),
        payment_mode=PaymentMode.FULL,
        amount=_dec(amount),
        chainage_from=body.chainage_from,
        chainage_to=body.chainage_to,
        piu=(body.piu or project.location or None),
        faro=body.faro,
        bill_from=body.bill_from,
        bill_to=body.bill_to,
        project_title=body.project_title or project.name,
        authority_engineer=body.authority_engineer,
        contractor_name=body.contractor_name or user.full_name,
        contract_price=_dec(body.contract_price) if body.contract_price is not None else None,
        summary_json=summary,
        signature_name=body.signature_name,
        signature_at=datetime.now(timezone.utc) if body.signature_name else None,
        status=InvoiceStatus.SUBMITTED,
        status_detail=_status_detail(InvoiceStatus.SUBMITTED),
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


@router.get("/summary-template")
async def summary_template(
    _: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.CONTRACTOR, UserRole.GOVERNMENT))],
):
    s = default_summary()
    from app.services.invoice_summary import compute_totals

    s["totals"] = compute_totals(s)
    return s


@router.put("/invoices/{invoice_id}/summary", response_model=InvoiceOut)
async def update_invoice_summary(
    invoice_id: int,
    body: InvoiceSummaryUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.CONTRACTOR))],
):
    inv = await _load(db, invoice_id)
    if user.role == UserRole.CONTRACTOR and inv.submitted_by_id != user.id:
        raise HTTPException(status_code=403, detail="Not your invoice")
    if inv.status not in (InvoiceStatus.SUBMITTED, InvoiceStatus.CLARIFICATION, InvoiceStatus.DRAFT):
        raise HTTPException(status_code=400, detail="Summary locked after recommendation/approval")

    summary = dumps_summary(body.summary)
    parsed = loads_summary(summary)
    inv.summary_json = summary
    if body.project_title is not None:
        inv.project_title = body.project_title
    if body.authority_engineer is not None:
        inv.authority_engineer = body.authority_engineer
    if body.contractor_name is not None:
        inv.contractor_name = body.contractor_name
    if body.contract_price is not None:
        inv.contract_price = _dec(body.contract_price)
    abs_amt = float(parsed.get("totals", {}).get("absolute_amount") or 0)
    inv.amount = _dec(body.amount if body.amount is not None else abs_amt or inv.amount)
    if body.signature_name:
        inv.signature_name = body.signature_name
        inv.signature_at = datetime.now(timezone.utc)
    await _add_activity(db, inv, user, "summary_updated", "NHAI Summary of Invoice updated")
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
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT))],
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
    if user.role == UserRole.ADMIN:
        inv.recommended_ae_amount = inv.recommended_amount
    if user.role == UserRole.GOVERNMENT:
        inv.recommended_piu_amount = inv.recommended_amount
        inv.authority_engineer = user.full_name
    elif inv.recommended_piu_amount is None:
        inv.recommended_piu_amount = inv.recommended_amount
    inv.status = InvoiceStatus.RECOMMENDED
    inv.status_detail = _status_detail(InvoiceStatus.RECOMMENDED)
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
    inv.status_detail = _status_detail(InvoiceStatus.CLARIFICATION)
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
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
):
    inv = await _load(db, invoice_id)
    if inv.status != InvoiceStatus.CLARIFICATION:
        raise HTTPException(status_code=400, detail="Invoice is not awaiting clarification")
    inv.status = InvoiceStatus.RECOMMENDED
    inv.status_detail = _status_detail(inv.status)
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
    inv.net_amount_released = inv.approved_amount
    inv.voucher_no = body.voucher_no or inv.voucher_no
    inv.authority_engineer = inv.authority_engineer or user.full_name
    if inv.recommended_piu_amount is None:
        inv.recommended_piu_amount = inv.approved_amount
    inv.status_detail = _status_detail(InvoiceStatus.APPROVED)
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
    inv.status_detail = _status_detail(InvoiceStatus.REJECTED)
    await _add_activity(db, inv, user, "rejected", body.note or "Invoice rejected")
    await notify(db, inv.submitted_by_id, "Invoice rejected", f"{inv.transaction_id} was rejected.", None)
    await db.commit()
    return _out(await _load(db, inv.id))


@router.post("/invoices/{invoice_id}/withdraw", response_model=InvoiceOut)
async def withdraw_invoice(
    invoice_id: int,
    body: InvoiceAction,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
):
    inv = await _load(db, invoice_id)
    if inv.status not in (InvoiceStatus.SUBMITTED, InvoiceStatus.CLARIFICATION):
        raise HTTPException(status_code=400, detail="Cannot withdraw after processing has started")
    inv.status = InvoiceStatus.WITHDRAWN
    inv.status_detail = _status_detail(InvoiceStatus.WITHDRAWN)
    await _add_activity(db, inv, user, "withdrawn", body.note or "Invoice withdrawn")
    await db.commit()
    return _out(await _load(db, inv.id))


def _require_pdf(file: UploadFile) -> None:
    name = (file.filename or "").lower()
    if not name.endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are allowed")


@router.post("/invoices/claim", response_model=InvoiceOut, status_code=201)
async def create_invoice_claim(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT))],
    project_id: Annotated[int, Form()],
    invoice_no: Annotated[str, Form()],
    invoice_date: Annotated[str, Form()],
    payment_type: Annotated[str, Form()] = "Stage Payment Statement for Works",
    this_bill_amount: Annotated[float, Form()] = 0,
    cumulative_amount: Annotated[float, Form()] = 0,
    contract_amount_cr: Annotated[float | None, Form()] = None,
    bill_from: Annotated[str | None, Form()] = None,
    bill_to: Annotated[str | None, Form()] = None,
    notes: Annotated[str | None, Form()] = None,
    bill_pdf: UploadFile | None = File(None),
):
    project = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    amount = this_bill_amount or 0.01
    count = (await db.execute(select(func.count(Invoice.id)))).scalar_one() + 1
    txn = f"RS/{project.id:04d}/{count:05d}"
    pdf_path = None
    if bill_pdf and bill_pdf.filename:
        _require_pdf(bill_pdf)
        pdf_path = await save_upload(bill_pdf, "invoice_bill")
    inv = Invoice(
        project_id=project_id,
        transaction_id=txn,
        invoice_no=invoice_no.strip(),
        invoice_date=date.fromisoformat(invoice_date[:10]),
        payment_type=payment_type.strip() or "Stage Payment Statement for Works",
        payment_mode=PaymentMode.FULL,
        amount=_dec(amount),
        this_bill_amount=_dec(this_bill_amount),
        cumulative_amount=_dec(cumulative_amount),
        contract_amount_cr=_dec(contract_amount_cr) if contract_amount_cr is not None else None,
        bill_from=date.fromisoformat(bill_from[:10]) if bill_from else None,
        bill_to=date.fromisoformat(bill_to[:10]) if bill_to else None,
        invoice_pdf_path=pdf_path,
        contractor_name=user.full_name,
        project_title=project.name,
        piu=project.location or "NHIPMPL HQ",
        status=InvoiceStatus.SUBMITTED,
        status_detail=_status_detail(InvoiceStatus.SUBMITTED),
        submitted_by_id=user.id,
        notes=notes,
    )
    db.add(inv)
    await db.flush()
    await _add_activity(db, inv, user, "submitted", notes or "Invoice submitted")
    await db.commit()
    return _out(await _load(db, inv.id))


@router.post("/invoices/{invoice_id}/recommendation-doc", response_model=InvoiceOut)
async def upload_recommendation_doc(
    invoice_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT))],
    file: UploadFile = File(...),
):
    """Recommendation Document PDF (GMC upload / NHIPMPL processing)."""
    _require_pdf(file)
    inv = await _load(db, invoice_id)
    inv.final_bill_pdf_path = await save_upload(file, "recommendation_doc")
    if user.role == UserRole.GOVERNMENT:
        inv.authority_engineer = user.full_name
        if inv.recommended_piu_amount is None and inv.recommended_amount is not None:
            inv.recommended_piu_amount = inv.recommended_amount
    await _add_activity(db, inv, user, "recommendation_doc", "Recommendation Document PDF uploaded")
    await db.commit()
    return _out(await _load(db, inv.id))


@router.post("/invoices/{invoice_id}/final-bill", response_model=InvoiceOut)
async def upload_final_bill(
    invoice_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT))],
    file: UploadFile = File(...),
):
    _require_pdf(file)
    inv = await _load(db, invoice_id)
    inv.final_bill_pdf_path = await save_upload(file, "final_bill")
    await _add_activity(db, inv, user, "final_bill", "Final bill PDF uploaded")
    await db.commit()
    return _out(await _load(db, inv.id))


@router.post("/invoices/{invoice_id}/diary", response_model=InvoiceOut)
async def save_invoice_diary(
    invoice_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT))],
    note: Annotated[str, Form()],
    signature_name: Annotated[str | None, Form()] = None,
    correspondence: UploadFile | None = File(None),
):
    inv = await _load(db, invoice_id)
    inv.diary_note = note.strip()
    inv.diary_signature = (signature_name or user.full_name or "").strip() or None
    if correspondence and correspondence.filename:
        inv.correspondence_path = await save_upload(correspondence, "invoice_corr")
    if user.role == UserRole.GOVERNMENT and not inv.authority_engineer:
        inv.authority_engineer = user.full_name
    await _add_activity(db, inv, user, "diary", note.strip())
    await db.commit()
    return _out(await _load(db, inv.id))
