import asyncio
import json
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import get_current_user, require_roles
from app.models.enums import UserRole
from app.models.project import Project, ProjectInventoryItem, ProjectInventorySheet
from app.models.user import User
from app.schemas import (
    InventoryItemIn,
    InventoryItemOut,
    InventorySheetIn,
    InventorySheetOut,
    InventorySheetRename,
    InventorySheetSummary,
    ProjectCreate,
    ProjectOut,
    ProjectUpdate,
)
from app.services.inventory_sheets import parse_workbook
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
    # Report parties keep "" when cleared, so the startup defaults do not refill them.
    for key in ("authority", "project_impl_authority", "concessionaire", "gmc_name", "epc_contractor"):
        if isinstance(data.get(key), str):
            data[key] = data[key].strip()
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


def _sheet_summary(sheet: ProjectInventorySheet, grid: list | None = None) -> InventorySheetSummary:
    grid = json.loads(sheet.grid) if grid is None else grid
    return InventorySheetSummary(
        id=sheet.id,
        name=sheet.name,
        sort_order=sheet.sort_order,
        rows=len(grid),
        cols=max((len(r) for r in grid), default=0),
    )


async def _sheet_or_404(db: AsyncSession, project_id: int, sheet_id: int) -> ProjectInventorySheet:
    sheet = (
        await db.execute(
            select(ProjectInventorySheet).where(
                ProjectInventorySheet.id == sheet_id, ProjectInventorySheet.project_id == project_id
            )
        )
    ).scalar_one_or_none()
    if not sheet:
        raise HTTPException(status_code=404, detail="Inventory sheet not found")
    return sheet


@router.get("/{project_id}/inventory-sheets", response_model=list[InventorySheetSummary])
async def list_inventory_sheets(
    project_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(get_current_user)],
):
    """Tabs of the package inventory workbook (no cell data)."""
    await _load_project(db, project_id)
    rows = await db.execute(
        select(ProjectInventorySheet)
        .where(ProjectInventorySheet.project_id == project_id)
        .order_by(ProjectInventorySheet.sort_order, ProjectInventorySheet.id)
    )
    return [_sheet_summary(s) for s in rows.scalars().all()]


@router.get("/{project_id}/inventory-sheets/{sheet_id}", response_model=InventorySheetOut)
async def get_inventory_sheet(
    project_id: int,
    sheet_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(get_current_user)],
):
    sheet = await _sheet_or_404(db, project_id, sheet_id)
    grid = json.loads(sheet.grid)
    return InventorySheetOut(**_sheet_summary(sheet, grid).model_dump(), grid=grid, merges=json.loads(sheet.merges))


@router.put("/{project_id}/inventory-sheets/{sheet_id}", response_model=InventorySheetOut)
async def save_inventory_sheet(
    project_id: int,
    sheet_id: int,
    body: InventorySheetIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
):
    """Save edited cells (and row changes) of one sheet."""
    sheet = await _sheet_or_404(db, project_id, sheet_id)
    width = max((len(r) for r in body.grid), default=0)
    grid = [[str(c) for c in r] + [""] * (width - len(r)) for r in body.grid]
    merges = [m for m in body.merges if len(m) == 4 and m[0] < len(grid) and m[1] < width]
    if body.name and body.name.strip():
        sheet.name = body.name.strip()[:120]
    sheet.grid = json.dumps(grid, ensure_ascii=False)
    sheet.merges = json.dumps(merges)
    await db.commit()
    await db.refresh(sheet)
    return InventorySheetOut(**_sheet_summary(sheet, grid).model_dump(), grid=grid, merges=merges)


@router.post("/{project_id}/inventory-sheets/import", response_model=list[InventorySheetSummary])
async def import_inventory_workbook(
    project_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    file: Annotated[UploadFile, File()],
):
    """Replace the package's inventory tabs with the visible sheets of an .xlsx file."""
    await _load_project(db, project_id)
    if not (file.filename or "").lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=400, detail="Upload an Excel workbook (.xlsx)")
    content = await file.read()
    try:
        sheets = await asyncio.to_thread(parse_workbook, content)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Could not read the workbook: {exc}") from exc
    if not sheets:
        raise HTTPException(status_code=400, detail="The workbook has no visible sheets with data")
    old = await db.execute(select(ProjectInventorySheet).where(ProjectInventorySheet.project_id == project_id))
    for sheet in old.scalars().all():
        await db.delete(sheet)
    await db.flush()
    for order, s in enumerate(sheets, start=1):
        db.add(
            ProjectInventorySheet(
                project_id=project_id,
                sort_order=order,
                name=s["name"][:120],
                grid=json.dumps(s["grid"], ensure_ascii=False),
                merges=json.dumps(s["merges"]),
            )
        )
    await db.commit()
    return await list_inventory_sheets(project_id, db, _)


@router.post("/{project_id}/inventory-sheets", response_model=InventorySheetOut, status_code=201)
async def create_inventory_sheet(
    project_id: int,
    body: InventorySheetIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
):
    """Add a new tab (sheet) to the package inventory, placed last."""
    await _load_project(db, project_id)
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Sheet name is required")
    last = (
        await db.execute(
            select(ProjectInventorySheet.sort_order)
            .where(ProjectInventorySheet.project_id == project_id)
            .order_by(ProjectInventorySheet.sort_order.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    width = max((len(r) for r in body.grid), default=0)
    grid = [[str(c) for c in r] + [""] * (width - len(r)) for r in body.grid]
    sheet = ProjectInventorySheet(
        project_id=project_id,
        sort_order=(last or 0) + 1,
        name=name[:120],
        grid=json.dumps(grid, ensure_ascii=False),
        merges=json.dumps([m for m in body.merges if len(m) == 4]),
    )
    db.add(sheet)
    await db.commit()
    await db.refresh(sheet)
    return InventorySheetOut(**_sheet_summary(sheet, grid).model_dump(), grid=grid, merges=json.loads(sheet.merges))


@router.patch("/{project_id}/inventory-sheets/{sheet_id}", response_model=InventorySheetSummary)
async def rename_inventory_sheet(
    project_id: int,
    sheet_id: int,
    body: InventorySheetRename,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
):
    """Rename a tab."""
    sheet = await _sheet_or_404(db, project_id, sheet_id)
    sheet.name = body.name.strip()[:120]
    await db.commit()
    await db.refresh(sheet)
    return _sheet_summary(sheet)


@router.delete("/{project_id}/inventory-sheets/{sheet_id}", status_code=204)
async def delete_inventory_sheet(
    project_id: int,
    sheet_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
):
    """Delete a tab and its data."""
    sheet = await _sheet_or_404(db, project_id, sheet_id)
    await db.delete(sheet)
    await db.commit()
