from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import get_current_user, require_roles
from app.models.enums import UserRole
from app.models.project import Project, ProjectInventoryItem
from app.models.user import User
from app.schemas import InventoryItemIn, InventoryItemOut, ProjectCreate, ProjectOut, ProjectUpdate
from app.services.storage import save_upload

router = APIRouter(prefix="/projects", tags=["projects"])


async def _load_project(db: AsyncSession, project_id: int) -> Project:
    result = await db.execute(
        select(Project)
        .where(Project.id == project_id)
        .options(selectinload(Project.contractors), selectinload(Project.surveyors))
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("", response_model=list[ProjectOut])
async def list_projects(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    stmt = (
        select(Project)
        .where(Project.is_active.is_(True))
        .options(selectinload(Project.contractors), selectinload(Project.surveyors))
        .order_by(Project.id.desc())
    )
    if user.role == UserRole.CONTRACTOR:
        stmt = stmt.where(Project.contractors.any(User.id == user.id))
    elif user.role == UserRole.SURVEYOR:
        stmt = stmt.where(Project.surveyors.any(User.id == user.id))
    result = await db.execute(stmt)
    return result.scalars().unique().all()


@router.post("", response_model=ProjectOut, status_code=201)
async def create_project(
    body: ProjectCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
):
    project = Project(
        name=body.name,
        title=body.title,
        short_name=body.short_name,
        location=body.location,
        description=body.description,
        chainage_from=body.chainage_from,
        chainage_to=body.chainage_to,
    )
    if body.contractor_ids:
        contractors = (
            await db.execute(select(User).where(User.id.in_(body.contractor_ids), User.role == UserRole.CONTRACTOR))
        ).scalars().all()
        project.contractors = list(contractors)
    if body.surveyor_ids:
        surveyors = (
            await db.execute(select(User).where(User.id.in_(body.surveyor_ids), User.role == UserRole.SURVEYOR))
        ).scalars().all()
        project.surveyors = list(surveyors)
    db.add(project)
    await db.commit()
    return await _load_project(db, project.id)


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(
    project_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(get_current_user)],
):
    return await _load_project(db, project_id)


@router.patch("/{project_id}", response_model=ProjectOut)
async def update_project(
    project_id: int,
    body: ProjectUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
):
    project = await _load_project(db, project_id)
    data = body.model_dump(exclude_unset=True)
    # Required text fields cannot be blanked; optional ones store NULL when cleared.
    for key in ("name", "location"):
        if key in data and not (data[key] or "").strip():
            raise HTTPException(status_code=400, detail=f"{key.capitalize()} cannot be empty")
    for key in ("name", "location", "title", "short_name", "description", "chainage_from", "chainage_to"):
        if isinstance(data.get(key), str):
            data[key] = data[key].strip() or None
    contractor_ids = data.pop("contractor_ids", None)
    surveyor_ids = data.pop("surveyor_ids", None)
    for key, value in data.items():
        setattr(project, key, value)
    if contractor_ids is not None:
        contractors = (
            await db.execute(select(User).where(User.id.in_(contractor_ids), User.role == UserRole.CONTRACTOR))
        ).scalars().all()
        project.contractors = list(contractors)
    if surveyor_ids is not None:
        surveyors = (
            await db.execute(select(User).where(User.id.in_(surveyor_ids), User.role == UserRole.SURVEYOR))
        ).scalars().all()
        project.surveyors = list(surveyors)
    await db.commit()
    return await _load_project(db, project_id)


@router.post("/{project_id}/image", response_model=ProjectOut)
async def upload_project_image(
    project_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    photo: Annotated[UploadFile, File()],
):
    """Replace the package photo shown on the dashboard tile."""
    if not (photo.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="Upload an image file (JPG / PNG / WebP)")
    project = await _load_project(db, project_id)
    project.image_url = await save_upload(photo, f"project_{project_id}")
    await db.commit()
    return await _load_project(db, project_id)


async def _inventory(db: AsyncSession, project_id: int) -> list[ProjectInventoryItem]:
    rows = await db.execute(
        select(ProjectInventoryItem)
        .where(ProjectInventoryItem.project_id == project_id)
        .order_by(ProjectInventoryItem.sort_order, ProjectInventoryItem.id)
    )
    return list(rows.scalars().all())


@router.get("/{project_id}/inventory", response_model=list[InventoryItemOut])
async def get_inventory(
    project_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(get_current_user)],
):
    """Project Inventory scope table (Sr. No / Scope / Description)."""
    await _load_project(db, project_id)
    return await _inventory(db, project_id)


@router.put("/{project_id}/inventory", response_model=list[InventoryItemOut])
async def replace_inventory(
    project_id: int,
    rows: list[InventoryItemIn],
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
):
    """Save the whole table in its new order; blank scope rows are dropped."""
    await _load_project(db, project_id)
    for old in await _inventory(db, project_id):
        await db.delete(old)
    await db.flush()
    order = 0
    for row in rows:
        scope = row.scope.strip()
        if not scope:
            continue
        order += 1
        db.add(
            ProjectInventoryItem(
                project_id=project_id, sort_order=order, scope=scope[:255], description=row.description.strip()
            )
        )
    await db.commit()
    return await _inventory(db, project_id)


@router.post("/{project_id}/location-map", response_model=ProjectOut)
async def upload_location_map(
    project_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    photo: Annotated[UploadFile, File()],
):
    """Add or replace the Project Inventory photo (e.g. route map)."""
    if not (photo.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="Upload an image file (JPG / PNG / WebP)")
    project = await _load_project(db, project_id)
    project.location_map_url = await save_upload(photo, f"project_map_{project_id}")
    await db.commit()
    return await _load_project(db, project_id)


@router.delete("/{project_id}/location-map", response_model=ProjectOut)
async def remove_location_map(
    project_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
):
    """Remove the Project Inventory photo."""
    project = await _load_project(db, project_id)
    project.location_map_url = None
    await db.commit()
    return await _load_project(db, project_id)
