from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import get_current_user, require_roles
from app.models.enums import UserRole
from app.models.project import Project
from app.models.user import User
from app.schemas import ProjectCreate, ProjectOut, ProjectUpdate

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
