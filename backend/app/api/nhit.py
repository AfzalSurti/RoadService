"""NHIT portal APIs: attendance, security, toll, incidents, ITS, assets, integrations, backup, executive."""

from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, hash_password, require_roles, verify_password
from app.models.billing import PortalDocument
from app.models.enums import UserRole
from app.models.portal_ops import (
    AttendanceRecord,
    BackupJob,
    BcpItem,
    CivilAsset,
    DocumentApproval,
    DocumentVersion,
    DutyRoster,
    ExecutiveSnapshot,
    HighwayIncident,
    IntegrationLink,
    ItsDevice,
    LeaveRequest,
    LoginHistory,
    Personnel,
    ResponseVehicle,
    TollDailyStat,
    TollPlaza,
    AuditLog,
)
from app.models.project import Project
from app.models.user import User
from app.services.audit import write_audit
from app.services.storage import save_upload

router = APIRouter(prefix="/nhit", tags=["nhit-portal"])


def _orm_dict(obj: Any) -> dict:
    data = {c.name: getattr(obj, c.name) for c in obj.__table__.columns}
    for k, v in list(data.items()):
        if isinstance(v, Decimal):
            data[k] = float(v)
        elif isinstance(v, (datetime, date)):
            data[k] = v.isoformat()
    return data


# ---- schemas (local) ----
class IdNote(BaseModel):
    note: str | None = None
    signature_data: str | None = None


class PersonnelIn(BaseModel):
    employee_code: str
    full_name: str
    designation: str
    project_id: int | None = None
    discipline: str | None = None
    employer: str | None = None
    deployment_location: str | None = None
    phone: str | None = None
    joining_date: date | None = None
    id_valid_till: date | None = None
    certifications: str | None = None


class AttendanceIn(BaseModel):
    personnel_id: int
    work_date: date
    status: str = "present"
    in_time: str | None = None
    out_time: str | None = None
    working_hours: float | None = None
    latitude: float | None = None
    longitude: float | None = None
    biometric_verified: bool = False
    shift_name: str | None = None
    notes: str | None = None


class LeaveIn(BaseModel):
    personnel_id: int
    from_date: date
    to_date: date
    leave_type: str = "casual"
    reason: str | None = None


class RosterIn(BaseModel):
    personnel_id: int
    work_date: date
    shift_name: str
    location: str | None = None
    notes: str | None = None


class MfaSetup(BaseModel):
    pin: str = Field(min_length=4, max_length=8)
    enabled: bool = True


class TollPlazaIn(BaseModel):
    name: str
    project_id: int | None = None
    chainage: str | None = None
    lanes: int = 4
    has_etc: bool = True
    has_wim: bool = False
    tariff_notes: str | None = None
    revision_date: date | None = None


class TollStatIn(BaseModel):
    plaza_id: int
    stat_date: date
    total_traffic: int = 0
    fastag_pct: float = 0
    cash_pct: float = 0
    revenue: float = 0
    avg_lane_availability: float = 100
    peak_hour_traffic: int = 0
    avg_waiting_min: float = 0
    notes: str | None = None


class IncidentIn(BaseModel):
    category: str
    severity: str = "medium"
    description: str | None = None
    chainage: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    project_id: int | None = None
    response_vehicle: str | None = None
    source_1033: bool = False


class VehicleIn(BaseModel):
    vehicle_code: str
    vehicle_type: str = "patrol"
    project_id: int | None = None
    base_location: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    status: str = "available"


class ItsIn(BaseModel):
    system_type: str
    name: str
    project_id: int | None = None
    location: str | None = None
    status: str = "online"
    health_pct: float = 100
    firmware_version: str | None = None
    notes: str | None = None


class AssetIn(BaseModel):
    asset_code: str
    asset_type: str
    name: str
    project_id: int | None = None
    chainage_from: str | None = None
    chainage_to: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    condition: str = "good"
    last_inspection: date | None = None
    next_maintenance: date | None = None
    notes: str | None = None


class IntegrationIn(BaseModel):
    name: str
    system_code: str
    endpoint_url: str | None = None
    status: str = "configured"
    notes: str | None = None


