from datetime import date, datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.catalog.defects import CATEGORIES, DEFECT_BY_ID, resolve_defect
from app.core.database import get_db
from app.core.security import get_current_user, require_roles
from app.models.enums import IssuePriority, IssueStatus, UserRole
from app.models.issue import Issue, IssueRejection, IssueStatusHistory
from app.models.user import User
from app.schemas import IssueAdminUpdate, IssueOut
from app.services.issue_service import (
    assert_admin,
    assert_contractor,
    assert_surveyor,
    ensure_transition,
    get_issue_or_404,
    get_project_or_404,
    notify,
    record_status,
    remaining_days,
    save_upload,
)

router = APIRouter(prefix="/issues", tags=["issues"])

_CATEGORY_NAMES = {c["id"]: c["name"] for c in CATEGORIES}


def _assert_verifier(user: User) -> None:
    """Surveyor verifies on site; admin may also approve/reject."""
    if user.role not in (UserRole.SURVEYOR, UserRole.ADMIN):
        raise HTTPException(status_code=403, detail="Only surveyor or admin can verify")


def _to_out(issue: Issue) -> IssueOut:
    data = IssueOut.model_validate(issue)
    data.remaining_days = remaining_days(issue.deadline_date)
    defect = DEFECT_BY_ID.get(issue.issue_type)
    data.issue_type_label = defect.label if defect else issue.issue_type
    data.work_category_label = _CATEGORY_NAMES.get(issue.work_category, issue.work_category)
    return data


@router.get("", response_model=list[IssueOut])
async def list_issues(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    status_filter: IssueStatus | None = Query(default=None, alias="status"),
    project_id: int | None = None,
):
    stmt = (
        select(Issue)
        .options(selectinload(Issue.status_history), selectinload(Issue.rejection_history))
        .order_by(Issue.id.desc())
    )
    if status_filter:
        stmt = stmt.where(Issue.status == status_filter)
    if project_id:
        stmt = stmt.where(Issue.project_id == project_id)
    if user.role == UserRole.CONTRACTOR:
        stmt = stmt.where(Issue.assigned_contractor_id == user.id)
    elif user.role == UserRole.SURVEYOR:
        stmt = stmt.where(Issue.reported_by_id == user.id)
    result = await db.execute(stmt)
    return [_to_out(i) for i in result.scalars().all()]


