"""Vendor work order, LOA, and contract timeline fields.

Revision ID: 009_vendor_contract_fields
Revises: 008_invoice_summary
Create Date: 2026-08-10
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "009_vendor_contract_fields"
down_revision: Union[str, None] = "008_invoice_summary"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("vendors", sa.Column("work_order_path", sa.String(512), nullable=True))
    op.add_column("vendors", sa.Column("loa_path", sa.String(512), nullable=True))
    op.add_column("vendors", sa.Column("type_of_work", sa.String(255), nullable=True))
    op.add_column("vendors", sa.Column("work_order_date", sa.Date(), nullable=True))
    op.add_column("vendors", sa.Column("commencement_date", sa.Date(), nullable=True))
    op.add_column("vendors", sa.Column("time_limit_completion", sa.String(128), nullable=True))
    op.add_column("vendors", sa.Column("defects_liability_period", sa.String(128), nullable=True))
    op.add_column("vendors", sa.Column("remarks", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("vendors", "remarks")
    op.drop_column("vendors", "defects_liability_period")
    op.drop_column("vendors", "time_limit_completion")
    op.drop_column("vendors", "commencement_date")
    op.drop_column("vendors", "work_order_date")
    op.drop_column("vendors", "type_of_work")
    op.drop_column("vendors", "loa_path")
    op.drop_column("vendors", "work_order_path")
