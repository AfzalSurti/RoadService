"""Project Inventory sheets loaded from the package inventory workbooks.

Revision ID: 032_inventory_sheets
Revises: 031_vendor_bills
Create Date: 2026-11-02
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.schema_guard import INVENTORY_SHEETS_DDL, inventory_sheet_inserts, load_bundled_workbooks

revision: str = "032_inventory_sheets"
down_revision: Union[str, None] = "031_vendor_bills"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    # The app's startup schema guard may already have created and loaded it.
    if "project_inventory_sheets" in sa.inspect(conn).get_table_names():
        return
    for stmt in INVENTORY_SHEETS_DDL:
        op.execute(stmt)
    for stmt, params in inventory_sheet_inserts(load_bundled_workbooks()):
        conn.execute(sa.text(stmt), params)


def downgrade() -> None:
    op.drop_table("project_inventory_sheets")
