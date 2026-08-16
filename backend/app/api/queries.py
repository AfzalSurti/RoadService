"""Portal Query Raise (tickets) — raise and resolve workflow for portal operations."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import require_roles
from app.models.enums import UserRole
from app.models.portal_ops import PortalQueryComment, PortalQueryTicket
from app.models.project import Project
from app.models.user import User
from app.services.issue_service import notify
from app.services.storage import save_upload

router = APIRouter(prefix="/queries", tags=["queries"])

MODULE_AREAS = [
    "incidents",
    "its",
    "civil_assets",
    "attendance",
    "vendors",
    "staff_details",
    "other",
]

STATUSES = {"open", "in_progress", "resolved", "closed"}
IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".heic")
MAX_ATTACHMENTS = 4


class QueryRaiseIn(BaseModel):
    subject: str = Field(min_length=3, max_length=255)
    description: str = Field(min_length=5)
    module_area: str = Field(min_length=2, max_length=64)
    priority: str = "medium"
    project_id: int | None = None


class QueryResolveIn(BaseModel):
    resolution_note: str = Field(min_length=3)
    status: str = "resolved"  # resolved | closed


class QueryStatusIn(BaseModel):
    status: str
    note: str | None = None


class QueryCommentIn(BaseModel):
    note: str = Field(min_length=1)


class QueryCommentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    ticket_id: int
    actor_id: int
    note: str
    action: str
    created_at: datetime


class QueryTicketOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    ticket_no: str
    project_id: int | None
    module_area: str
    subject: str
    description: str
    priority: str
    status: str
    raised_by_id: int
    assigned_to_id: int | None
    resolution_note: str | None
    resolved_by_id: int | None
    resolved_at: datetime | None
    attachment_path: str | None = None
    attachment_paths: list[str] = []
    created_at: datetime
    updated_at: datetime
    can_resolve: bool = False
    comments: list[QueryCommentOut] = []


def _parse_paths(raw: str | None) -> list[str]:
    if not raw:
        return []
    text = raw.strip()
    if text.startswith("["):
        try:
            data = json.loads(text)
            if isinstance(data, list):
                return [str(x) for x in data if x]
        except json.JSONDecodeError:
            pass
    return [text]


def _dump_paths(paths: list[str]) -> str | None:
    if not paths:
        return None
    if len(paths) == 1:
        return paths[0]
    return json.dumps(paths)


def _can_resolve(user: User) -> bool:
    # Resolve only GMC MIS Expert (admin)
    return user.role == UserRole.ADMIN


_QUERY_ROLES = (UserRole.ADMIN, UserRole.GOVERNMENT, UserRole.CONTRACTOR, UserRole.SURVEYOR)


def _out(row: PortalQueryTicket, user: User, comments: list[PortalQueryComment] | None = None) -> QueryTicketOut:
    paths = _parse_paths(row.attachment_path)
    return QueryTicketOut(
        id=row.id,
        ticket_no=row.ticket_no,
        project_id=row.project_id,
        module_area=row.module_area,
        subject=row.subject,
        description=row.description,
        priority=row.priority,
        status=row.status,
        raised_by_id=row.raised_by_id,
        assigned_to_id=row.assigned_to_id,
        resolution_note=row.resolution_note,
        resolved_by_id=row.resolved_by_id,
        resolved_at=row.resolved_at,
        attachment_path=paths[0] if paths else None,
        attachment_paths=paths,
        created_at=row.created_at,
        updated_at=row.updated_at,
        can_resolve=_can_resolve(user) and row.status in ("open", "in_progress"),
        comments=[
            QueryCommentOut(
                id=c.id,
                ticket_id=c.ticket_id,
                actor_id=c.actor_id,
                note=c.note,
                action=c.action,
                created_at=c.created_at,
            )
            for c in (comments or [])
        ],
    )


async def _load(db: AsyncSession, ticket_id: int) -> PortalQueryTicket:
    row = (await db.execute(select(PortalQueryTicket).where(PortalQueryTicket.id == ticket_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Query ticket not found")
    return row


async def _comments(db: AsyncSession, ticket_id: int) -> list[PortalQueryComment]:
    return list(
        (
            await db.execute(
                select(PortalQueryComment)
                .where(PortalQueryComment.ticket_id == ticket_id)
                .order_by(PortalQueryComment.id)
            )
        )
        .scalars()
        .all()
    )


@router.get("/meta")
async def query_meta(
    _: Annotated[User, Depends(require_roles(*_QUERY_ROLES))],
):
    return {
        "module_areas": MODULE_AREAS,
        "priorities": ["low", "medium", "high", "urgent"],
        "statuses": sorted(STATUSES),
    }


@router.get("", response_model=list[QueryTicketOut])
async def list_queries(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*_QUERY_ROLES))],
    status: str | None = None,
    module_area: str | None = None,
    project_id: int | None = None,
):
    try:
        stmt = select(PortalQueryTicket).order_by(PortalQueryTicket.id.desc())
        if status:
            stmt = stmt.where(PortalQueryTicket.status == status)
        if module_area:
            stmt = stmt.where(PortalQueryTicket.module_area == module_area)
        if project_id is not None:
            stmt = stmt.where(PortalQueryTicket.project_id == project_id)
        rows = (await db.execute(stmt)).scalars().all()
        return [_out(r, user) for r in rows]
    except Exception as exc:  # noqa: BLE001
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Queries list failed (run Neon SQL for portal_query_tickets): {exc}",
        ) from exc


@router.get("/{ticket_id}", response_model=QueryTicketOut)
async def get_query(
    ticket_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*_QUERY_ROLES))],
):
    row = await _load(db, ticket_id)
    return _out(row, user, await _comments(db, ticket_id))


@router.post("", response_model=QueryTicketOut, status_code=201)
async def raise_query(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*_QUERY_ROLES))],
    subject: Annotated[str, Form(min_length=3)],
    description: Annotated[str, Form(min_length=5)],
    module_area: Annotated[str, Form()] = "billing",
    priority: Annotated[str, Form()] = "medium",
    project_id: Annotated[int | None, Form()] = None,
    attachments: Annotated[list[UploadFile] | None, File()] = None,
    attachment: UploadFile | None = File(None),
):
    area = module_area.strip().lower().replace(" ", "_")
    if area not in MODULE_AREAS:
        raise HTTPException(400, f"module_area must be one of: {', '.join(MODULE_AREAS)}")
    prio = (priority or "medium").strip().lower()
    if prio not in ("low", "medium", "high", "urgent"):
        raise HTTPException(400, "Invalid priority")

    if project_id is not None:
        proj = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
        if not proj:
            raise HTTPException(404, "Project not found")

    count = (await db.execute(select(func.count(PortalQueryTicket.id)))).scalar_one() + 1
    ticket_no = f"QR-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{count:04d}"

    files: list[UploadFile] = []
    if attachments:
        files.extend([f for f in attachments if f and f.filename])
    if attachment and attachment.filename:
        files.append(attachment)
    if len(files) > MAX_ATTACHMENTS:
        raise HTTPException(400, f"Maximum {MAX_ATTACHMENTS} images allowed")
    # Screenshots preferred on portal; mobile raise may omit attachments
    paths: list[str] = []
    for upload in files:
        name = (upload.filename or "").lower()
        if not any(name.endswith(ext) for ext in IMAGE_EXTS):
            raise HTTPException(400, "Only image / screenshot files are allowed")
        paths.append(await save_upload(upload, "query_shot"))

    if not paths and user.role not in (UserRole.CONTRACTOR, UserRole.SURVEYOR, UserRole.ADMIN, UserRole.GOVERNMENT):
        raise HTTPException(400, "At least one image / screenshot is required (max 4)")

    row = PortalQueryTicket(
        ticket_no=ticket_no,
        project_id=project_id,
        module_area=area,
        subject=subject.strip(),
        description=description.strip(),
        priority=prio,
        status="open",
        raised_by_id=user.id,
        attachment_path=_dump_paths(paths),
    )
    db.add(row)
    await db.flush()
    db.add(
        PortalQueryComment(
            ticket_id=row.id,
            actor_id=user.id,
            note="Query / ticket raised",
            action="raise",
        )
    )

    # Notify GMC admins
    admins = (await db.execute(select(User).where(User.role == UserRole.ADMIN, User.is_active.is_(True)))).scalars().all()
    for admin in admins:
        if admin.id != user.id:
            await notify(db, admin.id, "New portal query raised", f"{ticket_no}: {row.subject}", None)

    await db.commit()
    await db.refresh(row)
    return _out(row, user, await _comments(db, row.id))


@router.post("/{ticket_id}/start", response_model=QueryTicketOut)
async def start_query(
    ticket_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    body: QueryStatusIn = QueryStatusIn(status="in_progress"),
):
    row = await _load(db, ticket_id)
    if row.status not in ("open",):
        raise HTTPException(400, "Only open queries can be taken up")
    row.status = "in_progress"
    row.assigned_to_id = user.id
    note = body.note or "Taken up for resolution"
    db.add(PortalQueryComment(ticket_id=row.id, actor_id=user.id, note=note, action="status"))
    await notify(db, row.raised_by_id, "Query in progress", f"{row.ticket_no} is being worked on", None)
    await db.commit()
    await db.refresh(row)
    return _out(row, user, await _comments(db, row.id))


@router.post("/{ticket_id}/resolve", response_model=QueryTicketOut)
async def resolve_query(
    ticket_id: int,
    body: QueryResolveIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
):
    row = await _load(db, ticket_id)
    if row.status in ("resolved", "closed"):
        raise HTTPException(400, "Query already resolved/closed")
    status = body.status if body.status in ("resolved", "closed") else "resolved"
    row.status = status
    row.resolution_note = body.resolution_note.strip()
    row.resolved_by_id = user.id
    row.resolved_at = datetime.now(timezone.utc)
    if not row.assigned_to_id:
        row.assigned_to_id = user.id
    db.add(
        PortalQueryComment(
            ticket_id=row.id,
            actor_id=user.id,
            note=body.resolution_note.strip(),
            action="resolve",
        )
    )
    await notify(
        db,
        row.raised_by_id,
        f"Query {status}",
        f"{row.ticket_no}: {body.resolution_note.strip()[:180]}",
        None,
    )
    await db.commit()
    await db.refresh(row)
    return _out(row, user, await _comments(db, row.id))


@router.post("/{ticket_id}/reopen", response_model=QueryTicketOut)
async def reopen_query(
    ticket_id: int,
    body: QueryCommentIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*_QUERY_ROLES))],
):
    row = await _load(db, ticket_id)
    if row.status not in ("resolved", "closed"):
        raise HTTPException(400, "Only resolved/closed queries can be reopened")
    if user.role in (UserRole.CONTRACTOR, UserRole.SURVEYOR) and row.raised_by_id != user.id:
        raise HTTPException(403, "You can only reopen your own queries")
    row.status = "open"
    row.resolution_note = None
    row.resolved_by_id = None
    row.resolved_at = None
    db.add(PortalQueryComment(ticket_id=row.id, actor_id=user.id, note=body.note.strip(), action="reopen"))
    await db.commit()
    await db.refresh(row)
    return _out(row, user, await _comments(db, row.id))


@router.post("/{ticket_id}/comments", response_model=QueryTicketOut)
async def add_comment(
    ticket_id: int,
    body: QueryCommentIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*_QUERY_ROLES))],
):
    row = await _load(db, ticket_id)
    db.add(PortalQueryComment(ticket_id=row.id, actor_id=user.id, note=body.note.strip(), action="comment"))
    await db.commit()
    await db.refresh(row)
    return _out(row, user, await _comments(db, row.id))
