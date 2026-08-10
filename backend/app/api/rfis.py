"""Site RFI — Request for Information raise / answer / close."""

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
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


def _out(row: SiteRfi, user: User) -> RfiOut:
    can_answer = user.role in (UserRole.ADMIN, UserRole.GOVERNMENT, UserRole.SURVEYOR) and row.status == "open"
    can_close = row.status in ("open", "answered") and (
        user.role == UserRole.ADMIN
        or row.raised_by_id == user.id
        or user.role in (UserRole.GOVERNMENT, UserRole.SURVEYOR)
    )
    return RfiOut(
        id=row.id,
        rfi_no=row.rfi_no,
        project_id=row.project_id,
        related_issue_id=row.related_issue_id,
        subject=row.subject,
        description=row.description,
        chainage=row.chainage,
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
    )


@router.get("", response_model=list[RfiOut])
async def list_rfis(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT, UserRole.CONTRACTOR, UserRole.SURVEYOR))],
    status: str | None = None,
    project_id: int | None = None,
):
    stmt = select(SiteRfi).order_by(SiteRfi.id.desc())
    if status:
        stmt = stmt.where(SiteRfi.status == status)
    if project_id is not None:
        stmt = stmt.where(SiteRfi.project_id == project_id)

    if user.role == UserRole.CONTRACTOR:
        # Contractor sees RFIs on their assigned projects (and ones they raised)
        projects = (
            await db.execute(
                select(Project)
                .options(selectinload(Project.contractors))
                .where(Project.contractors.any(User.id == user.id))
            )
        ).scalars().all()
        pids = [p.id for p in projects]
        if pids:
            stmt = stmt.where(or_(SiteRfi.project_id.in_(pids), SiteRfi.raised_by_id == user.id))
        else:
            stmt = stmt.where(SiteRfi.raised_by_id == user.id)

    rows = (await db.execute(stmt)).scalars().all()
    return [_out(r, user) for r in rows]


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
    body: RfiCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.CONTRACTOR, UserRole.SURVEYOR))],
):
    project = (
        await db.execute(
            select(Project).options(selectinload(Project.contractors)).where(Project.id == body.project_id)
        )
    ).scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    if user.role == UserRole.CONTRACTOR and not any(c.id == user.id for c in project.contractors):
        raise HTTPException(403, "Not assigned to this project")

    if body.related_issue_id:
        issue = (await db.execute(select(Issue).where(Issue.id == body.related_issue_id))).scalar_one_or_none()
        if not issue or issue.project_id != body.project_id:
            raise HTTPException(400, "related_issue_id must belong to the same project")

    priority = (body.priority or "medium").strip().lower()
    if priority not in ("low", "medium", "high", "urgent"):
        raise HTTPException(400, "Invalid priority")

    count = (await db.execute(select(func.count(SiteRfi.id)))).scalar_one() + 1
    rfi_no = f"RFI-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{count:04d}"

    row = SiteRfi(
        rfi_no=rfi_no,
        project_id=body.project_id,
        related_issue_id=body.related_issue_id,
        subject=body.subject.strip(),
        description=body.description.strip(),
        chainage=(body.chainage or "").strip() or None,
        priority=priority,
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
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT, UserRole.SURVEYOR))],
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
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT, UserRole.CONTRACTOR, UserRole.SURVEYOR))],
):
    row = (await db.execute(select(SiteRfi).where(SiteRfi.id == rfi_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "RFI not found")
    if row.status == "closed":
        raise HTTPException(400, "Already closed")
    if user.role == UserRole.CONTRACTOR and row.raised_by_id != user.id:
        raise HTTPException(403, "Contractors can only close their own RFIs")
    row.status = "closed"
    row.closed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(row)
    return _out(row, user)
