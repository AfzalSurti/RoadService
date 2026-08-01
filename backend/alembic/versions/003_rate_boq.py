"""Add rate_items and quantity_entries for BOQ rates.

Revision ID: 003_rate_boq
Revises: 002_catalog_strings
Create Date: 2026-08-01
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003_rate_boq"
down_revision: Union[str, None] = "002_catalog_strings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "rate_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("item_no", sa.String(64), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("unit", sa.String(32), nullable=False),
        sa.Column("boq_quantity", sa.Numeric(18, 4), nullable=False),
        sa.Column("rate", sa.Numeric(18, 4), nullable=False),
        sa.Column("boq_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("executed_quantity", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("executed_amount", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("remarks", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_rate_items_project_id", "rate_items", ["project_id"])

    op.create_table(
        "quantity_entries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("rate_item_id", sa.Integer(), sa.ForeignKey("rate_items.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("quantity", sa.Numeric(18, 4), nullable=False),
        sa.Column("amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("entered_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_quantity_entries_rate_item_id", "quantity_entries", ["rate_item_id"])
    op.create_index("ix_quantity_entries_project_id", "quantity_entries", ["project_id"])


def downgrade() -> None:
    op.drop_table("quantity_entries")
    op.drop_table("rate_items")
