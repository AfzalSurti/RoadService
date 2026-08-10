"""Organisation staff details for GMC / NHIPMPL / Contractor.

Revision ID: 011_org_staff_details
Revises: 010_monthly_progress_reports
Create Date: 2026-08-10
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "011_org_staff_details"
down_revision: Union[str, None] = "010_monthly_progress_reports"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "org_staff_details",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("organization", sa.String(32), nullable=False),  # gmc | nhimpl | contractor
        sa.Column("project_name", sa.String(255), nullable=False),
        sa.Column("position", sa.String(255), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("date_of_joining", sa.Date(), nullable=False),
        sa.Column("mobile_no", sa.String(32), nullable=False),
        sa.Column("alternate_mobile_no", sa.String(32), nullable=True),
        sa.Column("email_id", sa.String(255), nullable=False),
        sa.Column("owner_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_org_staff_organization", "org_staff_details", ["organization"])
    op.create_index("ix_org_staff_owner", "org_staff_details", ["owner_user_id"])


def downgrade() -> None:
    op.drop_index("ix_org_staff_owner", table_name="org_staff_details")
    op.drop_index("ix_org_staff_organization", table_name="org_staff_details")
    op.drop_table("org_staff_details")
