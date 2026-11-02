from typing import Annotated

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.billing import Invoice, PortalDocument
from app.models.enums import InvoiceStatus, IssueStatus, UserRole
from app.models.issue import Issue
from app.models.notification import Notification
from app.models.portal_ops import MonthlyProgressReport, PortalQueryTicket, SiteRfi
from app.models.user import User
from app.schemas import NotificationOut

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationOut])
async def list_notifications(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    unread_only: bool = False,
):
    stmt = select(Notification).where(Notification.user_id == user.id).order_by(Notification.id.desc())
    if unread_only:
        stmt = stmt.where(Notification.is_read.is_(False))
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/{notification_id}/read", response_model=NotificationOut)
async def mark_read(
    notification_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    result = await db.execute(
        select(Notification).where(Notification.id == notification_id, Notification.user_id == user.id)
    )
    n = result.scalar_one_or_none()
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    n.is_read = True
    await db.commit()
    await db.refresh(n)
    return n


@router.post("/read-all")
async def mark_all_read(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    result = await db.execute(
        select(Notification).where(Notification.user_id == user.id, Notification.is_read.is_(False))
    )
    notes = result.scalars().all()
    for n in notes:
        n.is_read = True
    await db.commit()
    return {"marked": len(notes)}


class TaskOut(BaseModel):
    key: str
    title: str
    detail: str
    count: int
    link: str
    urgent: bool = False


@router.get("/tasks", response_model=list[TaskOut])
async def my_tasks(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    """Today's to-do list for the signed-in user, from live portal data (non-zero only)."""
    tasks: list[TaskOut] = []

    async def add(key: str, stmt, title: str, detail: str, link: str, urgent: bool = False) -> None:
        try:
            count = int((await db.execute(stmt)).scalar_one() or 0)
        except Exception:  # noqa: BLE001 — a missing table on an older DB must not break the list
            await db.rollback()
            return
        if count:
            tasks.append(TaskOut(key=key, title=title, detail=detail.format(n=count), count=count, link=link, urgent=urgent))

    issues = select(func.count(Issue.id))
    awaiting = Issue.status.in_([IssueStatus.COMPLETED, IssueStatus.VERIFICATION_PENDING])
    overdue = (Issue.deadline_date < date.today()) & (Issue.status != IssueStatus.CLOSED)
    role = user.role

    if role == UserRole.ADMIN:
        await add("verify", issues.where(awaiting), "Verify completed defects",
                  "{n} defect(s) completed by contractors are waiting for verification.", "/issues?status=completed", True)
        await add("overdue", issues.where(overdue), "Follow up overdue defects",
                  "{n} defect(s) are past their deadline and not closed.", "/issues", True)
        await add("gmc_invoices", select(func.count(Invoice.id)).where(Invoice.gmc_review_status == "pending"),
                  "Review contractor invoices", "{n} contractor invoice(s) are waiting for your GMC review.",
                  "/contractor-billing", True)
        await add("queries", select(func.count(PortalQueryTicket.id)).where(PortalQueryTicket.status.in_(["open", "in_progress"])),
                  "Resolve queries", "{n} Query Raise ticket(s) are open or in progress.", "/queries")
        await add("msr", select(func.count(MonthlyProgressReport.id)).where(MonthlyProgressReport.review_status == "pending"),
                  "Review MSRs", "{n} Monthly Status Report(s) are waiting for your review.", "/mpr")
        await add("docs", select(func.count(PortalDocument.id)).where(PortalDocument.approval_status == "pending"),
                  "Approve documents", "{n} document(s) are waiting for approval.", "/documents")
    elif role == UserRole.GOVERNMENT:
        to_approve = Invoice.status.in_([InvoiceStatus.SUBMITTED, InvoiceStatus.RECOMMENDED]) & (
            Invoice.gmc_review_status == "approved"
        )
        await add("invoices", select(func.count(Invoice.id)).where(to_approve), "Approve invoices",
                  "{n} invoice(s) are waiting for NHIPMPL approval.", "/contractor-billing", True)
        await add("rfis", select(func.count(SiteRfi.id)).where(SiteRfi.status == "open"), "Answer RFIs",
                  "{n} Request(s) for Inspection are open.", "/rfi")
        await add("docs", select(func.count(PortalDocument.id)).where(PortalDocument.approval_status == "pending"),
                  "Approve documents", "{n} document(s) are waiting for approval.", "/documents")
        await add("overdue", issues.where(overdue), "Overdue defects to watch",
                  "{n} defect(s) are past their deadline.", "/issues")
    elif role == UserRole.CONTRACTOR:
        mine = Issue.assigned_contractor_id == user.id
        await add("rework", issues.where(mine, Issue.status == IssueStatus.UNDER_REVIEW), "Do rework",
                  "{n} defect(s) were sent back for rework.", "/issues?status=under_review", True)
        await add("start", issues.where(mine, Issue.status == IssueStatus.OPEN), "Start new defects",
                  "{n} defect(s) assigned to you are not started yet.", "/issues?status=open", True)
        await add("submit", issues.where(mine, Issue.status == IssueStatus.IN_PROGRESS), "Submit completed work",
                  "{n} defect(s) are in progress — submit photo proof when done.", "/issues?status=in_progress")
        await add("overdue", issues.where(mine, overdue), "Overdue defects",
                  "{n} of your defect(s) are past their deadline.", "/issues", True)
        await add("clarify", select(func.count(Invoice.id)).where(
                      Invoice.submitted_by_id == user.id, Invoice.status == InvoiceStatus.CLARIFICATION),
                  "Clarify invoices", "{n} of your invoice(s) need clarification.", "/contractor-billing", True)
        await add("rfi_close", select(func.count(SiteRfi.id)).where(SiteRfi.raised_by_id == user.id, SiteRfi.status == "answered"),
                  "Close answered RFIs", "{n} of your RFI(s) have been answered — review and close.", "/rfi")
    elif role == UserRole.SURVEYOR:
        await add("verify", issues.where(Issue.reported_by_id == user.id, awaiting), "Verify completed defects",
                  "{n} defect(s) you raised are completed — verify on site.", "/issues?status=completed", True)
        await add("rfis", select(func.count(SiteRfi.id)).where(SiteRfi.status == "open"), "Answer RFIs",
                  "{n} Request(s) for Inspection are open.", "/rfi")
    return tasks