class BackupIn(BaseModel):
    job_name: str
    backup_type: str = "incremental"
    schedule: str = "daily"
    location: str = "onsite"
    notes: str | None = None


class BcpIn(BaseModel):
    title: str
    category: str = "dr"
    owner: str | None = None
    status: str = "pending"
    due_date: date | None = None
    notes: str | None = None


class ExecutiveIn(BaseModel):
    stretch_name: str
    project_id: int | None = None
    key_features: str | None = None
    total_length_km: float | None = None
    physical_progress_pct: float = 0
    planned_expenditure: float = 0
    actual_expenditure: float = 0
    toll_plazas_count: int = 0
    avg_lane_availability: float = 100
    notes: str | None = None


class DocMetaUpdate(BaseModel):
    watermark_text: str | None = None
    classification: str | None = None
    signature_data: str | None = None


# ---- Document workflow ----
@router.get("/documents/pending-approvals")
async def pending_approvals(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT))],
):
    rows = (
        await db.execute(
            select(DocumentApproval).where(DocumentApproval.status == "pending").order_by(DocumentApproval.id.desc())
        )
    ).scalars().all()
    return [_orm_dict(r) for r in rows]


@router.post("/documents/{doc_id}/new-version")
async def new_document_version(
    doc_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT, UserRole.CONTRACTOR))],
    change_note: Annotated[str | None, Form()] = None,
    file: UploadFile = File(...),
):
    doc = (await db.execute(select(PortalDocument).where(PortalDocument.id == doc_id))).scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Document not found")
    if doc.checked_out_by_id and doc.checked_out_by_id != user.id and user.role != UserRole.ADMIN:
        raise HTTPException(400, "Document is checked out by another user")
    path = await save_upload(file, f"doc_v_{doc.category}")
    doc.current_version = int(doc.current_version or 1) + 1
    doc.file_path = path
    db.add(
        DocumentVersion(
            document_id=doc.id,
            version_no=doc.current_version,
            file_path=path,
            change_note=change_note,
            uploaded_by_id=user.id,
        )
    )
    await write_audit(db, actor_id=user.id, action="document_new_version", entity_type="document", entity_id=str(doc.id), detail=change_note)
    await db.commit()
    return _orm_dict(doc)


@router.get("/documents/{doc_id}/versions")
async def document_versions(
    doc_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(get_current_user)],
):
    rows = (
        await db.execute(
            select(DocumentVersion).where(DocumentVersion.document_id == doc_id).order_by(DocumentVersion.version_no.desc())
        )
    ).scalars().all()
    return [_orm_dict(r) for r in rows]


@router.post("/documents/{doc_id}/checkout")
async def checkout_document(
    doc_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT, UserRole.CONTRACTOR))],
):
    doc = (await db.execute(select(PortalDocument).where(PortalDocument.id == doc_id))).scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Document not found")
    if doc.checked_out_by_id and doc.checked_out_by_id != user.id:
        raise HTTPException(400, "Already checked out")
    doc.checked_out_by_id = user.id
    doc.checked_out_at = datetime.now(timezone.utc)
    await write_audit(db, actor_id=user.id, action="document_checkout", entity_type="document", entity_id=str(doc.id))
    await db.commit()
    return _orm_dict(doc)


@router.post("/documents/{doc_id}/checkin")
async def checkin_document(
    doc_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT, UserRole.CONTRACTOR))],
):
    doc = (await db.execute(select(PortalDocument).where(PortalDocument.id == doc_id))).scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Document not found")
    if doc.checked_out_by_id and doc.checked_out_by_id != user.id and user.role != UserRole.ADMIN:
        raise HTTPException(403, "Only checkout owner or admin can check in")
    doc.checked_out_by_id = None
    doc.checked_out_at = None
    await write_audit(db, actor_id=user.id, action="document_checkin", entity_type="document", entity_id=str(doc.id))
    await db.commit()
    return _orm_dict(doc)


