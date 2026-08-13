from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, require_roles
from app.models.billing import DocumentFolder, PortalDocument, Vendor
from app.models.enums import UserRole
from app.models.portal_ops import DocumentVersion, MonthlyProgressReport
from app.models.project import Project
from app.models.user import User
from app.schemas import DocumentFolderOut, DocumentOut, MprOut, VendorCreate, VendorOut
from app.services.audit import write_audit
from app.services.storage import save_upload

docs_router = APIRouter(prefix="/documents", tags=["documents"])
vendors_router = APIRouter(prefix="/vendors", tags=["vendors"])
mpr_router = APIRouter(prefix="/mpr", tags=["mpr"])

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
    "Monthly Progress Report (MPR)",
]

STANDARD_REPO: list[tuple[str, list[str]]] = [
    (
        "Contract Documents",
        [
            "Concession Agreement (CA)",
            "EPC/HAM/BOT Contract Agreement",
            "O&M Agreement",
            "Letter of Award (LoA)",
            "Letter of Acceptance (LoA)",
            "Work Orders",
            "Change of Scope Orders",
            "Supplementary Agreements",
            "Contract Amendments",
            "Equipment inventory, warranties, AMC, lifecycle records",
            "Digital approvals, comments, review history",
            "Pending approvals, expiring contracts, document status",
        ],
    ),
    (
        "Project Documents",
        [
            "DPR",
            "Approved Drawings",
            "Good for Construction (GFC) Drawings",
            "As-Built Drawings",
            "BOQ",
            "Technical Specifications",
            "Design Calculations",
            "Project Schedule",
            "Baseline Programme",
            "Monthly Progress Reports (MPR)",
            "Inspection Reports",
            "Audit Reports",
            "Commissioning Certificates",
            "Completion Certificate",
            "O&M Manuals",
        ],
    ),
    (
        "ITS/TMS/ATMS Documents",
        [
            "ATMS drawings and specs",
            "TMS drawings and specs",
            "ITS architecture",
            "MLFF / ETC records",
            "Equipment inventory",
            "As-built ITS",
        ],
    ),
]


async def _ensure_standard_repo(db: AsyncSession) -> None:
    for r_idx, (root_name, children) in enumerate(STANDARD_REPO):
        root = (
            await db.execute(
                select(DocumentFolder).where(
                    DocumentFolder.name == root_name,
                    DocumentFolder.parent_id.is_(None),
                )
            )
        ).scalar_one_or_none()
        if not root:
            root = DocumentFolder(
                name=root_name,
                folder_type="discipline",
                parent_id=None,
                sort_order=100 + r_idx,
            )
            db.add(root)
            await db.flush()
        for t_idx, child in enumerate(children):
            found = (
                await db.execute(
                    select(DocumentFolder).where(
                        DocumentFolder.parent_id == root.id,
                        DocumentFolder.name == child,
                    )
                )
            ).scalar_one_or_none()
            if not found:
                db.add(
                    DocumentFolder(
                        name=child,
                        folder_type="doctype",
                        parent_id=root.id,
                        sort_order=t_idx,
                    )
                )


async def _ensure_folder_tree(db: AsyncSession) -> None:
    """Create stretch tree plus standard Contract / Project / ITS folders."""
    existing = (await db.execute(select(func.count(DocumentFolder.id)))).scalar_one()

    if not existing:
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
        await _ensure_standard_repo(db)
        await db.commit()
        return

    # Backfill MPR (and any missing doctypes) under Civil Related for each package stretch
    for stretch in STRETCHES:
        stretch_folder = (
            await db.execute(
                select(DocumentFolder).where(
                    DocumentFolder.name == stretch,
                    DocumentFolder.folder_type == "stretch",
                )
            )
        ).scalar_one_or_none()
        if not stretch_folder:
            continue
        civil = (
            await db.execute(
                select(DocumentFolder).where(
                    DocumentFolder.parent_id == stretch_folder.id,
                    DocumentFolder.name == "Civil Related",
                    DocumentFolder.folder_type == "discipline",
                )
            )
        ).scalar_one_or_none()
        if not civil:
            continue
        for t_idx, doc_type in enumerate(DOC_TYPES):
            found = (
                await db.execute(
                    select(DocumentFolder).where(
                        DocumentFolder.parent_id == civil.id,
                        DocumentFolder.name == doc_type,
                    )
                )
            ).scalar_one_or_none()
            if not found:
                db.add(
                    DocumentFolder(
                        name=doc_type,
                        folder_type="doctype",
                        parent_id=civil.id,
                        project_id=stretch_folder.project_id,
                        sort_order=t_idx,
                    )
                )
    await _ensure_standard_repo(db)
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
    try:
        await _ensure_folder_tree(db)
    except Exception:
        await db.rollback()

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
    try:
        await _ensure_folder_tree(db)
        await write_audit(
            db, actor_id=user.id, action="document_folders_seed", entity_type="document_folder", entity_id="tree"
        )
        await db.commit()
        return {"ok": True, "message": "Document folder tree ready"}
    except Exception as exc:  # noqa: BLE001
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Could not set up folders: {exc}") from exc


