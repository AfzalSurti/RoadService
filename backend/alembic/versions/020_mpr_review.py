"""MPR review columns — GMC MIS Expert Approved / Not Approved + remark.

Revision ID: 020_mpr_review
Revises: 019_query_multi_attachments
Create Date: 2026-09-02
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "020_mpr_review"
down_revision: Union[str, None] = "019_query_multi_attachments"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "monthly_progress_reports",
        sa.Column("review_status", sa.String(32), nullable=False, server_default="pending"),
    )
    op.add_column(
        "monthly_progress_reports",
        sa.Column("review_remark", sa.Text(), nullable=True),
    )
    op.add_column(
        "monthly_progress_reports",
        sa.Column("reviewed_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
    )
    op.add_column(
        "monthly_progress_reports",
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("monthly_progress_reports", "reviewed_at")
    op.drop_column("monthly_progress_reports", "reviewed_by_id")
    op.drop_column("monthly_progress_reports", "review_remark")
    op.drop_column("monthly_progress_reports", "review_status")