@router.post("/documents/{doc_id}/request-approval")
async def request_approval(
    doc_id: int,
    body: IdNote,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.CONTRACTOR))],
):
    doc = (await db.execute(select(PortalDocument).where(PortalDocument.id == doc_id))).scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Document not found")
    doc.approval_status = "pending"
    db.add(
        DocumentApproval(
            document_id=doc.id,
            requested_by_id=user.id,
            status="pending",
            comment=body.note,
            signature_data=body.signature_data,
        )
    )
    await write_audit(db, actor_id=user.id, action="document_request_approval", entity_type="document", entity_id=str(doc.id))
    await db.commit()
    return _orm_dict(doc)


@router.post("/documents/{doc_id}/decide-approval")
async def decide_approval(
    doc_id: int,
    body: IdNote,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT))],
    approve: bool = True,
):
    doc = (await db.execute(select(PortalDocument).where(PortalDocument.id == doc_id))).scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Document not found")
    pending = (
        await db.execute(
            select(DocumentApproval)
            .where(DocumentApproval.document_id == doc_id, DocumentApproval.status == "pending")
            .order_by(DocumentApproval.id.desc())
        )
    ).scalars().first()
    if not pending:
        raise HTTPException(400, "No pending approval")
    pending.status = "approved" if approve else "rejected"
    pending.approver_id = user.id
    pending.comment = body.note
    pending.signature_data = body.signature_data or pending.signature_data
    pending.decided_at = datetime.now(timezone.utc)
    doc.approval_status = pending.status
    if body.signature_data:
        doc.signature_data = body.signature_data
    await write_audit(
        db,
        actor_id=user.id,
        action=f"document_{pending.status}",
        entity_type="document",
        entity_id=str(doc.id),
        detail=body.note,
    )
    await db.commit()
    return _orm_dict(doc)


@router.patch("/documents/{doc_id}/meta")
async def update_doc_meta(
    doc_id: int,
    body: DocMetaUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT))],
):
    doc = (await db.execute(select(PortalDocument).where(PortalDocument.id == doc_id))).scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Document not found")
    if body.watermark_text is not None:
        doc.watermark_text = body.watermark_text
    if body.classification is not None:
        doc.classification = body.classification
    if body.signature_data is not None:
        doc.signature_data = body.signature_data
    await write_audit(db, actor_id=user.id, action="document_meta_update", entity_type="document", entity_id=str(doc.id))
    await db.commit()
    return _orm_dict(doc)


@router.post("/documents/{doc_id}/log-download")
async def log_download(
    doc_id: int,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    await write_audit(
        db,
        actor_id=user.id,
        action="document_download",
        entity_type="document",
        entity_id=str(doc_id),
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return {"ok": True}


# ---- Security / MFA / audit ----
@router.get("/security/audit-logs")
async def audit_logs(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT))],
    limit: int = 100,
):
    rows = (await db.execute(select(AuditLog).order_by(AuditLog.id.desc()).limit(limit))).scalars().all()
    return [_orm_dict(r) for r in rows]


@router.get("/security/login-history")
async def login_history(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    limit: int = 50,
):
    stmt = select(LoginHistory).order_by(LoginHistory.id.desc()).limit(limit)
    if user.role != UserRole.ADMIN:
        stmt = stmt.where(LoginHistory.user_id == user.id)
    rows = (await db.execute(stmt)).scalars().all()
    return [_orm_dict(r) for r in rows]


@router.get("/security/me")
async def security_me(user: Annotated[User, Depends(get_current_user)]):
    return {
        "user_id": user.id,
        "email": user.email,
        "mfa_enabled": bool(user.mfa_enabled),
        "role": user.role.value,
        "encryption_policy": "TLS in transit; application secrets in env; AES recommended for at-rest DB",
        "sso_status": "configured_placeholder",
        "waf_status": "edge_placeholder",
    }