@docs_router.post("/folders", response_model=DocumentFolderOut, status_code=201)
async def create_folder(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    name: Annotated[str, Form()],
    parent_id: Annotated[int | None, Form()] = None,
):
    parent = None
    if parent_id is not None:
        parent = (await db.execute(select(DocumentFolder).where(DocumentFolder.id == parent_id))).scalar_one_or_none()
        if not parent:
            raise HTTPException(404, "Parent folder not found")
    folder = DocumentFolder(
        name=name.strip(),
        folder_type="doctype" if parent else "discipline",
        parent_id=parent.id if parent else None,
        project_id=parent.project_id if parent else None,
        sort_order=0,
    )
    db.add(folder)
    await write_audit(db, actor_id=user.id, action="folder_create", entity_type="document_folder", entity_id=name)
    await db.commit()
    await db.refresh(folder)
    return DocumentFolderOut(
        id=folder.id,
        name=folder.name,
        folder_type=folder.folder_type,
        parent_id=folder.parent_id,
        project_id=folder.project_id,
        sort_order=folder.sort_order,
        created_at=folder.created_at,
        children=[],
        document_count=0,
    )


@docs_router.patch("/folders/{folder_id}", response_model=DocumentFolderOut)
async def rename_folder(
    folder_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    name: Annotated[str, Form()],
):
    folder = (await db.execute(select(DocumentFolder).where(DocumentFolder.id == folder_id))).scalar_one_or_none()
    if not folder:
        raise HTTPException(404, "Folder not found")
    folder.name = name.strip()
    await write_audit(db, actor_id=user.id, action="folder_rename", entity_type="document_folder", entity_id=str(folder_id))
    await db.commit()
    await db.refresh(folder)
    return DocumentFolderOut(
        id=folder.id,
        name=folder.name,
        folder_type=folder.folder_type,
        parent_id=folder.parent_id,
        project_id=folder.project_id,
        sort_order=folder.sort_order,
        created_at=folder.created_at,
        children=[],
        document_count=0,
    )


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
        if folder.folder_type not in ("doctype", "discipline"):
            raise HTTPException(status_code=400, detail="Upload only into a document folder")
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
    _: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT, UserRole.CONTRACTOR))],
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


@mpr_router.get("", response_model=list[MprOut])
async def list_mpr(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT, UserRole.CONTRACTOR))],
    project_id: int | None = None,
    vendor_id: int | None = None,
):
    await _ensure_folder_tree(db)
    stmt = select(MonthlyProgressReport).order_by(MonthlyProgressReport.id.desc())
    if project_id is not None:
        stmt = stmt.where(MonthlyProgressReport.project_id == project_id)
    if vendor_id is not None:
        stmt = stmt.where(MonthlyProgressReport.vendor_id == vendor_id)
    return (await db.execute(stmt)).scalars().all()


