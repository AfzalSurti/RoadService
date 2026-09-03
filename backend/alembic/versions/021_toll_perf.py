"""Toll Plaza Performances — imported report rows + summary notes.

Revision ID: 021_toll_perf
Revises: 020_mpr_review
Create Date: 2026-09-02
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "021_toll_perf"
down_revision: Union[str, None] = "020_mpr_review"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "toll_perf_rows",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("report_type", sa.String(48), nullable=False),
        sa.Column("payload", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_toll_perf_rows_report_type", "toll_perf_rows", ["report_type"])

    op.create_table(
        "toll_perf_notes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("note_key", sa.String(64), nullable=False),
        sa.Column("note_value", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_toll_perf_notes_note_key", "toll_perf_notes", ["note_key"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_toll_perf_notes_note_key", table_name="toll_perf_notes")
    op.drop_table("toll_perf_notes")
    op.drop_index("ix_toll_perf_rows_report_type", table_name="toll_perf_rows")
    op.drop_table("toll_perf_rows")