@router.post("/security/mfa")
async def setup_mfa(
    body: MfaSetup,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    user.mfa_enabled = body.enabled
    user.mfa_pin_hash = hash_password(body.pin) if body.enabled else None
    await write_audit(db, actor_id=user.id, action="mfa_setup", entity_type="user", entity_id=str(user.id))
    await db.commit()
    return {"mfa_enabled": user.mfa_enabled}


# ---- Attendance ----
@router.get("/personnel")
async def list_personnel(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT, UserRole.CONTRACTOR))],
):
    return [_orm_dict(r) for r in (await db.execute(select(Personnel).order_by(Personnel.id.desc()))).scalars().all()]


@router.post("/personnel", status_code=201)
async def create_personnel(
    body: PersonnelIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
):
    row = Personnel(**body.model_dump())
    db.add(row)
    await write_audit(db, actor_id=user.id, action="personnel_create", entity_type="personnel", entity_id=body.employee_code)
    await db.commit()
    await db.refresh(row)
    return _orm_dict(row)


@router.get("/attendance")
async def list_attendance(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT, UserRole.CONTRACTOR))],
):
    return [_orm_dict(r) for r in (await db.execute(select(AttendanceRecord).order_by(AttendanceRecord.id.desc()).limit(200))).scalars().all()]


@router.post("/attendance", status_code=201)
async def mark_attendance(
    body: AttendanceIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.CONTRACTOR))],
):
    row = AttendanceRecord(**body.model_dump())
    db.add(row)
    await write_audit(db, actor_id=user.id, action="attendance_mark", entity_type="attendance", entity_id=str(body.personnel_id))
    await db.commit()
    await db.refresh(row)
    return _orm_dict(row)


@router.get("/leaves")
async def list_leaves(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT, UserRole.CONTRACTOR))],
):
    return [_orm_dict(r) for r in (await db.execute(select(LeaveRequest).order_by(LeaveRequest.id.desc()))).scalars().all()]


@router.post("/leaves", status_code=201)
async def create_leave(
    body: LeaveIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.CONTRACTOR))],
):
    row = LeaveRequest(**body.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _orm_dict(row)


@router.post("/leaves/{leave_id}/decide")
async def decide_leave(
    leave_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    approve: bool = True,
):
    row = (await db.execute(select(LeaveRequest).where(LeaveRequest.id == leave_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Leave not found")
    row.status = "approved" if approve else "rejected"
    await write_audit(db, actor_id=user.id, action=f"leave_{row.status}", entity_type="leave", entity_id=str(leave_id))
    await db.commit()
    return _orm_dict(row)


@router.get("/rosters")
async def list_rosters(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT, UserRole.CONTRACTOR))],
):
    return [_orm_dict(r) for r in (await db.execute(select(DutyRoster).order_by(DutyRoster.id.desc()))).scalars().all()]


@router.post("/rosters", status_code=201)
async def create_roster(
    body: RosterIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
):
    row = DutyRoster(**body.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _orm_dict(row)


@router.get("/attendance/summary")
async def attendance_summary(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT))],
):
    total = (await db.execute(select(func.count(Personnel.id)).where(Personnel.is_active.is_(True)))).scalar_one()
    present = (
        await db.execute(
            select(func.count(AttendanceRecord.id)).where(
                AttendanceRecord.work_date == date.today(), AttendanceRecord.status == "present"
            )
        )
    ).scalar_one()
    pending_leave = (
        await db.execute(select(func.count(LeaveRequest.id)).where(LeaveRequest.status == "pending"))
    ).scalar_one()
    return {"active_personnel": total, "present_today": present, "pending_leaves": pending_leave}


# ---- Toll ----
@router.get("/toll/plazas")
async def list_plazas(db: Annotated[AsyncSession, Depends(get_db)], _: Annotated[User, Depends(get_current_user)]):
    return [_orm_dict(r) for r in (await db.execute(select(TollPlaza).order_by(TollPlaza.id.desc()))).scalars().all()]


