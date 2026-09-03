"""Invoice GMC MIS Expert review gate before NHIPMPL.

Revision ID: 022_invoice_gmc_review
Revises: 021_toll_perf
Create Date: 2026-09-03
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "022_invoice_gmc_review"
down_revision: Union[str, None] = "021_toll_perf"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("invoices", sa.Column("submitted_by_role", sa.String(32), nullable=True))
    op.add_column(
        "invoices",
        sa.Column("gmc_review_status", sa.String(16), nullable=False, server_default="approved"),
    )
    op.add_column("invoices", sa.Column("gmc_remark", sa.Text(), nullable=True))
    op.add_column(
        "invoices",
        sa.Column("gmc_reviewed_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
    )
    op.add_column("invoices", sa.Column("gmc_reviewed_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("invoices", "gmc_reviewed_at")
    op.drop_column("invoices", "gmc_reviewed_by_id")
    op.drop_column("invoices", "gmc_remark")
    op.drop_column("invoices", "gmc_review_status")
    op.drop_column("invoices", "submitted_by_role")
