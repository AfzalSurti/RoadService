"""Store multiple query screenshot paths (JSON) as Text.

Revision ID: 019_query_multi_attachments
Revises: 018_field_ops_mobile
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "019_query_multi_attachments"
down_revision: Union[str, None] = "018_field_ops_mobile"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "portal_query_tickets",
        "attachment_path",
        existing_type=sa.String(length=512),
        type_=sa.Text(),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "portal_query_tickets",
        "attachment_path",
        existing_type=sa.Text(),
        type_=sa.String(length=512),
        existing_nullable=True,
    )
