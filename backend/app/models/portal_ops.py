"""NHIT / NHAI portal operations models (documents workflow, attendance, toll, incidents, ITS, assets, etc.)."""

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(128), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class LoginHistory(Base):
    __tablename__ = "login_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    success: Mapped[bool] = mapped_column(Boolean, default=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)
    mfa_used: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DocumentVersion(Base):
    __tablename__ = "document_versions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("portal_documents.id", ondelete="CASCADE"), index=True)
    version_no: Mapped[int] = mapped_column(Integer, nullable=False)
    file_path: Mapped[str] = mapped_column(String(512), nullable=False)
    change_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    uploaded_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DocumentApproval(Base):
    __tablename__ = "document_approvals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("portal_documents.id", ondelete="CASCADE"), index=True)
    requested_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    approver_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="pending")  # pending|approved|rejected
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    signature_data: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Personnel(Base):
    __tablename__ = "personnel"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    employee_code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    designation: Mapped[str] = mapped_column(String(128), nullable=False)
    discipline: Mapped[str | None] = mapped_column(String(128), nullable=True)
    employer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    deployment_location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    photo_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    joining_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    id_valid_till: Mapped[date | None] = mapped_column(Date, nullable=True)
    certifications: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    personnel_id: Mapped[int] = mapped_column(ForeignKey("personnel.id", ondelete="CASCADE"), index=True)
    work_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), default="present")  # present|absent|leave|on_tour
    in_time: Mapped[str | None] = mapped_column(String(16), nullable=True)
    out_time: Mapped[str | None] = mapped_column(String(16), nullable=True)
    working_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    biometric_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    shift_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class LeaveRequest(Base):
    __tablename__ = "leave_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    personnel_id: Mapped[int] = mapped_column(ForeignKey("personnel.id", ondelete="CASCADE"), index=True)
    from_date: Mapped[date] = mapped_column(Date, nullable=False)
    to_date: Mapped[date] = mapped_column(Date, nullable=False)
    leave_type: Mapped[str] = mapped_column(String(64), default="casual")
    status: Mapped[str] = mapped_column(String(32), default="pending")  # pending|approved|rejected
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DutyRoster(Base):
    __tablename__ = "duty_rosters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    personnel_id: Mapped[int] = mapped_column(ForeignKey("personnel.id", ondelete="CASCADE"), index=True)
    work_date: Mapped[date] = mapped_column(Date, nullable=False)
    shift_name: Mapped[str] = mapped_column(String(64), nullable=False)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class TollPlaza(Base):
    __tablename__ = "toll_plazas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    chainage: Mapped[str | None] = mapped_column(String(64), nullable=True)
    lanes: Mapped[int] = mapped_column(Integer, default=4)
    has_etc: Mapped[bool] = mapped_column(Boolean, default=True)
    has_wim: Mapped[bool] = mapped_column(Boolean, default=False)
    tariff_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    revision_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TollDailyStat(Base):
    __tablename__ = "toll_daily_stats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    plaza_id: Mapped[int] = mapped_column(ForeignKey("toll_plazas.id", ondelete="CASCADE"), index=True)
    stat_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    total_traffic: Mapped[int] = mapped_column(Integer, default=0)
    fastag_pct: Mapped[float] = mapped_column(Float, default=0)
    cash_pct: Mapped[float] = mapped_column(Float, default=0)
    revenue: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0)
    avg_lane_availability: Mapped[float] = mapped_column(Float, default=100)
    peak_hour_traffic: Mapped[int] = mapped_column(Integer, default=0)
    avg_waiting_min: Mapped[float] = mapped_column(Float, default=0)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class HighwayIncident(Base):
    __tablename__ = "highway_incidents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    incident_code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    category: Mapped[str] = mapped_column(String(64), nullable=False)  # accident|breakdown|fire|medical|security|other
    severity: Mapped[str] = mapped_column(String(32), default="medium")
    status: Mapped[str] = mapped_column(String(32), default="active")  # active|cleared|closed
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    chainage: Mapped[str | None] = mapped_column(String(64), nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    reported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    detected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    response_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cleared_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    response_vehicle: Mapped[str | None] = mapped_column(String(128), nullable=True)
    source_1033: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class ResponseVehicle(Base):
    __tablename__ = "response_vehicles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    vehicle_code: Mapped[str] = mapped_column(String(64), unique=True)
    vehicle_type: Mapped[str] = mapped_column(String(64), default="patrol")
    status: Mapped[str] = mapped_column(String(32), default="available")  # available|on_mission|offline
    base_location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)


