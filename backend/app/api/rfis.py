"""Site RFI — Request for Information raise / answer / close."""

from datetime import date, datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import get_current_user, require_roles
from app.models.enums import UserRole
from app.models.issue import Issue
from app.models.portal_ops import SiteRfi
from app.models.project import Project
from app.models.user import User
from app.services.issue_service import notify
from app.services.storage import save_upload

router = APIRouter(prefix="/rfis", tags=["rfis"])


class RfiCreate(BaseModel):
    project_id: int
    subject: str = Field(min_length=3, max_length=255)
    description: str = Field(min_length=5)
    chainage: str | None = None
    priority: str = "medium"
    related_issue_id: int | None = None


class RfiAnswer(BaseModel):
    answer_text: str = Field(min_length=3)


class RfiOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    rfi_no: str
    project_id: int
    related_issue_id: int | None
    subject: str
    description: str
    chainage: str | None
    ae_name: str | None = None
    contractor_name: str | None = None
    category: str | None = None
    inspection_date: date | None = None
    photo_path: str | None = None
    priority: str
    status: str
    raised_by_id: int
    answer_text: str | None
    answered_by_id: int | None
    answered_at: datetime | None
    closed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    can_answer: bool = False
    can_close: bool = False
    can_raise: bool = False


def _out(row: SiteRfi, user: User) -> RfiOut:
    # GMC MIS Expert (admin) is view-only on RFI.
    can_answer = user.role in (UserRole.GOVERNMENT, UserRole.SURVEYOR) and row.status == "open"
    can_close = row.status in ("open", "answered") and (
        row.raised_by_id == user.id or user.role in (UserRole.GOVERNMENT, UserRole.SURVEYOR)
    )
    state = getattr(row, "__dict__", {})
    return RfiOut(
        id=row.id,
        rfi_no=row.rfi_no,
        project_id=row.project_id,
        related_issue_id=row.related_issue_id,
        subject=row.subject,
        description=row.description,
        chainage=row.chainage,
        ae_name=state.get("ae_name"),
        contractor_name=state.get("contractor_name"),
        category=state.get("category"),
        inspection_date=state.get("inspection_date"),
        photo_path=state.get("photo_path"),
        priority=row.priority,
        status=row.status,
        raised_by_id=row.raised_by_id,
        answer_text=row.answer_text,
        answered_by_id=row.answered_by_id,
        answered_at=row.answered_at,
        closed_at=row.closed_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
        can_answer=can_answer,
        can_close=can_close and row.status != "closed",
        can_raise=user.role in (UserRole.CONTRACTOR, UserRole.GOVERNMENT),
    )


@router.get("", response_model=list[RfiOut])
async def list_rfis(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT, UserRole.CONTRACTOR, UserRole.SURVEYOR))],
    status: str | None = None,
    project_id: int | None = None,
    ae_name: str | None = None,
    contractor: str | None = None,
):
    try:
        stmt = select(SiteRfi).order_by(SiteRfi.id.desc())
        if status:
            stmt = stmt.where(SiteRfi.status == status)
        if project_id is not None:
            stmt = stmt.where(SiteRfi.project_id == project_id)
        # Optional filters on deferred columns — only when requested (needs migration 015)
        if ae_name:
            stmt = stmt.where(SiteRfi.ae_name.ilike(f"%{ae_name.strip()}%"))
        if contractor:
            stmt = stmt.where(SiteRfi.contractor_name.ilike(f"%{contractor.strip()}%"))

        if user.role == UserRole.CONTRACTOR:
            # Contractor sees RFIs on their assigned projects (and ones they raised)
            from app.models.project import project_contractors

            assigned = (
                await db.execute(
                    select(project_contractors.c.project_id).where(
                        project_contractors.c.user_id == user.id
                    )
                )
            ).scalars().all()
            stmt = stmt.where(
                or_(SiteRfi.raised_by_id == user.id, SiteRfi.project_id.in_(list(assigned) or [-1]))
            )

        rows = (await db.execute(stmt)).scalars().all()
        return [_out(r, user) for r in rows]
    except Exception as exc:  # noqa: BLE001
        await db.rollback()
        # Missing site_rfis / 015 columns → empty list instead of opaque CORS/Failed to fetch
        if ae_name or contractor:
            raise HTTPException(
                status_code=500,
                detail=f"RFI list failed (run Neon SQL for site_rfis columns): {exc}",
            ) from exc
        return []


