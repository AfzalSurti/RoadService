"""Monthly Progress Report table and package MPR folders support.

Revision ID: 010_monthly_progress_reports
Revises: 009_vendor_contract_fields
Create Date: 2026-08-10
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "010_monthly_progress_reports"
down_revision: Union[str, None] = "009_vendor_contract_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "monthly_progress_reports",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("vendor_id", sa.Integer(), sa.ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True),
        sa.Column("folder_id", sa.Integer(), sa.ForeignKey("document_folders.id", ondelete="SET NULL"), nullable=True),
        sa.Column("package_name", sa.String(255), nullable=False),
        sa.Column("report_month", sa.Date(), nullable=False),
        sa.Column("physical_progress", sa.Text(), nullable=True),
        sa.Column("financial_progress", sa.Text(), nullable=True),
        sa.Column("rating_performance", sa.Text(), nullable=True),
        sa.Column("timely_execution", sa.Text(), nullable=True),
        sa.Column("pending_activity", sa.Text(), nullable=True),
        sa.Column("critical_observation", sa.Text(), nullable=True),
        sa.Column("last_remarks", sa.Text(), nullable=True),
        sa.Column("pdf_path", sa.String(512), nullable=True),
        sa.Column("submitted_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_mpr_project_id", "monthly_progress_reports", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_mpr_project_id", table_name="monthly_progress_reports")
    op.drop_table("monthly_progress_reports")
