from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.enums import IssueStatus
from app.models.issue import Issue
from app.services.issue_service import ensure_transition, notify, record_status


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
