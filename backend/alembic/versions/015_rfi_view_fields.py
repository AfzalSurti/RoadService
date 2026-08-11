"""RFI report fields and photo for MIS-style view.

Revision ID: 015_rfi_view_fields
Revises: 014_query_ticket_attachment
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "015_rfi_view_fields"
down_revision: Union[str, None] = "014_query_ticket_attachment"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("site_rfis", sa.Column("ae_name", sa.String(length=255), nullable=True))
    op.add_column("site_rfis", sa.Column("contractor_name", sa.String(length=255), nullable=True))
    op.add_column("site_rfis", sa.Column("category", sa.String(length=128), nullable=True))
    op.add_column("site_rfis", sa.Column("inspection_date", sa.Date(), nullable=True))
    op.add_column("site_rfis", sa.Column("photo_path", sa.String(length=512), nullable=True))


def downgrade() -> None:
    op.drop_column("site_rfis", "photo_path")
    op.drop_column("site_rfis", "inspection_date")
    op.drop_column("site_rfis", "category")
    op.drop_column("site_rfis", "contractor_name")
    op.drop_column("site_rfis", "ae_name")
