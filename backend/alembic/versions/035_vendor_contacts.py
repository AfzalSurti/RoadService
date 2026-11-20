"""Vendor contact details (person, phone, email, address) and database copies of uploads.

Revision ID: 035_vendor_contacts
Revises: 034_msr_folder
Create Date: 2026-11-20
"""

from typing import Sequence, Union

from alembic import op

from app.core.schema_guard import VENDOR_CONTACT_BACKFILL, VENDOR_CONTACT_COLUMNS
from app.services.storage import _STORED_FILES_DDL

revision: str = "035_vendor_contacts"
down_revision: Union[str, None] = "034_msr_folder"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for col, typ in VENDOR_CONTACT_COLUMNS:
        op.execute(f"ALTER TABLE vendors ADD COLUMN IF NOT EXISTS {col} {typ}")
    op.execute(VENDOR_CONTACT_BACKFILL)
    op.execute(_STORED_FILES_DDL)


def downgrade() -> None:
    for col, _ in VENDOR_CONTACT_COLUMNS:
        op.execute(f"ALTER TABLE vendors DROP COLUMN IF EXISTS {col}")