@router.post("", response_model=IssueOut, status_code=201)
async def create_issue(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    project_id: Annotated[int, Form()],
    issue_type: Annotated[str, Form()],
    work_category: Annotated[str, Form()],
    description: Annotated[str, Form()],
    before_lat: Annotated[float, Form()],
    before_lng: Annotated[float, Form()],
    photo: Annotated[UploadFile, File(description="Camera capture only")],
    priority: Annotated[IssuePriority, Form()] = IssuePriority.MEDIUM,
    chainage: Annotated[str | None, Form()] = None,
    lane: Annotated[str | None, Form()] = None,
    side: Annotated[str | None, Form()] = None,
    carriageway: Annotated[str | None, Form()] = None,
    is_critical: Annotated[str | None, Form()] = None,
    start_chainage: Annotated[str | None, Form()] = None,
    end_chainage: Annotated[str | None, Form()] = None,
    voice_note: Annotated[str | None, Form()] = None,
    deadline_days: Annotated[int, Form()] = 10,
    assigned_contractor_id: Annotated[int | None, Form()] = None,
):
    """Surveyor creates issue with camera photo + GPS (multipart)."""
    assert_surveyor(user)
    try:
        defect = resolve_defect(issue_type, work_category)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    project = await get_project_or_404(db, project_id)
    if user not in project.surveyors and user.role != UserRole.ADMIN:
        surveyor_ids = {s.id for s in project.surveyors}
        if user.id not in surveyor_ids:
            raise HTTPException(status_code=403, detail="Surveyor not assigned to this project")

    contractor_id = assigned_contractor_id
    if contractor_id is None:
        if not project.contractors:
            raise HTTPException(status_code=400, detail="Project has no assigned contractor")
        contractor_id = project.contractors[0].id

    photo_path = await save_upload(photo, f"issue_before_p{project_id}")
    deadline = date.today() + timedelta(days=deadline_days)

    issue = Issue(
        project_id=project_id,
        issue_type=defect.id,
        work_category=defect.category_id,
        description=description,
        priority=priority,
        status=IssueStatus.OPEN,
        chainage=chainage or (f"{start_chainage} to {end_chainage}" if start_chainage and end_chainage else start_chainage),
        lane=lane,
        side=side,
        carriageway=carriageway,
        is_critical=str(is_critical or "").lower() in ("1", "true", "yes", "on"),
        start_chainage=start_chainage,
        end_chainage=end_chainage,
        voice_note=voice_note,
        before_photo_path=photo_path,
        before_lat=before_lat,
        before_lng=before_lng,
        deadline_days=deadline_days,
        deadline_date=deadline,
        reported_by_id=user.id,
        assigned_contractor_id=contractor_id,
    )
    db.add(issue)
    await db.flush()
    db.add(
        IssueStatusHistory(
            issue_id=issue.id,
            from_status=None,
            to_status=IssueStatus.OPEN,
            actor_id=user.id,
            note="Issue created",
        )
    )
    await notify(
        db,
        contractor_id,
        "New issue assigned",
        f"Issue #{issue.id} assigned to you. Deadline: {deadline_days} days.",
        issue.id,
    )
    await db.commit()
    issue = await get_issue_or_404(db, issue.id)
    return _to_out(issue)


@router.get("/{issue_id}", response_model=IssueOut)
async def get_issue(
    issue_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(get_current_user)],
):
    return _to_out(await get_issue_or_404(db, issue_id))


