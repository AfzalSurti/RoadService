from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, require_roles
from app.models.billing import DocumentFolder, PortalDocument, Vendor
from app.models.enums import UserRole
from app.models.portal_ops import DocumentVersion
from app.models.project import Project
from app.models.user import User
from app.schemas import DocumentFolderOut, DocumentOut, VendorCreate, VendorOut
from app.services.audit import write_audit
from app.services.storage import save_upload

docs_router = APIRouter(prefix="/documents", tags=["documents"])
vendors_router = APIRouter(prefix="/vendors", tags=["vendors"])

STRETCHES = [
    "Jabalpur - Lakhnadon",
    "Lakhnadon - Khawasa",
    "Bokhedi - Kelapur",
]
DISCIPLINES = ["Civil Related", "Toll/ATMS/TMS"]
DOC_TYPES = [
    "Contract agreement",
    "Drawing (Approved, As Built Drawing)",
    "Extension time (EOT)",
]


async def _ensure_folder_tree(db: AsyncSession) -> None:
    existing = (await db.execute(select(func.count(DocumentFolder.id)))).scalar_one()
    if existing:
        return

    for s_idx, stretch in enumerate(STRETCHES):
        project = (await db.execute(select(Project).where(Project.name == stretch))).scalar_one_or_none()
        if not project:
            project = Project(
                name=stretch,
                location=stretch,
                description=f"Corridor stretch folder project: {stretch}",
                chainage_from="0+000",
                chainage_to="0+000",
            )
            db.add(project)
            await db.flush()

        stretch_folder = DocumentFolder(
            name=stretch,
            folder_type="stretch",
            parent_id=None,
            project_id=project.id,
            sort_order=s_idx,
        )
        db.add(stretch_folder)
        await db.flush()

        for d_idx, discipline in enumerate(DISCIPLINES):
            disc_folder = DocumentFolder(
                name=discipline,
                folder_type="discipline",
                parent_id=stretch_folder.id,
                project_id=project.id,
                sort_order=d_idx,
            )
            db.add(disc_folder)
            await db.flush()
            for t_idx, doc_type in enumerate(DOC_TYPES):
                db.add(
                    DocumentFolder(
                        name=doc_type,
                        folder_type="doctype",
                        parent_id=disc_folder.id,
                        project_id=project.id,
                        sort_order=t_idx,
                    )
                )
    await db.commit()


def _folder_node(folder: DocumentFolder, counts: dict[int, int], children_map: dict[int, list[DocumentFolder]]) -> DocumentFolderOut:
    kids = children_map.get(folder.id, [])
    return DocumentFolderOut(
        id=folder.id,
        name=folder.name,
        folder_type=folder.folder_type,
        parent_id=folder.parent_id,
        project_id=folder.project_id,
        sort_order=folder.sort_order,
        created_at=folder.created_at,
        document_count=counts.get(folder.id, 0),
        children=[_folder_node(c, counts, children_map) for c in kids],
    )


