from datetime import datetime, timezone
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
# Four disciplines under every package. Civil Related and Toll/ATMS/TMS carry a
# group level (Contract / Project / ITS...) then leaf doc-types; Statutory and
# Financial carry leaf doc-types directly.
DISCIPLINES = [
    "Civil Related",
    "Toll/ATMS/TMS",
    "Statutory & Compliance Documents",
    "Financial Documents",
]

CONTRACT_DOCS = [
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
]
PROJECT_DOCS = [
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
]
ITS_DOCS = [
    "System Design Documents (SDD)",
    "FAT Reports",
    "SAT Reports",
    "POC Reports",
    "Network Architecture",
    "IP Addressing Plan",
    "Asset Register",
    "Device Configuration Files",
    "Software Versions",
    "Firmware Repository",
    "OEM Manuals",
    "Warranty Documents",
    "AMC Documents",
]
STATUTORY_DOCS = [
    "NHAI Approvals",
    "IE Certificates",
    "Safety Audit Reports",
    "Environmental Clearances",
    "Insurance Documents",
    "Licenses",
    "Statutory Permissions",
    "Incident Investigation Reports",
]
FINANCIAL_DOCS = [
    "Invoices",
    "Running Account Bills",
    "Payment Certificates",
    "Performance Bank Guarantees",
    "Security Deposits",
    "Insurance Policies",
    "Cost Estimates",
    "Budget Approvals",
]

# discipline -> {group: [leaves]}  OR  discipline -> [leaves]
PACKAGE_TREE: dict[str, object] = {
    "Civil Related": {
        "Contract Documents": CONTRACT_DOCS,
        "Project Documents": PROJECT_DOCS,
    },
    "Toll/ATMS/TMS": {
        "ITS/TMS/ATMS Documents": ITS_DOCS,
    },
    "Statutory & Compliance Documents": STATUTORY_DOCS,
    "Financial Documents": FINANCIAL_DOCS,
}


async def _folder_has_documents(db: AsyncSession, folder_id: int) -> bool:
    """True if this folder or any descendant holds a PortalDocument."""
    stack = [folder_id]
    seen: set[int] = set()
    while stack:
        cur = stack.pop()
        if cur in seen:
            continue
        seen.add(cur)
        cnt = (
            await db.execute(
                select(func.count(PortalDocument.id)).where(PortalDocument.folder_id == cur)
            )
        ).scalar_one()
        if cnt:
            return True
        kids = (
            await db.execute(select(DocumentFolder.id).where(DocumentFolder.parent_id == cur))
        ).scalars().all()
        stack.extend(kids)
    return False


async def _ensure_child(
    db: AsyncSession,
    *,
    name: str,
    folder_type: str,
    parent_id: int | None,
    project_id: int | None,
    sort_order: int,
) -> DocumentFolder:
    q = select(DocumentFolder).where(DocumentFolder.name == name)
    q = (
        q.where(DocumentFolder.parent_id == parent_id)
        if parent_id is not None
        else q.where(DocumentFolder.parent_id.is_(None))
    )
    row = (await db.execute(q)).scalars().first()
    if row:
        row.folder_type = folder_type
        row.project_id = project_id
        row.sort_order = sort_order
        return row
    row = DocumentFolder(
        name=name,
        folder_type=folder_type,
        parent_id=parent_id,
        project_id=project_id,
        sort_order=sort_order,
    )
    db.add(row)
    await db.flush()
    return row


async def _prune_children(db: AsyncSession, parent_id: int, allowed: set[str]) -> None:
    """Delete empty child folders whose name is not in the canonical set."""
    kids = (
        await db.execute(select(DocumentFolder).where(DocumentFolder.parent_id == parent_id))
    ).scalars().all()
    for k in kids:
        if k.name not in allowed and not await _folder_has_documents(db, k.id):
            await db.delete(k)
    await db.flush()


async def _find_mpr_leaf(db: AsyncSession, project_id: int) -> int | None:
    """Folder id of the 'Monthly Progress Reports (MPR)' leaf for a package project."""
    pkg = (
        await db.execute(
            select(DocumentFolder).where(
                DocumentFolder.project_id == project_id,
                DocumentFolder.folder_type == "stretch",
            )
        )
    ).scalars().first()
    if not pkg:
        return None
    civil = (
        await db.execute(
            select(DocumentFolder).where(
                DocumentFolder.parent_id == pkg.id,
                DocumentFolder.name == "Civil Related",
            )
        )
    ).scalars().first()
    if not civil:
        return None
    proj_docs = (
        await db.execute(
            select(DocumentFolder).where(
                DocumentFolder.parent_id == civil.id,
                DocumentFolder.name == "Project Documents",
            )
        )
    ).scalars().first()
    parents = [p.id for p in (proj_docs, civil) if p]
    leaf = (
        await db.execute(
            select(DocumentFolder).where(
                DocumentFolder.parent_id.in_(parents),
                DocumentFolder.name.like("Monthly Progress Report%"),
            )
        )
    ).scalars().first()
    return leaf.id if leaf else None


