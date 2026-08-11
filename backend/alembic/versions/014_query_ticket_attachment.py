"""Add screenshot/image attachment on portal query tickets.

Revision ID: 014_query_ticket_attachment
Revises: 013_site_rfis
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "014_query_ticket_attachment"
down_revision: Union[str, None] = "013_site_rfis"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("portal_query_tickets", sa.Column("attachment_path", sa.String(length=512), nullable=True))


def downgrade() -> None:
    op.drop_column("portal_query_tickets", "attachment_path")
