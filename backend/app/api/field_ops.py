"""Field ops for GMC representative: NCR, PMM, critical issues, road warnings."""

from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, require_roles
from app.models.enums import UserRole
from app.models.portal_ops import CriticalIssue, PmmSurvey, RoadWarning, SiteNcr, SiteRfi
from app.models.project import Project
from app.models.user import User
from app.services.issue_service import get_project_or_404

router = APIRouter(prefix="/field", tags=["field-ops"])

_FIELD_ROLES = (UserRole.SURVEYOR, UserRole.ADMIN, UserRole.GOVERNMENT, UserRole.CONTRACTOR)


def _ucc(project: Project) -> str:
    loc = (project.location or "").strip()
    if loc and "/" in loc and len(loc) < 40:
        return loc
    return f"N/{project.id:05d}/01003/MH"


async def _assert_project_access(db: AsyncSession, user: User, project_id: int) -> Project:
    project = await get_project_or_404(db, project_id)
    if user.role in (UserRole.ADMIN, UserRole.GOVERNMENT):
        return project
    if user.role == UserRole.SURVEYOR:
        ids = {s.id for s in project.surveyors}
        if user.id not in ids:
            raise HTTPException(status_code=403, detail="Not assigned to this project")
        return project
    if user.role == UserRole.CONTRACTOR:
        ids = {c.id for c in project.contractors}
        if ids and user.id not in ids:
            raise HTTPException(status_code=403, detail="Not assigned to this project")
        return project
    raise HTTPException(status_code=403, detail="Not allowed")


class NcrOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    ncr_no: str
    project_id: int
    related_rfi_id: int | None
    chainage_start: str | None
    chainage_end: str | None
    category: str | None
    sub_category: str | None
    item: str | None
    layer: str | None
    side: str | None
    description: str
    rectification_duration: str | None
    status: str
    stage: str | None
    block_succeeding_rfis: bool
    raised_by_id: int
    created_at: datetime


class NcrCreate(BaseModel):
    project_id: int
    related_rfi_id: int | None = None
    chainage_start: str | None = None
    chainage_end: str | None = None
    category: str | None = None
    sub_category: str | None = None
    item: str | None = None
    layer: str | None = None
    side: str | None = None
    description: str = Field(min_length=5)
    rectification_duration: str | None = None
    block_succeeding_rfis: bool = False


class PmmOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
    status: str
    survey_date: date | None
    remarks: str | None
    lane_length_km: float | None
    distress_json: str | None
    raised_by_id: int
    created_at: datetime
    updated_at: datetime


class PmmCreate(BaseModel):
    project_id: int
    survey_date: date | None = None
    remarks: str | None = None
    lane_length_km: float | None = None
    distress_json: str | None = None


class CriticalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    issue_no: str
    project_id: int
    description: str
    issue_type: str | None
    status: str
    expected_resolution: date | None
    concerned_authority: str | None
    chainage_from: str | None
    chainage_to: str | None
    total_length_km: float | None
    priority: str | None
    remarks: str | None
    raised_by_id: int
    created_at: datetime


class CriticalCreate(BaseModel):
    project_id: int
    description: str = Field(min_length=5, max_length=500)
    issue_type: str | None = None
    status: str = "new"
    expected_resolution: date | None = None
    concerned_authority: str | None = None
    chainage_from: str | None = None
    chainage_to: str | None = None
    total_length_km: float | None = None
    priority: str | None = None
    remarks: str | None = None


class WarningOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
    title: str
    chainage: str | None
    note: str | None
    status: str
    raised_by_id: int
    created_at: datetime


class WarningCreate(BaseModel):
    project_id: int
    title: str = Field(min_length=3, max_length=255)
    chainage: str | None = None
    note: str | None = None


class ProjectUccOut(BaseModel):
    id: int
    name: str
    location: str
    description: str | None
    ucc: str


@router.get("/projects", response_model=list[ProjectUccOut])
async def list_field_projects(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*_FIELD_ROLES))],
):
    stmt = select(Project).order_by(Project.id.desc())
    if user.role == UserRole.SURVEYOR:
        stmt = stmt.where(Project.surveyors.any(User.id == user.id))
    elif user.role == UserRole.CONTRACTOR:
        stmt = stmt.where(Project.contractors.any(User.id == user.id))
    rows = (await db.execute(stmt)).scalars().unique().all()
    # Demo fallback: if contractor has no assignments, still list packages
    if user.role == UserRole.CONTRACTOR and not rows:
        rows = (await db.execute(select(Project).order_by(Project.id.desc()))).scalars().unique().all()
    return [
        ProjectUccOut(
            id=p.id,
            name=p.name,
            location=p.location,
            description=p.description,
            ucc=_ucc(p),
        )
        for p in rows
    ]


@router.get("/ncrs", response_model=list[NcrOut])
async def list_ncrs(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*_FIELD_ROLES))],
    project_id: int | None = None,
):
    stmt = select(SiteNcr).order_by(SiteNcr.id.desc())
    if project_id:
        stmt = stmt.where(SiteNcr.project_id == project_id)
    # GMC + contractor + gov see shared list (portal/mobile interlink)
    return (await db.execute(stmt)).scalars().all()