async def _ensure_folder_tree(db: AsyncSession) -> None:
    """Idempotently build 3 package roots -> 4 disciplines -> groups/leaves.

    Prunes empty stray folders so the tree shows only the canonical structure.
    """
    # 1) drop stray top-level folders (not one of the 3 packages) that hold no documents
    roots = (
        await db.execute(select(DocumentFolder).where(DocumentFolder.parent_id.is_(None)))
    ).scalars().all()
    for r in roots:
        if r.name not in STRETCHES and not await _folder_has_documents(db, r.id):
            await db.delete(r)
    await db.flush()

    # 2) (re)build the canonical tree for each package
    for s_idx, stretch in enumerate(STRETCHES):
        project = (
            await db.execute(select(Project).where(Project.name == stretch))
        ).scalar_one_or_none()
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

        pkg = await _ensure_child(
            db, name=stretch, folder_type="stretch", parent_id=None,
            project_id=project.id, sort_order=s_idx,
        )

        for d_idx, discipline in enumerate(DISCIPLINES):
            disc = await _ensure_child(
                db, name=discipline, folder_type="discipline", parent_id=pkg.id,
                project_id=project.id, sort_order=d_idx,
            )
            spec = PACKAGE_TREE.get(discipline, [])
            if isinstance(spec, dict):
                for g_idx, (group, leaves) in enumerate(spec.items()):
                    grp = await _ensure_child(
                        db, name=group, folder_type="discipline", parent_id=disc.id,
                        project_id=project.id, sort_order=g_idx,
                    )
                    for l_idx, leaf in enumerate(leaves):
                        await _ensure_child(
                            db, name=leaf, folder_type="doctype", parent_id=grp.id,
                            project_id=project.id, sort_order=l_idx,
                        )
                    await _prune_children(db, grp.id, set(leaves))
                await _prune_children(db, disc.id, set(spec.keys()))
            else:
                for l_idx, leaf in enumerate(spec):
                    await _ensure_child(
                        db, name=leaf, folder_type="doctype", parent_id=disc.id,
                        project_id=project.id, sort_order=l_idx,
                    )
                await _prune_children(db, disc.id, set(spec))

        await _prune_children(db, pkg.id, set(DISCIPLINES))

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
    try:
        try:
            await _ensure_folder_tree(db)
        except Exception:
            await db.rollback()
        stmt = select(MonthlyProgressReport).order_by(MonthlyProgressReport.id.desc())
        if project_id is not None:
            stmt = stmt.where(MonthlyProgressReport.project_id == project_id)
        if vendor_id is not None:
            stmt = stmt.where(MonthlyProgressReport.vendor_id == vendor_id)
        return list((await db.execute(stmt)).scalars().all())
    except Exception as exc:  # noqa: BLE001
        await db.rollback()
        # Missing monthly_progress_reports table → empty list (not Failed to fetch)
        detail = str(exc).lower()
        if "monthly_progress" in detail or "does not exist" in detail or "undefinedtable" in detail:
            return []
        raise HTTPException(
            status_code=500,
            detail=f"MPR list failed (run Neon SQL for monthly_progress_reports): {exc}",
        ) from exc


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

    # Link to the "Monthly Progress Reports (MPR)" leaf under Civil Related > Project Documents
    folder_id = await _find_mpr_leaf(db, project_id)

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


_MPR_REVIEW_STATES = {"pending", "approved", "not_approved"}


@mpr_router.post("/{mpr_id}/review", response_model=MprOut)
async def review_mpr(
    mpr_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    review_status: Annotated[str, Form()],
    review_remark: Annotated[str | None, Form()] = None,
):
    """GMC MIS Expert marks a contractor MPR Approved / Not Approved with a remark."""
    row = (
        await db.execute(select(MonthlyProgressReport).where(MonthlyProgressReport.id == mpr_id))
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="MPR not found")
    status = (review_status or "").strip().lower().replace(" ", "_").replace("-", "_")
    if status == "not_approved" or status == "notapproved":
        status = "not_approved"
    if status not in _MPR_REVIEW_STATES:
        raise HTTPException(status_code=400, detail="review_status must be approved, not_approved or pending")
    row.review_status = status
    row.review_remark = (review_remark or "").strip() or None
    row.reviewed_by_id = user.id
    row.reviewed_at = datetime.now(timezone.utc)
    await write_audit(
        db,
        actor_id=user.id,
        action="mpr_review",
        entity_type="mpr",
        entity_id=str(row.id),
        detail=f"{status}: {row.review_remark or ''}".strip(),
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
