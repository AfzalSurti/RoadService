"""Vendor bills (RA bills) on BOQ quantity entries.

Revision ID: 031_vendor_bills
Revises: 030_rate_item_vendor
Create Date: 2026-11-02
"""

from typing import Sequence, Union

from alembic import op

from app.core.schema_guard import BILL_COLUMNS_DDL

revision: str = "031_vendor_bills"
down_revision: Union[str, None] = "030_rate_item_vendor"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # IF NOT EXISTS: the app's startup schema guard may already have added them.
    for stmt in BILL_COLUMNS_DDL:
        op.execute(stmt)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_quantity_entries_vendor_id")
    op.drop_column("quantity_entries", "bill_date")
    op.drop_column("quantity_entries", "bill_no")
    op.drop_column("quantity_entries", "vendor_id")