@router.post("/ncrs", response_model=NcrOut, status_code=201)
async def create_ncr(
    body: NcrCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.SURVEYOR, UserRole.ADMIN))],
):
    await _assert_project_access(db, user, body.project_id)
    if body.related_rfi_id:
        rfi = (
            await db.execute(select(SiteRfi).where(SiteRfi.id == body.related_rfi_id))
        ).scalar_one_or_none()
        if not rfi or rfi.project_id != body.project_id:
            raise HTTPException(status_code=400, detail="Reference RFI not found on this project")
    count = (await db.execute(select(func.count(SiteNcr.id)))).scalar_one()
    row = SiteNcr(
        ncr_no=f"NCR/{body.project_id:05d}/{count + 1:04d}",
        project_id=body.project_id,
        related_rfi_id=body.related_rfi_id,
        chainage_start=body.chainage_start,
        chainage_end=body.chainage_end,
        category=body.category,
        sub_category=body.sub_category,
        item=body.item,
        layer=body.layer,
        side=body.side,
        description=body.description,
        rectification_duration=body.rectification_duration,
        status="open",
        stage="Raised",
        block_succeeding_rfis=body.block_succeeding_rfis,
        raised_by_id=user.id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


class StatusUpdate(BaseModel):
    status: str = Field(min_length=2, max_length=64)
    stage: str | None = None


@router.patch("/ncrs/{ncr_id}/status", response_model=NcrOut)
async def update_ncr_status(
    ncr_id: int,
    body: StatusUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*_FIELD_ROLES))],
):
    row = (await db.execute(select(SiteNcr).where(SiteNcr.id == ncr_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "NCR not found")
    row.status = body.status
    if body.stage is not None:
        row.stage = body.stage
    await db.commit()
    await db.refresh(row)
    return row


@router.get("/pmm", response_model=list[PmmOut])
async def list_pmm(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*_FIELD_ROLES))],
):
    stmt = select(PmmSurvey).order_by(PmmSurvey.id.desc())
    return (await db.execute(stmt)).scalars().all()


@router.post("/pmm", response_model=PmmOut, status_code=201)
async def create_pmm(
    body: PmmCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.SURVEYOR, UserRole.ADMIN))],
):
    await _assert_project_access(db, user, body.project_id)
    row = PmmSurvey(
        project_id=body.project_id,
        status="open",
        survey_date=body.survey_date or date.today(),
        remarks=body.remarks,
        lane_length_km=body.lane_length_km,
        distress_json=body.distress_json,
        raised_by_id=user.id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.patch("/pmm/{pmm_id}/status", response_model=PmmOut)
async def update_pmm_status(
    pmm_id: int,
    body: StatusUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*_FIELD_ROLES))],
):
    row = (await db.execute(select(PmmSurvey).where(PmmSurvey.id == pmm_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "PMM not found")
    row.status = body.status
    await db.commit()
    await db.refresh(row)
    return row


@router.get("/critical", response_model=list[CriticalOut])
async def list_critical(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*_FIELD_ROLES))],
):
    stmt = select(CriticalIssue).order_by(CriticalIssue.id.desc())
    return (await db.execute(stmt)).scalars().all()


@router.post("/critical", response_model=CriticalOut, status_code=201)
async def create_critical(
    body: CriticalCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.SURVEYOR, UserRole.ADMIN))],
):
    await _assert_project_access(db, user, body.project_id)
    count = (await db.execute(select(func.count(CriticalIssue.id)))).scalar_one()
    length = body.total_length_km
    if length is None and body.chainage_from and body.chainage_to:
        try:
            length = abs(float(body.chainage_to) - float(body.chainage_from))
        except ValueError:
            length = None
    row = CriticalIssue(
        issue_no=f"CI/N/{body.project_id:05d}/{count + 1:05d}",
        project_id=body.project_id,
        description=body.description,
        issue_type=body.issue_type,
        status=body.status or "new",
        expected_resolution=body.expected_resolution,
        concerned_authority=body.concerned_authority,
        chainage_from=body.chainage_from,
        chainage_to=body.chainage_to,
        total_length_km=length,
        priority=body.priority,
        remarks=body.remarks,
        raised_by_id=user.id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.patch("/critical/{issue_id}/status", response_model=CriticalOut)
async def update_critical_status(
    issue_id: int,
    body: StatusUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*_FIELD_ROLES))],
):
    row = (await db.execute(select(CriticalIssue).where(CriticalIssue.id == issue_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Critical issue not found")
    row.status = body.status
    await db.commit()
    await db.refresh(row)
    return row


@router.get("/warnings", response_model=list[WarningOut])
async def list_warnings(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(*_FIELD_ROLES))],
):
    stmt = select(RoadWarning).order_by(RoadWarning.id.desc())
    return (await db.execute(stmt)).scalars().all()


@router.post("/warnings", response_model=WarningOut, status_code=201)
async def create_warning(
    body: WarningCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.SURVEYOR, UserRole.ADMIN))],
):
    await _assert_project_access(db, user, body.project_id)
    row = RoadWarning(
        project_id=body.project_id,
        title=body.title,
        chainage=body.chainage,
        note=body.note,
        status="open",
        raised_by_id=user.id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row
