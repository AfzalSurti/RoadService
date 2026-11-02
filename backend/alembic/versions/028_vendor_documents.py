"""Vendor documents: several files per type (work order, LOA, BOQ, EOT, bills).

Revision ID: 028_vendor_documents
Revises: 027_vendor_eot
Create Date: 2026-11-02
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.schema_guard import VENDOR_DOCUMENTS_BACKFILL, VENDOR_DOCUMENTS_DDL

revision: str = "028_vendor_documents"
down_revision: Union[str, None] = "027_vendor_eot"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # The app's startup schema guard may already have created and filled it.
    if "vendor_documents" in sa.inspect(op.get_bind()).get_table_names():
        return
    for stmt in VENDOR_DOCUMENTS_DDL:
        op.execute(stmt)
    op.execute(VENDOR_DOCUMENTS_BACKFILL)


def downgrade() -> None:
    op.drop_table("vendor_documents")
