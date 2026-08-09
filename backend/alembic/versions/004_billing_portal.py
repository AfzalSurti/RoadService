"""Billing, documents, and vendors tables.

Revision ID: 004_billing_portal
Revises: 003_rate_boq
Create Date: 2026-08-09
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "004_billing_portal"
down_revision: Union[str, None] = "003_rate_boq"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

invoice_status = postgresql.ENUM(
    "draft",
    "submitted",
    "recommended",
    "clarification",
    "approved",
    "rejected",
    "withdrawn",
    name="invoice_status",
    create_type=False,
)
payment_mode = postgresql.ENUM(
    "full",
    "provisional",
    "balance",
    name="payment_mode",
    create_type=False,
)


def upgrade() -> None:
    op.execute(
        """
        DO $$ BEGIN
          CREATE TYPE invoice_status AS ENUM (
            'draft','submitted','recommended','clarification','approved','rejected','withdrawn'
          );
        EXCEPTION WHEN duplicate_object THEN null; END $$;
        """
    )
    op.execute(
        """
        DO $$ BEGIN
          CREATE TYPE payment_mode AS ENUM ('full','provisional','balance');
        EXCEPTION WHEN duplicate_object THEN null; END $$;
        """
    )

    op.create_table(
        "invoices",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("transaction_id", sa.String(128), nullable=False, unique=True),
        sa.Column("invoice_no", sa.String(64), nullable=False),
        sa.Column("invoice_date", sa.Date(), nullable=False),
        sa.Column("payment_type", sa.String(128), nullable=False),
        sa.Column("payment_mode", payment_mode, nullable=False, server_default="full"),
        sa.Column("amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("recommended_amount", sa.Numeric(18, 2), nullable=True),
        sa.Column("approved_amount", sa.Numeric(18, 2), nullable=True),
        sa.Column("upc", sa.String(128), nullable=True),
        sa.Column("chainage_from", sa.String(64), nullable=True),
        sa.Column("chainage_to", sa.String(64), nullable=True),
        sa.Column("status", invoice_status, nullable=False, server_default="submitted"),
        sa.Column("submitted_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("calculation_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_invoices_project_id", "invoices", ["project_id"])
    op.create_index("ix_invoices_transaction_id", "invoices", ["transaction_id"])

    op.create_table(
        "invoice_activities",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("invoice_id", sa.Integer(), sa.ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("actor_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_invoice_activities_invoice_id", "invoice_activities", ["invoice_id"])

    op.create_table(
        "portal_documents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="SET NULL"), nullable=True),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("file_path", sa.String(512), nullable=False),
        sa.Column("uploaded_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "vendors",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("contractor_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("brief", sa.Text(), nullable=True),
        sa.Column("progress_notes", sa.Text(), nullable=True),
        sa.Column("delay_notes", sa.Text(), nullable=True),
        sa.Column("escalation_matrix", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("vendors")
    op.drop_table("portal_documents")
    op.drop_table("invoice_activities")
    op.drop_table("invoices")
    op.execute("DROP TYPE IF EXISTS payment_mode")
    op.execute("DROP TYPE IF EXISTS invoice_status")