class ItsDevice(Base):
    __tablename__ = "its_devices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    system_type: Mapped[str] = mapped_column(String(32), nullable=False)  # atms|tms|mlff|other
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="online")  # online|degraded|offline
    health_pct: Mapped[float] = mapped_column(Float, default=100)
    last_heartbeat: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    firmware_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class CivilAsset(Base):
    __tablename__ = "civil_assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    asset_code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    asset_type: Mapped[str] = mapped_column(String(64), nullable=False)  # pavement|bridge|culvert|furniture|signage|drainage
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    chainage_from: Mapped[str | None] = mapped_column(String(64), nullable=True)
    chainage_to: Mapped[str | None] = mapped_column(String(64), nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    condition: Mapped[str] = mapped_column(String(32), default="good")  # good|fair|poor|critical
    last_inspection: Mapped[date | None] = mapped_column(Date, nullable=True)
    next_maintenance: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class IntegrationLink(Base):
    __tablename__ = "integration_links"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    system_code: Mapped[str] = mapped_column(String(64), nullable=False)  # nhai_ccc|erp|eoffice|datalake|rajmarg|1033|ihmcl
    endpoint_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="configured")  # configured|connected|degraded|offline
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class BackupJob(Base):
    __tablename__ = "backup_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_name: Mapped[str] = mapped_column(String(255), nullable=False)
    backup_type: Mapped[str] = mapped_column(String(32), default="incremental")  # incremental|full
    schedule: Mapped[str] = mapped_column(String(128), default="daily")
    location: Mapped[str] = mapped_column(String(255), default="onsite")
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_status: Mapped[str] = mapped_column(String(32), default="scheduled")  # scheduled|success|failed|tested
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class BcpItem(Base):
    __tablename__ = "bcp_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(64), default="dr")  # backup|dr|bcp|availability
    owner: Mapped[str | None] = mapped_column(String(128), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="pending")  # pending|in_progress|done
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class ExecutiveSnapshot(Base):
    __tablename__ = "executive_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    stretch_name: Mapped[str] = mapped_column(String(255), nullable=False)
    key_features: Mapped[str | None] = mapped_column(Text, nullable=True)
    total_length_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    physical_progress_pct: Mapped[float] = mapped_column(Float, default=0)
    planned_expenditure: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0)
    actual_expenditure: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0)
    toll_plazas_count: Mapped[int] = mapped_column(Integer, default=0)
    avg_lane_availability: Mapped[float] = mapped_column(Float, default=100)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class MonthlyProgressReport(Base):
    """Package-wise Monthly Progress Report linked to vendor/agency."""

    __tablename__ = "monthly_progress_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    vendor_id: Mapped[int | None] = mapped_column(ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True)
    folder_id: Mapped[int | None] = mapped_column(ForeignKey("document_folders.id", ondelete="SET NULL"), nullable=True)
    package_name: Mapped[str] = mapped_column(String(255), nullable=False)
    report_month: Mapped[date] = mapped_column(Date, nullable=False)
    physical_progress: Mapped[str | None] = mapped_column(Text, nullable=True)
    financial_progress: Mapped[str | None] = mapped_column(Text, nullable=True)
    rating_performance: Mapped[str | None] = mapped_column(Text, nullable=True)
    timely_execution: Mapped[str | None] = mapped_column(Text, nullable=True)
    pending_activity: Mapped[str | None] = mapped_column(Text, nullable=True)
    critical_observation: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    pdf_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    submitted_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class OrgStaffDetail(Base):
    """Key / sub-key professionals under GMC, NHIPMPL, or Contractor organisations."""

    __tablename__ = "org_staff_details"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization: Mapped[str] = mapped_column(String(32), nullable=False, index=True)  # gmc|nhimpl|contractor
    project_name: Mapped[str] = mapped_column(String(255), nullable=False)
    position: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    date_of_joining: Mapped[date] = mapped_column(Date, nullable=False)
    mobile_no: Mapped[str] = mapped_column(String(32), nullable=False)
    alternate_mobile_no: Mapped[str | None] = mapped_column(String(32), nullable=True)
    email_id: Mapped[str] = mapped_column(String(255), nullable=False)
    owner_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
