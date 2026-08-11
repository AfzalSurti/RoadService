"""Executive drawing portfolio rows.

Revision ID: 016_executive_drawings
Revises: 015_rfi_view_fields
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "016_executive_drawings"
down_revision: Union[str, None] = "015_rfi_view_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "executive_drawings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_code", sa.String(length=64), nullable=False),
        sa.Column("project_name", sa.String(length=255), nullable=False),
        sa.Column("region", sa.String(length=128), nullable=True),
        sa.Column("ae_name", sa.String(length=255), nullable=True),
        sa.Column("counts_json", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("executive_drawings")
