"""Organisation staff details — GMC / NHIPMPL / Contractor key professionals."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, require_roles
from app.models.enums import UserRole
from app.models.portal_ops import OrgStaffDetail
from app.models.user import User

router = APIRouter(prefix="/staff-details", tags=["staff-details"])

ORG_BY_ROLE = {
    UserRole.ADMIN: "gmc",
    UserRole.GOVERNMENT: "nhimpl",
    UserRole.CONTRACTOR: "contractor",
}

ORG_LABELS = {
    "gmc": "GMC (HQ + Site) — MIS Expert",
    "nhimpl": "Project Manager NHIMPL / NHIPMPL",
    "contractor": "Contractor",
}


class StaffDetailIn(BaseModel):
    project_name: str = Field(min_length=1, max_length=255)
    position: str = Field(min_length=1, max_length=255)
    name: str = Field(min_length=1, max_length=255)
    date_of_joining: date
    mobile_no: str = Field(min_length=5, max_length=32)
    alternate_mobile_no: str | None = Field(default=None, max_length=32)
    email_id: str = Field(min_length=3, max_length=255)


class StaffDetailOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    organization: str
    organization_label: str = ""
    project_name: str
    position: str
    name: str
    date_of_joining: date
    mobile_no: str
    alternate_mobile_no: str | None
    email_id: str
    owner_user_id: int
    created_by_id: int
    can_edit: bool = False


def _org_for_user(user: User) -> str | None:
    return ORG_BY_ROLE.get(user.role)


def _can_edit(user: User, row: OrgStaffDetail) -> bool:
    org = _org_for_user(user)
    if not org or row.organization != org:
        return False
    if user.role == UserRole.CONTRACTOR:
        return row.owner_user_id == user.id
    # GMC admin / NHIPMPL: any user of that org role can edit their org's staff
    return True


def _out(row: OrgStaffDetail, user: User) -> StaffDetailOut:
    return StaffDetailOut(
        id=row.id,
        organization=row.organization,
        organization_label=ORG_LABELS.get(row.organization, row.organization),
        project_name=row.project_name,
        position=row.position,
        name=row.name,
        date_of_joining=row.date_of_joining,
        mobile_no=row.mobile_no,
        alternate_mobile_no=row.alternate_mobile_no,
        email_id=row.email_id,
        owner_user_id=row.owner_user_id,
        created_by_id=row.created_by_id,
        can_edit=_can_edit(user, row),
    )


@router.get("/meta")
async def staff_meta(
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT, UserRole.CONTRACTOR, UserRole.SURVEYOR))],
):
    org = _org_for_user(user)
    return {
        "my_organization": org,
        "my_organization_label": ORG_LABELS.get(org or "", ""),
        "can_add": org is not None and user.role != UserRole.SURVEYOR,
        "organizations": [{"id": k, "label": v} for k, v in ORG_LABELS.items()],
    }


@router.get("", response_model=list[StaffDetailOut])
async def list_staff(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT, UserRole.CONTRACTOR, UserRole.SURVEYOR))],
    organization: str | None = None,
):
    stmt = select(OrgStaffDetail).order_by(OrgStaffDetail.organization, OrgStaffDetail.name)
    if organization:
        stmt = stmt.where(OrgStaffDetail.organization == organization)
    rows = (await db.execute(stmt)).scalars().all()
    return [_out(r, user) for r in rows]


@router.post("", response_model=StaffDetailOut, status_code=201)
async def create_staff(
    body: StaffDetailIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT, UserRole.CONTRACTOR))],
):
    org = _org_for_user(user)
    if not org:
        raise HTTPException(403, "Your role cannot add staff details")
    alt = (body.alternate_mobile_no or "").strip() or None
    row = OrgStaffDetail(
        organization=org,
        project_name=body.project_name.strip(),
        position=body.position.strip(),
        name=body.name.strip(),
        date_of_joining=body.date_of_joining,
        mobile_no=body.mobile_no.strip(),
        alternate_mobile_no=alt,
        email_id=body.email_id.strip().lower(),
        owner_user_id=user.id,
        created_by_id=user.id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _out(row, user)


@router.put("/{staff_id}", response_model=StaffDetailOut)
async def update_staff(
    staff_id: int,
    body: StaffDetailIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT, UserRole.CONTRACTOR))],
):
    row = (await db.execute(select(OrgStaffDetail).where(OrgStaffDetail.id == staff_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Staff detail not found")
    if not _can_edit(user, row):
        raise HTTPException(403, "You can only edit staff under your own organisation dashboard")
    row.project_name = body.project_name.strip()
    row.position = body.position.strip()
    row.name = body.name.strip()
    row.date_of_joining = body.date_of_joining
    row.mobile_no = body.mobile_no.strip()
    row.alternate_mobile_no = (body.alternate_mobile_no or "").strip() or None
    row.email_id = body.email_id.strip().lower()
    await db.commit()
    await db.refresh(row)
    return _out(row, user)


@router.delete("/{staff_id}")
async def delete_staff(
    staff_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT, UserRole.CONTRACTOR))],
):
    row = (await db.execute(select(OrgStaffDetail).where(OrgStaffDetail.id == staff_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Staff detail not found")
    if not _can_edit(user, row):
        raise HTTPException(403, "You can only delete staff under your own organisation dashboard")
    await db.delete(row)
    await db.commit()
    return {"ok": True}
