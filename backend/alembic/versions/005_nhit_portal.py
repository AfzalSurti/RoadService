"""NHIT portal mega-module tables + document/security columns.

Revision ID: 005_nhit_portal
Revises: 004_billing_portal
Create Date: 2026-08-09
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005_nhit_portal"
down_revision: Union[str, None] = "004_billing_portal"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("mfa_enabled", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column("users", sa.Column("mfa_pin_hash", sa.String(255), nullable=True))

    op.add_column("portal_documents", sa.Column("current_version", sa.Integer(), server_default="1", nullable=False))
    op.add_column(
        "portal_documents",
        sa.Column("approval_status", sa.String(32), server_default="draft", nullable=False),
    )
    op.add_column(
        "portal_documents",
        sa.Column("classification", sa.String(32), server_default="internal", nullable=False),
    )
    op.add_column("portal_documents", sa.Column("watermark_text", sa.String(255), nullable=True))
    op.add_column("portal_documents", sa.Column("signature_data", sa.Text(), nullable=True))
    op.add_column("portal_documents", sa.Column("checked_out_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True))
    op.add_column("portal_documents", sa.Column("checked_out_at", sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("actor_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("action", sa.String(128), nullable=False),
        sa.Column("entity_type", sa.String(64), nullable=False),
        sa.Column("entity_id", sa.String(64), nullable=True),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column("ip_address", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "login_history",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("success", sa.Boolean(), server_default=sa.true()),
        sa.Column("ip_address", sa.String(64), nullable=True),
        sa.Column("user_agent", sa.String(255), nullable=True),
        sa.Column("mfa_used", sa.Boolean(), server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_login_history_user_id", "login_history", ["user_id"])

    op.create_table(
        "document_versions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("document_id", sa.Integer(), sa.ForeignKey("portal_documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_no", sa.Integer(), nullable=False),
        sa.Column("file_path", sa.String(512), nullable=False),
        sa.Column("change_note", sa.Text(), nullable=True),
        sa.Column("uploaded_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_document_versions_document_id", "document_versions", ["document_id"])

    op.create_table(
        "document_approvals",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("document_id", sa.Integer(), sa.ForeignKey("portal_documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("requested_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("approver_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("status", sa.String(32), server_default="pending"),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("signature_data", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_document_approvals_document_id", "document_approvals", ["document_id"])

    op.create_table(
        "personnel",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="SET NULL"), nullable=True),
        sa.Column("employee_code", sa.String(64), nullable=False, unique=True),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("designation", sa.String(128), nullable=False),
        sa.Column("discipline", sa.String(128), nullable=True),
        sa.Column("employer", sa.String(255), nullable=True),
        sa.Column("deployment_location", sa.String(255), nullable=True),
        sa.Column("phone", sa.String(32), nullable=True),
        sa.Column("photo_path", sa.String(512), nullable=True),
        sa.Column("joining_date", sa.Date(), nullable=True),
        sa.Column("id_valid_till", sa.Date(), nullable=True),
        sa.Column("certifications", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_personnel_employee_code", "personnel", ["employee_code"])

    op.create_table(
        "attendance_records",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("personnel_id", sa.Integer(), sa.ForeignKey("personnel.id", ondelete="CASCADE"), nullable=False),
        sa.Column("work_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(32), server_default="present"),
        sa.Column("in_time", sa.String(16), nullable=True),
        sa.Column("out_time", sa.String(16), nullable=True),
        sa.Column("working_hours", sa.Float(), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("biometric_verified", sa.Boolean(), server_default=sa.false()),
        sa.Column("shift_name", sa.String(64), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_attendance_records_personnel_id", "attendance_records", ["personnel_id"])
    op.create_index("ix_attendance_records_work_date", "attendance_records", ["work_date"])

    op.create_table(
        "leave_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("personnel_id", sa.Integer(), sa.ForeignKey("personnel.id", ondelete="CASCADE"), nullable=False),
        sa.Column("from_date", sa.Date(), nullable=False),
        sa.Column("to_date", sa.Date(), nullable=False),
        sa.Column("leave_type", sa.String(64), server_default="casual"),
        sa.Column("status", sa.String(32), server_default="pending"),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_leave_requests_personnel_id", "leave_requests", ["personnel_id"])

    op.create_table(
        "duty_rosters",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("personnel_id", sa.Integer(), sa.ForeignKey("personnel.id", ondelete="CASCADE"), nullable=False),
        sa.Column("work_date", sa.Date(), nullable=False),
        sa.Column("shift_name", sa.String(64), nullable=False),
        sa.Column("location", sa.String(255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
    )
    op.create_index("ix_duty_rosters_personnel_id", "duty_rosters", ["personnel_id"])

    op.create_table(
        "toll_plazas",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("chainage", sa.String(64), nullable=True),
        sa.Column("lanes", sa.Integer(), server_default="4"),
        sa.Column("has_etc", sa.Boolean(), server_default=sa.true()),
        sa.Column("has_wim", sa.Boolean(), server_default=sa.false()),
        sa.Column("tariff_notes", sa.Text(), nullable=True),
        sa.Column("revision_date", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "toll_daily_stats",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("plaza_id", sa.Integer(), sa.ForeignKey("toll_plazas.id", ondelete="CASCADE"), nullable=False),
        sa.Column("stat_date", sa.Date(), nullable=False),
        sa.Column("total_traffic", sa.Integer(), server_default="0"),
        sa.Column("fastag_pct", sa.Float(), server_default="0"),
        sa.Column("cash_pct", sa.Float(), server_default="0"),
        sa.Column("revenue", sa.Numeric(18, 2), server_default="0"),
        sa.Column("avg_lane_availability", sa.Float(), server_default="100"),
        sa.Column("peak_hour_traffic", sa.Integer(), server_default="0"),
        sa.Column("avg_waiting_min", sa.Float(), server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
    )
    op.create_index("ix_toll_daily_stats_plaza_id", "toll_daily_stats", ["plaza_id"])
    op.create_index("ix_toll_daily_stats_stat_date", "toll_daily_stats", ["stat_date"])

    op.create_table(
        "highway_incidents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="SET NULL"), nullable=True),
        sa.Column("incident_code", sa.String(64), nullable=False, unique=True),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("severity", sa.String(32), server_default="medium"),
        sa.Column("status", sa.String(32), server_default="active"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("chainage", sa.String(64), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("reported_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("detected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("response_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cleared_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("response_vehicle", sa.String(128), nullable=True),
        sa.Column("source_1033", sa.Boolean(), server_default=sa.false()),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
    )
    op.create_index("ix_highway_incidents_incident_code", "highway_incidents", ["incident_code"])

    op.create_table(
        "response_vehicles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="SET NULL"), nullable=True),
        sa.Column("vehicle_code", sa.String(64), nullable=False, unique=True),
        sa.Column("vehicle_type", sa.String(64), server_default="patrol"),
        sa.Column("status", sa.String(32), server_default="available"),
        sa.Column("base_location", sa.String(255), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
    )

    op.create_table(
        "its_devices",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="SET NULL"), nullable=True),
        sa.Column("system_type", sa.String(32), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("location", sa.String(255), nullable=True),
        sa.Column("status", sa.String(32), server_default="online"),
        sa.Column("health_pct", sa.Float(), server_default="100"),
        sa.Column("last_heartbeat", sa.DateTime(timezone=True), nullable=True),
        sa.Column("firmware_version", sa.String(64), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
    )

    op.create_table(
        "civil_assets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="SET NULL"), nullable=True),
        sa.Column("asset_code", sa.String(64), nullable=False, unique=True),
        sa.Column("asset_type", sa.String(64), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("chainage_from", sa.String(64), nullable=True),
        sa.Column("chainage_to", sa.String(64), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("condition", sa.String(32), server_default="good"),
        sa.Column("last_inspection", sa.Date(), nullable=True),
        sa.Column("next_maintenance", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
    )
    op.create_index("ix_civil_assets_asset_code", "civil_assets", ["asset_code"])

    op.create_table(
        "integration_links",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("system_code", sa.String(64), nullable=False),
        sa.Column("endpoint_url", sa.String(512), nullable=True),
        sa.Column("status", sa.String(32), server_default="configured"),
        sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "backup_jobs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("job_name", sa.String(255), nullable=False),
        sa.Column("backup_type", sa.String(32), server_default="incremental"),
        sa.Column("schedule", sa.String(128), server_default="daily"),
        sa.Column("location", sa.String(255), server_default="onsite"),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_status", sa.String(32), server_default="scheduled"),
        sa.Column("notes", sa.Text(), nullable=True),
    )

    op.create_table(
        "bcp_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("category", sa.String(64), server_default="dr"),
        sa.Column("owner", sa.String(128), nullable=True),
        sa.Column("status", sa.String(32), server_default="pending"),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
    )

    op.create_table(
        "executive_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="SET NULL"), nullable=True),
        sa.Column("stretch_name", sa.String(255), nullable=False),
        sa.Column("key_features", sa.Text(), nullable=True),
        sa.Column("total_length_km", sa.Float(), nullable=True),
        sa.Column("physical_progress_pct", sa.Float(), server_default="0"),
        sa.Column("planned_expenditure", sa.Numeric(18, 2), server_default="0"),
        sa.Column("actual_expenditure", sa.Numeric(18, 2), server_default="0"),
        sa.Column("toll_plazas_count", sa.Integer(), server_default="0"),
        sa.Column("avg_lane_availability", sa.Float(), server_default="100"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    for t in [
        "executive_snapshots",
        "bcp_items",
        "backup_jobs",
        "integration_links",
        "civil_assets",
        "its_devices",
        "response_vehicles",
        "highway_incidents",
        "toll_daily_stats",
        "toll_plazas",
        "duty_rosters",
        "leave_requests",
        "attendance_records",
        "personnel",
        "document_approvals",
        "document_versions",
        "login_history",
        "audit_logs",
    ]:
        op.drop_table(t)
    op.drop_column("portal_documents", "checked_out_at")
    op.drop_column("portal_documents", "checked_out_by_id")
    op.drop_column("portal_documents", "signature_data")
    op.drop_column("portal_documents", "watermark_text")
    op.drop_column("portal_documents", "classification")
    op.drop_column("portal_documents", "approval_status")
    op.drop_column("portal_documents", "current_version")
    op.drop_column("users", "mfa_pin_hash")
    op.drop_column("users", "mfa_enabled")