@router.post("/{issue_id}/start", response_model=IssueOut)
async def start_work(
    issue_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    assert_contractor(user)
    issue = await get_issue_or_404(db, issue_id)
    if issue.assigned_contractor_id != user.id:
        raise HTTPException(status_code=403, detail="Not assigned to this issue")
    ensure_transition(issue.status, IssueStatus.IN_PROGRESS)
    await record_status(db, issue, IssueStatus.IN_PROGRESS, user, note="Work started")
    await db.commit()
    return _to_out(await get_issue_or_404(db, issue_id))


@router.post("/{issue_id}/complete", response_model=IssueOut)
async def complete_work(
    issue_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    completion_lat: Annotated[float, Form()],
    completion_lng: Annotated[float, Form()],
    photo: Annotated[UploadFile, File()],
    completion_remarks: Annotated[str | None, Form()] = None,
):
    assert_contractor(user)
    issue = await get_issue_or_404(db, issue_id)
    if issue.assigned_contractor_id != user.id:
        raise HTTPException(status_code=403, detail="Not assigned to this issue")
    ensure_transition(issue.status, IssueStatus.COMPLETED)
    path = await save_upload(photo, f"issue_complete_{issue_id}")
    issue.completion_photo_path = path
    issue.completion_lat = completion_lat
    issue.completion_lng = completion_lng
    issue.completion_remarks = completion_remarks
    issue.completed_at = datetime.now(timezone.utc)
    await record_status(db, issue, IssueStatus.COMPLETED, user, note="Work completed — pending verification")
    await notify(
        db,
        issue.reported_by_id,
        "Issue ready for verification",
        f"Issue #{issue.id} completed. Please verify within 24 hours.",
        issue.id,
    )
    await db.commit()
    return _to_out(await get_issue_or_404(db, issue_id))


@router.post("/{issue_id}/verify/approve", response_model=IssueOut)
async def verify_approve(
    issue_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    verification_lat: Annotated[float, Form()],
    verification_lng: Annotated[float, Form()],
    photo: Annotated[UploadFile, File()],
):
    _assert_verifier(user)
    issue = await get_issue_or_404(db, issue_id)
    if issue.status not in (IssueStatus.COMPLETED, IssueStatus.VERIFICATION_PENDING):
        raise HTTPException(status_code=400, detail="Issue is not awaiting verification")
    path = await save_upload(photo, f"issue_verify_{issue_id}")
    issue.verification_photo_path = path
    issue.verification_lat = verification_lat
    issue.verification_lng = verification_lng
    issue.verified_at = datetime.now(timezone.utc)
    await record_status(db, issue, IssueStatus.CLOSED, user, note="Verification approved")
    await notify(
        db,
        issue.assigned_contractor_id,
        "Issue closed",
        f"Issue #{issue.id} verified and closed.",
        issue.id,
    )
    await db.commit()
    return _to_out(await get_issue_or_404(db, issue_id))


@router.post("/{issue_id}/verify/reject", response_model=IssueOut)
async def verify_reject(
    issue_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    verification_lat: Annotated[float, Form()],
    verification_lng: Annotated[float, Form()],
    reason: Annotated[str, Form()],
    photo: Annotated[UploadFile, File()],
    comments: Annotated[str | None, Form()] = None,
):
    _assert_verifier(user)
    issue = await get_issue_or_404(db, issue_id)
    if issue.status not in (IssueStatus.COMPLETED, IssueStatus.VERIFICATION_PENDING):
        raise HTTPException(status_code=400, detail="Issue is not awaiting verification")
    path = await save_upload(photo, f"issue_reject_{issue_id}")
    issue.verification_photo_path = path
    issue.verification_lat = verification_lat
    issue.verification_lng = verification_lng
    db.add(
        IssueRejection(
            issue_id=issue.id,
            reason=reason,
            comments=comments,
            photo_path=path,
            lat=verification_lat,
            lng=verification_lng,
            rejected_by_id=user.id,
        )
    )
    await record_status(db, issue, IssueStatus.UNDER_REVIEW, user, note=f"Rework required: {reason}")
    await notify(
        db,
        issue.assigned_contractor_id,
        "Rework required",
        f"Issue #{issue.id} rejected. Reason: {reason}",
        issue.id,
    )
    await db.commit()
    return _to_out(await get_issue_or_404(db, issue_id))


@router.post("/{issue_id}/rework/start", response_model=IssueOut)
async def rework_start(
    issue_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    """Contractor picks up under-review issue → In Progress."""
    assert_contractor(user)
    issue = await get_issue_or_404(db, issue_id)
    if issue.assigned_contractor_id != user.id:
        raise HTTPException(status_code=403, detail="Not assigned to this issue")
    ensure_transition(issue.status, IssueStatus.IN_PROGRESS)
    await record_status(db, issue, IssueStatus.IN_PROGRESS, user, note="Rework started")
    await db.commit()
    return _to_out(await get_issue_or_404(db, issue_id))


@router.patch("/{issue_id}", response_model=IssueOut)
async def admin_update_issue(
    issue_id: int,
    body: IssueAdminUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
):
    assert_admin(user)
    issue = await get_issue_or_404(db, issue_id)
    if body.assigned_contractor_id is not None:
        issue.assigned_contractor_id = body.assigned_contractor_id
        await notify(
            db,
            body.assigned_contractor_id,
            "Issue reassigned",
            f"Issue #{issue.id} was reassigned to you.",
            issue.id,
        )
    if body.deadline_days is not None:
        issue.deadline_days = body.deadline_days
        issue.deadline_date = date.today() + timedelta(days=body.deadline_days)
    if body.priority is not None:
        issue.priority = body.priority
    if body.status is not None and body.status != issue.status:
        await record_status(db, issue, body.status, user, note="Admin status override")
    await db.commit()
    return _to_out(await get_issue_or_404(db, issue_id))
