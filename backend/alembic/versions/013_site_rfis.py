"""Site RFI (Request for Information) raise and answer workflow.

Revision ID: 013_site_rfis
Revises: 012_portal_query_tickets
Create Date: 2026-08-10
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "013_site_rfis"
down_revision: Union[str, None] = "012_portal_query_tickets"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "site_rfis",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("rfi_no", sa.String(64), nullable=False, unique=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("related_issue_id", sa.Integer(), sa.ForeignKey("issues.id", ondelete="SET NULL"), nullable=True),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("chainage", sa.String(64), nullable=True),
        sa.Column("priority", sa.String(32), nullable=False, server_default="medium"),
        sa.Column("status", sa.String(32), nullable=False, server_default="open"),
        sa.Column("raised_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("answer_text", sa.Text(), nullable=True),
        sa.Column("answered_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("answered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_site_rfis_status", "site_rfis", ["status"])
    op.create_index("ix_site_rfis_project", "site_rfis", ["project_id"])
    op.create_index("ix_site_rfis_raised_by", "site_rfis", ["raised_by_id"])


def downgrade() -> None:
    op.drop_index("ix_site_rfis_raised_by", table_name="site_rfis")
    op.drop_index("ix_site_rfis_project", table_name="site_rfis")
    op.drop_index("ix_site_rfis_status", table_name="site_rfis")
    op.drop_table("site_rfis")
