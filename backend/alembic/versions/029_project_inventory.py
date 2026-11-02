"""Project Inventory: location map + scope table per package.

Revision ID: 029_project_inventory
Revises: 028_vendor_documents
Create Date: 2026-11-02
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.catalog.packages import PACKAGE_INVENTORY
from app.core.schema_guard import INVENTORY_DDL

revision: str = "029_project_inventory"
down_revision: Union[str, None] = "028_vendor_documents"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE projects ADD COLUMN IF NOT EXISTS location_map_url VARCHAR(1024)")
    conn = op.get_bind()
    # The app's startup schema guard may already have created and seeded it.
    if "project_inventory_items" in sa.inspect(conn).get_table_names():
        return
    for stmt in INVENTORY_DDL:
        op.execute(stmt)
    for name, rows in PACKAGE_INVENTORY.items():
        for order, (scope, description) in enumerate(rows, start=1):
            conn.execute(
                sa.text(
                    "INSERT INTO project_inventory_items (project_id, sort_order, scope, description) "
                    "SELECT id, :o, :s, :d FROM projects WHERE name = :n"
                ),
                {"n": name, "o": order, "s": scope, "d": description},
            )


def downgrade() -> None:
    op.drop_table("project_inventory_items")
    op.drop_column("projects", "location_map_url")