@router.post("/toll/plazas", status_code=201)
async def create_plaza(
    body: TollPlazaIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
):
    row = TollPlaza(**body.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _orm_dict(row)


@router.get("/toll/stats")
async def list_toll_stats(db: Annotated[AsyncSession, Depends(get_db)], _: Annotated[User, Depends(get_current_user)]):
    return [_orm_dict(r) for r in (await db.execute(select(TollDailyStat).order_by(TollDailyStat.id.desc()).limit(200))).scalars().all()]


@router.post("/toll/stats", status_code=201)
async def create_toll_stat(
    body: TollStatIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT))],
):
    data = body.model_dump()
    data["revenue"] = Decimal(str(data["revenue"]))
    row = TollDailyStat(**data)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _orm_dict(row)


@router.get("/toll/dashboard")
async def toll_dashboard(db: Annotated[AsyncSession, Depends(get_db)], _: Annotated[User, Depends(get_current_user)]):
    plazas = (await db.execute(select(func.count(TollPlaza.id)))).scalar_one()
    traffic = (await db.execute(select(func.coalesce(func.sum(TollDailyStat.total_traffic), 0)))).scalar_one()
    revenue = (await db.execute(select(func.coalesce(func.sum(TollDailyStat.revenue), 0)))).scalar_one()
    avg_fastag = (await db.execute(select(func.coalesce(func.avg(TollDailyStat.fastag_pct), 0)))).scalar_one()
    return {
        "plazas": plazas,
        "total_traffic": int(traffic or 0),
        "total_revenue": float(revenue or 0),
        "avg_fastag_pct": float(avg_fastag or 0),
    }


# ---- Incidents / route ops ----
@router.get("/incidents")
async def list_incidents(db: Annotated[AsyncSession, Depends(get_db)], _: Annotated[User, Depends(get_current_user)]):
    return [_orm_dict(r) for r in (await db.execute(select(HighwayIncident).order_by(HighwayIncident.id.desc()))).scalars().all()]


@router.post("/incidents", status_code=201)
async def create_incident(
    body: IncidentIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT, UserRole.CONTRACTOR))],
):
    count = (await db.execute(select(func.count(HighwayIncident.id)))).scalar_one() + 1
    row = HighwayIncident(
        **body.model_dump(),
        incident_code=f"INC-{date.today().strftime('%Y%m%d')}-{count:04d}",
        created_by_id=user.id,
        detected_at=datetime.now(timezone.utc),
    )
    db.add(row)
    await write_audit(db, actor_id=user.id, action="incident_create", entity_type="incident", entity_id=row.incident_code)
    await db.commit()
    await db.refresh(row)
    return _orm_dict(row)