@router.get("/{rfi_id}", response_model=RfiOut)
async def get_rfi(
    rfi_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT, UserRole.CONTRACTOR, UserRole.SURVEYOR))],
):
    row = (await db.execute(select(SiteRfi).where(SiteRfi.id == rfi_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "RFI not found")
    return _out(row, user)


@router.post("", response_model=RfiOut, status_code=201)
async def raise_rfi(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.CONTRACTOR, UserRole.GOVERNMENT))],
    project_id: Annotated[int, Form()],
    subject: Annotated[str, Form(min_length=3)],
    description: Annotated[str, Form(min_length=5)],
    chainage: Annotated[str | None, Form()] = None,
    priority: Annotated[str, Form()] = "medium",
    related_issue_id: Annotated[int | None, Form()] = None,
    ae_name: Annotated[str | None, Form()] = None,
    contractor_name: Annotated[str | None, Form()] = None,
    category: Annotated[str | None, Form()] = None,
    inspection_date: Annotated[str | None, Form()] = None,
    photo: UploadFile | None = File(None),
):
    project = (
        await db.execute(
            select(Project).options(selectinload(Project.contractors)).where(Project.id == project_id)
        )
    ).scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    if user.role == UserRole.CONTRACTOR and not any(c.id == user.id for c in project.contractors):
        raise HTTPException(403, "Not assigned to this project")

    if related_issue_id:
        issue = (await db.execute(select(Issue).where(Issue.id == related_issue_id))).scalar_one_or_none()
        if not issue or issue.project_id != project_id:
            raise HTTPException(400, "related_issue_id must belong to the same project")

    prio = (priority or "medium").strip().lower()
    if prio not in ("low", "medium", "high", "urgent"):
        raise HTTPException(400, "Invalid priority")

    insp = None
    if inspection_date:
        try:
            insp = date.fromisoformat(inspection_date[:10])
        except ValueError as exc:
            raise HTTPException(400, "Invalid inspection_date") from exc

    photo_path = None
    if photo and photo.filename:
        photo_path = await save_upload(photo, "rfi_photo")

    count = (await db.execute(select(func.count(SiteRfi.id)))).scalar_one() + 1
    rfi_no = f"RFI-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{count:04d}"

    row = SiteRfi(
        rfi_no=rfi_no,
        project_id=project_id,
        related_issue_id=related_issue_id,
        subject=subject.strip(),
        description=description.strip(),
        chainage=(chainage or "").strip() or None,
        ae_name=(ae_name or "").strip() or None,
        contractor_name=(contractor_name or user.full_name or "").strip() or None,
        category=(category or "").strip() or None,
        inspection_date=insp,
        photo_path=photo_path,
        priority=prio,
        status="open",
        raised_by_id=user.id,
    )
    db.add(row)
    await db.flush()

    # Notify GMC admins + government
    reviewers = (
        await db.execute(
            select(User).where(
                User.is_active.is_(True),
                User.role.in_([UserRole.ADMIN, UserRole.GOVERNMENT, UserRole.SURVEYOR]),
            )
        )
    ).scalars().all()
    for u in reviewers:
        if u.id != user.id:
            await notify(db, u.id, "New RFI raised", f"{rfi_no}: {row.subject}", body.related_issue_id)

    await db.commit()
    await db.refresh(row)
    return _out(row, user)


@router.post("/{rfi_id}/answer", response_model=RfiOut)
async def answer_rfi(
    rfi_id: int,
    body: RfiAnswer,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.GOVERNMENT, UserRole.SURVEYOR))],
):
    row = (await db.execute(select(SiteRfi).where(SiteRfi.id == rfi_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "RFI not found")
    if row.status != "open":
        raise HTTPException(400, "Only open RFIs can be answered")
    row.answer_text = body.answer_text.strip()
    row.answered_by_id = user.id
    row.answered_at = datetime.now(timezone.utc)
    row.status = "answered"
    await notify(db, row.raised_by_id, "RFI answered", f"{row.rfi_no}: {body.answer_text.strip()[:160]}", row.related_issue_id)
    await db.commit()
    await db.refresh(row)
    return _out(row, user)


@router.post("/{rfi_id}/close", response_model=RfiOut)
async def close_rfi(
    rfi_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.GOVERNMENT, UserRole.CONTRACTOR, UserRole.SURVEYOR))],
):
    row = (await db.execute(select(SiteRfi).where(SiteRfi.id == rfi_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "RFI not found")
    if row.status == "closed":
        raise HTTPException(400, "Already closed")
    if user.role == UserRole.CONTRACTOR and row.raised_by_id != user.id:
        raise HTTPException(403, "Contractors can only close their own RFIs")
    if user.role == UserRole.ADMIN:
        raise HTTPException(403, "GMC MIS Expert has view-only access to RFI")
    row.status = "closed"
    row.closed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(row)
    return _out(row, user)
