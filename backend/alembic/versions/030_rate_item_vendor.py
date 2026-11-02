"""BOQ items linked to a vendor.

Revision ID: 030_rate_item_vendor
Revises: 029_project_inventory
Create Date: 2026-11-02
"""

from typing import Sequence, Union

from alembic import op

revision: str = "030_rate_item_vendor"
down_revision: Union[str, None] = "029_project_inventory"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # IF NOT EXISTS: the app's startup schema guard may already have added it.
    op.execute(
        "ALTER TABLE rate_items ADD COLUMN IF NOT EXISTS vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL"
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_rate_items_vendor_id ON rate_items (vendor_id)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_rate_items_vendor_id")
    op.drop_column("rate_items", "vendor_id")
