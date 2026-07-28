from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.enums import IssueStatus
from app.models.issue import Issue
from app.services.issue_service import ensure_transition, notify, record_status


async def warn_approaching_verification_deadline() -> int:
    """
    Warn surveyors when a completed issue is nearing the verification window
    (default: last 4 hours before VERIFICATION_PENDING_HOURS).
    """
    hours = settings.verification_pending_hours
    warn_after = datetime.now(timezone.utc) - timedelta(hours=max(hours - 4, 1))
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    warned = 0
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Issue).where(
                Issue.status == IssueStatus.COMPLETED,
                Issue.completed_at.is_not(None),
                Issue.completed_at <= warn_after,
                Issue.completed_at > cutoff,
            )
        )
        issues = result.scalars().all()
        for issue in issues:
            # Avoid spamming: only one warning title per issue while still completed
            from app.models.notification import Notification

            existing = (
                await db.execute(
                    select(Notification).where(
                        Notification.issue_id == issue.id,
                        Notification.user_id == issue.reported_by_id,
                        Notification.title == "Verification due soon",
                    )
                )
            ).scalar_one_or_none()
            if existing:
                continue
            await notify(
                db,
                issue.reported_by_id,
                "Verification due soon",
                f"Issue #{issue.id} must be verified within {hours}h of completion — window closing.",
                issue.id,
            )
            warned += 1
        await db.commit()
    return warned


async def flip_stale_completed_to_verification_pending() -> int:
    """
    Scheduled job: Completed issues not verified within VERIFICATION_PENDING_HOURS
    auto-flip to Verification Pending.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(hours=settings.verification_pending_hours)
    flipped = 0
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Issue).where(
                Issue.status == IssueStatus.COMPLETED,
                Issue.completed_at.is_not(None),
                Issue.completed_at <= cutoff,
            )
        )
        issues = result.scalars().all()
        for issue in issues:
            ensure_transition(issue.status, IssueStatus.VERIFICATION_PENDING, system=True)
            await record_status(
                db,
                issue,
                IssueStatus.VERIFICATION_PENDING,
                actor=None,
                note=f"Auto-transition after {settings.verification_pending_hours}h without verification",
            )
            await notify(
                db,
                issue.reported_by_id,
                "Verification overdue",
                f"Issue #{issue.id} moved to Verification Pending.",
                issue.id,
            )
            flipped += 1
        await db.commit()
    return flipped