@router.post("/incidents/{incident_id}/respond")
async def respond_incident(
    incident_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT))],
    vehicle: str | None = None,
):
    row = (await db.execute(select(HighwayIncident).where(HighwayIncident.id == incident_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Incident not found")
    row.response_at = datetime.now(timezone.utc)
    if vehicle:
        row.response_vehicle = vehicle
    await db.commit()
    return _orm_dict(row)


@router.post("/incidents/{incident_id}/clear")
async def clear_incident(
    incident_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT))],
):
    row = (await db.execute(select(HighwayIncident).where(HighwayIncident.id == incident_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Incident not found")
    row.status = "cleared"
    row.cleared_at = datetime.now(timezone.utc)
    await db.commit()
    return _orm_dict(row)


@router.get("/vehicles")
async def list_vehicles(db: Annotated[AsyncSession, Depends(get_db)], _: Annotated[User, Depends(get_current_user)]):
    return [_orm_dict(r) for r in (await db.execute(select(ResponseVehicle).order_by(ResponseVehicle.id.desc()))).scalars().all()]


@router.post("/vehicles", status_code=201)
async def create_vehicle(
    body: VehicleIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
):
    row = ResponseVehicle(**body.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _orm_dict(row)


@router.get("/incidents/kpis")
async def incident_kpis(db: Annotated[AsyncSession, Depends(get_db)], _: Annotated[User, Depends(get_current_user)]):
    active = (await db.execute(select(func.count(HighwayIncident.id)).where(HighwayIncident.status == "active"))).scalar_one()
    cleared = (await db.execute(select(func.count(HighwayIncident.id)).where(HighwayIncident.status == "cleared"))).scalar_one()
    vehicles = (await db.execute(select(func.count(ResponseVehicle.id)))).scalar_one()
    return {"active": active, "cleared": cleared, "response_vehicles": vehicles}


# ---- ITS / ATMS / TMS / MLFF ----
@router.get("/its")
async def list_its(db: Annotated[AsyncSession, Depends(get_db)], _: Annotated[User, Depends(get_current_user)]):
    return [_orm_dict(r) for r in (await db.execute(select(ItsDevice).order_by(ItsDevice.id.desc()))).scalars().all()]


@router.post("/its", status_code=201)
async def create_its(
    body: ItsIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
):
    row = ItsDevice(**body.model_dump(), last_heartbeat=datetime.now(timezone.utc))
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _orm_dict(row)


@router.patch("/its/{device_id}/heartbeat")
async def its_heartbeat(
    device_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    status_value: str = "online",
    health_pct: float = 100,
):
    row = (await db.execute(select(ItsDevice).where(ItsDevice.id == device_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Device not found")
    row.status = status_value
    row.health_pct = health_pct
    row.last_heartbeat = datetime.now(timezone.utc)
    await db.commit()
    return _orm_dict(row)


# ---- Civil assets ----
@router.get("/assets")
async def list_assets(db: Annotated[AsyncSession, Depends(get_db)], _: Annotated[User, Depends(get_current_user)]):
    return [_orm_dict(r) for r in (await db.execute(select(CivilAsset).order_by(CivilAsset.id.desc()))).scalars().all()]


@router.post("/assets", status_code=201)
async def create_asset(
    body: AssetIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.CONTRACTOR))],
):
    row = CivilAsset(**body.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _orm_dict(row)


# ---- Integrations ----
@router.get("/integrations")
async def list_integrations(db: Annotated[AsyncSession, Depends(get_db)], _: Annotated[User, Depends(get_current_user)]):
    return [_orm_dict(r) for r in (await db.execute(select(IntegrationLink).order_by(IntegrationLink.id.desc()))).scalars().all()]


@router.post("/integrations", status_code=201)
async def create_integration(
    body: IntegrationIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
):
    row = IntegrationLink(**body.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _orm_dict(row)


@router.post("/integrations/{link_id}/sync")
async def sync_integration(
    link_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
):
    row = (await db.execute(select(IntegrationLink).where(IntegrationLink.id == link_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Integration not found")
    row.last_sync_at = datetime.now(timezone.utc)
    row.status = "connected"
    await write_audit(db, actor_id=user.id, action="integration_sync", entity_type="integration", entity_id=str(link_id))
    await db.commit()
    return _orm_dict(row)


# ---- Backup / DR / BCP ----
@router.get("/backup/jobs")
async def list_backups(db: Annotated[AsyncSession, Depends(get_db)], _: Annotated[User, Depends(require_roles(UserRole.ADMIN))]):
    return [_orm_dict(r) for r in (await db.execute(select(BackupJob).order_by(BackupJob.id.desc()))).scalars().all()]


@router.post("/backup/jobs", status_code=201)
async def create_backup(
    body: BackupIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
):
    row = BackupJob(**body.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _orm_dict(row)


@router.post("/backup/jobs/{job_id}/run")
async def run_backup(
    job_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
):
    row = (await db.execute(select(BackupJob).where(BackupJob.id == job_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Backup job not found")
    row.last_run_at = datetime.now(timezone.utc)
    row.last_status = "success"
    await write_audit(db, actor_id=user.id, action="backup_run", entity_type="backup", entity_id=str(job_id))
    await db.commit()
    return _orm_dict(row)


@router.get("/bcp")
async def list_bcp(db: Annotated[AsyncSession, Depends(get_db)], _: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT))]):
    return [_orm_dict(r) for r in (await db.execute(select(BcpItem).order_by(BcpItem.id.desc()))).scalars().all()]


@router.post("/bcp", status_code=201)
async def create_bcp(
    body: BcpIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
):
    row = BcpItem(**body.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _orm_dict(row)


# ---- Executive summary ----
@router.get("/executive")
async def list_executive(db: Annotated[AsyncSession, Depends(get_db)], _: Annotated[User, Depends(get_current_user)]):
    return [_orm_dict(r) for r in (await db.execute(select(ExecutiveSnapshot).order_by(ExecutiveSnapshot.id.desc()))).scalars().all()]


@router.post("/executive", status_code=201)
async def create_executive(
    body: ExecutiveIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT))],
):
    data = body.model_dump()
    data["planned_expenditure"] = Decimal(str(data["planned_expenditure"]))
    data["actual_expenditure"] = Decimal(str(data["actual_expenditure"]))
    row = ExecutiveSnapshot(**data)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _orm_dict(row)


@router.get("/executive/overview")
async def executive_overview(db: Annotated[AsyncSession, Depends(get_db)], _: Annotated[User, Depends(get_current_user)]):
    snaps = (await db.execute(select(ExecutiveSnapshot))).scalars().all()
    active_inc = (await db.execute(select(func.count(HighwayIncident.id)).where(HighwayIncident.status == "active"))).scalar_one()
    its_offline = (await db.execute(select(func.count(ItsDevice.id)).where(ItsDevice.status != "online"))).scalar_one()
    return {
        "stretches": len(snaps),
        "avg_physical_progress": (sum(float(s.physical_progress_pct or 0) for s in snaps) / len(snaps)) if snaps else 0,
        "planned_expenditure": sum(float(s.planned_expenditure or 0) for s in snaps),
        "actual_expenditure": sum(float(s.actual_expenditure or 0) for s in snaps),
        "active_incidents": active_inc,
        "its_not_online": its_offline,
        "toll": {
            "plazas": (await db.execute(select(func.count(TollPlaza.id)))).scalar_one(),
            "total_traffic": int((await db.execute(select(func.coalesce(func.sum(TollDailyStat.total_traffic), 0)))).scalar_one() or 0),
            "total_revenue": float((await db.execute(select(func.coalesce(func.sum(TollDailyStat.revenue), 0)))).scalar_one() or 0),
        },
    }


# ---- Seed demo data ----
@router.post("/seed-demo")
async def seed_demo(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
):
    project = (await db.execute(select(Project).order_by(Project.id).limit(1))).scalar_one_or_none()
    pid = project.id if project else None

    if not (await db.execute(select(func.count(TollPlaza.id)))).scalar_one():
        p1 = TollPlaza(name="Plaza A - North", project_id=pid, chainage="45+000", lanes=6, has_etc=True, has_wim=True, tariff_notes="Car ₹65 / LCV ₹105")
        p2 = TollPlaza(name="Plaza B - South", project_id=pid, chainage="112+200", lanes=4, has_etc=True, tariff_notes="Car ₹55")
        db.add_all([p1, p2])
        await db.flush()
        db.add_all(
            [
                TollDailyStat(plaza_id=p1.id, stat_date=date.today(), total_traffic=18240, fastag_pct=91.2, cash_pct=8.8, revenue=Decimal("1450000"), avg_lane_availability=97.5, peak_hour_traffic=2100, avg_waiting_min=1.8),
                TollDailyStat(plaza_id=p2.id, stat_date=date.today(), total_traffic=12400, fastag_pct=88.0, cash_pct=12.0, revenue=Decimal("980000"), avg_lane_availability=95.0, peak_hour_traffic=1500, avg_waiting_min=2.4),
            ]
        )

    if not (await db.execute(select(func.count(Personnel.id)))).scalar_one():
        pe = Personnel(employee_code="EMP-001", full_name="Ravi Kumar", designation="Site Engineer", discipline="Civil", employer="Contractor", deployment_location="Package-1", project_id=pid, joining_date=date(2024, 4, 1))
        db.add(pe)
        await db.flush()
        db.add(AttendanceRecord(personnel_id=pe.id, work_date=date.today(), status="present", in_time="09:05", out_time="18:10", working_hours=8.5, latitude=23.02, longitude=72.57, biometric_verified=True, shift_name="General"))
        db.add(DutyRoster(personnel_id=pe.id, work_date=date.today(), shift_name="General", location="Package-1"))

    if not (await db.execute(select(func.count(HighwayIncident.id)))).scalar_one():
        db.add(
            HighwayIncident(
                incident_code=f"INC-{date.today().strftime('%Y%m%d')}-0001",
                category="breakdown",
                severity="medium",
                status="active",
                description="Heavy vehicle breakdown on LHS",
                chainage="67+350",
                latitude=23.05,
                longitude=72.60,
                source_1033=True,
                project_id=pid,
                created_by_id=user.id,
                detected_at=datetime.now(timezone.utc),
            )
        )
        db.add(ResponseVehicle(vehicle_code="RV-01", vehicle_type="patrol", status="available", base_location="Km 60", project_id=pid))

    if not (await db.execute(select(func.count(ItsDevice.id)))).scalar_one():
        db.add_all(
            [
                ItsDevice(system_type="atms", name="ATMS Node km 50", location="Km 50", status="online", health_pct=98, project_id=pid, last_heartbeat=datetime.now(timezone.utc)),
                ItsDevice(system_type="tms", name="TMS Plaza A", location="Plaza A", status="online", health_pct=96, project_id=pid, last_heartbeat=datetime.now(timezone.utc)),
                ItsDevice(system_type="mlff", name="MLFF Gantries Set-1", location="Km 80", status="degraded", health_pct=72, project_id=pid, last_heartbeat=datetime.now(timezone.utc)),
            ]
        )

    if not (await db.execute(select(func.count(CivilAsset.id)))).scalar_one():
        db.add_all(
            [
                CivilAsset(asset_code="BR-001", asset_type="bridge", name="Major Bridge km 55", chainage_from="55+000", chainage_to="55+120", condition="good", latitude=23.04, longitude=72.58, project_id=pid, last_inspection=date.today()),
                CivilAsset(asset_code="PV-010", asset_type="pavement", name="Flexible pavement stretch", chainage_from="40+000", chainage_to="50+000", condition="fair", project_id=pid),
            ]
        )

    if not (await db.execute(select(func.count(IntegrationLink.id)))).scalar_one():
        for name, code in [
            ("NHAI Central Command Centre", "nhai_ccc"),
            ("ERP", "erp"),
            ("e-Office", "eoffice"),
            ("Data Lake", "datalake"),
            ("Rajmarg Yatra", "rajmarg"),
            ("Emergency 1033", "1033"),
            ("IHMCL Regional ATMS/TMS", "ihmcl"),
        ]:
            db.add(IntegrationLink(name=name, system_code=code, status="configured", notes="Interface ready for credentials"))

    if not (await db.execute(select(func.count(BackupJob.id)))).scalar_one():
        db.add_all(
            [
                BackupJob(job_name="Daily DB incremental", backup_type="incremental", schedule="daily 02:00", location="onsite+offsite", last_status="scheduled"),
                BackupJob(job_name="Weekly full backup", backup_type="full", schedule="Sunday 01:00", location="geo-redundant", last_status="scheduled"),
            ]
        )
        db.add_all(
            [
                BcpItem(title="DR failover drill", category="dr", owner="IT Admin", status="pending"),
                BcpItem(title="Business Continuity Plan review", category="bcp", owner="PMO", status="in_progress"),
            ]
        )

    if not (await db.execute(select(func.count(ExecutiveSnapshot.id)))).scalar_one():
        db.add(
            ExecutiveSnapshot(
                stretch_name=project.name if project else "NHIT Sample Stretch",
                project_id=pid,
                key_features="6-lane, ETC plazas, ATMS coverage",
                total_length_km=120.5,
                physical_progress_pct=68.4,
                planned_expenditure=Decimal("4500000000"),
                actual_expenditure=Decimal("3120000000"),
                toll_plazas_count=2,
                avg_lane_availability=96.2,
                notes="Executive snapshot seeded for demo",
            )
        )

    await write_audit(db, actor_id=user.id, action="seed_demo", entity_type="nhit", entity_id="all")
    await db.commit()
    return {"ok": True, "message": "Demo NHIT portal data ready"}