@mpr_router.post("", response_model=MprOut, status_code=201)
async def create_mpr(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.CONTRACTOR))],
    package_name: Annotated[str, Form()],
    project_id: Annotated[int, Form()],
    report_month: Annotated[str, Form()],
    vendor_id: Annotated[int | None, Form()] = None,
    physical_progress: Annotated[str | None, Form()] = None,
    financial_progress: Annotated[str | None, Form()] = None,
    rating_performance: Annotated[str | None, Form()] = None,
    timely_execution: Annotated[str | None, Form()] = None,
    pending_activity: Annotated[str | None, Form()] = None,
    critical_observation: Annotated[str | None, Form()] = None,
    last_remarks: Annotated[str | None, Form()] = None,
    pdf_file: UploadFile | None = File(None),
):
    from datetime import date as date_cls

    await _ensure_folder_tree(db)
    project = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project / package not found")
    if vendor_id:
        vendor = (await db.execute(select(Vendor).where(Vendor.id == vendor_id))).scalar_one_or_none()
        if not vendor:
            raise HTTPException(404, "Vendor not found")

    # Link to package MPR folder under Civil Related
    stretch = (
        await db.execute(
            select(DocumentFolder).where(
                DocumentFolder.project_id == project_id,
                DocumentFolder.folder_type == "stretch",
            )
        )
    ).scalar_one_or_none()
    folder_id = None
    if stretch:
        civil = (
            await db.execute(
                select(DocumentFolder).where(
                    DocumentFolder.parent_id == stretch.id,
                    DocumentFolder.name == "Civil Related",
                )
            )
        ).scalar_one_or_none()
        if civil:
            mpr_folder = (
                await db.execute(
                    select(DocumentFolder).where(
                        DocumentFolder.parent_id == civil.id,
                        DocumentFolder.name == "Monthly Progress Report (MPR)",
                    )
                )
            ).scalar_one_or_none()
            if mpr_folder:
                folder_id = mpr_folder.id

    pdf_path = None
    if pdf_file and pdf_file.filename:
        pdf_path = await save_upload(pdf_file, "mpr_pdf")

    month = date_cls.fromisoformat(report_month.strip()[:10])
    row = MonthlyProgressReport(
        project_id=project_id,
        vendor_id=vendor_id,
        folder_id=folder_id,
        package_name=package_name.strip() or project.name,
        report_month=month,
        physical_progress=physical_progress,
        financial_progress=financial_progress,
        rating_performance=rating_performance,
        timely_execution=timely_execution,
        pending_activity=pending_activity,
        critical_observation=critical_observation,
        last_remarks=last_remarks,
        pdf_path=pdf_path,
        submitted_by_id=user.id,
    )
    db.add(row)
    await db.flush()

    if folder_id and pdf_path:
        doc = PortalDocument(
            project_id=project_id,
            folder_id=folder_id,
            category="Monthly Progress Report (MPR)",
            title=f"MPR {package_name} {month.isoformat()}",
            description=last_remarks,
            file_path=pdf_path,
            uploaded_by_id=user.id,
            current_version=1,
            approval_status="draft",
            classification="internal",
            watermark_text="CONFIDENTIAL — RoadService",
        )
        db.add(doc)
        await db.flush()
        db.add(
            DocumentVersion(
                document_id=doc.id,
                version_no=1,
                file_path=pdf_path,
                change_note="MPR PDF import",
                uploaded_by_id=user.id,
            )
        )

    await write_audit(
        db,
        actor_id=user.id,
        action="mpr_create",
        entity_type="mpr",
        entity_id=str(row.id),
        detail=package_name,
    )
    await db.commit()
    await db.refresh(row)
    return row


@mpr_router.post("/{mpr_id}/pdf", response_model=MprOut)
async def upload_mpr_pdf(
    mpr_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.CONTRACTOR, UserRole.ADMIN))],
    pdf_file: UploadFile = File(...),
):
    row = (
        await db.execute(select(MonthlyProgressReport).where(MonthlyProgressReport.id == mpr_id))
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="MPR not found")
    if not pdf_file.filename:
        raise HTTPException(status_code=400, detail="PDF file required")
    pdf_path = await save_upload(pdf_file, "mpr_pdf")
    row.pdf_path = pdf_path

    if row.folder_id:
        doc = PortalDocument(
            project_id=row.project_id,
            folder_id=row.folder_id,
            category="Monthly Progress Report (MPR)",
            title=f"MPR {row.package_name} {row.report_month}",
            description=row.last_remarks,
            file_path=pdf_path,
            uploaded_by_id=user.id,
            current_version=1,
            approval_status="draft",
            classification="internal",
            watermark_text="CONFIDENTIAL — RoadService",
        )
        db.add(doc)
        await db.flush()
        db.add(
            DocumentVersion(
                document_id=doc.id,
                version_no=1,
                file_path=pdf_path,
                change_note="MPR PDF upload",
                uploaded_by_id=user.id,
            )
        )

    await write_audit(
        db,
        actor_id=user.id,
        action="mpr_pdf_upload",
        entity_type="mpr",
        entity_id=str(row.id),
    )
    await db.commit()
    await db.refresh(row)
    return row


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