@docs_router.get("/folders", response_model=list[DocumentFolderOut])
async def list_folders(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    if user.role == UserRole.SURVEYOR:
        raise HTTPException(status_code=403, detail="Surveyors use mobile field tools")
    await _ensure_folder_tree(db)

    folders = (
        await db.execute(select(DocumentFolder).order_by(DocumentFolder.sort_order, DocumentFolder.id))
    ).scalars().all()
    count_rows = (
        await db.execute(
            select(PortalDocument.folder_id, func.count(PortalDocument.id))
            .where(PortalDocument.folder_id.is_not(None))
            .group_by(PortalDocument.folder_id)
        )
    ).all()
    counts = {fid: int(c) for fid, c in count_rows if fid is not None}

    children_map: dict[int, list[DocumentFolder]] = {}
    roots: list[DocumentFolder] = []
    for f in folders:
        if f.parent_id is None:
            roots.append(f)
        else:
            children_map.setdefault(f.parent_id, []).append(f)

    return [_folder_node(r, counts, children_map) for r in roots]


@docs_router.post("/folders/seed")
async def seed_folders(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
):
    # Force rebuild only if empty; otherwise return current
    await _ensure_folder_tree(db)
    await write_audit(db, actor_id=user.id, action="document_folders_seed", entity_type="document_folder", entity_id="tree")
    await db.commit()
    return {"ok": True, "message": "Document folder tree ready"}


@docs_router.get("", response_model=list[DocumentOut])
async def list_documents(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    project_id: int | None = None,
    folder_id: int | None = None,
):
    stmt = select(PortalDocument).order_by(PortalDocument.id.desc())
    if project_id:
        stmt = stmt.where(PortalDocument.project_id == project_id)
    if folder_id is not None:
        stmt = stmt.where(PortalDocument.folder_id == folder_id)
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
    folder_id: Annotated[int | None, Form()] = None,
    file: UploadFile = File(...),
):
    folder = None
    if folder_id:
        folder = (await db.execute(select(DocumentFolder).where(DocumentFolder.id == folder_id))).scalar_one_or_none()
        if not folder:
            raise HTTPException(status_code=404, detail="Folder not found")
        if folder.folder_type != "doctype":
            raise HTTPException(status_code=400, detail="Upload only into a document-type folder")
        if project_id is None:
            project_id = folder.project_id
        category = folder.name

    path = await save_upload(file, f"doc_{category}")
    doc = PortalDocument(
        project_id=project_id,
        folder_id=folder_id,
        category=category.strip().lower() if isinstance(category, str) else "project",
        title=title.strip(),
        description=description,
        file_path=path,
        uploaded_by_id=user.id,
        current_version=1,
        approval_status="draft",
        classification="internal",
        watermark_text="CONFIDENTIAL — RoadService",
    )
    # keep readable category for doctype folders
    if folder:
        doc.category = folder.name
    db.add(doc)
    await db.flush()
    db.add(
        DocumentVersion(
            document_id=doc.id,
            version_no=1,
            file_path=path,
            change_note="Initial upload",
            uploaded_by_id=user.id,
        )
    )
    await write_audit(
        db,
        actor_id=user.id,
        action="document_upload",
        entity_type="document",
        entity_id=str(doc.id),
        detail=title,
    )
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
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    name: Annotated[str, Form()],
    project_id: Annotated[int | None, Form()] = None,
    contractor_user_id: Annotated[int | None, Form()] = None,
    brief: Annotated[str | None, Form()] = None,
    progress_notes: Annotated[str | None, Form()] = None,
    delay_notes: Annotated[str | None, Form()] = None,
    escalation_matrix: Annotated[str | None, Form()] = None,
    type_of_work: Annotated[str | None, Form()] = None,
    work_order_date: Annotated[str | None, Form()] = None,
    commencement_date: Annotated[str | None, Form()] = None,
    time_limit_completion: Annotated[str | None, Form()] = None,
    defects_liability_period: Annotated[str | None, Form()] = None,
    remarks: Annotated[str | None, Form()] = None,
    work_order_file: UploadFile | None = File(None),
    loa_file: UploadFile | None = File(None),
):
    from datetime import date as date_cls

    def _parse_date(v: str | None) -> date_cls | None:
        if not v or not str(v).strip():
            return None
        return date_cls.fromisoformat(str(v).strip()[:10])

    work_order_path = None
    loa_path = None
    if work_order_file and work_order_file.filename:
        work_order_path = await save_upload(work_order_file, "vendor_wo")
    if loa_file and loa_file.filename:
        loa_path = await save_upload(loa_file, "vendor_loa")

    vendor = Vendor(
        name=name.strip(),
        project_id=project_id,
        contractor_user_id=contractor_user_id,
        brief=brief,
        progress_notes=progress_notes,
        delay_notes=delay_notes,
        escalation_matrix=escalation_matrix,
        type_of_work=type_of_work,
        work_order_date=_parse_date(work_order_date),
        commencement_date=_parse_date(commencement_date),
        time_limit_completion=time_limit_completion,
        defects_liability_period=defects_liability_period,
        remarks=remarks,
        work_order_path=work_order_path,
        loa_path=loa_path,
    )
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
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(vendor, k, v)
    await db.commit()
    await db.refresh(vendor)
    return vendor
