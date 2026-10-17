from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.enums import STATUS_TRANSITIONS, IssueStatus, UserRole
from app.models.issue import Issue, IssueStatusHistory
from app.models.notification import Notification
from app.models.project import Project
from app.models.user import User
from app.services.storage import save_upload

__all__ = [
    "remaining_days",
    "ensure_transition",
    "save_upload",
    "record_status",
    "notify",
    "notify_many",
    "user_ids_with_roles",
    "notify_issue_event",
    "get_issue_or_404",
    "get_project_or_404",
    "assert_surveyor",
    "assert_contractor",
    "assert_admin",
]


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


async def notify(
    db: AsyncSession,
    user_id: int,
    title: str,
    message: str,
    issue_id: int | None = None,
    link: str | None = None,
) -> None:
    db.add(
        Notification(
            user_id=user_id,
            issue_id=issue_id,
            link=link,
            title=title,
            message=message,
        )
    )


async def user_ids_with_roles(db: AsyncSession, *roles: UserRole) -> list[int]:
    rows = await db.execute(select(User.id).where(User.is_active.is_(True), User.role.in_(roles)))
    return list(rows.scalars().all())


async def notify_many(
    db: AsyncSession,
    user_ids,
    title: str,
    message: str,
    issue_id: int | None = None,
    link: str | None = None,
    exclude: int | None = None,
) -> None:
    """Notify each distinct user once, skipping `exclude` (usually the actor)."""
    seen: set[int] = set()
    for uid in user_ids:
        if uid is None or uid == exclude or uid in seen:
            continue
        seen.add(uid)
        await notify(db, uid, title, message, issue_id, link)


async def notify_issue_event(
    db: AsyncSession,
    issue: Issue,
    actor: User | None,
    title: str,
    message: str,
) -> None:
    """Every issue event reaches GMC Experts, NHIPMPL, the reporter and the contractor."""
    oversight = await user_ids_with_roles(db, UserRole.ADMIN, UserRole.GOVERNMENT)
    await notify_many(
        db,
        [*oversight, issue.reported_by_id, issue.assigned_contractor_id],
        title,
        message,
        issue.id,
        exclude=actor.id if actor else None,
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
