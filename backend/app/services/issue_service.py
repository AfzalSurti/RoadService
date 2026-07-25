from datetime import date, datetime, timezone
from pathlib import Path

import aiofiles
from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.enums import STATUS_TRANSITIONS, IssueStatus, UserRole
from app.models.issue import Issue, IssueRejection, IssueStatusHistory
from app.models.notification import Notification
from app.models.project import Project
from app.models.user import User


def remaining_days(deadline: date) -> int:
    return (deadline - date.today()).days


def ensure_transition(current: IssueStatus, new: IssueStatus, *, system: bool = False) -> None:
    allowed = STATUS_TRANSITIONS.get(current, set())
    if new not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid transition: {current.value} → {new.value}",
        )
    if new == IssueStatus.VERIFICATION_PENDING and not system:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification Pending is set only by the scheduler",
        )


async def save_upload(file: UploadFile, prefix: str) -> str:
    upload_root = Path(settings.upload_dir)
    upload_root.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "photo.jpg").suffix or ".jpg"
    name = f"{prefix}_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}{ext}"
    path = upload_root / name
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty photo upload")
    async with aiofiles.open(path, "wb") as out:
        await out.write(content)
    return name  # served at /uploads/{name}


async def record_status(
    db: AsyncSession,
    issue: Issue,
    to_status: IssueStatus,
    actor: User | None,
    note: str | None = None,
) -> None:
    history = IssueStatusHistory(
        issue_id=issue.id,
        from_status=issue.status,
        to_status=to_status,
        actor_id=actor.id if actor else None,
        note=note,
    )
    issue.status = to_status
    db.add(history)


async def notify(db: AsyncSession, user_id: int, title: str, message: str, issue_id: int | None = None) -> None:
    db.add(
        Notification(
            user_id=user_id,
            issue_id=issue_id,
            title=title,
            message=message,
        )
    )


async def get_issue_or_404(db: AsyncSession, issue_id: int) -> Issue:
    result = await db.execute(
        select(Issue)
        .where(Issue.id == issue_id)
        .options(
            selectinload(Issue.status_history),
            selectinload(Issue.rejection_history),
        )
    )
    issue = result.scalar_one_or_none()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    return issue


async def get_project_or_404(db: AsyncSession, project_id: int) -> Project:
    result = await db.execute(
        select(Project)
        .where(Project.id == project_id)
        .options(selectinload(Project.contractors), selectinload(Project.surveyors))
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def assert_surveyor(user: User) -> None:
    if user.role != UserRole.SURVEYOR:
        raise HTTPException(status_code=403, detail="Only surveyors can perform this action")


def assert_contractor(user: User) -> None:
    if user.role != UserRole.CONTRACTOR:
        raise HTTPException(status_code=403, detail="Only contractors can perform this action")


def assert_admin(user: User) -> None:
    if user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin only")
