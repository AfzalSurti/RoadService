from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, require_roles
from app.models.billing import PortalDocument, Vendor
from app.models.enums import UserRole
from app.models.user import User
from app.schemas import DocumentOut, VendorCreate, VendorOut
from app.services.storage import save_upload

docs_router = APIRouter(prefix="/documents", tags=["documents"])
vendors_router = APIRouter(prefix="/vendors", tags=["vendors"])


@docs_router.get("", response_model=list[DocumentOut])
async def list_documents(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    project_id: int | None = None,
):
    stmt = select(PortalDocument).order_by(PortalDocument.id.desc())
    if project_id:
        stmt = stmt.where(PortalDocument.project_id == project_id)
    if user.role == UserRole.SURVEYOR:
        raise HTTPException(status_code=403, detail="Surveyors use mobile field tools")
    return (await db.execute(stmt)).scalars().all()


@docs_router.post("", response_model=DocumentOut, status_code=201)
async def upload_document(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT, UserRole.CONTRACTOR))],
    title: Annotated[str, Form()],
    category: Annotated[str, Form()] = "project",
    description: Annotated[str | None, Form()] = None,
    project_id: Annotated[int | None, Form()] = None,
    file: UploadFile = File(...),
):
    path = await save_upload(file, f"doc_{category}")
    doc = PortalDocument(
        project_id=project_id,
        category=category.strip().lower(),
        title=title.strip(),
        description=description,
        file_path=path,
        uploaded_by_id=user.id,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc


@vendors_router.get("", response_model=list[VendorOut])
async def list_vendors(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT))],
):
    return (await db.execute(select(Vendor).order_by(Vendor.id.desc()))).scalars().all()


@vendors_router.post("", response_model=VendorOut, status_code=201)
async def create_vendor(
    body: VendorCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
):
    vendor = Vendor(**body.model_dump())
    db.add(vendor)
    await db.commit()
    await db.refresh(vendor)
    return vendor


@vendors_router.patch("/{vendor_id}", response_model=VendorOut)
async def update_vendor(
    vendor_id: int,
    body: VendorCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
):
    vendor = (await db.execute(select(Vendor).where(Vendor.id == vendor_id))).scalar_one_or_none()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    for k, v in body.model_dump().items():
        setattr(vendor, k, v)
    await db.commit()
    await db.refresh(vendor)
    return vendor
